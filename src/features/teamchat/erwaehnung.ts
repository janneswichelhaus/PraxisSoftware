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

/** @alle gibt es dort, wo mehr als zwei lesen (ANN-647). */
export function alleMoeglich(art: Gespraechsart): boolean {
  return art === 'channel' || art === 'private' || art === 'fleet' || art === 'group';
}

/** Steht „@alle“ im Text? */
export function alleErwaehnt(text: string, art: Gespraechsart): boolean {
  return alleMoeglich(art) && steht(text, 'alle');
}
