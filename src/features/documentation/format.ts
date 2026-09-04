import { formatLocalDate, formatLocalTime } from '@/features/appointments/api';
import type { TreatmentNote } from './api';

/** Datum und Uhrzeit in der Praxiszeitzone, wie sie in der Dokumentation stehen. */
export function zeitpunkt(wert: string, zone: string): string {
  return `${formatLocalDate(wert, zone)}, ${formatLocalTime(wert, zone)} Uhr`;
}

/**
 * Die Herkunftszeile eines Eintrags.
 *
 * Für einen Entwurf zählt, wer ihn zuletzt geändert hat; für einen
 * finalisierten Eintrag, wer ihn zum Bestandteil der Akte gemacht hat. Beides
 * in einer Zeile zu zeigen wäre für den Alltag zu viel - die vollständige
 * Urheberschaft je Version steht im Änderungsverlauf.
 */
export function herkunft(note: TreatmentNote, zone: string): string {
  const verfasst = note.author_name ? `Verfasst von ${note.author_name}. ` : '';

  // Die automatische Finalisierung hat keine handelnde Person; das steht so
  // da, statt eine zu erfinden (DOK-004, ADR-016 Punkt 7).
  if (note.status === 'final' && note.finalized_at && note.finalisation_kind === 'automatic') {
    return `${verfasst}Automatisch finalisiert am ${zeitpunkt(note.finalized_at, zone)} nach Ablauf der Frist.`;
  }

  if (note.status === 'final' && note.finalized_at) {
    const wer = note.finalized_by_name ? ` von ${note.finalized_by_name}` : '';
    return `${verfasst}Finalisiert am ${zeitpunkt(note.finalized_at, zone)}${wer}.`;
  }

  const wer = note.last_editor_name ? ` von ${note.last_editor_name}` : '';
  return `${verfasst}Zuletzt geändert am ${zeitpunkt(note.updated_at, zone)}${wer}.`;
}
