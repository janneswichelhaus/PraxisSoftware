import { erstelleNachbildung } from './mock.ts';
import type { Terminaladapter } from './typen.ts';

/** Nur die Felder, die diese Function tatsächlich liest. */
export interface Umgebung {
  readonly CARD_TERMINAL_PROVIDER?: string | undefined;
  /** `development`, `test` oder `production`; ohne Angabe die Produktion. */
  readonly APP_ENVIRONMENT?: string | undefined;
}

/** Ohne oder mit unbekannter Angabe die Produktion - wie beim Kartendienst (ADR-019 Punkt 36). */
export function umgebungsart(wert: string | undefined): 'development' | 'test' | 'production' {
  const art = (wert ?? '').trim().toLowerCase();
  return art === 'development' || art === 'test' ? art : 'production';
}

// Grundsatz 5: Bis ein Zahlungsdienst geprüft ist, gibt es nur die Nachbildung, und die nicht in der
// Produktion. Alles andere heißt „nicht eingerichtet“, nie stillschweigend die Nachbildung.
export function waehleTerminal(umgebung: Umgebung): Terminaladapter | null {
  const anbieter = (umgebung.CARD_TERMINAL_PROVIDER ?? '').trim().toLowerCase();
  if (anbieter !== 'mock') return null;
  return umgebungsart(umgebung.APP_ENVIRONMENT) === 'production' ? null : erstelleNachbildung();
}
