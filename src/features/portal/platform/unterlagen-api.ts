import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

// -----------------------------------------------------------------------------
// Eigene Rechnungen (ADR-023 Punkt 16, ANN-250)
// -----------------------------------------------------------------------------

export const rechnungZeileSchema = z.object({
  id: z.string().uuid(),
  invoice_number: z.string(),
  issued_on: z.string(),
  due_on: z.string(),
  total_cents: z.number(),
  currency: z.string(),
  paid_cents: z.number(),
  outstanding_cents: z.number(),
  payment_state: z.enum(['unpaid', 'partially_paid', 'paid', 'overpaid']),
  overdue: z.boolean(),
  cancelled: z.boolean(),
  cancelled_on: z.string().nullable(),
  recipient_kind: z.string().nullable(),
  recipient_name: z.string().nullable(),
  service_from: z.string().nullable(),
  service_to: z.string().nullable(),
});
export type Rechnungszeile = z.infer<typeof rechnungZeileSchema>;

export function rechnungenSchluessel(zugangId: string) {
  return ['platform-invoices', zugangId] as const;
}

/** Die ausgestellten Rechnungen des Bereichs - mit Recht `billing`, sonst leer. */
export async function ladeRechnungen(zugangId: string): Promise<Rechnungszeile[]> {
  const satz = 'Ihre Rechnungen konnten nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_invoices', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(rechnungZeileSchema), ergebnis.data ?? [], satz);
}

const positionSchema = z.object({
  performed_on: z.string(),
  code: z.string(),
  label: z.string(),
  item_kind: z.string(),
  quantity: z.number(),
  unit_price_cents: z.number(),
  line_total_cents: z.number(),
  currency: z.string(),
  tax_treatment: z.string(),
  tax_rate_permille: z.number(),
  /** Letzter Tag eines Abo-Monats; ältere Snapshots tragen ihn nicht. */
  period_until: z.string().nullable().optional(),
});
export type Rechnungsposition = z.infer<typeof positionSchema>;

/** Das Blatt: der Snapshot der Praxis (ADR-009 Punkt 10), nur was das Blatt zeigt. */
const rechnungSchema = z.object({
  id: z.string().uuid(),
  invoice_number: z.string(),
  issued_on: z.string(),
  due_on: z.string(),
  paid_cents: z.number(),
  outstanding_cents: z.number(),
  payment_state: z.enum(['unpaid', 'partially_paid', 'paid', 'overpaid']),
  cancellation: z.object({ cancellation_number: z.string(), cancelled_on: z.string() }).nullable(),
  replaces_invoice_number: z.string().nullable(),
  correction_invoice_number: z.string().nullable(),
  document: z.object({
    schema_version: z.number(),
    currency: z.string(),
    service_period: z.object({ from: z.string(), to: z.string() }).nullable().optional(),
    period_month: z.string(),
    issuer: z.object({
      legal_name: z.string(),
      street: z.string().optional(),
      house_number: z.string().nullable().optional(),
      postal_code: z.string().optional(),
      city: z.string().optional(),
      phone: z.string().nullable().optional(),
      email: z.string().nullable().optional(),
      tax_number: z.string().nullable().optional(),
      vat_id: z.string().nullable().optional(),
      bank_name: z.string().nullable().optional(),
      account_holder: z.string().nullable().optional(),
      iban: z.string().optional(),
      bic: z.string().nullable().optional(),
      payment_term_days: z.number().optional(),
    }),
    recipient: z.object({
      kind: z.string(),
      name: z.string(),
      street: z.string().nullable().optional(),
      house_number: z.string().nullable().optional(),
      postal_code: z.string().nullable().optional(),
      city: z.string().nullable().optional(),
    }),
    // Geburtsdatum und Behandlungsgrundlage stehen auf dem Blatt der Praxis
    // (Beihilfe braucht beides) - die Person bekommt dasselbe Blatt (ANN-250).
    patient: z.object({ name: z.string(), date_of_birth: z.string().nullable().optional() }),
    treatment_bases: z
      .array(
        z.object({
          kind: z.string(),
          issued_on: z.string(),
          prescriber: z.string().nullable().optional(),
          diagnosis_icd10: z.string().nullable().optional(),
          diagnosis: z.string().nullable().optional(),
        }),
      )
      .optional(),
    items: z.array(positionSchema),
    tax_groups: z
      .array(
        z.object({
          tax_treatment: z.string(),
          tax_rate_permille: z.number(),
          exemption_reason: z.string().nullable().optional(),
          gross_cents: z.number(),
          tax_cents: z.number(),
          net_cents: z.number(),
        }),
      )
      .optional(),
    totals: z.object({ total_cents: z.number(), tax_total_cents: z.number() }),
  }),
});
export type Rechnungsblatt = z.infer<typeof rechnungSchema>;

