import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Die Plattform spricht nur Plattformprojektionen an (ADR-023 Punkte 19, 26).
 *
 * Diese Datei ist der einzige Datenzugang des Features. `trennung.test.ts`
 * hält fest, dass hier nichts aus den Praxisfeatures hereinkommt. Welche
 * Zeilen die Person sieht, entscheidet der Server; die Oberfläche zeigt nur.
 */

const kontextSchema = z.object({
  access_id: z.string().uuid(),
  organization_name: z.string(),
  relationship_kind: z.enum(['treatment', 'training']),
  status: z.enum(['active', 'locked']),
  readable: z.boolean(),
  read_until: z.string().nullable(),
  /** POR-006: eigener Zugang oder Vertretung (ADR-023 Punkt 13). */
  access_kind: z.enum(['self', 'legal_representative', 'companion']),
  /** Nur an einer lesbaren Vertretung: für wen sie handelt (Punkt 14). */
  represented_name: z.string().nullable(),
});
export type Plattformzugang = z.infer<typeof kontextSchema>;
export type Bereich = Plattformzugang['relationship_kind'];

export const KONTEXT_SCHLUESSEL = ['platform-context'] as const;

/**
 * Die eigenen Zugänge mit Praxis und Zustand. Leer heißt: Dieses Konto hat
 * keinen Zugang zur Plattform - dann ist es womöglich ein Konto mit offener
 * Praxiseinladung (`ZugangEinrichtenPage`).
 */
export async function ladePlattformkontext(): Promise<Plattformzugang[]> {
  const satz = 'Ihr Zugang konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_context')) as {
    data: unknown;
    error: unknown;
  };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(kontextSchema), ergebnis.data ?? [], satz);
}

/** Die Bezeichnung eines Bereichs in der Sprache der Person (DSN-001 D6). */
export const BEREICHSNAME: Record<Bereich, string> = {
  treatment: 'Behandlung',
  training: 'Training',
};

/**
 * „Überall abmelden" (ADR-023 Punkt 18): beendet alle Sitzungen des Kontos
 * beim Anmeldedienst. Anders als in der Praxis ohne Auditeintrag - das
 * Protokoll kennt für die Plattform nur, was Punkt 24 nennt.
 */
export async function ueberallAbmelden(): Promise<void> {
  const { error } = await getSupabase().auth.signOut({ scope: 'global' });
  if (error) throw new Error('Die Abmeldung auf allen Geräten ist nicht gelungen.');
}

// -----------------------------------------------------------------------------
// Unter „Ich": wer für mich Zugang hat (POR-007, ADR-023 Punkt 14)
// -----------------------------------------------------------------------------

const vertretungSchema = z.object({
  access_id: z.string().uuid(),
  access_kind: z.enum(['legal_representative', 'companion']),
  legal_basis: z.enum(['custody', 'guardianship', 'power_of_attorney']).nullable(),
  representative_name: z.string(),
  status: z.enum(['invited', 'active', 'locked']),
  since: z.string(),
  can_end: z.boolean(),
});
export type MeineVertretung = z.infer<typeof vertretungSchema>;

export function vertretungenSchluessel(zugangId: string) {
  return ['platform-representatives', zugangId] as const;
}

/**
 * Wer für die Person Zugang hat. Der Server antwortet nur über den eigenen
 * Zugang oder eine rechtliche Vertretung; einer Begleitung leer.
 */
export async function ladeMeineVertretungen(zugangId: string): Promise<MeineVertretung[]> {
  const satz = 'Die Liste konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_representatives', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(vertretungSchema), ergebnis.data ?? [], satz);
}

