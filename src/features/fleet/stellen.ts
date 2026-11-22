import { useRef, useState } from 'react';
import { isZoneKey, type Severity } from './zones';
import type { BikeMarker } from './bike3d/ansichten';

/**
 * Die Stellen einer Meldung ohne Oberfläche: Check-Up und Panne führen denselben Zustand,
 * und die Prüfliste des Check-Ups liest ihn mit (Stelle hebt Prüfpunkt an, ANN-555).
 */

export type Erfassungsart = 'checkup' | 'panne';

export interface Stelle {
  key: string;
  zone: string;
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
  /** Ein Bauteil aus der Liste: öffnet eine neue Stelle daran oder versetzt die offene. */
  waehle: (zone: string) => void;
  /** Eine neue Stelle, das Bauteil noch offen - „Weitere Stelle“ im Check-Up. */
  neu: () => void;
  bearbeite: (key: string) => void;
  aendere: (teil: Partial<Omit<Entwurf, 'key'>>) => void;
  uebernehmen: () => void;
  verwerfen: () => void;
  entfernen: () => void;
  /** Nimmt neue Stellen wieder heraus - im geführten Check-Up, wenn ein Punkt neu bewertet wird. */
  entferneStellen: (keys: readonly string[]) => void;
}

/** Einstufung in der Pannenmeldung: jede Stelle ist ein Schaden (Handoff, Vorschlag 4). */
function einstufungFuer(art: Erfassungsart, gewuenscht: Severity): Severity {
  return art === 'panne' ? 'problem' : gewuenscht;
}

export function useStellenerfassung({ art }: { art: Erfassungsart }): Stellenzustand {
  const [stellen, setStellen] = useState<Stelle[]>([]);
  const [entwurf, setEntwurf] = useState<Entwurf | null>(null);
  const zaehler = useRef(0);

  return {
    art,
    stellen,
    entwurf,
    waehle(zone) {
      if (!isZoneKey(zone)) return;
      // Eine offene Stelle wandert mit: Notiz, Fotos und Bewertung bleiben.
      setEntwurf((vorher) => ({
        key: vorher?.key ?? null,
        zone,
        severity: einstufungFuer(art, vorher?.severity ?? 'problem'),
        note: vorher?.note ?? '',
        fotos: vorher?.fotos ?? [],
      }));
    },
    neu() {
      setEntwurf({ key: null, zone: '', severity: 'problem', note: '', fotos: [] });
    },
    bearbeite(key) {
      const stelle = stellen.find((eintrag) => eintrag.key === key);
      if (stelle) setEntwurf({ ...stelle });
    },
    aendere(teil) {
      setEntwurf((vorher) => {
        if (!vorher) return vorher;
        return {
          ...vorher,
          ...teil,
          severity: einstufungFuer(art, teil.severity ?? vorher.severity),
        };
      });
    },
    uebernehmen() {
      if (!entwurf || !isZoneKey(entwurf.zone)) return;
      zaehler.current += 1;
      const stelle: Stelle = { ...entwurf, key: entwurf.key ?? `stelle-${zaehler.current}` };
      setStellen((vorher) =>
        entwurf.key
          ? vorher.map((eintrag) => (eintrag.key === entwurf.key ? stelle : eintrag))
          : [...vorher, stelle],
      );
      setEntwurf(null);
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
    entferneStellen(keys) {
      if (keys.length === 0) return;
      setStellen((vorher) => vorher.filter((eintrag) => !keys.includes(eintrag.key)));
      setEntwurf((vorher) => (vorher?.key && keys.includes(vorher.key) ? null : vorher));
    },
  };
}

/** Die Nummer einer neuen Stelle: nach den schon offenen des Rads. */
export function nummerDerStelle(index: number, bestehend: number): number {
  return bestehend + index + 1;
}

/**
 * Was das 3D-Rad zu einer Meldung zeigt: die schon offenen Stellen mit ihrer Nummer, die neuen
 * dahinter, die offene Stelle als neue Nadel. Jede Nadel steht am Anker ihres Bauteils, weil nur
 * das Bauteil gespeichert wird (ANN-870).
 */
export function radBild(
  zustand: Pick<Stellenzustand, 'stellen' | 'entwurf'>,
  bestehend: readonly { id: string; zone: string; severity: Severity; number: number | null }[],
) {
  const { stellen, entwurf } = zustand;
  const offene = bestehend.filter((spot) => spot.number !== null);
  const aktivNummer = entwurf?.key
    ? nummerDerStelle(
        stellen.findIndex((stelle) => stelle.key === entwurf.key),
        offene.length,
      )
    : nummerDerStelle(stellen.length, offene.length);
  const markers: BikeMarker[] = [
    ...offene.map((spot) => ({
      id: `offen-${spot.id}`,
      zone: spot.zone,
      point: null,
      severity: spot.severity,
      number: spot.number ?? 0,
    })),
    ...stellen.map((stelle, index) => {
      const quelle = entwurf?.key === stelle.key ? entwurf : stelle;
      return {
        id: stelle.key,
        zone: quelle.zone,
        point: null,
        severity: quelle.severity,
        number: nummerDerStelle(index, offene.length),
      };
    }),
  ];
  const draft =
    entwurf && !entwurf.key && isZoneKey(entwurf.zone)
      ? { zone: entwurf.zone, point: null, number: aktivNummer }
      : null;
  return { offene, aktivNummer, markers, draft };
}
