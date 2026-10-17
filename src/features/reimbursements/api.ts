import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';
import { dateiAblehnungsgrund, dateiInhaltAblehnungsgrund } from '@/features/files/dokumentarten';
import { nachSrgb } from '@/features/files/farbe';
import { alleBytes, bereinigeBild } from '@/features/files/metadaten';

/**
 * Erstattungen (ERS-001): Lesen und Schreiben über die Serverfunktionen aus
 * `supabase/migrations/20261127100000_ers_001_erstattungen.sql`.
 *
 * Wer was sieht, entscheidet und auszahlt, entscheidet der Server (ANN-598):
 * Die Seite fragt `can_decide` und `can_read_all` nur ab, um nicht anzubieten,
 * was abgewiesen würde (ADR-004). Die volle IBAN kommt nur aus
 * `reimbursement_payout_details` (ANN-601).
 */

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

export const REIMBURSEMENT_STATUS = [
  'requested',
  'approved',
  'rejected',
  'withdrawn',
  'paid',
] as const;
export type ReimbursementStatus = (typeof REIMBURSEMENT_STATUS)[number];
export type ReimbursementKind = 'electricity' | 'purchase';

const receiptSchema = z.object({
  id: z.string(),
  amount_cents: z.number().int(),
  purpose: z.string(),
  mime_type: z.string(),
  verified: z.boolean(),
});
export type Receipt = z.infer<typeof receiptSchema>;

const reimbursementSchema = z.object({
  id: z.string(),
  staff_member_id: z.string(),
  name: z.string().nullable(),
  kind: z.enum(['electricity', 'purchase']),
  period_month: z.string().nullable(),
  working_days: z.number().int().nullable(),
  energy_wh_per_day: z.number().int().nullable(),
  working_minutes: z.number().int().nullable(),
  km_per_hour: z.number().int().nullable(),
  wh_per_km: z.number().int().nullable(),
  rate_cents_per_kwh: z.number().int().nullable(),
  amount_cents: z.number().int(),
  status: z.enum(REIMBURSEMENT_STATUS),
  self_entered: z.boolean(),
  requested_at: z.string(),
  decided_at: z.string().nullable(),
  decided_by_name: z.string().nullable(),
  decision_note: z.string().nullable(),
  withdrawn_at: z.string().nullable(),
  paid_at: z.string().nullable(),
  paid_by_name: z.string().nullable(),
  receipts: z.array(receiptSchema),
});
export type Reimbursement = z.infer<typeof reimbursementSchema>;

const accountSchema = z.object({ iban_masked: z.string(), since: z.string() });
export type PayoutAccount = z.infer<typeof accountSchema>;

const overviewSchema = z.object({
  my_staff_member_id: z.string().nullable(),
  can_decide: z.boolean(),
  can_read_all: z.boolean(),
  person: z
    .object({
      staff_member_id: z.string(),
      name: z.string().nullable(),
      account: accountSchema.nullable(),
      reimbursements: z.array(reimbursementSchema),
    })
    .nullable(),
  to_decide: z.array(reimbursementSchema),
  to_pay: z.array(reimbursementSchema.extend({ iban_masked: z.string().nullable() })),
  people: z.array(
    z.object({ staff_member_id: z.string(), name: z.string().nullable(), open: z.number().int() }),
  ),
});
export type Overview = z.infer<typeof overviewSchema>;

const electricityPreviewSchema = z.object({
  month: z.string(),
  working_minutes: z.number().int(),
  km_per_hour: z.number().int(),
  wh_per_km: z.number().int(),
  cents_per_kwh: z.number().int(),
  amount_cents: z.number().int(),
  already_requested: z.boolean(),
});
export type ElectricityPreview = z.infer<typeof electricityPreviewSchema>;

const electricitySuggestionSchema = z.object({
  month: z.string(),
  working_minutes: z.number().int(),
  amount_cents: z.number().int(),
});
export type ElectricitySuggestion = z.infer<typeof electricitySuggestionSchema>;

