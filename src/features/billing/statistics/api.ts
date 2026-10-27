import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import type { Kennzahlen, Zielkennung, Ziele } from './kennzahlen';

/**
 * Kennzahlen und Zielwerte der Praxisführung (STA-001, STA-002).
 *
 * Beide Aufrufe liefert der Server allein `owner`; eine andere Rolle bekommt
 * keine Zeile. Die Seite wird ihr gar nicht erst angeboten — die Grenze
 * sitzt trotzdem im Server (ADR-004).
 */

// `bigint` kommt aus PostgREST als Zahl oder Zeichenkette.
const zahl = z.coerce.number();

const kennzahlenSchema = z.object({
  time_zone: z.string(),
  today: z.string(),
  month: z.string(),
  previous_month: z.string(),
  revenue_cents: zahl,
  revenue_therapy_cents: zahl,
  revenue_training_cents: zahl,
  revenue_previous_cents: zahl,
  payments_cents: zahl,
  payments_previous_cents: zahl,
  open_count: zahl,
  open_cents: zahl,
  open_not_due_count: zahl,
  open_not_due_cents: zahl,
  open_overdue_1_30_count: zahl,
  open_overdue_1_30_cents: zahl,
  open_overdue_31_60_count: zahl,
  open_overdue_31_60_cents: zahl,
  open_overdue_over_60_count: zahl,
  open_overdue_over_60_cents: zahl,
  utilization_from: z.string(),
  utilization_to: z.string(),
  available_minutes: zahl,
  booked_minutes: zahl,
  ending_bases: zahl,
  uncovered_appointments: zahl,
  absences_from: z.string(),
  absences_to: z.string(),
  patient_cancellations: zahl,
  no_shows: zahl,
  absences_with_fee: zahl,
  absence_fee_cents: zahl,
  absences_previous: zahl,
  absence_fee_previous_cents: zahl,
}) satisfies z.ZodType<Kennzahlen>;

const zieleSchema = z.object({
  revenue_cents: zahl.nullable(),
  open_items_cents: zahl.nullable(),
  utilization_percent: zahl.nullable(),
  ending_bases: zahl.nullable(),
  absences: zahl.nullable(),
});

export const KENNZAHLEN_KEY = ['statistics', 'kennzahlen'] as const;
export const ZIELE_KEY = ['statistics', 'ziele'] as const;

/** Die Kennzahlen für einen Monat; `null` heißt der laufende Monat in der Zeitzone der Praxis. */
export async function fetchKennzahlen(monat: string | null): Promise<Kennzahlen> {
  const satz = 'Die Statistik konnte nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_practice_statistics', {
    p_month: monat,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  const zeilen = antwort(z.array(kennzahlenSchema), data ?? [], satz);
  if (zeilen.length !== 1) throw new Error(satz);
  return zeilen[0]!;
}

export async function fetchZiele(): Promise<Ziele> {
  const satz = 'Die Zielwerte konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_practice_targets')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error(satz);
  const zeilen = antwort(z.array(zieleSchema), data ?? [], satz);
  if (zeilen.length !== 1) throw new Error(satz);
  return zeilen[0]!;
}

/** Setzt einen Zielwert; `null` leert ihn. */
export async function setzeZiel(ziel: Zielkennung, wert: number | null): Promise<void> {
  const { error } = (await getSupabase().rpc('set_practice_target', {
    p_kpi: ziel,
    p_value: wert,
  })) as { error: unknown };
  if (error) throw new Error('Der Zielwert konnte nicht gespeichert werden.');
}

// -----------------------------------------------------------------------------
// Grafiken (STA-004, STA-006)
// -----------------------------------------------------------------------------

const monatSchema = z.object({
  month: z.string(),
  revenue_cents: zahl,
  revenue_therapy_cents: zahl,
  revenue_training_cents: zahl,
  payments_cents: zahl,
});
export type Umsatzmonat = z.infer<typeof monatSchema>;

const leistungSchema = z.object({
  code: z.string(),
  label: z.string(),
  revenue_cents: zahl,
});
export type Leistungsumsatz = z.infer<typeof leistungSchema>;

const personSchema = z.object({
  month: z.string(),
  staff_member_id: z.string().nullable(),
  staff_name: z.string().nullable(),
  revenue_cents: zahl,
});
export type Personenumsatz = z.infer<typeof personSchema>;

export const MONATE_KEY = ['statistics', 'monate'] as const;
export const LEISTUNGEN_KEY = ['statistics', 'leistungen'] as const;
export const JE_PERSON_KEY = ['statistics', 'je-person'] as const;

/** Umsatz und Zahlungseingang je Monat, bis einschließlich des laufenden. */
export async function fetchUmsatzMonate(monate = 12): Promise<Umsatzmonat[]> {
  const satz = 'Der Umsatzverlauf konnte nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_practice_revenue_months', {
    p_months: monate,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(z.array(monatSchema), data ?? [], satz);
}

/** Umsatz je Leistung in einem Monat, absteigend. */
export async function fetchTopLeistungen(monat: string | null): Promise<Leistungsumsatz[]> {
  const satz = 'Die Leistungen konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_top_services', {
    p_month: monat,
    p_limit: 10,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(z.array(leistungSchema), data ?? [], satz);
}

/**
 * Umsatz je Monat und behandelnder Person (ANN-156). owner bekommt alle,
 * eine Person mit Umsatzbeteiligung nur sich selbst; jeder Aufruf steht im
 * Protokoll.
 */
export async function fetchUmsatzJePerson(monate: number): Promise<Personenumsatz[]> {
  const satz = 'Der Umsatz je Person konnte nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_revenue_by_staff', {
    p_months: monate,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(z.array(personSchema), data ?? [], satz);
}
