import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import type { DatevBereich, DatevBuchung, DatevLauf } from './datev';

/**
 * Export für die Steuerberatung im DATEV-Format (ANN-828 bis ANN-830). Einstellungen speichert
 * nur owner, exportieren owner und office; was eine Rolle sieht, entscheidet der Server (ADR-004).
 */

const einstellungenSchema = z.object({
  consultant_number: z.number(),
  client_number_therapy: z.number().nullable(),
  client_number_training: z.number().nullable(),
  chart_of_accounts: z.enum(['SKR03', 'SKR04']),
});

export type DatevEinstellungen = z.infer<typeof einstellungenSchema>;

/** `null`: noch nicht erfasst. */
export async function fetchDatevEinstellungen(): Promise<DatevEinstellungen | null> {
  const { data, error } = await getSupabase()
    .from('datev_settings')
    .select('consultant_number, client_number_therapy, client_number_training, chart_of_accounts')
    .maybeSingle();

  if (error) throw new Error('Die DATEV-Angaben konnten nicht geladen werden.');
  return data === null
    ? null
    : antwort(einstellungenSchema, data, 'Die DATEV-Angaben konnten nicht geladen werden.');
}

export async function speichereDatevEinstellungen(werte: DatevEinstellungen): Promise<void> {
  const { error } = await getSupabase().rpc('save_datev_settings', {
    p_consultant_number: werte.consultant_number,
    p_client_number_therapy: werte.client_number_therapy,
    p_client_number_training: werte.client_number_training,
    p_chart_of_accounts: werte.chart_of_accounts,
  });

  if (error) throw new Error('Die DATEV-Angaben konnten nicht gespeichert werden.');
}

const buchungSchema = z.object({
  kind: z.enum(['invoice', 'cancellation', 'payment', 'payment_void']),
  document_date: z.string(),
  invoice_number: z.string(),
  document_number: z.string().nullable(),
  tax_treatment: z.enum(['exempt_healthcare', 'taxable', 'not_taxable']).nullable(),
  tax_rate_permille: z.number().nullable(),
  small_business: z.boolean(),
  // `bigint` aus der Datenbank: je nach Größe Zahl oder Zeichenkette.
  amount_cents: z.coerce.number(),
  direction: z.enum(['incoming', 'refund']).nullable(),
  method: z.enum(['bank_transfer', 'other', 'offset']).nullable(),
  currency: z.string(),
}) satisfies z.ZodType<DatevBuchung, unknown>;

/** Was der Monat eines Bereichs noch nicht exportiert hat (ANN-830). */
export async function fetchDatevOffen(
  bereich: DatevBereich,
  monat: string,
): Promise<DatevBuchung[]> {
  const { data, error } = (await getSupabase().rpc('list_datev_pending', {
    p_service_area: bereich,
    p_month: monat,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Buchungen konnten nicht geladen werden.');
  return antwort(z.array(buchungSchema), data ?? [], 'Die Buchungen konnten nicht geladen werden.');
}

const laufzeileSchema = z.object({
  id: z.string(),
  sequence: z.number(),
  created_at: z.string(),
  document_count: z.number(),
  invoice_ids: z.array(z.string()),
  cancelled_invoice_ids: z.array(z.string()),
});

export type DatevLaufzeile = z.infer<typeof laufzeileSchema>;

export async function fetchDatevLaeufe(
  bereich: DatevBereich,
  monat: string,
): Promise<DatevLaufzeile[]> {
  const { data, error } = (await getSupabase().rpc('list_datev_exports', {
    p_service_area: bereich,
    p_month: monat,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Exporte konnten nicht geladen werden.');
  return antwort(z.array(laufzeileSchema), data ?? [], 'Die Exporte konnten nicht geladen werden.');
}

const FEHLER: [string, string][] = [
  ['nothing new to export', 'In diesem Monat ist nichts Neues zu exportieren.'],
  ['datev settings missing', 'Zuerst die DATEV-Angaben eintragen.'],
  ['datev client number missing', 'Für diesen Bereich fehlt die Mandantennummer.'],
  ['only euro amounts', 'Nur Beträge in Euro lassen sich exportieren.'],
  ['lies in the future', 'Dieser Monat hat noch nicht begonnen.'],
];

/** Legt einen Exportlauf an und gibt seine Kennung zurück. */
export async function erstelleDatevLauf(bereich: DatevBereich, monat: string): Promise<string> {
  const { data, error } = (await getSupabase().rpc('create_datev_export', {
    p_service_area: bereich,
    p_month: monat,
  })) as { data: unknown; error: { message?: string } | null };

  if (error) {
    const treffer = FEHLER.find(([teil]) => error.message?.includes(teil));
    throw new Error(treffer?.[1] ?? 'Der Export konnte nicht angelegt werden.');
  }
  return antwort(z.string(), data, 'Der Export konnte nicht angelegt werden.');
}

const laufSchema = z.object({
  id: z.string(),
  service_area: z.enum(['therapy', 'training']),
  period_month: z.string(),
  sequence: z.number(),
  consultant_number: z.number(),
  client_number: z.number(),
  chart_of_accounts: z.enum(['SKR03', 'SKR04']),
  created_stamp: z.string().regex(/^\d{17}$/),
  bookings: z.array(buchungSchema),
}) satisfies z.ZodType<DatevLauf, unknown>;

export async function fetchDatevLauf(id: string): Promise<DatevLauf> {
  const { data, error } = (await getSupabase().rpc('get_datev_export', {
    p_export_id: id,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Der Export konnte nicht geladen werden.');
  return antwort(laufSchema, data, 'Der Export konnte nicht geladen werden.');
}
