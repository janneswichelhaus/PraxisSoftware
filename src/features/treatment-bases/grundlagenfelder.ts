import type { GrundlageFehlerfeld } from './api';

/**
 * Feste Kennung je Feld (UX-012) - die Fehlerzusammenfassung springt darauf.
 *
 * Auch die Heilmittelauswahl hat eine: Sie ist kein einzelnes Feld, kann aber
 * fehlen. Die Kennung trägt dort das erste Kästchen der Gruppe.
 */
export function grundlageFeldId(feld: GrundlageFehlerfeld): string {
  return `grundlage-${feld}`;
}

/**
 * Beschriftung je Feld, in der Reihenfolge des Formulars.
 *
 * Die Fehlerzusammenfassung nennt beide Bauarten, deshalb steht hier das
 * neutrale „Datum"; am Feld selbst steht „Ausstellungsdatum" beziehungsweise
 * „Vereinbart am" (ADR-020 Punkt 7, `bauartDatumsBeschriftung`).
 *
 * Seit VER-EPIC-002 sind es sieben statt neun: Die Heilmittel sind eine
 * Auswahl, die Terminzahl ein eigenes Feld, „Anmerkungen" das einzige
 * Textfeld neben der Diagnose. Therapieziel, Hinweis der Verordner:in und
 * Empfehlung haben das Formular verlassen (ANN-064, ANN-065).
 */
export const GRUNDLAGE_BESCHRIFTUNG: Record<GrundlageFehlerfeld, string> = {
  treatment_basis_kind: 'Art',
  prescriber_id: 'Verordner:in',
  issued_on: 'Datum',
  frequency_note: 'Frequenz',
  items: 'Heilmittel',
  appointment_count: 'Anzahl möglicher Termine',
  diagnosis: 'Diagnose oder Leitsymptomatik',
  note: 'Anmerkungen',
};

export const GRUNDLAGE_REIHENFOLGE = Object.keys(GRUNDLAGE_BESCHRIFTUNG) as GrundlageFehlerfeld[];
