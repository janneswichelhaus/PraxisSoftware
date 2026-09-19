import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Datenzugriff auf Leistungskatalog und Leistungen (ABR-001, ABR-002).
 *
 * Zwei Zugriffswege stehen hier nebeneinander, und der Unterschied ist
 * beabsichtigt:
 *
 * Der **Katalog** enthält keine Patientendaten. Er wird deshalb wie die
 * Verordnerkartei direkt aus der Tabelle gelesen; die RLS entscheidet, was
 * sichtbar ist. Geschrieben wird er ausschließlich über Serverfunktionen —
 * Preise setzt allein der `owner` (ANN-071).
 *
 * Die **Leistungen** tragen einen Patientenbezug. Sie sind über keine Tabelle
 * erreichbar, sondern nur über Serverfunktionen, die eine rollenabhängige
 * Projektion liefern (ADR-004).
 *
 * Keine Preisrechnung im Browser: Was eine Leistung kostet, steht an der
 * Katalogposition, und die ist unveränderlich, sobald ihre Preisliste in Kraft
 * ist. Diese Datei multipliziert nur für die Anzeige.
 */

// -----------------------------------------------------------------------------
// Leistungskatalog
// -----------------------------------------------------------------------------

export const katalogVersionSchema = z.object({
  id: z.string(),
  label: z.string(),
  valid_from: z.string(),
  published_at: z.string().nullable(),
});

export type KatalogVersion = z.infer<typeof katalogVersionSchema>;

export const katalogPositionSchema = z.object({
  id: z.string(),
  catalog_version_id: z.string(),
  sort_order: z.number(),
  code: z.string(),
  label: z.string(),
  item_kind: z.enum(['treatment', 'absence_fee']),
  remedy: z.string().nullable(),
  unit_price_cents: z.number(),
  currency: z.string(),
  tax_treatment: z.enum(['exempt_healthcare', 'taxable', 'not_taxable']),
  tax_rate_permille: z.number(),
});

export type KatalogPosition = z.infer<typeof katalogPositionSchema>;

export const steuerLabels: Record<KatalogPosition['tax_treatment'], string> = {
  exempt_healthcare: 'Heilbehandlung, umsatzsteuerfrei',
  taxable: 'Umsatzsteuerpflichtig',
  not_taxable: 'Nicht steuerbar',
};

export const artLabels: Record<KatalogPosition['item_kind'], string> = {
  treatment: 'Behandlung',
  absence_fee: 'Ausfallhonorar',
};

export async function fetchKatalogVersionen(): Promise<KatalogVersion[]> {
  const { data, error } = await getSupabase()
    .from('service_catalog_versions')
    .select('id, label, valid_from, published_at')
    .order('valid_from', { ascending: false });

  if (error) throw new Error('Die Preislisten konnten nicht geladen werden.');
  return z.array(katalogVersionSchema).parse(data ?? []);
}

export async function fetchKatalogPositionen(versionId: string): Promise<KatalogPosition[]> {
  const { data, error } = await getSupabase()
    .from('service_catalog_items')
    .select(
      'id, catalog_version_id, sort_order, code, label, item_kind, remedy, unit_price_cents, currency, tax_treatment, tax_rate_permille',
    )
    .eq('catalog_version_id', versionId)
    .order('sort_order', { ascending: true });

  if (error) throw new Error('Die Positionen konnten nicht geladen werden.');
  return z.array(katalogPositionSchema).parse(data ?? []);
}

/** Eine Position, wie das Formular sie führt — der Preis als Eingabetext. */
export interface PositionsEingabe {
  code: string;
  label: string;
  item_kind: KatalogPosition['item_kind'];
  remedy: string;
  preis: string;
  tax_treatment: KatalogPosition['tax_treatment'];
  tax_rate_permille: number;
}

