import type { TreatmentBasisFeld } from './api';

/**
 * Feste Kennung je Kopffeld (UX-012) - die Fehlerzusammenfassung springt
 * darauf. Die Positionen tragen ihre laufende Nummer schon in der
 * Beschriftung und bleiben bei der erzeugten Kennung.
 */
export function grundlageFeldId(feld: TreatmentBasisFeld): string {
  return `grundlage-${feld}`;
}

/**
 * Beschriftung je Kopffeld, in der Reihenfolge des Formulars.
 *
 * Die Fehlerzusammenfassung nennt beide Bauarten, deshalb steht hier das
 * neutrale „Datum"; am Feld selbst steht „Ausstellungsdatum" beziehungsweise
 * „Vereinbart am" (ADR-020 Punkt 7, `bauartDatumsBeschriftung`).
 */
export const GRUNDLAGE_BESCHRIFTUNG: Record<TreatmentBasisFeld, string> = {
  treatment_basis_kind: 'Art',
  prescriber_id: 'Verordner:in',
  issued_on: 'Datum',
  frequency_note: 'Frequenz',
  diagnosis: 'Diagnose oder Leitsymptomatik',
  therapy_goal: 'Therapieziel',
  prescriber_note: 'Hinweis der Verordner:in',
  follow_up_recommendation: 'Empfehlung der Therapeut:in zum Verordnungsende',
  note: 'Bemerkung',
};

export const GRUNDLAGE_REIHENFOLGE = Object.keys(GRUNDLAGE_BESCHRIFTUNG) as TreatmentBasisFeld[];
