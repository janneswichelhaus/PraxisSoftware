import { useRef, useState } from 'react';
import { isZoneKey, type Severity } from './bike3d/zones';

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