export function rechnungSchluessel(zugangId: string, rechnungId: string) {
  return ['platform-invoice', zugangId, rechnungId] as const;
}

/** Eine eigene Rechnung als Blatt; `null`, wenn es sie für diesen Zugang nicht gibt. */
export async function ladeRechnung(
  zugangId: string,
  rechnungId: string,
): Promise<Rechnungsblatt | null> {
  const satz = 'Die Rechnung konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_invoice', {
    p_access_id: zugangId,
    p_invoice_id: rechnungId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  if (ergebnis.data === null || ergebnis.data === undefined) return null;
  return antwort(rechnungSchema, ergebnis.data, satz);
}

// -----------------------------------------------------------------------------
// Freigegebene Dokumente (ADR-017 Punkte 15, 54, 55, ANN-249)
// -----------------------------------------------------------------------------

export const dokumentSchema = z.object({
  id: z.string().uuid(),
  document_type: z.string(),
  display_name: z.string(),
  mime_type: z.string(),
  byte_size: z.coerce.number(),
  released_at: z.string(),
});
export type Dokument = z.infer<typeof dokumentSchema>;

export function dokumenteSchluessel(zugangId: string) {
  return ['platform-files', zugangId] as const;
}

/** Die einzeln freigegebenen Dokumente der Akte - nur im Behandlungszugang. */
export async function ladeDokumente(zugangId: string): Promise<Dokument[]> {
  const satz = 'Ihre Dokumente konnten nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_files', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(dokumentSchema), ergebnis.data ?? [], satz);
}

const verweisSchema = z.object({
  bucket_id: z.string(),
  object_key: z.string(),
  display_name: z.string(),
  mime_type: z.string(),
});

/** Gültigkeit eines signierten Verweises in Sekunden (ADR-017 Punkt 15). */
export const VERWEIS_GUELTIGKEIT_SEKUNDEN = 60;

/**
 * Erst die einmalige Freigabe des Servers (ohne Protokoll, ADR-010 Punkt 22), dann die
 * Unterschrift der Ablage, die sie verbraucht (ADR-017 Punkte 15, 20, 21). Der Verweis bleibt hier.
 */
async function dokumentVerweis(
  zugangId: string,
  dokumentId: string,
  herunterladen: boolean,
): Promise<{ url: string; mimeType: string; name: string }> {
  const satz = 'Das Dokument konnte nicht geöffnet werden.';
  const ergebnis = (await getSupabase().rpc('issue_platform_file_link', {
    p_access_id: zugangId,
    p_file_id: dokumentId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  const freigabe = antwort(z.array(verweisSchema), ergebnis.data ?? [], satz)[0];
  if (!freigabe) throw new Error(satz);
  const ablage = getSupabase().storage.from(freigabe.bucket_id);
  const { data: signiert, error } = herunterladen
    ? await ablage.createSignedUrl(freigabe.object_key, VERWEIS_GUELTIGKEIT_SEKUNDEN, {
        download: freigabe.display_name,
      })
    : await ablage.createSignedUrl(freigabe.object_key, VERWEIS_GUELTIGKEIT_SEKUNDEN);
  if (error || !signiert?.signedUrl) throw new Error(satz);
  return { url: signiert.signedUrl, mimeType: freigabe.mime_type, name: freigabe.display_name };
}

/** Ein Bild zum Ansehen in der Anwendung (ADR-017 Punkt 54). */
export async function ladeDokumentZumAnzeigen(
  zugangId: string,
  dokumentId: string,
): Promise<{ bild: Blob; name: string }> {
  const { url, mimeType, name } = await dokumentVerweis(zugangId, dokumentId, false);
  const antwortDerAblage = await fetch(url, { cache: 'no-store' });
  if (!antwortDerAblage.ok) throw new Error('Das Dokument konnte nicht geladen werden.');
  return { bild: new Blob([await antwortDerAblage.arrayBuffer()], { type: mimeType }), name };
}

/** Ein Dokument auf das Gerät holen (ADR-017 Punkt 55), etwa ein PDF. */
export async function ladeDokumentHerunter(zugangId: string, dokumentId: string): Promise<void> {
  const { url } = await dokumentVerweis(zugangId, dokumentId, true);
  const link = document.createElement('a');
  link.href = url;
  link.rel = 'noopener noreferrer';
  link.download = '';
  link.click();
}
