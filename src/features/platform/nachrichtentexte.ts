/**
 * Die festen Sätze am Reiter „Nachrichten" (KOM-001, IDEA-KOM-002, DSN-001 4.1).
 *
 * Zusage und Notfallhinweis stehen über jedem Eingabefeld, dauerhaft und
 * nicht wegklickbar. Sie sind für alle gleich und hängen **nie** vom Inhalt
 * einer Nachricht ab: Eine Einstufung „klingt dringend" wäre eine
 * Risikoklassifikation nach ADR-006 Punkt 4 und entsteht nicht.
 *
 * Wortlaut aus DSN-001 4.1 (bestätigt 2026-09-30). Die Zahl der Werktage
 * kommt aus den Praxisstammdaten (ANN-309).
 */

export type Thema = 'exercise' | 'complaint' | 'organisational' | 'other';

/** „Worum geht es?" - in dieser Reihenfolge (DSN-001 4.1). */
export const THEMEN: readonly Thema[] = ['exercise', 'complaint', 'organisational', 'other'];

export const THEMA_NAME: Record<Thema, string> = {
  exercise: 'Übung',
  complaint: 'Beschwerden',
  organisational: 'Termin oder Rechnung',
  other: 'Sonstiges',
};

/** Die Zusage. Werktage sind Montag bis Freitag (ANN-309). */
export function zusage(werktage: number): string {
  return werktage === 1
    ? 'Antwort in der Regel innerhalb eines Werktags.'
    : `Antwort in der Regel innerhalb von ${zahlwort(werktage)} Werktagen.`;
}

/** Der Notfallhinweis - wörtlich wie in DSN-001 4.1. */
export const NICHT_AKUT = 'Nicht für akute Beschwerden.';
export const NOTFALL =
  'Im Notfall 112, außerhalb der Sprechzeiten der ärztliche Bereitschaftsdienst 116117.';

/** Im Training ohne Einwilligung (ANN-311): warum zwei Themen fehlen. */
export const OHNE_EINWILLIGUNG =
  'Fragen zu Übungen und Beschwerden sind Angaben zu Ihrer Gesundheit. Sie können sie hier stellen, sobald Sie unter „Ich → Einwilligungen“ eingewilligt haben. Termin, Rechnung und Sonstiges gehen immer.';

const ZAHLWOERTER = ['null', 'einem', 'zwei', 'drei', 'vier', 'fünf', 'sechs', 'sieben', 'acht'];

function zahlwort(n: number): string {
  return ZAHLWOERTER[n] ?? String(n);
}
