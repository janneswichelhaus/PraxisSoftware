import { useRef, useState, type RefObject } from 'react';
import type { BikeFocus } from './bike3d/BikeModel3D';
import {
  MODEL_VERSION,
  isZoneKey,
  type BikePick,
  type BikeType,
  type CheckItemKey,
  type ModelPoint,
  type Severity,
  type ZoneView,
} from './bike3d/zones';
import type { Spot } from './api';

/**
 * Der Zustand der Stellenerfassung am 3D-Rad (`Stellenerfassung.tsx`) - die
 * Stellen einer Meldung, die gerade offene Stelle und was das Rad zeigt.
 * Ohne Oberfläche, damit Check-Up und Panne denselben Zustand führen und die
 * Prüfliste des Check-Ups ihn mitlesen kann (Stelle hebt Prüfpunkt an,
 * ANN-550).
 */

export type Erfassungsart = 'checkup' | 'panne';

export interface Stelle {
  key: string;
  zone: string;
  point: ModelPoint | null;
  severity: Severity;
  note: string;
  fotos: Blob[];
}

export interface Entwurf extends Omit<Stelle, 'key'> {
  /** `null` für eine neue Stelle. */
  key: string | null;
}

export interface Stellenzustand {
  art: Erfassungsart;
  stellen: readonly Stelle[];
  entwurf: Entwurf | null;
  fokus: BikeFocus | null;
  hervorgehoben: { zonen: readonly string[]; pruefpunkt: CheckItemKey | null } | null;
  rahmen: RefObject<HTMLDivElement | null>;
  tippen: (treffer: BikePick | null) => void;
  /** „Am Rad zeigen“ und „Stelle am Rad markieren“ aus der Prüfliste. */
  zeigeBauteile: (
    zonen: readonly string[],
    ansicht: ZoneView | undefined,
    pruefpunkt: CheckItemKey | null,
  ) => void;
  bearbeite: (key: string) => void;
  ohneModell: () => void;
  aendere: (teil: Partial<Omit<Entwurf, 'key'>>) => void;
  uebernehmen: () => void;
  verwerfen: () => void;
  entfernen: () => void;
}

/** Einstufung in der Pannenmeldung: jede Stelle ist ein Schaden (Handoff, Vorschlag 4). */
function einstufungFuer(art: Erfassungsart, gewuenscht: Severity): Severity {
  return art === 'panne' ? 'problem' : gewuenscht;
}

export function useStellenerfassung({
  art,
  onGesetzt,
}: {
  art: Erfassungsart;
  /** Nach „Stelle setzen“ - der Check-Up hebt damit die Bewertung an. */
  onGesetzt?: (stelle: Stelle) => void;
}): Stellenzustand {
  const [stellen, setStellen] = useState<Stelle[]>([]);
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const [fokus, setFokus] = useState<BikeFocus | null>(null);
  const [hervorgehoben, setHervorgehoben] = useState<Stellenzustand['hervorgehoben']>(null);
  const rahmen = useRef<HTMLDivElement>(null);
  const zaehler = useRef(0);

  function neueMarke(): number {
    zaehler.current += 1;
    return zaehler.current;
  }

  function insBild() {
    const element = rahmen.current;
    if (!element) return;
    const lage = element.getBoundingClientRect();
    if (lage.top < 0 || lage.bottom > window.innerHeight) {
      element.scrollIntoView?.({ block: 'center' });
    }
  }

  return {
    art,
    stellen,
    entwurf,
    fokus,
    hervorgehoben,
    rahmen,
    tippen(treffer) {
      if (!treffer || !isZoneKey(treffer.zone)) return;
      if (treffer.markerId) {
        // Eine eigene Nadel öffnet ihre Stelle; eine schon offene aus einer
        // früheren Meldung bleibt, wie sie ist.
        const getroffen = stellen.find((stelle) => stelle.key === treffer.markerId);
        if (getroffen) {
          setEntwurf({ ...getroffen });
          setHervorgehoben(null);
        }
        return;
      }
      // Eine offene Stelle wandert mit: Notiz, Fotos und Bewertung bleiben.
      setEntwurf((vorher) => ({
        key: vorher?.key ?? null,
        zone: treffer.zone,
        point: treffer.point,
        severity: einstufungFuer(art, vorher?.severity ?? 'problem'),
        note: vorher?.note ?? '',
        fotos: vorher?.fotos ?? [],
      }));
      setHervorgehoben(null);
    },
    zeigeBauteile(zonen, ansicht, pruefpunkt) {
      setFokus({ zones: zonen, ...(ansicht ? { view: ansicht } : {}), token: neueMarke() });
      setHervorgehoben({ zonen, pruefpunkt });
      setEntwurf(null);
      insBild();
    },
    bearbeite(key) {
      const stelle = stellen.find((eintrag) => eintrag.key === key);
      if (!stelle) return;
      setEntwurf({ ...stelle });
      setHervorgehoben(null);
      setFokus({ zones: [stelle.zone], token: neueMarke() });
      insBild();
    },
    ohneModell() {
      setEntwurf({ key: null, zone: '', point: null, severity: 'problem', note: '', fotos: [] });
      setHervorgehoben(null);
    },
    aendere(teil) {
      setEntwurf((vorher) => {
        if (!vorher) return vorher;
        // Aus der Liste gewählt: Die Nadel springt an die Mitte des Bauteils.
        const punkt = teil.zone !== undefined && teil.zone !== vorher.zone ? null : vorher.point;
        return {
          ...vorher,
          ...teil,
          point: teil.point === undefined ? punkt : teil.point,
          severity: einstufungFuer(art, teil.severity ?? vorher.severity),
        };
      });
    },
    uebernehmen() {
      if (!entwurf || !isZoneKey(entwurf.zone)) return;
      const stelle: Stelle = {
        ...entwurf,
        key: entwurf.key ?? `stelle-${neueMarke()}`,
        note: entwurf.note,
      };
      setStellen((vorher) =>
        entwurf.key
          ? vorher.map((eintrag) => (eintrag.key === entwurf.key ? stelle : eintrag))
          : [...vorher, stelle],
      );
      setEntwurf(null);
      onGesetzt?.(stelle);
    },
    verwerfen() {
      setEntwurf(null);
    },
    entfernen() {
      if (!entwurf?.key) return;
      const key = entwurf.key;
      setStellen((vorher) => vorher.filter((eintrag) => eintrag.key !== key));
      setEntwurf(null);
    },
  };
}

/** Der Punkt einer gespeicherten Stelle - auf einer anderen Fassung des Modells die Mitte des Bauteils (ANN-550). */
export function punktAmModell(
  spot: Pick<Spot, 'point' | 'model_version'>,
  bauart: BikeType,
): ModelPoint | null {
  return spot.model_version === MODEL_VERSION[bauart] ? spot.point : null;
}

/** Die Nummer einer neuen Stelle: nach den schon offenen des Rads. */
export function nummerDerStelle(index: number, bestehend: number): number {
  return bestehend + index + 1;
}