const electricitySettingsSchema = z.object({
  electricity_cents_per_kwh: z.number().int(),
  electricity_wh_per_km: z.number().int(),
  electricity_km_per_hour: z.number().int(),
});

/** Die Werte der Praxis für den Ladestrom (ORG-008). */
export interface ElectricitySettings {
  centsPerKwh: number;
  whPerKm: number;
  kmPerHour: number;
}

const submittedSchema = z.object({
  id: z.string(),
  status: z.enum(['requested', 'approved']),
  amount_cents: z.number().int(),
});
export type Submitted = z.infer<typeof submittedSchema>;

const payoutSchema = reimbursementSchema.extend({
  iban: z.string().nullable(),
  account_since: z.string().nullable(),
});
export type PayoutDetails = z.infer<typeof payoutSchema>;

// -----------------------------------------------------------------------------
// Fehler in Sätzen der Praxis
// -----------------------------------------------------------------------------

type ServerError = { message?: string; code?: string } | null;

const SENTENCES: readonly (readonly [string, string])[] = [
  ['invalid iban', 'Die IBAN stimmt nicht – bitte die Ziffern prüfen.'],
  ['payout account missing', 'Bitte zuerst die IBAN für die Auszahlung angeben.'],
  ['month already requested', 'Für diesen Monat ist Ladestrom schon beantragt.'],
  ['month not allowed', 'Ladestrom geht für einen der letzten zwölf abgeschlossenen Monate.'],
  [
    'no planned working hours',
    'In diesem Monat sind keine Arbeitsstunden geplant – es gibt nichts zu erstatten.',
  ],
  ['declaration missing', 'Ladestrom gibt es nur, wenn zu Hause geladen wurde.'],
  ['electricity settings out of range', 'Bitte die Werte in den angegebenen Grenzen eintragen.'],
  [
    'too many receipts',
    'Schon zehn Belege ohne Antrag – nicht abgesendete fallen nach einem Tag weg.',
  ],
  ['one to ten receipts', 'Ein bis zehn Belege je Erstattung.'],
  ['receipt item is invalid', 'Bitte je Beleg einen Betrag bis 1.000 € und wofür angeben.'],
  ['receipt not found', 'Dieser Beleg ist nicht mehr da – bitte noch einmal fotografieren.'],
  ['unsupported media type', 'Belege gehen als Foto (JPEG, PNG) oder PDF.'],
  ['file too large or empty', 'Die Datei ist leer oder größer als 10 MB.'],
  ['reimbursement is not open', 'Diese Erstattung ist schon entschieden oder zurückgezogen.'],
  ['reimbursement is not approved', 'Diese Erstattung ist nicht (mehr) zum Auszahlen offen.'],
  ['reimbursement not found', 'Diese Erstattung gibt es nicht mehr.'],
  ['rejection needs a reason', 'Bitte einen Grund angeben.'],
  ['not allowed to decide own request', 'Über die eigene Erstattung entscheidet jemand anderes.'],
  ['no staff member for this account', 'Zu Ihrem Konto gibt es keinen Mitarbeiterdatensatz.'],
  ['staff member not found', 'Diese Person gibt es nicht im Mitarbeiterstamm.'],
  ['is too long', 'Höchstens 500 Zeichen.'],
  ['not allowed', 'Dafür fehlt die Berechtigung.'],
];

function sentence(error: ServerError, fallback: string): Error {
  const text = error?.message ?? '';
  const hit = SENTENCES.find(([key]) => text.includes(key));
  return new Error(hit ? hit[1] : fallback);
}

async function call(fn: string, args: Record<string, unknown>, fallback: string) {
  const { data, error } = (await getSupabase().rpc(fn, args)) as {
    data: unknown;
    error: ServerError;
  };
  if (error) throw sentence(error, fallback);
  return data;
}

// -----------------------------------------------------------------------------
// Lesen
// -----------------------------------------------------------------------------