/** Eine Begleitung beenden — der Widerruf der Einwilligung (Punkt 13). */
export async function begleitungBeenden(zugangId: string, begleitungId: string): Promise<void> {
  const satz = 'Die Begleitung konnte nicht beendet werden. Bitte wenden Sie sich an die Praxis.';
  const ergebnis = (await getSupabase().rpc('end_platform_companion', {
    p_access_id: zugangId,
    p_companion_access_id: begleitungId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error || ergebnis.data !== true) throw new Error(satz);
}

// -----------------------------------------------------------------------------
// Reiter „Termine": die eigenen Termine (POR-008, DSN-001 4.1)
// -----------------------------------------------------------------------------

const terminSchema = z.object({
  id: z.string().uuid(),
  starts_at: z.string(),
  ends_at: z.string(),
  appointment_type: z.enum(['home_visit', 'practice', 'video']),
  /** Für die Person: dokumentiert und abgerechnet sind „durchgeführt". */
  status: z.enum(['confirmed', 'cancelled', 'no_show', 'completed']),
  staff_name: z.string().nullable(),
  location_name: z.string().nullable(),
  visit_street: z.string().nullable(),
  visit_house_number: z.string().nullable(),
  visit_postal_code: z.string().nullable(),
  visit_city: z.string().nullable(),
  /**
   * POR-010: Ein Absagewunsch jetzt läge unter 24 Stunden - gerechnet vom
   * Server (ADR-018 Punkt 8), nur am bestätigten künftigen Termin.
   */
  late_notice: z.boolean().nullable(),
  /** POR-010: der offene Wunsch an diesem Termin. */
  open_request_kind: z.enum(['change', 'cancel']).nullable(),
});
export type Termin = z.infer<typeof terminSchema>;

export function termineSchluessel(zugangId: string) {
  return ['platform-appointments', zugangId] as const;
}

/**
 * Die eigenen Termine des gewählten Bereichs: künftige und die der letzten
 * zwölf Monate (ANN-251). Welche Zeilen, entscheidet der Server über den
 * Zugang; die Kennung wählt nur unter den eigenen aus (ADR-023 Punkt 19).
 */
export async function ladeTermine(zugangId: string): Promise<Termin[]> {
  const satz = 'Ihre Termine konnten nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_appointments', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(terminSchema), ergebnis.data ?? [], satz);
}

// -----------------------------------------------------------------------------
// Terminwünsche (POR-009, PROJECT_PRINCIPLES.md 8, DSN-001 4.1, ANN-246)
// -----------------------------------------------------------------------------

export const TAGESZEITEN = ['morning', 'midday', 'afternoon'] as const;
export type Tageszeit = (typeof TAGESZEITEN)[number];
export const TAGESZEIT_NAME: Record<Tageszeit, string> = {
  morning: 'Vormittag',
  midday: 'Mittag',
  afternoon: 'Nachmittag',
};

const wunschSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['new', 'change', 'cancel']),
  appointment_id: z.string().uuid().nullable(),
  /** Kalendertage `YYYY-MM-DD`. */
  preferred_days: z.array(z.string()),
  preferred_times: z.array(z.enum(TAGESZEITEN)),
  note: z.string().nullable(),
  status: z.enum(['open', 'done', 'declined', 'withdrawn']),
  created_at: z.string(),
  resolved_at: z.string().nullable(),
  answer: z.string().nullable(),
});
export type Terminwunsch = z.infer<typeof wunschSchema>;

export function wuenscheSchluessel(zugangId: string) {
  return ['platform-appointment-requests', zugangId] as const;
}

/** Die eigenen Wünsche des Bereichs, offene zuerst. */
export async function ladeWuensche(zugangId: string): Promise<Terminwunsch[]> {
  const satz = 'Ihre Terminwünsche konnten nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_appointment_requests', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(wunschSchema), ergebnis.data ?? [], satz);
}

/**
 * Einen Termin wünschen: Tage, Tageszeiten, eine freie Zeile. Ein Wunsch, kein
 * Termin - einen Termin macht daraus die Praxis (§8). Die Grenzen prüft der
 * Server; die Meldungen hier sagen, was zu tun ist (§13).
 */
export async function terminWuenschen(eingabe: {
  zugangId: string;
  tage: string[];
  zeiten: Tageszeit[];
  notiz: string;
}): Promise<string> {
  const ergebnis = (await getSupabase().rpc('request_platform_appointment', {
    p_access_id: eingabe.zugangId,
    p_days: eingabe.tage,
    p_times: eingabe.zeiten,
    p_note: eingabe.notiz.trim() === '' ? null : eingabe.notiz.trim(),
  })) as { data: unknown; error: { message?: string } | null };
  if (ergebnis.error) throw new Error(wunschfehler(ergebnis.error.message));
  return antwort(z.string().uuid(), ergebnis.data, 'Ihr Wunsch konnte nicht gesendet werden.');
}

