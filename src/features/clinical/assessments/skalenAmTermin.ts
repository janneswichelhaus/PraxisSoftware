import { useCallback, useMemo, useRef, useState } from 'react';
import { erhebungAbschliessen, erhebungSpeichern } from './api';
import type { Antwort } from './antworten';
import { bibliothek } from './bibliothek';
import { instrumentFuer, SKALEN_AM_TERMIN } from './instrumente';
import { optionKennung, type ScoreDefinition, type ScoreItem } from './schema';

// Die Veränderungsfrage fragt nach der Zeit „seit Beginn“ (ANN-823).
const AB_ZWEITEM_TERMIN: ReadonlySet<string> = new Set(['globale_veraenderung']);

/**
 * Die Skalen für einen Termin: nur aktive Instrumente mit genau einer Frage.
 * `position` ist „Termin n“ der Grundlage; ohne sie steht alles da.
 */
export function skalenFuer(
  position: number | null,
  scores: readonly ScoreDefinition[] = bibliothek.scores,
): ScoreDefinition[] {
  return SKALEN_AM_TERMIN.filter(
    (id) => !(AB_ZWEITEM_TERMIN.has(id) && position !== null && position < 2),
  )
    .map((id) => instrumentFuer(id, scores))
    .filter((s): s is ScoreDefinition => s !== undefined && s.meta.aktiv && s.items.length === 1);
}

export interface Stufe {
  kennung: string;
  /** Was auf der Stufe steht: die Zahl, bei Antworten mit Wert mit Vorzeichen. */
  text: string;
  /** Was die Stufe heißt, für Vorlesesoftware und die Zeile im Vorschlag. */
  bedeutung: string;
  antwort: Antwort;
}

function mitVorzeichen(wert: number): string {
  return wert > 0 ? `+${wert}` : wert < 0 ? `−${Math.abs(wert)}` : '0';
}

/** Die antippbaren Stufen einer Frage; leer für jeden anderen Typ. */
export function stufenVon(item: ScoreItem): Stufe[] {
  if (item.typ === 'skala') {
    const { min, max } = item.skala ?? { min: 0, max: 10 };
    return Array.from({ length: max - min + 1 }, (_, i) => {
      const wert = min + i;
      return {
        kennung: String(wert),
        text: String(wert),
        bedeutung: String(wert),
        antwort: { wert },
      };
    });
  }
  if (item.typ === 'einzelauswahl') {
    return (item.optionen ?? []).map((option) => {
      const kennung = optionKennung(option);
      return {
        kennung,
        text: option.wert === undefined ? option.label : mitVorzeichen(option.wert),
        bedeutung: option.label,
        antwort: { auswahl: kennung },
      };
    });
  }
  return [];
}

/** Die Enden einer Skala zur Orientierung, wie sie die Definition nennt. */
export function ankerVon(item: ScoreItem): { min: string; max: string } | null {
  if (item.anker) return item.anker;
  const stufen = stufenVon(item);
  const erste = stufen[0];
  const letzte = stufen.at(-1);
  return item.typ === 'einzelauswahl' && erste && letzte
    ? { min: erste.bedeutung, max: letzte.bedeutung }
    : null;
}

/** Kurz im Eintrag, wie man es mitschreibt (Jannes 2026-11-01). */
const KURZ: Readonly<Record<string, string>> = {
  nrs_schmerz: 'NRS',
  globale_veraenderung: 'Veränderung seit Beginn',
};

/** Eine Zeile für den Vorschlag: „NRS 4/10“, „Veränderung seit Beginn: etwas besser“. */
export function skalenzeile(definition: ScoreDefinition, stufe: Stufe): string {
  const item = definition.items[0];
  const name = KURZ[definition.meta.id] ?? definition.meta.name_de;
  return item?.typ === 'skala'
    ? `${name} ${stufe.text}/${item.skala?.max ?? 10}`
    : `${name}: ${stufe.bedeutung}`;
}

/** Gewählt, aber noch nicht in der Doku: Kennung der Stufe je Instrument. */
export type Skalenwahl = Readonly<Record<string, string>>;

export interface SkalenAmTermin {
  skalen: readonly ScoreDefinition[];
  wahl: Skalenwahl;
  setzen: (instrumentId: string, kennung: string | undefined) => void;
  verwerfen: () => void;
  /** Was im Vorschlag stünde; leer, solange nichts gewählt ist. */
  text: string;
  /** Speichert und schließt je gewählter Skala eine Erhebung ab, dann ist die Wahl leer. */
  uebernehmen: () => Promise<string>;
}

/**
 * Gewählt wird auf dem Gerät; erst „Übernehmen“ speichert die Erhebungen und gibt die Zeilen
 * heraus. Ein Fehlgriff davor kostet so keine Korrektur mit Begründung (ANN-103).
 */
export function useSkalenAmTermin({
  patientId,
  datum,
  skalen,
}: {
  patientId: string | null;
  datum: string;
  skalen: readonly ScoreDefinition[];
}): SkalenAmTermin {
  const [wahl, setWahl] = useState<Skalenwahl>({});
  // Ein Entwurf, dessen Abschluss scheiterte, wird beim nächsten Versuch
  // überschrieben statt verdoppelt.
  const entwuerfe = useRef(new Map<string, string>());
  // Schon abgeschlossen in einem Versuch, der danach scheiterte: nicht zweimal.
  const erledigt = useRef(new Set<string>());

  const setzen = useCallback((instrumentId: string, kennung: string | undefined) => {
    erledigt.current.delete(instrumentId);
    setWahl((bisher) => {
      const neu = { ...bisher };
      if (kennung === undefined) delete neu[instrumentId];
      else neu[instrumentId] = kennung;
      return neu;
    });
  }, []);
  const verwerfen = useCallback(() => setWahl({}), []);

  const gewaehlt = useMemo(
    () =>
      skalen.flatMap((definition) => {
        const item = definition.items[0];
        const stufe = item && stufenVon(item).find((s) => s.kennung === wahl[definition.meta.id]);
        return item && stufe ? [{ definition, item, stufe }] : [];
      }),
    [skalen, wahl],
  );
  const text = gewaehlt.map(({ definition, stufe }) => skalenzeile(definition, stufe)).join('\n');

  const uebernehmen = useCallback(async () => {
    if (!patientId) throw new Error('Der Termin gehört zu keiner Patientin und keinem Patienten.');
    for (const { definition, item, stufe } of gewaehlt) {
      if (erledigt.current.has(definition.meta.id)) continue;
      const id = await erhebungSpeichern({
        patientId,
        erhebungId: entwuerfe.current.get(definition.meta.id) ?? null,
        instrumentId: definition.meta.id,
        version: definition.meta.version,
        datum,
        antworten: { [item.id]: stufe.antwort },
        korrigiert: null,
        begruendung: null,
      });
      entwuerfe.current.set(definition.meta.id, id);
      await erhebungAbschliessen(id);
      entwuerfe.current.delete(definition.meta.id);
      erledigt.current.add(definition.meta.id);
    }
    erledigt.current.clear();
    setWahl({});
    return text;
  }, [datum, gewaehlt, patientId, text]);

  return { skalen, wahl, setzen, verwerfen, text, uebernehmen };
}
