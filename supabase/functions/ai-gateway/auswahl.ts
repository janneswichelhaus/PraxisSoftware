/**
 * Welcher Adapter antwortet (KI-EPIC-001, ADR-005 Punkte 5 und 8).
 *
 * Die Wahl hängt an einem Secret, nicht an einem Schalter in der Oberfläche:
 * `AI_PROVIDER=mock` ist die Nachbildung. Einen anderen Wert gibt es nicht,
 * solange kein Anbieter entschieden und geprüft ist (ADR-002, C6) - es wird
 * auch keiner vorgebaut.
 *
 * **Alles andere heißt „nicht eingerichtet", nie stillschweigend die
 * Nachbildung** - dieselbe Regel wie beim Kartendienst (ANN-090). Ein fester
 * Beispieltext, der einspringt, weil ein Secret fehlt oder falsch geschrieben
 * ist, sähe aus wie ein verstandenes Diktat. **In der Produktion ist die
 * Nachbildung ausgeschlossen** (wie ADR-019 Punkt 36): Fehlt `APP_ENVIRONMENT`
 * oder ist es unbekannt, gilt die Produktion. Die Annahme dazu ist ANN-524,
 * verankert an `src/lib/ki/gateway.ts`.
 */

import { erstelleNachbildung } from './mock.ts';
import type { Sprachadapter } from './typen.ts';

/** Nur die Felder, die diese Function tatsächlich liest. */
export interface Umgebung {
  readonly AI_PROVIDER?: string | undefined;
  /** `development`, `test` oder `production`. */
  readonly APP_ENVIRONMENT?: string | undefined;
}

export type Umgebungsart = 'development' | 'test' | 'production';

/**
 * Welche Umgebung das ist - ohne Angabe oder mit unbekannter Angabe die
 * Produktion. Dieselbe Regel wie `umgebungsart` im Kartendienst
 * (`auswahl.test.ts` vergleicht beide); kopiert statt importiert, damit der
 * Gateway nicht den Kartenanbieter mitlädt.
 */
export function umgebungsart(wert: string | undefined): Umgebungsart {
  const art = (wert ?? '').trim().toLowerCase();
  return art === 'development' || art === 'test' ? art : 'production';
}

/** Was die Function aus ihren Secrets macht. */
export interface Einrichtung {
  /** `null`: nicht eingerichtet oder in der Produktion abgewiesen. */
  readonly adapter: Sprachadapter | null;
  /**
   * Wurde die Nachbildung in der Produktion abgewiesen? Dann meldet der
   * Handler es als Protokolleintrag (noch ohne Ausgang, `index.ts`).
   */
  readonly gateAbgewiesen: boolean;
}

export function richteEin(umgebung: Umgebung): Einrichtung {
  const anbieter = (umgebung.AI_PROVIDER ?? '').trim().toLowerCase();
  const produktion = umgebungsart(umgebung.APP_ENVIRONMENT) === 'production';
  if (anbieter === 'mock') {
    return produktion
      ? { adapter: null, gateAbgewiesen: true }
      : { adapter: erstelleNachbildung(), gateAbgewiesen: false };
  }
  return { adapter: null, gateAbgewiesen: false };
}