export const REIMBURSEMENTS_KEY = ['reimbursements'] as const;

export function reimbursementsKey(staffMemberId: string | null) {
  return [...REIMBURSEMENTS_KEY, staffMemberId ?? 'own'] as const;
}

/** Der Satz, wenn die Liste ohne Antwort des Servers nicht lädt. */
export const LOAD_ERROR = 'Die Erstattungen konnten nicht geladen werden.';

/** Die eigenen Erstattungen - oder, für owner und Büro, die einer anderen Person. */
export async function fetchReimbursements(staffMemberId: string | null): Promise<Overview> {
  const data = await call('list_reimbursements', { p_staff_member_id: staffMemberId }, LOAD_ERROR);
  return antwort(overviewSchema, data, LOAD_ERROR);
}

/** Der Satz, wenn der Vorschlag ohne Antwort des Servers nicht kommt (Funkloch). */
export const PREVIEW_ERROR = 'Die Arbeitsstunden konnten nicht gezählt werden.';

/**
 * Ladestrom eines Monats (ORG-008): geplante Arbeitsminuten, die Werte der
 * Praxis und der Betrag - gerechnet am Server.
 */
export async function previewElectricity(month: string): Promise<ElectricityPreview> {
  const data = await call('preview_electricity_reimbursement', { p_month: month }, PREVIEW_ERROR);
  return antwort(electricityPreviewSchema, data, PREVIEW_ERROR);
}

export const SUGGESTIONS_KEY = [...REIMBURSEMENTS_KEY, 'suggestions'] as const;

/** Die abgeschlossenen Monate ohne Ladestrom-Antrag, mit Betrag - für den Eingang. */
export async function fetchElectricitySuggestions(): Promise<ElectricitySuggestion[]> {
  const fallback = 'Der Ladestrom konnte nicht berechnet werden.';
  const data = await call('electricity_suggestions', {}, fallback);
  return antwort(z.array(electricitySuggestionSchema), data ?? [], fallback);
}

export const ELECTRICITY_SETTINGS_KEY = ['electricity-settings'] as const;

/** Die Werte der eigenen Praxis - RLS liefert Praxiskonten genau die eigene Organisation. */
export async function fetchElectricitySettings(): Promise<ElectricitySettings> {
  const fallback = 'Die Werte für den Ladestrom konnten nicht geladen werden.';
  const { data, error } = await getSupabase()
    .from('organizations')
    .select('electricity_cents_per_kwh, electricity_wh_per_km, electricity_km_per_hour')
    .maybeSingle();
  if (error || !data) throw new Error(fallback);
  const row = antwort(electricitySettingsSchema, data, fallback);
  return {
    centsPerKwh: row.electricity_cents_per_kwh,
    whPerKm: row.electricity_wh_per_km,
    kmPerHour: row.electricity_km_per_hour,
  };
}

/** Verbindlich prüft `set_electricity_settings`: nur owner, Werte in ihren Grenzen. */
export async function saveElectricitySettings(settings: ElectricitySettings): Promise<void> {
  await call(
    'set_electricity_settings',
    {
      p_cents_per_kwh: settings.centsPerKwh,
      p_wh_per_km: settings.whPerKm,
      p_km_per_hour: settings.kmPerHour,
    },
    'Die Werte für den Ladestrom konnten nicht gespeichert werden.',
  );
}

export const PAYOUT_ERROR = 'Die Angaben zur Auszahlung konnten nicht geladen werden.';

/** Für owner: die volle IBAN zu einem genehmigten Antrag (ANN-601). */
export async function fetchPayoutDetails(reimbursementId: string): Promise<PayoutDetails> {
  const data = await call(
    'reimbursement_payout_details',
    { p_reimbursement_id: reimbursementId },
    PAYOUT_ERROR,
  );
  return antwort(payoutSchema, data, PAYOUT_ERROR);
}

// -----------------------------------------------------------------------------
// Schreiben
// -----------------------------------------------------------------------------

