/**
 * Die Mitteilung zu einer Push-Nachricht (ADR-024 Punkt 14).
 *
 * Die Nachricht trägt nur den Katalogschlüssel und gegebenenfalls Zeitpunkt
 * und Zeitzone; den Text setzt der Service Worker aus dem Katalog in
 * `src/lib/begriffe.ts`. Was nicht in den Katalog passt, zeigt nichts.
 */

import { benachrichtigungstext, istBenachrichtigungsart } from '../lib/begriffe';

export interface Mitteilung {
  readonly titel: string;
  readonly text: string;
  /** Gleiche Art ersetzt die vorige Mitteilung, statt sich zu stapeln. */
  readonly tag: string;
}

export function mitteilungAusPush(daten: unknown): Mitteilung | null {
  if (typeof daten !== 'object' || daten === null) return null;
  const d = daten as Record<string, unknown>;
  if (!istBenachrichtigungsart(d['k'])) return null;
  const zeitpunkt = typeof d['t'] === 'string' ? d['t'] : null;
  const zone = typeof d['z'] === 'string' && /^[A-Za-z_/]{1,64}$/.test(d['z']) ? d['z'] : undefined;
  try {
    const { titel, text } = benachrichtigungstext(d['k'], zeitpunkt, zone);
    return { titel, text, tag: d['k'] };
  } catch {
    // Eine Zeitzone, die der Browser nicht kennt.
    const { titel, text } = benachrichtigungstext(d['k'], zeitpunkt);
    return { titel, text, tag: d['k'] };
  }
}
