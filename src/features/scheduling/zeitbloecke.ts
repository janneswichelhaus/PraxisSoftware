import type { WorkingHourException, Zeitblock } from './api';

/**
 * Regeln für die Zeitblöcke im Formular der Arbeitszeiten (ORG-02, ORG-05).
 *
 * Reine Funktionen ohne Oberfläche: Sie entscheiden, was als Eingabe zählt,
 * was ein Fehler ist und was sich gegenüber dem gespeicherten Stand geändert
 * hat. Verbindlich prüft weiterhin der Server (`set_staff_working_hours`,
 * `set_staff_working_hour_exception`); hier geht es darum, dass nichts still
 * verschwindet.
 */

/** Ein leerer Block, damit sofort etwas eingetragen werden kann. */
export const LEERER_BLOCK: Zeitblock = { von: '', bis: '' };

/**
 * Nur ganz leere Blöcke fallen weg.
 *
 * Bis ORG-02 fiel auch ein Block mit nur einem Wert still heraus - ein
 * vergessenes „bis" löschte so den Tag oder seinen zweiten Block, und die
 * Seite meldete trotzdem „gespeichert". Ein halber Block ist eine Eingabe
 * mit Fehler, keine leere Zeile (`halbeBloecke`).
 */
export function ohneLeere(bloecke: readonly Zeitblock[]): Zeitblock[] {
  return bloecke.filter((block) => block.von !== '' || block.bis !== '');
}

function sortiert(bloecke: readonly Zeitblock[]): Zeitblock[] {
  return [...bloecke].sort((a, b) => a.von.localeCompare(b.von) || a.bis.localeCompare(b.bis));
}

/** Dieselben Blöcke, gleich in welcher Reihenfolge sie eingegeben wurden? */
export function gleicheBloecke(a: readonly Zeitblock[], b: readonly Zeitblock[]): boolean {
  if (a.length !== b.length) return false;
  const links = sortiert(a);
  const rechts = sortiert(b);
  return links.every((block, index) => {
    const gegenueber = rechts[index];
    return gegenueber !== undefined && block.von === gegenueber.von && block.bis === gegenueber.bis;
  });
}

/** Feldfehler eines Blocks - je Feld höchstens einer. */
export interface Blockfehler {
  von?: string;
  bis?: string;
}

export const FEHLT_BEGINN = 'Bitte den Beginn eintragen.';
export const FEHLT_ENDE = 'Bitte das Ende eintragen.';

/**
 * Blöcke mit genau einem Wert (ORG-02).
 *
 * Liefert je Block die Feldfehler, oder `null`, wenn kein Block halb
 * ausgefüllt ist. Ob ein Block vor seinem Beginn endet, prüft weiterhin der
 * Server und meldet es verständlich.
 */
export function halbeBloecke(bloecke: readonly Zeitblock[]): Blockfehler[] | null {
  const fehler = bloecke.map((block): Blockfehler => {
    if (block.von === '' && block.bis !== '') return { von: FEHLT_BEGINN };
    if (block.bis === '' && block.von !== '') return { bis: FEHLT_ENDE };
    return {};
  });
  return fehler.some((eintrag) => eintrag.von !== undefined || eintrag.bis !== undefined)
    ? fehler
    : null;
}

/** Eine Abweichung, wie sie in der Liste steht: ein Datum, eine Zeile (ORG-05). */
export interface AbweichungsTag {
  datum: string;
  /** Der ganze Tag ohne Termine. */
  frei: boolean;
  bloecke: Zeitblock[];
}

/**
 * Fasst die Zeilen eines Datums zusammen.
 *
 * Die Datenbank führt je Block eine Zeile; zwei Blöcke eines Tages standen
 * bis ORG-05 als zwei Zeilen mit demselben Datum untereinander. Die Reihenfolge
 * der Daten bleibt die der Abfrage (nach Datum sortiert).
 */
export function abweichungenNachDatum(liste: readonly WorkingHourException[]): AbweichungsTag[] {
  const tage = new Map<string, AbweichungsTag>();
  for (const eintrag of liste) {
    const tag = tage.get(eintrag.on_date) ?? { datum: eintrag.on_date, frei: false, bloecke: [] };
    if (eintrag.kind === 'unavailable') {
      tag.frei = true;
    } else if (eintrag.starts_at !== null && eintrag.ends_at !== null) {
      tag.bloecke.push({ von: eintrag.starts_at, bis: eintrag.ends_at });
    }
    tage.set(eintrag.on_date, tag);
  }
  return [...tage.values()].map((tag) => ({ ...tag, bloecke: sortiert(tag.bloecke) }));
}
