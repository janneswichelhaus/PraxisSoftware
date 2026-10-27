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
 * Kennung des Fehlersatzes der Heilmittelauswahl (VER-16).
 *
 * Gruppe und erstes Kästchen verweisen darauf (`aria-describedby`): Wer der
 * Fehlerzusammenfassung auf das Kästchen folgt, hört dort, was fehlt.
 */
export const HEILMITTEL_FEHLER_ID = 'grundlage-items-error';

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
 *
 * Seit UXR-007 (VER-21) steht die Frequenz hinter der Terminzahl: Heilmittel,
 * Anzahl und Frequenz schreibt die Praxis zusammen vom Rezept ab.
 */
export const GRUNDLAGE_BESCHRIFTUNG: Record<GrundlageFehlerfeld, string> = {
  treatment_basis_kind: 'Art',
  prescriber_id: 'Verordner:in',
  issued_on: 'Datum',
  items: 'Heilmittel',
  appointment_count: 'Anzahl möglicher Termine',
  frequency_note: 'Frequenz',
  diagnosis: 'Diagnose oder Leitsymptomatik',
  note: 'Anmerkungen',
};

export const GRUNDLAGE_REIHENFOLGE = Object.keys(GRUNDLAGE_BESCHRIFTUNG) as GrundlageFehlerfeld[];

/**
 * Der späteste zulässige Tag für Ausstellungs- und Vereinbarungsdatum: heute
 * (VER-15).
 *
 * In der Ortszeit des Geräts, wie die Prüfung in `treatmentBasisFormSchema`
 * („darf nicht in der Zukunft liegen"). Am Feld als `max` gesetzt, bietet die
 * Datumsauswahl die Zukunft gar nicht erst an; verbindlich bleibt die Prüfung.
 */
export function spaetestesDatum(jetzt: Date = new Date()): string {
  const monat = String(jetzt.getMonth() + 1).padStart(2, '0');
  const tag = String(jetzt.getDate()).padStart(2, '0');
  return `${jetzt.getFullYear()}-${monat}-${tag}`;
}
