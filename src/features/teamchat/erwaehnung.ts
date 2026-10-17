import type { Person } from './api';

/** Höchstlänge einer Nachricht - zugleich die Grenze des Servers. */
export const NACHRICHT_MAX = 4000;

/** Wer im Text noch mit „@Name“ steht, ist erwähnt - sonst nicht mehr. */
export function erwaehnte(text: string, personen: readonly Person[]): string[] {
  return personen
    .filter((person) => text.includes(`@${person.name}`))
    .map((person) => person.staff_member_id);
}