export async function createKatalogVersion(
  label: string,
  gueltigAb: string,
  kopieVon: string | null,
): Promise<string> {
  const { data, error } = (await getSupabase().rpc('create_service_catalog_version', {
    p_label: label,
    p_valid_from: gueltigAb,
    p_copy_from: kopieVon,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Preisliste konnte nicht angelegt werden.');
  const id = z.string().uuid().safeParse(data);
  if (!id.success) throw new Error('Die Preisliste konnte nicht angelegt werden.');
  return id.data;
}

export async function writeKatalogPositionen(
  versionId: string,
  positionen: {
    code: string;
    label: string;
    item_kind: string;
    remedy: string | null;
    unit_price_cents: number;
    tax_treatment: string;
    tax_rate_permille: number;
  }[],
): Promise<void> {
  const { error } = await getSupabase().rpc('write_service_catalog_items', {
    p_version_id: versionId,
    p_items: positionen,
  });

  if (error) throw new Error('Die Positionen konnten nicht gespeichert werden.');
}

export async function publishKatalogVersion(versionId: string): Promise<void> {
  const { error } = await getSupabase().rpc('publish_service_catalog_version', {
    p_version_id: versionId,
  });

  if (error) throw new Error('Die Preisliste konnte nicht in Kraft gesetzt werden.');
}

export async function deleteKatalogVersion(versionId: string): Promise<void> {
  const { error } = await getSupabase().rpc('delete_service_catalog_version', {
    p_version_id: versionId,
  });

  if (error) throw new Error('Der Entwurf konnte nicht verworfen werden.');
}

// -----------------------------------------------------------------------------
// Praxis-Stammdaten für Rechnungen (ABR-000)
// -----------------------------------------------------------------------------

export const praxisStammdatenSchema = z.object({
  legal_name: z.string(),
  street: z.string(),
  house_number: z.string().nullable(),
  postal_code: z.string(),
  city: z.string(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  tax_number: z.string(),
  vat_id: z.string().nullable(),
  small_business: z.boolean(),
  bank_name: z.string().nullable(),
  account_holder: z.string().nullable(),
  iban: z.string(),
  bic: z.string().nullable(),
  invoice_number_prefix: z.string(),
  payment_term_days: z.number(),
});

export type PraxisStammdaten = z.infer<typeof praxisStammdatenSchema>;

/** `null` heißt: noch nie erfasst — nicht „nicht lesbar". */
export async function fetchPraxisStammdaten(): Promise<PraxisStammdaten | null> {
  const { data, error } = await getSupabase()
    .from('practice_billing_profiles')
    .select(
      'legal_name, street, house_number, postal_code, city, phone, email, tax_number, vat_id, small_business, bank_name, account_holder, iban, bic, invoice_number_prefix, payment_term_days',
    )
    .maybeSingle();

  if (error) throw new Error('Die Praxis-Stammdaten konnten nicht geladen werden.');
  return data === null ? null : praxisStammdatenSchema.parse(data);
}

export async function savePraxisStammdaten(eingabe: PraxisStammdaten): Promise<void> {
  const { error } = await getSupabase().rpc('save_practice_billing_profile', {
    p_legal_name: eingabe.legal_name,
    p_street: eingabe.street,
    p_house_number: eingabe.house_number,
    p_postal_code: eingabe.postal_code,
    p_city: eingabe.city,
    p_phone: eingabe.phone,
    p_email: eingabe.email,
    p_tax_number: eingabe.tax_number,
    p_vat_id: eingabe.vat_id,
    p_small_business: eingabe.small_business,
    p_bank_name: eingabe.bank_name,
    p_account_holder: eingabe.account_holder,
    p_iban: eingabe.iban,
    p_bic: eingabe.bic,
    p_invoice_number_prefix: eingabe.invoice_number_prefix,
    p_payment_term_days: eingabe.payment_term_days,
  });

  if (error) throw new Error('Die Praxis-Stammdaten konnten nicht gespeichert werden.');
}

// -----------------------------------------------------------------------------
// Rechnungsempfänger (ABR-003a)
// -----------------------------------------------------------------------------

export const empfaengerartLabels: Record<string, string> = {
  self: 'Patient:in selbst',
  legal_representative: 'Sorgeberechtigte',
  guardian: 'Betreuung',
  aid_authority: 'Beihilfestelle',
  private_insurer: 'Private Krankenversicherung',
  other: 'Sonstiger Kostenträger',
};

const empfaengerSchema = z.object({
  id: z.string(),
  recipient_kind: z.string(),
  name: z.string(),
  street: z.string().nullable(),
  house_number: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
  reference: z.string().nullable(),
  is_default: z.boolean(),
});

export type Empfaenger = z.infer<typeof empfaengerSchema>;

export async function fetchEmpfaenger(patientId: string): Promise<Empfaenger[]> {
  const { data, error } = (await getSupabase().rpc('list_invoice_recipients', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Rechnungsempfänger konnten nicht geladen werden.');
  return z.array(empfaengerSchema).parse(data ?? []);
}

export async function saveEmpfaenger(eingabe: {
  id: string | null;
  patientId: string;
  recipient_kind: string;
  name: string;
  street: string | null;
  house_number: string | null;
  postal_code: string | null;
  city: string | null;
  reference: string | null;
  is_default: boolean;
}): Promise<void> {
  const { error } = await getSupabase().rpc('save_invoice_recipient', {
    p_id: eingabe.id,
    p_patient_id: eingabe.patientId,
    p_recipient_kind: eingabe.recipient_kind,
    p_name: eingabe.name,
    p_street: eingabe.street,
    p_house_number: eingabe.house_number,
    p_postal_code: eingabe.postal_code,
    p_city: eingabe.city,
    p_reference: eingabe.reference,
    p_is_default: eingabe.is_default,
  });

  if (error) throw new Error('Der Rechnungsempfänger konnte nicht gespeichert werden.');
}

// -----------------------------------------------------------------------------
// Rechnungen (ABR-003)
// -----------------------------------------------------------------------------

const kandidatSchema = z.object({
  patient_id: z.string(),
  patient_name: z.string(),
  period_month: z.string(),
  service_count: z.number(),
  total_cents: z.number(),
  currency: z.string(),
  has_draft: z.boolean(),
  // BEF-018: Die Zeile sagt nicht nur, dass ein Entwurf steht — sie führt
  // auch hin. Ohne die Kennung war er in der Liste darunter zu suchen.
  draft_id: z.string().nullable(),
});

export type Kandidat = z.infer<typeof kandidatSchema>;

export async function fetchKandidaten(): Promise<Kandidat[]> {
  const { data, error } = (await getSupabase().rpc('list_invoice_candidates', {
    p_limit: 100,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die abzurechnenden Leistungen konnten nicht geladen werden.');
  return z.array(kandidatSchema).parse(data ?? []);
}

/**
 * Der Zahlungsstand einer Rechnung.
 *
 * Er kommt gerechnet vom Server und steht an keiner Spalte (ADR-009 Punkt 12:
 * „Der Zahlungsstatus ist damit abgeleitet, nicht gesetzt"). Diese Datei
 * rechnet ihn deshalb auch nicht nach — sie zeigt ihn an.
 */
export const zahlungsstandLabels = {
  unpaid: 'Offen',
  partially_paid: 'Teilweise bezahlt',
  paid: 'Bezahlt',
  overpaid: 'Überzahlt',
} as const;

export type Zahlungsstand = keyof typeof zahlungsstandLabels;

const rechnungSchema = z.object({
  id: z.string(),
  status: z.enum(['draft', 'issued']),
  invoice_number: z.string().nullable(),
  period_month: z.string(),
  issued_on: z.string().nullable(),
  due_on: z.string().nullable(),
  patient_id: z.string(),
  patient_name: z.string(),
  recipient_name: z.string(),
  recipient_kind: z.string(),
  total_cents: z.number(),
  currency: z.string(),
  item_count: z.number(),
  paid_cents: z.number(),
  outstanding_cents: z.number(),
  payment_state: z.enum(['unpaid', 'partially_paid', 'paid', 'overpaid']),
  overdue: z.boolean(),
  // Storniert ist ein abgeleiteter Zustand: Es gibt ein Stornodokument zu
  // dieser Rechnung (ABR-003c, ANN-079). An der Rechnung steht dazu nichts.
  cancelled: z.boolean(),
});

export type Rechnung = z.infer<typeof rechnungSchema>;

export async function fetchRechnungen(): Promise<Rechnung[]> {
  const { data, error } = (await getSupabase().rpc('list_invoices', { p_limit: 100 })) as {
    data: unknown;
    error: unknown;
  };

  if (error) throw new Error('Die Rechnungen konnten nicht geladen werden.');
  return z.array(rechnungSchema).parse(data ?? []);
}

/**
 * Das Rechnungsdokument, wie der Server es liefert.
 *
 * Ein Entwurf wird aus den heutigen Stammdaten gebaut, eine ausgestellte
 * Rechnung kommt aus ihrem Snapshot (ADR-009 Punkt 10). Dieselbe Form für
 * beides — die Seite kennt deshalb nur eine Darstellung.
 */
const dokumentSchema = z.object({
  schema_version: z.number(),
  period_month: z.string(),
  currency: z.string(),
  invoice_number: z.string().optional(),
  issued_on: z.string().optional(),
  due_on: z.string().optional(),
  issuer: z.object({
    legal_name: z.string(),
    street: z.string(),
    house_number: z.string().nullable(),
    postal_code: z.string(),
    city: z.string(),
    phone: z.string().nullable(),
    email: z.string().nullable(),
    tax_number: z.string(),
    vat_id: z.string().nullable(),
    small_business: z.boolean(),
    bank_name: z.string().nullable(),
    account_holder: z.string().nullable(),
    iban: z.string(),
    bic: z.string().nullable(),
    payment_term_days: z.number(),
  }),
  recipient: z.object({
    kind: z.string(),
    name: z.string(),
    street: z.string().nullable(),
    house_number: z.string().nullable(),
    postal_code: z.string().nullable(),
    city: z.string().nullable(),
    reference: z.string().nullable(),
  }),
  patient: z.object({
    name: z.string(),
    date_of_birth: z.string().nullable(),
  }),
  treatment_bases: z.array(
    z.object({
      kind: z.string(),
      issued_on: z.string(),
      prescriber: z.string().nullable(),
    }),
  ),
  items: z.array(
    z.object({
      performed_on: z.string(),
      code: z.string(),
      label: z.string(),
      item_kind: z.enum(['treatment', 'absence_fee']),
      quantity: z.number(),
      unit_price_cents: z.number(),
      line_total_cents: z.number(),
      currency: z.string(),
      tax_treatment: z.enum(['exempt_healthcare', 'taxable', 'not_taxable']),
      tax_rate_permille: z.number(),
    }),
  ),
  tax_groups: z.array(
    z.object({
      tax_treatment: z.enum(['exempt_healthcare', 'taxable', 'not_taxable']),
      tax_rate_permille: z.number(),
      gross_cents: z.number(),
      tax_cents: z.number(),
      net_cents: z.number(),
    }),
  ),
  totals: z.object({
    total_cents: z.number(),
    tax_total_cents: z.number(),
  }),
});

const rechnungsansichtSchema = z.object({
  id: z.string(),
  status: z.enum(['draft', 'issued']),
  patient_id: z.string(),
  recipient_id: z.string().nullable(),
  invoice_number: z.string().nullable(),
  issued_on: z.string().nullable(),
  due_on: z.string().nullable(),
  // Der Zahlungsstand kommt gerechnet vom Server (ABR-004). Am Entwurf steht
  // er auf null-Werten — an ihm kann niemand zahlen.
  paid_cents: z.number(),
  outstanding_cents: z.number(),
  payment_state: z.enum(['unpaid', 'partially_paid', 'paid', 'overpaid']),
  overdue: z.boolean(),
  // Die Storno- und Korrekturkette (ABR-003c). `cancellation` ist das
  // Stornodokument zu dieser Rechnung; `replaces_*` zeigt zurück auf die
  // Rechnung, die diese hier ersetzt, `correction_*` nach vorn auf die
  // Korrektur, die sie ersetzt hat.
  cancellation: z
    .object({
      cancellation_number: z.string(),
      reason: z.string(),
      cancelled_on: z.string(),
    })
    .nullable(),
  replaces_invoice_id: z.string().nullable(),
  replaces_invoice_number: z.string().nullable(),
  correction_invoice_id: z.string().nullable(),
  correction_invoice_number: z.string().nullable(),
  document: dokumentSchema,
});

export type Rechnungsansicht = z.infer<typeof rechnungsansichtSchema>;
export type Rechnungsdokument = z.infer<typeof dokumentSchema>;

export class KeineStammdaten extends Error {}

export async function fetchRechnung(invoiceId: string): Promise<Rechnungsansicht> {
  const { data, error } = (await getSupabase().rpc('get_invoice', {
    p_invoice_id: invoiceId,
  })) as { data: unknown; error: { message?: string } | null };

  // Der eine Fehler, der eine eigene Antwort verdient: Ohne Absender lässt
  // sich kein Rechnungsbild bauen. Das ist keine Störung, sondern eine
  // fehlende Angabe — und die Seite sagt, welche.
  if (error?.message?.includes('practice billing profile missing')) throw new KeineStammdaten();
  if (error) throw new Error('Die Rechnung konnte nicht geladen werden.');
  return rechnungsansichtSchema.parse(data);
}

export async function createEntwurf(patientId: string, monat: string): Promise<string> {
  const { data, error } = (await getSupabase().rpc('create_invoice_draft', {
    p_patient_id: patientId,
    p_period_month: monat,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Der Rechnungsentwurf konnte nicht angelegt werden.');
  const id = z.string().uuid().safeParse(data);
  if (!id.success) throw new Error('Der Rechnungsentwurf konnte nicht angelegt werden.');
  return id.data;
}

export async function deleteEntwurf(invoiceId: string): Promise<void> {
  const { error } = await getSupabase().rpc('delete_invoice_draft', { p_invoice_id: invoiceId });
  if (error) throw new Error('Der Entwurf konnte nicht verworfen werden.');
}

export async function setzeEmpfaenger(
  invoiceId: string,
  recipientId: string | null,
): Promise<void> {
  const { error } = await getSupabase().rpc('set_invoice_recipient', {
    p_invoice_id: invoiceId,
    p_recipient_id: recipientId,
  });

  if (error) throw new Error('Der Empfänger konnte nicht gesetzt werden.');
}

export async function stelleRechnungAus(invoiceId: string): Promise<string> {
  const { data, error } = (await getSupabase().rpc('issue_invoice', {
    p_invoice_id: invoiceId,
  })) as { data: unknown; error: { message?: string } | null };

  if (error?.message?.includes('practice billing profile missing')) throw new KeineStammdaten();
  if (error) throw new Error('Die Rechnung konnte nicht ausgestellt werden.');
  const nummer = z.string().safeParse(data);
  if (!nummer.success) throw new Error('Die Rechnung konnte nicht ausgestellt werden.');
  return nummer.data;
}

/**
 * Eine ausgestellte Rechnung stornieren (ABR-003c).
 *
 * Gibt die Nummer des Stornodokuments zurück — es ist ein eigenes Dokument
 * mit eigener Nummer aus demselben Nummernkreis (ADR-009 Punkt 9, ANN-079).
 * Die Rechnung selbst bleibt unverändert; „storniert" ist der Zustand, der
 * sich aus der Existenz dieses Dokuments ergibt.
 */
export async function storniereRechnung(invoiceId: string, grund: string): Promise<string> {
  const { data, error } = (await getSupabase().rpc('cancel_invoice', {
    p_invoice_id: invoiceId,
    p_reason: grund,
  })) as { data: unknown; error: { message?: string } | null };

  // Der eine Fall, der eine eigene Antwort verdient: Erst das Geld, dann das
  // Dokument. Alles andere wäre ein Eingang ohne Forderung.
  if (error?.message?.includes('void the payments of this invoice first')) {
    throw new ZahlungStehtNoch();
  }
  if (error) throw new Error('Die Rechnung konnte nicht storniert werden.');
  const nummer = z.string().safeParse(data);
  if (!nummer.success) throw new Error('Die Rechnung konnte nicht storniert werden.');
  return nummer.data;
}

export class ZahlungStehtNoch extends Error {}

/** Der Entwurf der Korrekturrechnung zu einer stornierten Rechnung (ABR-003c). */
export async function erstelleKorrektur(invoiceId: string): Promise<string> {
  const { data, error } = (await getSupabase().rpc('create_correction_draft', {
    p_invoice_id: invoiceId,
  })) as { data: unknown; error: { message?: string } | null };

  if (error?.message?.includes('already exists')) {
    throw new Error(
      'Für diese Patientin und diesen Monat steht bereits ein Entwurf. Er ist die Korrektur.',
    );
  }
  if (error?.message?.includes('no billable services')) {
    throw new Error(
      'Es gibt keine offenen Leistungen mehr für diesen Monat — die Korrektur hätte keine Zeile.',
    );
  }
  if (error) throw new Error('Die Korrekturrechnung konnte nicht angelegt werden.');
  const id = z.string().uuid().safeParse(data);
  if (!id.success) throw new Error('Die Korrekturrechnung konnte nicht angelegt werden.');
  return id.data;
}

// -----------------------------------------------------------------------------
// Zahlungen und offene Posten (ABR-004)
// -----------------------------------------------------------------------------

export const zahlungswegLabels: Record<string, string> = {
  bank_transfer: 'Überweisung',
  other: 'Anderer Weg',
};

export const richtungLabels: Record<string, string> = {
  incoming: 'Eingang',
  refund: 'Rückzahlung',
};

const offenerPostenSchema = z.object({
  id: z.string(),
  invoice_number: z.string(),
  patient_id: z.string(),
  patient_name: z.string(),
  recipient_name: z.string(),
  period_month: z.string(),
  issued_on: z.string(),
  due_on: z.string(),
  total_cents: z.number(),
  paid_cents: z.number(),
  outstanding_cents: z.number(),
  currency: z.string(),
  overdue: z.boolean(),
  /**
   * Die Summe über **alle** offenen Posten, nicht nur über die gelieferten
   * Zeilen — der Server rechnet sie vor dem Kürzen der Liste. Deshalb steht
   * sie an jeder Zeile und wird hier nicht aufaddiert.
   */
  open_total_cents: z.number(),
});

export type OffenerPosten = z.infer<typeof offenerPostenSchema>;

export async function fetchOffenePosten(): Promise<OffenerPosten[]> {
  const { data, error } = (await getSupabase().rpc('list_open_items', { p_limit: 100 })) as {
    data: unknown;
    error: unknown;
  };

  if (error) throw new Error('Die offenen Posten konnten nicht geladen werden.');
  return z.array(offenerPostenSchema).parse(data ?? []);
}

const zahlungSchema = z.object({
  id: z.string(),
  direction: z.enum(['incoming', 'refund']),
  amount_cents: z.number(),
  currency: z.string(),
  paid_on: z.string(),
  method: z.string(),
  note: z.string().nullable(),
  voided_at: z.string().nullable(),
  void_reason: z.string().nullable(),
});

export type Zahlung = z.infer<typeof zahlungSchema>;

const zahlungMitRechnungSchema = zahlungSchema.extend({
  invoice_id: z.string(),
  invoice_number: z.string().nullable(),
  patient_name: z.string(),
  recipient_name: z.string(),
});

export type ZahlungMitRechnung = z.infer<typeof zahlungMitRechnungSchema>;

export async function fetchZahlungen(): Promise<ZahlungMitRechnung[]> {
  const { data, error } = (await getSupabase().rpc('list_payments', { p_limit: 100 })) as {
    data: unknown;
    error: unknown;
  };

  if (error) throw new Error('Die Zahlungen konnten nicht geladen werden.');
  return z.array(zahlungMitRechnungSchema).parse(data ?? []);
}

export async function fetchRechnungszahlungen(invoiceId: string): Promise<Zahlung[]> {
  const { data, error } = (await getSupabase().rpc('list_invoice_payments', {
    p_invoice_id: invoiceId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Zahlungen konnten nicht geladen werden.');
  return z.array(zahlungSchema).parse(data ?? []);
}

/** Eine Rückzahlung über dem Eingang — der eine Fehler mit eigener Antwort. */
export class RueckzahlungZuHoch extends Error {}

export async function bucheZahlung(eingabe: {
  invoiceId: string;
  betragCent: number;
  tag: string;
  weg: string;
  richtung: 'incoming' | 'refund';
  notiz: string | null;
}): Promise<void> {
  const { error } = (await getSupabase().rpc('record_payment', {
    p_invoice_id: eingabe.invoiceId,
    p_amount_cents: eingabe.betragCent,
    p_paid_on: eingabe.tag,
    p_method: eingabe.weg,
    p_direction: eingabe.richtung,
    p_note: eingabe.notiz,
  })) as { error: { message?: string } | null };

  if (error?.message?.includes('refund cannot exceed')) throw new RueckzahlungZuHoch();
  if (error?.message?.includes('dated in the future'))
    throw new Error('Eine Zahlung lässt sich nicht für die Zukunft erfassen.');
  if (error) throw new Error('Die Zahlung konnte nicht erfasst werden.');
}

export async function storniereZahlung(paymentId: string, grund: string): Promise<void> {
  const { error } = await getSupabase().rpc('void_payment', {
    p_payment_id: paymentId,
    p_reason: grund,
  });

  if (error) throw new Error('Die Zahlung konnte nicht storniert werden.');
}

// -----------------------------------------------------------------------------
// Leistungen
// -----------------------------------------------------------------------------

const offenerTerminSchema = z.object({
  appointment_id: z.string(),
  patient_id: z.string(),
  patient_name: z.string(),
  performed_on: z.string(),
  starts_at: z.string(),
  status: z.string(),
  fee_basis: z.string().nullable(),
  appointment_type: z.string(),
  suggestion_count: z.number(),
});

export type OffenerTermin = z.infer<typeof offenerTerminSchema>;

export async function fetchOffeneTermine(): Promise<OffenerTermin[]> {
  const { data, error } = (await getSupabase().rpc('list_open_billable_appointments', {
    p_limit: 100,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die offenen Termine konnten nicht geladen werden.');
  return z.array(offenerTerminSchema).parse(data ?? []);
}

const vorschlagSchema = z.object({
  catalog_item_id: z.string(),
  code: z.string(),
  label: z.string(),
  item_kind: z.enum(['treatment', 'absence_fee']),
  unit_price_cents: z.number(),
  currency: z.string(),
  tax_treatment: z.enum(['exempt_healthcare', 'taxable', 'not_taxable']),
  tax_rate_permille: z.number(),
  suggested: z.boolean(),
});

export type Vorschlag = z.infer<typeof vorschlagSchema>;

export class KeinKatalog extends Error {}

export async function fetchVorschlag(appointmentId: string): Promise<Vorschlag[]> {
  const { data, error } = (await getSupabase().rpc('get_billable_service_draft', {
    p_appointment_id: appointmentId,
  })) as { data: unknown; error: { message?: string } | null };

  // Der eine Fehler, der eine eigene Antwort verdient: Für den Leistungstag
  // gibt es keine in Kraft gesetzte Preisliste. Das ist kein Defekt, sondern
  // eine fehlende Angabe — und die Seite sagt, welche.
  if (error?.message?.includes('no published service catalog')) throw new KeinKatalog();
  if (error) throw new Error('Die Leistungen zu diesem Termin konnten nicht geladen werden.');
  return z.array(vorschlagSchema).parse(data ?? []);
}

const leistungSchema = z.object({
  id: z.string(),
  appointment_id: z.string(),
  patient_id: z.string(),
  patient_name: z.string(),
  performed_on: z.string(),
  code: z.string(),
  label: z.string(),
  item_kind: z.enum(['treatment', 'absence_fee']),
  quantity: z.number(),
  unit_price_cents: z.number(),
  currency: z.string(),
  tax_treatment: z.enum(['exempt_healthcare', 'taxable', 'not_taxable']),
  tax_rate_permille: z.number(),
  status: z.enum(['billable', 'invoiced']),
});

export type Leistung = z.infer<typeof leistungSchema>;

export async function fetchLeistungen(): Promise<Leistung[]> {
  const { data, error } = (await getSupabase().rpc('list_billable_services', {
    p_from: null,
    p_to: null,
    p_limit: 200,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Leistungen konnten nicht geladen werden.');
  return z.array(leistungSchema).parse(data ?? []);
}

export class KontingentAusgeschoepft extends Error {}

export async function recordLeistungen(
  appointmentId: string,
  positionen: { catalog_item_id: string; quantity: number }[],
): Promise<void> {
  const { error } = (await getSupabase().rpc('record_billable_services', {
    p_appointment_id: appointmentId,
    p_items: positionen,
  })) as { error: { message?: string } | null };

  if (error?.message?.includes('quantity exhausted')) throw new KontingentAusgeschoepft();
  if (error) throw new Error('Die Leistungen konnten nicht erfasst werden.');
}

export async function deleteLeistungen(appointmentId: string): Promise<void> {
  const { error } = await getSupabase().rpc('delete_billable_services', {
    p_appointment_id: appointmentId,
  });

  if (error) throw new Error('Die Erfassung konnte nicht zurückgenommen werden.');
}

/**
 * Leistungen eines Termins zusammengefasst.
 *
 * Die Liste kommt zeilenweise aus der Datenbank; auf dem Bildschirm gehören
 * die Zeilen eines Termins zusammen, weil auch das Zurücknehmen den ganzen
 * Vorgang betrifft.
 */
export interface Terminleistungen {
  appointmentId: string;
  patientName: string;
  performedOn: string;
  zeilen: Leistung[];
  summeCent: number;
  abgerechnet: boolean;
}

export function nachTerminen(leistungen: Leistung[]): Terminleistungen[] {
  const gruppen = new Map<string, Terminleistungen>();

  for (const zeile of leistungen) {
    const vorhanden = gruppen.get(zeile.appointment_id);
    const gruppe = vorhanden ?? {
      appointmentId: zeile.appointment_id,
      patientName: zeile.patient_name,
      performedOn: zeile.performed_on,
      zeilen: [],
      summeCent: 0,
      abgerechnet: false,
    };

    gruppe.zeilen.push(zeile);
    gruppe.summeCent += zeile.unit_price_cents * zeile.quantity;
    gruppe.abgerechnet = gruppe.abgerechnet || zeile.status === 'invoiced';
    if (!vorhanden) gruppen.set(zeile.appointment_id, gruppe);
  }

  return [...gruppen.values()];
}
