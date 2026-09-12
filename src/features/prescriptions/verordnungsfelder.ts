import type { PrescriptionFeld } from './api';

/**
 * Feste Kennung je Kopffeld (UX-012) - die Fehlerzusammenfassung springt
 * darauf. Die Positionen tragen ihre laufende Nummer schon in der
 * Beschriftung und bleiben bei der erzeugten Kennung.
 */
export function verordnungFeldId(feld: PrescriptionFeld): string {
  return `verordnung-${feld}`;
}

/** Beschriftung je Kopffeld, in der Reihenfolge des Formulars. */
export const VERORDNUNG_BESCHRIFTUNG: Record<PrescriptionFeld, string> = {
  prescriber_id: 'Verordner:in',
  prescription_kind: 'Art',
  issued_on: 'Ausstellungsdatum',
  frequency_note: 'Frequenz',
  diagnosis: 'Diagnose oder Leitsymptomatik',
  therapy_goal: 'Therapieziel',
  prescriber_note: 'Hinweis der Verordner:in',
  follow_up_recommendation: 'Empfehlung der Therapeut:in zum Verordnungsende',
  note: 'Bemerkung',
};

export const VERORDNUNG_REIHENFOLGE = Object.keys(VERORDNUNG_BESCHRIFTUNG) as PrescriptionFeld[];