export async function savePayoutAccount(iban: string): Promise<PayoutAccount> {
  const fallback = 'Die IBAN konnte nicht gespeichert werden.';
  const data = await call('set_own_payout_account', { p_iban: iban }, fallback);
  return antwort(accountSchema, data, fallback);
}

export async function submitElectricity(input: {
  month: string;
  /** Der Haken „zu Hause geladen“ - der Server prüft ihn selbst. */
  declared: boolean;
  iban: string | null;
}): Promise<Submitted> {
  const fallback = 'Der Ladestrom konnte nicht beantragt werden.';
  const data = await call(
    'submit_electricity_reimbursement',
    {
      p_month: input.month,
      p_declared: input.declared,
      p_iban: input.iban,
    },
    fallback,
  );
  return antwort(submittedSchema, data, fallback);
}

export async function submitPurchase(input: {
  items: readonly { receiptId: string; amountCents: number; purpose: string }[];
  iban: string | null;
}): Promise<Submitted> {
  const fallback = 'Der Einkauf konnte nicht beantragt werden.';
  const data = await call(
    'submit_purchase_reimbursement',
    {
      p_items: input.items.map((item) => ({
        receipt_id: item.receiptId,
        amount_cents: item.amountCents,
        purpose: item.purpose,
      })),
      p_iban: input.iban,
    },
    fallback,
  );
  return antwort(submittedSchema, data, fallback);
}

export async function withdrawReimbursement(reimbursementId: string): Promise<void> {
  await call(
    'withdraw_reimbursement',
    { p_reimbursement_id: reimbursementId },
    'Die Erstattung konnte nicht zurückgezogen werden.',
  );
}

export async function decideReimbursement(input: {
  reimbursementId: string;
  approve: boolean;
  note: string | null;
}): Promise<{ status: 'approved' | 'rejected' }> {
  const fallback = 'Die Entscheidung konnte nicht gespeichert werden.';
  const data = await call(
    'decide_reimbursement',
    { p_reimbursement_id: input.reimbursementId, p_approve: input.approve, p_note: input.note },
    fallback,
  );
  return antwort(z.object({ status: z.enum(['approved', 'rejected']) }), data, fallback);
}

export async function markPaid(reimbursementId: string): Promise<void> {
  await call(
    'mark_reimbursement_paid',
    { p_reimbursement_id: reimbursementId },
    'Die Auszahlung konnte nicht vermerkt werden.',
  );
}

// -----------------------------------------------------------------------------
// Belege (ANN-600): derselbe Weg wie die Fotos am Rad (ADR-017 Punkt 7)
// -----------------------------------------------------------------------------

