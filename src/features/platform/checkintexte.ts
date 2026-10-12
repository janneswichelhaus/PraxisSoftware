import type { Plattformzugang } from './api';

/** Wer die Angaben liest - in der Anrede der Plattform (DSN-001 D6). */
export function leserIn(zugang: Plattformzugang): string {
  return zugang.relationship_kind === 'treatment' ? 'Ihre Therapeut:in' : 'Ihre Trainingsbetreuung';
}

/**
 * Was nach dem Absenden mit den Angaben geschieht (DSN-001 4.1, D5): gelesen
 * beim nächsten Termin, nicht laufend, kein Alarm.
 */
export function nachDemCheckin(zugang: Plattformzugang): string {
  return `Danke. ${leserIn(zugang)} sieht Ihre Angaben beim nächsten Termin. Bei akuten Beschwerden: 112 oder 116117.`;
}