/** Verständliche Sätze für die Abweisungen des Servers, ohne interne Details. */
export function wunschfehler(meldung: string | undefined): string {
  const m = meldung ?? '';
  if (m.includes('at least one day')) return 'Bitte wählen Sie mindestens einen Tag.';
  if (m.includes('too many days')) return 'Bitte wählen Sie höchstens 14 Tage.';
  if (m.includes('day out of range'))
    return 'Bitte wählen Sie Tage ab heute, höchstens ein Jahr voraus.';
  if (m.includes('note too long')) return 'Ihre Nachricht darf höchstens 500 Zeichen lang sein.';
  if (m.includes('not allowed'))
    return 'Ihr Zugang erlaubt das gerade nicht. Bitte wenden Sie sich an die Praxis.';
  return 'Ihr Wunsch konnte nicht gesendet werden. Bitte versuchen Sie es erneut.';
}

/** Einen offenen Wunsch zurückziehen. */
export async function wunschZurueckziehen(zugangId: string, wunschId: string): Promise<void> {
  const satz = 'Der Wunsch konnte nicht zurückgezogen werden.';
  const ergebnis = (await getSupabase().rpc('withdraw_platform_appointment_request', {
    p_access_id: zugangId,
    p_request_id: wunschId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error || ergebnis.data !== true) throw new Error(satz);
}

/**
 * Termin ändern oder absagen - als Wunsch (POR-010, D4). Die Absage trägt
 * das Büro ein; als Eingang gilt der Zeitpunkt dieses Wunsches (ANN-247).
 */
export async function terminAendernWuenschen(eingabe: {
  zugangId: string;
  terminId: string;
  art: 'change' | 'cancel';
  tage: string[];
  zeiten: Tageszeit[];
  notiz: string;
}): Promise<string> {
  const ergebnis = (await getSupabase().rpc('request_platform_appointment_change', {
    p_access_id: eingabe.zugangId,
    p_appointment_id: eingabe.terminId,
    p_kind: eingabe.art,
    p_days: eingabe.tage,
    p_times: eingabe.zeiten,
    p_note: eingabe.notiz.trim() === '' ? null : eingabe.notiz.trim(),
  })) as { data: unknown; error: { message?: string } | null };
  if (ergebnis.error) {
    const m = ergebnis.error.message ?? '';
    if (m.includes('request already open'))
      throw new Error('Zu diesem Termin liegt schon ein Wunsch vor. Die Praxis meldet sich.');
    if (m.includes('not confirmed') || m.includes('has started') || m.includes('not found'))
      throw new Error('Dieser Termin lässt sich nicht mehr ändern. Bitte rufen Sie die Praxis an.');
    throw new Error(wunschfehler(m));
  }
  return antwort(z.string().uuid(), ergebnis.data, 'Ihr Wunsch konnte nicht gesendet werden.');
}

// -----------------------------------------------------------------------------
// Befundbogen vorab (POR-012, §7, DSN-001 4.1, ANN-248)
// -----------------------------------------------------------------------------

const bogenSchema = z.object({
  id: z.string().uuid(),
  instrument_id: z.string(),
  definition_version: z.string(),
  status: z.enum(['entwurf', 'abgeschlossen']),
  recorded_on: z.string(),
  source: z.enum(['practice', 'platform']),
  /** Nur aus Erhebungen über die Plattform; eine in der Praxis erhobene bleibt Befund. */
  answers: z.record(z.string(), z.unknown()).nullable(),
  updated_at: z.string(),
  completed_at: z.string().nullable(),
});
export type Bogenstand = z.infer<typeof bogenSchema>;

export function befundbogenSchluessel(zugangId: string) {
  return ['platform-questionnaire', zugangId] as const;
}

/** Der Stand der Bögen, die die Person ausfüllt - nur im Behandlungszugang. */
export async function ladeBefundbogen(zugangId: string): Promise<Bogenstand[]> {
  const satz = 'Ihr Befundbogen konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_questionnaire', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(bogenSchema), ergebnis.data ?? [], satz);
}

function bogenfehler(meldung: string | undefined): string {
  const m = meldung ?? '';
  if (m.includes('already completed'))
    return 'Ihr Befundbogen liegt der Praxis schon vor. Änderungen besprechen Sie beim Termin.';
  if (m.includes('not available'))
    return 'Dieser Bogen lässt sich zurzeit nicht ausfüllen. Bitte wenden Sie sich an die Praxis.';
  if (m.includes('not allowed'))
    return 'Ihr Zugang erlaubt das gerade nicht. Bitte wenden Sie sich an die Praxis.';
  if (m.includes('is completed')) return 'Dieser Bogen ist schon abgeschickt.';
  return 'Ihre Angaben konnten nicht gespeichert werden. Bitte versuchen Sie es erneut.';
}

/** Entwurf anlegen oder überschreiben; der Server prüft jede Antwort gegen die Definition. */
export async function befundbogenSpeichern(eingabe: {
  zugangId: string;
  entwurfId: string | null;
  instrumentId: string;
  version: string;
  antworten: Record<string, unknown>;
}): Promise<string> {
  const ergebnis = (await getSupabase().rpc('save_platform_questionnaire_response', {
    p_access_id: eingabe.zugangId,
    p_response_id: eingabe.entwurfId,
    p_instrument_id: eingabe.instrumentId,
    p_definition_version: eingabe.version,
    p_answers: eingabe.antworten,
  })) as { data: unknown; error: { message?: string } | null };
  if (ergebnis.error) throw new Error(bogenfehler(ergebnis.error.message));
  return antwort(z.string().uuid(), ergebnis.data, bogenfehler(undefined));
}

/** Absenden: der Bogen ist abgeschlossen und liegt der Praxis vor. */
export async function befundbogenAbsenden(zugangId: string, entwurfId: string): Promise<void> {
  const ergebnis = (await getSupabase().rpc('complete_platform_questionnaire_response', {
    p_access_id: zugangId,
    p_response_id: entwurfId,
  })) as { data: unknown; error: { message?: string } | null };
  if (ergebnis.error || ergebnis.data !== true) {
    throw new Error(bogenfehler(ergebnis.error?.message ?? 'not found'));
  }
}

/** Den eigenen Entwurf verwerfen. */
export async function befundbogenVerwerfen(zugangId: string, entwurfId: string): Promise<void> {
  const ergebnis = (await getSupabase().rpc('discard_platform_questionnaire_response', {
    p_access_id: zugangId,
    p_response_id: entwurfId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error || ergebnis.data !== true) {
    throw new Error('Der Entwurf konnte nicht verworfen werden.');
  }
}

// -----------------------------------------------------------------------------
// Eigene Rechnungen (POR-013, DSN-001 D3, ADR-023 Punkt 16, ANN-250)
// -----------------------------------------------------------------------------

const rechnungZeileSchema = z.object({
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
  /** ANG-002: letzter Tag eines Abo-Monats; ältere Snapshots tragen ihn nicht. */
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
// Freigegebene Dokumente (POR-014, DSN-001 D3, ADR-017 Punkte 15, 54, 55, ANN-249)
// -----------------------------------------------------------------------------

const dokumentSchema = z.object({
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
const VERWEIS_GUELTIGKEIT_SEKUNDEN = 60;

/**
 * Der Verweis auf genau ein freigegebenes Dokument: erst die einmalige
 * Freigabe des Servers (protokolliert als Abruf, ADR-023 Punkt 24), dann die
 * Unterschrift der Ablage, die sie verbraucht (ADR-017 Punkte 15, 20, 21).
 * Der Verweis verlässt dieses Modul nicht.
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

// -----------------------------------------------------------------------------
// Einwilligungen (POR-016, POR-017; ADR-023 Punkt 13; ANN-261, ANN-262)
// -----------------------------------------------------------------------------

const einwilligungSchema = z.object({
  purpose: z.enum(['email_contact', 'prescriber_report', 'patient_photos', 'training_health_data']),
  /** open: noch nie etwas; refused: in der Praxis abgelehnt (ADR-017 Punkt 35). */
  state: z.enum(['open', 'granted', 'withdrawn', 'refused']),
  occurred_on: z.string().nullable(),
  /** Wer den Stand gesetzt hat: die Plattform oder ein Papier in der Praxis. */
  source: z.enum(['practice', 'platform']).nullable(),
  /** Nach der Lesefrist nur noch widerrufen (D2, ANN-261). */
  can_grant: z.boolean(),
});
export type Einwilligung = z.infer<typeof einwilligungSchema>;

export function einwilligungenSchluessel(zugangId: string) {
  return ['platform-consents', zugangId] as const;
}

/**
 * Der Stand je Zweck. Leer für eine Begleitung: Sie erteilt nichts, und der
 * Stand geht sie nichts an (Punkt 13).
 */
export async function ladeEinwilligungen(zugangId: string): Promise<Einwilligung[]> {
  const satz = 'Ihre Einwilligungen konnten nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_consents', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(einwilligungSchema), ergebnis.data ?? [], satz);
}

/** Erteilen oder widerrufen, mit der Fassung des Texts, den die Person sah. */
export async function einwilligungSchreiben(eingabe: {
  zugangId: string;
  zweck: Einwilligung['purpose'];
  erteilen: boolean;
  fassung: string;
}): Promise<void> {
  const ergebnis = (await getSupabase().rpc('record_platform_consent', {
    p_access_id: eingabe.zugangId,
    p_purpose: eingabe.zweck,
    p_grant: eingabe.erteilen,
    p_wording_version: eingabe.fassung,
  })) as { data: unknown; error: { message?: string } | null };
  if (ergebnis.error) throw new Error(einwilligungsfehler(ergebnis.error.message));
}

/** Verständliche Sätze für die Abweisungen des Servers (§13). */
export function einwilligungsfehler(meldung: string | undefined): string {
  const m = meldung ?? '';
  if (m.includes('already granted')) return 'Diese Einwilligung ist schon erteilt.';
  if (m.includes('no consent to withdraw'))
    return 'Diese Einwilligung ist nicht erteilt. Es gibt nichts zu widerrufen.';
  if (m.includes('wording outdated'))
    return 'Der Text hat sich geändert. Bitte laden Sie die Seite neu und lesen Sie ihn noch einmal.';
  if (m.includes('not allowed'))
    return 'Das ist mit diesem Zugang nicht möglich. Bitte wenden Sie sich an die Praxis.';
  return 'Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.';
}

// -----------------------------------------------------------------------------
// Datenexport (POR-018, IDEA-QSN-003, ANN-265)
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Trainingspaket und Preise (ANG-008, IDEA-ANG-004, PROJECT_PRINCIPLES.md 4.10)
// -----------------------------------------------------------------------------

const meinPaketSchema = z.object({
  label: z.string(),
  package_months: z.number(),
  price_cents: z.number(),
  currency: z.string(),
  starts_on: z.string(),
  ends_on: z.string(),
  /** Aus dem Tag: beginnt bald, läuft, vorbei. Kein Pausieren (ANN-277). */
  state: z.enum(['planned', 'running', 'ended']),
});
export type MeinPaket = z.infer<typeof meinPaketSchema>;

export function paketeSchluessel(zugangId: string) {
  return ['platform-training-packages', zugangId] as const;
}

/** Die eigenen Pakete; `null` heißt: für diesen Zugang nicht sichtbar (Recht billing). */
export async function ladeMeinePakete(zugangId: string): Promise<MeinPaket[] | null> {
  const satz = 'Ihr Paket konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_training_packages', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(meinPaketSchema).nullable(), ergebnis.data ?? null, satz);
}

const angeboteSchema = z.object({
  /** Enthält der Preis Umsatzsteuer? Unter § 19 UStG nicht. */
  vat_included: z.boolean(),
  offers: z.array(
    z.object({
      code: z.string(),
      label: z.string(),
      package_months: z.number(),
      price_cents: z.number(),
      currency: z.string(),
      tax_rate_permille: z.number(),
    }),
  ),
});
export type Paketangebote = z.infer<typeof angeboteSchema>;

export function angeboteSchluessel(zugangId: string) {
  return ['platform-training-offers', zugangId] as const;
}

/** Die Pakete der geltenden Preisliste; `null`: für diesen Zugang keine (nur Training). */
export async function ladeAngebote(zugangId: string): Promise<Paketangebote | null> {
  const satz = 'Die Preise konnten nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_training_offers', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(angeboteSchema.nullable(), ergebnis.data ?? null, satz);
}

const exportSchema = z.object({
  format: z.literal('plattform-export'),
  format_version: z.number(),
  exported_at: z.string(),
  organization: z.string(),
  relationship: z.enum(['treatment', 'training']),
  exported_by: z.enum(['self', 'legal_representative']),
  person: z.record(z.string(), z.unknown()),
  appointments: z.array(terminSchema),
  appointment_requests: z.array(wunschSchema),
  questionnaires: z.array(bogenSchema),
  invoices: z.array(rechnungZeileSchema),
  documents: z.array(dokumentSchema),
  consents: z.array(einwilligungSchema.omit({ can_grant: true })),
  /** ANG-008: die eigenen Trainingspakete; ältere Exporte tragen sie nicht. */
  training_packages: z.array(meinPaketSchema).default([]),
  /** KND-003: der im Konto geschlossene Trainingsvertrag; sonst null. */
  training_contract: z
    .lazy(() => vertragSchema)
    .nullable()
    .default(null),
});
export type Datenexport = z.infer<typeof exportSchema>;

/**
 * Die eigenen Daten der Plattform, wie der Server sie zusammensetzt. Jeder
 * Aufruf steht im Protokoll der Praxis (ADR-023 Punkt 24) - die Seite ruft
 * deshalb nur auf Knopfdruck auf und nie von selbst.
 */
export async function ladeDatenexport(
  zugangId: string,
): Promise<{ daten: Datenexport; roh: unknown }> {
  const satz =
    'Ihre Daten konnten nicht zusammengestellt werden. Bitte versuchen Sie es noch einmal.';
  const ergebnis = (await getSupabase().rpc('platform_export', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return { daten: antwort(exportSchema, ergebnis.data, satz), roh: ergebnis.data };
}

// -----------------------------------------------------------------------------
// Einstieg (POR-019, IDEA-LZK-005, ANN-266)
// -----------------------------------------------------------------------------

const einstiegSchema = z.object({
  pending: z.boolean(),
  finished_at: z.string().nullable(),
  /** Von der Praxis übersprungen - ohne Namen (ADR-023 Punkt 22). */
  skipped_at: z.string().nullable(),
});
export type Einstiegsstand = z.infer<typeof einstiegSchema>;

export function einstiegSchluessel(zugangId: string) {
  return ['platform-onboarding', zugangId] as const;
}

export async function ladeEinstieg(zugangId: string): Promise<Einstiegsstand | null> {
  const satz = 'Der Einstieg konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_onboarding', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(einstiegSchema), ergebnis.data ?? [], satz)[0] ?? null;
}

/** Den Einstieg beenden - auch mit „Später"; danach kommt er nicht wieder. */
export async function einstiegBeenden(zugangId: string): Promise<void> {
  const ergebnis = (await getSupabase().rpc('finish_platform_onboarding', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error)
    throw new Error('Das hat nicht geklappt. Bitte versuchen Sie es noch einmal.');
}

// -----------------------------------------------------------------------------
// Nachsorge-Abo (ANG-003, ANG-004; PROJECT_PRINCIPLES.md 4.6, ADR-009 Punkt 21)
// -----------------------------------------------------------------------------

const aboSchema = z.object({
  id: z.string().uuid(),
  starts_on: z.string(),
  ends_on: z.string().nullable(),
  /** Läuft, ist gekündigt und läuft noch, oder ist beendet. */
  state: z.enum(['running', 'ending', 'ended']),
  next_month_start: z.string().nullable(),
  next_month_price_cents: z.number().nullable(),
  /** Laufend: das Ende, auf das eine Kündigung heute fiele (ANN-270). */
  cancel_effective_on: z.string().nullable(),
  cancelled_at: z.string().nullable(),
  cancelled_via: z.enum(['practice', 'platform']).nullable(),
  /** Den Knopf haben die Person selbst und ihre rechtliche Vertretung (ANN-273). */
  can_cancel: z.boolean(),
});
export type Nachsorgeabo = z.infer<typeof aboSchema>;

export function aboSchluessel(zugangId: string) {
  return ['platform-aftercare', zugangId] as const;
}

/** Das eigene Abo; `null` heißt: keins, oder für diesen Zugang nicht sichtbar. */
export async function ladeAbo(zugangId: string): Promise<Nachsorgeabo | null> {
  const satz = 'Ihr Abo konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_aftercare', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(aboSchema.nullable(), ergebnis.data ?? null, satz);
}

const kuendigungSchema = z.object({
  ends_on: z.string(),
  cancelled_at: z.string(),
  cancelled_on: z.string(),
});
export type Kuendigungsbestaetigung = z.infer<typeof kuendigungSchema>;

/** Der Kündigungsknopf (ANN-272): liefert die Bestätigung mit Zeitpunkt. */
export async function aboKuendigen(
  zugangId: string,
  aboId: string,
): Promise<Kuendigungsbestaetigung> {
  const satz = 'Die Kündigung ist nicht angekommen. Bitte versuchen Sie es noch einmal.';
  const ergebnis = (await getSupabase().rpc('cancel_platform_aftercare', {
    p_access_id: zugangId,
    p_subscription_id: aboId,
  })) as { data: unknown; error: { message?: string } | null };
  if (ergebnis.error?.message?.includes('already cancelled'))
    throw new Error('Ihr Abo ist schon gekündigt.');
  if (ergebnis.error) throw new Error(satz);
  return antwort(kuendigungSchema, ergebnis.data, satz);
}

// -----------------------------------------------------------------------------
// Trainingsvertrag im eigenen Konto (KND-003, KND-004; PROJECT_PRINCIPLES.md
// 4.10, ANN-288, ANN-289)
// -----------------------------------------------------------------------------

const praxisSchema = z.object({
  name: z.string(),
  street: z.string().nullable(),
  house_number: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
});

const trainingsangebotSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  package_months: z.number(),
  price_cents: z.number(),
  currency: z.string(),
  tax_rate_permille: z.number(),
  /** Enthält der Preis Umsatzsteuer? Unter § 19 UStG nicht. */
  vat_included: z.boolean(),
  starts_on: z.string(),
  ends_on: z.string(),
  valid_until: z.string(),
  offered_on: z.string(),
  handover_items: z.array(z.object({ title: z.string(), body: z.string() })),
  /** Die Kontaktdaten der Akte, wenn die Praxis sie zur Übernahme anbietet. */
  contact: z
    .object({
      date_of_birth: z.string().nullable(),
      street: z.string().nullable(),
      house_number: z.string().nullable(),
      postal_code: z.string().nullable(),
      city: z.string().nullable(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
    })
    .nullable(),
  /** Beginnt das Training innerhalb der Widerrufsfrist? */
  early_start: z.boolean(),
  withdrawal_days: z.number(),
  wording_version: z.string(),
  /** Warum (noch) nicht angenommen werden kann; null: es geht. */
  blocker: z.string().nullable(),
  /** Nur der eigene Zugang nimmt an (ANN-289). */
  can_accept: z.boolean(),
  practice: praxisSchema,
});
export type Trainingsangebot = z.infer<typeof trainingsangebotSchema>;

export function trainingsangebotSchluessel(zugangId: string) {
  return ['platform-training-offer', zugangId] as const;
}

/** Das offene Angebot der Praxis; `null`: keins, oder für diesen Zugang nicht sichtbar. */
export async function ladeTrainingsangebot(zugangId: string): Promise<Trainingsangebot | null> {
  const satz = 'Das Angebot konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_training_offer', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(trainingsangebotSchema.nullable(), ergebnis.data ?? null, satz);
}

const buchungSchema = z.object({
  contract_id: z.string().uuid(),
  training_access_id: z.string().uuid(),
  concluded_at: z.string(),
  label: z.string(),
  package_months: z.number(),
  price_cents: z.number(),
  currency: z.string(),
  starts_on: z.string(),
  ends_on: z.string(),
  withdrawal_ends_on: z.string(),
  early_start_requested: z.boolean(),
  contact_released: z.boolean(),
  health_consent_granted: z.boolean(),
  released_titles: z.array(z.string()),
});
export type Buchungsbestaetigung = z.infer<typeof buchungSchema>;

export interface Buchung {
  angebotId: string;
  freigaben: number[];
  kontakt: boolean;
  einwilligung: boolean;
  fruehBeginnen: boolean;
  fassung: string;
}

/** „Zahlungspflichtig buchen": liefert die Bestätigung (ANN-288). */
export async function angebotAnnehmen(
  zugangId: string,
  buchung: Buchung,
): Promise<Buchungsbestaetigung> {
  const satz = 'Die Buchung ist nicht angekommen. Bitte versuchen Sie es noch einmal.';
  const ergebnis = (await getSupabase().rpc('accept_platform_training_offer', {
    p_access_id: zugangId,
    p_offer_id: buchung.angebotId,
    p_release_items: buchung.freigaben,
    p_release_contact: buchung.kontakt,
    p_health_consent: buchung.einwilligung,
    p_early_start: buchung.fruehBeginnen,
    p_wording_version: buchung.fassung,
  })) as { data: unknown; error: { message?: string } | null };
  const meldung = ergebnis.error?.message ?? '';
  if (meldung.includes('not open'))
    throw new Error('Das Angebot gilt nicht mehr. Bitte sprechen Sie die Praxis an.');
  if (meldung.includes('wording outdated'))
    throw new Error('Die Bedingungen haben sich geändert. Bitte laden Sie die Seite neu.');
  if (meldung.includes('health consent required'))
    throw new Error(
      'Angaben aus der Behandlung gehen nur mit Ihrer Einwilligung zu Gesundheitsangaben ins Training.',
    );
  if (meldung.includes('early start must be requested'))
    throw new Error(
      'Bitte bestätigen Sie, dass das Training vor dem Ende der Frist beginnen soll.',
    );
  if (meldung.includes('cannot be accepted'))
    throw new Error(
      'Das Angebot kann gerade nicht angenommen werden. Bitte laden Sie die Seite neu.',
    );
  if (ergebnis.error) throw new Error(satz);
  return antwort(buchungSchema, ergebnis.data, satz);
}

const vertragSchema = z.object({
  id: z.string().uuid(),
  concluded_at: z.string(),
  label: z.string(),
  package_months: z.number(),
  price_cents: z.number(),
  currency: z.string(),
  tax_rate_permille: z.number(),
  vat_included: z.boolean(),
  starts_on: z.string(),
  ends_on: z.string(),
  offered_on: z.string(),
  wording_version: z.string(),
  early_start_requested: z.boolean(),
  contact_released: z.boolean(),
  health_consent_granted: z.boolean(),
  withdrawal_ends_on: z.string(),
  released_titles: z.array(z.string()),
  /** KND-004: Eingang des Widerrufs; null: nicht widerrufen. */
  withdrawn_at: z.string().nullable().default(null),
  /** KND-004: Knopf da? In der Frist, nicht widerrufen, Recht contract. */
  can_withdraw: z.boolean().default(false),
});
export type Trainingsvertrag = z.infer<typeof vertragSchema>;

export function vertragSchluessel(zugangId: string) {
  return ['platform-training-contract', zugangId] as const;
}

/** Der eigene Trainingsvertrag; `null`: keiner, oder für diesen Zugang nicht sichtbar. */
export async function ladeVertrag(zugangId: string): Promise<Trainingsvertrag | null> {
  const satz = 'Ihr Vertrag konnte nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_training_contract', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(vertragSchema.nullable(), ergebnis.data ?? null, satz);
}

const widerrufSchema = z.object({
  withdrawn_at: z.string(),
  withdrawn_on: z.string(),
  label: z.string(),
  concluded_at: z.string(),
});
export type Widerrufseingang = z.infer<typeof widerrufSchema>;

/** Die Widerrufsfunktion (§ 356a BGB, KND-004): liefert den Eingang mit Zeitpunkt. */
export async function vertragWiderrufen(
  zugangId: string,
  vertragId: string,
): Promise<Widerrufseingang> {
  const satz = 'Der Widerruf ist nicht angekommen. Bitte versuchen Sie es noch einmal.';
  const ergebnis = (await getSupabase().rpc('withdraw_platform_training_contract', {
    p_access_id: zugangId,
    p_contract_id: vertragId,
  })) as { data: unknown; error: { message?: string } | null };
  const meldung = ergebnis.error?.message ?? '';
  if (meldung.includes('already withdrawn')) throw new Error('Sie haben schon widerrufen.');
  if (meldung.includes('period has ended'))
    throw new Error('Die Widerrufsfrist ist abgelaufen. Bitte wenden Sie sich an die Praxis.');
  if (ergebnis.error) throw new Error(satz);
  return antwort(widerrufSchema, ergebnis.data, satz);
}