async function checksum(file: Blob): Promise<string> {
  const bytes = await alleBytes(file);
  const hash = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

const preparedSchema = z.object({
  receipt_id: z.string(),
  bucket_id: z.string(),
  object_key: z.string(),
});

/** Was die Person liest, wenn der Server einen Beleg verwirft (ADR-017 Punkt 52). */
export const RECEIPT_REJECTED =
  'Der Beleg wurde bei der Prüfung am Server verworfen. Bitte noch einmal fotografieren.';

/**
 * Einen Beleg hochladen - bevor er einem Antrag gehört.
 *
 * Wie `uploadFleetPhoto`: Format und Inhalt prüfen, Farbe nach sRGB,
 * Metadaten eines Fotos verlustfrei entfernen (ADR-017 Punkte 34 und 53),
 * Prüfsumme der bereinigten Bytes, dann (a) vorbereiten, (b) hochladen,
 * (c) bestätigen und die Prüfung am Server. Scheitert (b) oder (c), wird
 * der Beleg verworfen.
 */
export async function uploadReceipt(file: Blob): Promise<string> {
  const reason = dateiAblehnungsgrund(file);
  if (reason) throw new Error(reason);
  const contentReason = await dateiInhaltAblehnungsgrund(file);
  if (contentReason) throw new Error(contentReason);
  const clean = await bereinigeBild(await nachSrgb(file));
  const sum = await checksum(clean);

  const fallback = 'Der Beleg konnte nicht angenommen werden.';
  const data = await call(
    'prepare_reimbursement_receipt_upload',
    { p_mime_type: clean.type, p_byte_size: clean.size, p_checksum_sha256: sum },
    fallback,
  );
  const prepared = antwort(z.array(preparedSchema), data ?? [], fallback)[0];
  if (!prepared) throw new Error(fallback);

  try {
    // ADR-017 Punkte 8 und 16: kein Überschreiben, kein Zwischenspeicher.
    const { error } = await getSupabase()
      .storage.from(prepared.bucket_id)
      .upload(prepared.object_key, clean, {
        contentType: clean.type,
        cacheControl: '0',
        upsert: false,
      });
    if (error) throw new Error('Der Beleg konnte nicht übertragen werden.');
    await call(
      'confirm_reimbursement_receipt_upload',
      { p_receipt_id: prepared.receipt_id },
      'Der übertragene Beleg stimmte nicht mit dem angekündigten überein.',
    );
  } catch (failure) {
    try {
      await getSupabase().rpc('discard_reimbursement_receipt', {
        p_receipt_id: prepared.receipt_id,
      });
    } catch {
      // Der ursprüngliche Grund ist die Meldung; der tägliche Lauf räumt auf.
    }
    throw failure;
  }

  if ((await verifyOnServer(prepared.receipt_id)) === 'rejected') {
    throw new Error(RECEIPT_REJECTED);
  }
  return prepared.receipt_id;
}

/** Prüfung am Inhalt (Edge Function `patient-file-verify`); ohne Function kein Fehler. */
async function verifyOnServer(receiptId: string): Promise<string | null> {
  try {
    const { data, error } = (await getSupabase().functions.invoke<unknown>('patient-file-verify', {
      body: { receipt_id: receiptId },
    })) as { data: unknown; error: unknown };
    if (error) return null;
    const result = z.object({ ergebnis: z.string() }).safeParse(data);
    return result.success ? result.data.ergebnis : null;
  } catch {
    return null;
  }
}

/** Einen eigenen Beleg verwerfen, solange er keinem Antrag gehört. */
export async function discardReceipt(receiptId: string): Promise<void> {
  await call(
    'discard_reimbursement_receipt',
    { p_receipt_id: receiptId },
    'Der Beleg konnte nicht verworfen werden.',
  );
}

/** Gültigkeit eines signierten Verweises in Sekunden (ADR-017 Punkt 15). */
const LINK_SECONDS = 60;

/**
 * Einen Beleg zum Ansehen laden - in den Speicher der Seite, nicht auf das
 * Gerät (ADR-017 Punkt 54): erst die einmalige Freigabe, dann der Verweis,
 * dann `fetch` ohne Zwischenspeicher. Der Verweis verlässt diese Funktion nicht.
 */
export async function loadReceipt(receiptId: string): Promise<Blob> {
  const fallback = 'Der Beleg konnte nicht geöffnet werden.';
  const data = await call(
    'issue_reimbursement_receipt_link',
    { p_receipt_id: receiptId },
    fallback,
  );
  const grant = antwort(
    z.array(z.object({ bucket_id: z.string(), object_key: z.string(), mime_type: z.string() })),
    data ?? [],
    fallback,
  )[0];
  if (!grant) throw new Error(fallback);
  const { data: signed, error } = await getSupabase()
    .storage.from(grant.bucket_id)
    .createSignedUrl(grant.object_key, LINK_SECONDS);
  if (error || !signed?.signedUrl) throw new Error('Der Beleg ist in der Ablage nicht auffindbar.');
  const response = await fetch(signed.signedUrl, { cache: 'no-store' });
  if (!response.ok) throw new Error('Der Beleg konnte nicht geladen werden.');
  return new Blob([await response.arrayBuffer()], { type: grant.mime_type });
}
