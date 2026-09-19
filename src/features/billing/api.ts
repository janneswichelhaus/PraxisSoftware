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
