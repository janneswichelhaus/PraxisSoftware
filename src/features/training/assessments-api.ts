import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Assessments im Training (OUT-002, IDEA-OUT-007): Testbatterie mit
 * Messbedingungen, Ergebnissen und geplanter Wiederholung.
 *
 * Anzeigen und aufzeichnen, nicht bewerten (ADR-006 Punkte 2, 11, 13): Der
 * Seitenvergleich ist eine offene Division, kein Schwellenwert, keine
 * Freigabe, keine Farbe (ANN-365). Rechte, Einwilligung und Protokoll prüft
 * der Server.
 */

const ergebnisSchema = z.object({
  label: z.string(),
  unit: z.string().nullable(),
  value: z.number().nullable(),
  left: z.number().nullable(),
  right: z.number().nullable(),
});

const assessmentSchema = z.object({
  id: z.string(),
  title: z.string(),
  performed_on: z.string(),
  conditions: z.string().nullable(),
  next_due_on: z.string().nullable(),
  created_by_name: z.string().nullable(),
  results: z.array(ergebnisSchema),
});

const sichtSchema = z.object({
  today: z.string(),
  can_write: z.boolean(),
  relationship_open: z.boolean(),
  health_consent: z.boolean(),
  /** Jüngstes zuerst. */
  assessments: z.array(assessmentSchema),
});

export type Assessment = z.infer<typeof assessmentSchema>;
export type Messergebnis = z.infer<typeof ergebnisSchema>;
export type Assessmentsicht = z.infer<typeof sichtSchema>;

export const ASSESSMENT_TITEL_MAX = 80;
export const BEDINGUNGEN_MAX = 500;
export const MESSUNGEN_MAX = 20;
export const MESSUNG_MAX = 80;
export const EINHEIT_MAX = 20;

export function assessmentsKey(verhaeltnisId: string) {
  return ['training-assessments', verhaeltnisId] as const;
}

/** Öffnen heißt lesen: steht als Öffnen des Trainingsverhältnisses im Protokoll. */
export async function fetchAssessments(verhaeltnisId: string): Promise<Assessmentsicht | null> {
  const satz = 'Die Assessments konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_training_assessments', {
    p_relationship_id: verhaeltnisId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  if (data === null) return null;
  return antwort(sichtSchema, data, satz);
}

export type Messeingabe =
  | { label: string; unit: string | null; value: number }
  | { label: string; unit: string | null; left: number; right: number };

function schreibfehler(meldung: string | undefined): string {
  const m = meldung ?? '';
  if (m.includes('consent'))
    return 'Ohne Einwilligung zu Gesundheitsangaben lässt sich kein Assessment festhalten.';
  if (m.includes('has ended'))
    return 'Das Verhältnis ist beendet. Es lässt sich nichts mehr festhalten.';
  if (m.includes('future')) return 'Ein Assessment lässt sich erst am Tag der Messung festhalten.';
  if (m.includes('not found')) return 'Das Assessment wurde nicht gefunden.';
  if (m.includes('not allowed'))
    return 'Assessments halten Inhaber:in und Trainingsbetreuung fest.';
  if (m.includes('due_after')) return 'Die Wiederholung liegt nach dem Tag der Messung.';
  return 'Nicht gespeichert. Bitte die Eingaben und die Verbindung prüfen.';
}

export async function assessmentFesthalten(eingabe: {
  verhaeltnisId: string;
  titel: string;
  tag: string;
  bedingungen: string;
  wiederholung: string | null;
  messungen: readonly Messeingabe[];
}): Promise<void> {
  const { error } = (await getSupabase().rpc('record_training_assessment', {
    p_relationship_id: eingabe.verhaeltnisId,
    p_title: eingabe.titel.trim(),
    p_performed_on: eingabe.tag,
    p_conditions: eingabe.bedingungen.trim() === '' ? null : eingabe.bedingungen.trim(),
    p_next_due_on: eingabe.wiederholung,
    p_results: eingabe.messungen,
  })) as { error: { message?: string } | null };
  if (error) throw new Error(schreibfehler(error.message));
}

export async function assessmentEntfernen(id: string): Promise<void> {
  const { error } = (await getSupabase().rpc('remove_training_assessment', {
    p_assessment_id: id,
  })) as { error: { message?: string } | null };
  if (error) throw new Error(schreibfehler(error.message));
}

// -----------------------------------------------------------------------------
// Darstellung - reine Funktionen
// -----------------------------------------------------------------------------

/**
 * Seitenvergleich (IDEA-OUT-007, ANN-365): die kleinere Seite in Prozent der
 * größeren, ganzzahlig gerundet – eine Division, offen gerechnet. Ohne
 * größere Seite (beide 0) gibt es keine Zahl. Welche Seite betroffen ist und
 * ab wann etwas genügt, sagt die Anwendung nicht.
 */
export function seitenProzent(links: number, rechts: number): number | null {
  const groesser = Math.max(Math.abs(links), Math.abs(rechts));
  if (groesser === 0) return null;
  return Math.round((Math.min(Math.abs(links), Math.abs(rechts)) / groesser) * 100);
}

const zahl = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 2 });

export function zahlText(wert: number): string {
  return zahl.format(wert);
}

/** „12 cm“, „L 112 · R 140 cm“ – der Wert, wie gemessen. */
export function ergebnisText(e: Messergebnis): string {
  const einheit = e.unit ? ` ${e.unit}` : '';
  if (e.left !== null && e.right !== null) {
    return `L ${zahlText(e.left)} · R ${zahlText(e.right)}${einheit}`;
  }
  return e.value !== null ? `${zahlText(e.value)}${einheit}` : '–';
}

/** „kleinere Seite 80 % der größeren“ oder nichts. */
export function seitenText(e: Messergebnis): string | null {
  if (e.left === null || e.right === null) return null;
  const prozent = seitenProzent(e.left, e.right);
  return prozent === null ? null : `kleinere Seite ${prozent} % der größeren`;
}

/** „12,5“ und „12.5“ → 12.5; leer oder keine Zahl → `null`. */
export function zahlAusEingabe(text: string): number | null {
  const t = text.trim().replace(',', '.');
  if (t === '' || /[^\d.-]/.test(t)) return null;
  const wert = Number(t);
  return Number.isFinite(wert) ? wert : null;
}

/** Je Titel die Assessments, jüngstes zuerst; die Titel nach dem jüngsten. */
export function nachTitel(assessments: readonly Assessment[]): [string, Assessment[]][] {
  const gruppen = new Map<string, Assessment[]>();
  for (const a of assessments) gruppen.set(a.title, [...(gruppen.get(a.title) ?? []), a]);
  return [...gruppen];
}

/**
 * Die Wiedervorlage (IDEA-OUT-007): je Titel gilt die Wiederholung des
 * jüngsten Assessments. Fällig heißt: Der Tag ist erreicht – ein Datum, keine
 * Bewertung.
 */
export function wiedervorlagen(
  assessments: readonly Assessment[],
  heute: string,
): { titel: string; am: string; faellig: boolean }[] {
  return nachTitel(assessments)
    .flatMap(([titel, liste]) => {
      const am = liste[0]!.next_due_on;
      return am ? [{ titel, am, faellig: am <= heute }] : [];
    })
    .sort((a, b) => a.am.localeCompare(b.am));
}
