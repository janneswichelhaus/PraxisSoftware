import type { Gespraechsart } from './api';

/** Höchstlänge einer Nachricht - zugleich die Grenze des Servers. */
export const NACHRICHT_MAX = 4000;

const WORTZEICHEN = /[\p{L}\p{N}]/u;

/** Steht `@ziel` im Text als ganzes Wort? */
function steht(text: string, ziel: string): boolean {
  let ab = 0;
  for (;;) {
    const an = text.indexOf(`@${ziel}`, ab);
    if (an < 0) return false;
    const nach = text.charAt(an + ziel.length + 1);
    if (!nach || !WORTZEICHEN.test(nach)) return true;
    ab = an + 1;
  }
}

/** Wer im Text noch mit „@Name“ steht, ist erwähnt - sonst nicht mehr. */
export function erwaehnte(
  text: string,
  personen: readonly { staff_member_id: string; name: string }[],
): string[] {
  return personen.filter((person) => steht(text, person.name)).map((p) => p.staff_member_id);
}

/**
 * Ein angefangenes „@…“ direkt vor der Schreibmarke - getippt statt über den
 * Knopf (wie bei Slack): am Anfang oder nach einem Leerraum, in einer Zeile,
 * höchstens 30 Zeichen. `von` ist die Stelle des „@“. Bis zur Praxis-Sichtung
 * TEAM-002 erwähnte ein getipptes „@Olivia“ niemanden.
 */
export function angefangeneErwaehnung(
  text: string,
  marke: number,
): { von: number; wort: string } | null {
  const vor = text.slice(0, marke);
  const von = vor.lastIndexOf('@');
  if (von < 0) return null;
  if (von > 0 && !/\s/.test(vor.charAt(von - 1))) return null;
  const wort = vor.slice(von + 1);
  if (wort.length > 30 || wort.includes('\n')) return null;
  return { von, wort };
}

/** Wer zu „@…“ passt: Der Name oder eines seiner Wörter beginnt so. */
export function passendePersonen<T extends { name: string }>(
  personen: readonly T[],
  wort: string,
): T[] {
  const anfang = wort.toLocaleLowerCase('de');
  return personen.filter((p) => {
    const name = p.name.toLocaleLowerCase('de');
    return name.startsWith(anfang) || name.split(/\s+/).some((teil) => teil.startsWith(anfang));
  });
}

/** @alle gibt es dort, wo mehr als zwei lesen (ANN-647). */
export function alleMoeglich(art: Gespraechsart): boolean {
  return art === 'channel' || art === 'private' || art === 'fleet' || art === 'group';
}

/** Steht „@alle“ im Text? */
export function alleErwaehnt(text: string, art: Gespraechsart): boolean {
  return alleMoeglich(art) && steht(text, 'alle');
}
