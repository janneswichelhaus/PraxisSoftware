import { z } from 'zod';
import { formatDate } from '@/lib/datum';
import { getSupabase } from '@/lib/supabase';

/**
 * Therapiebericht an die Verordner:in (DOK-005).
 *
 * Der Bericht ist gespeichert, nicht nur gedruckt (**ANN-121**): Ein Entwurf
 * ist frei änderbar, ein abgeschlossener Bericht ist als Snapshot eingefroren
 * und belegt später, was an die Verordner:in ging. Welche Einträge und welches
 * Körperschema darin stehen, kreuzt die Therapeut:in an — nichts ist vorbelegt,
 * nichts wird gedeutet (**ANN-122**, PROJECT_PRINCIPLES.md §17).
 *
 * Das Dokument baut der Server an einer Stelle, für die Vorschau des Entwurfs
 * wie für den Snapshot (`app.therapy_report_dokument`).
 */

export const TEXT_MAX = 8000;
export const EMPFEHLUNG_MAX = 2000;
export const EINTRAEGE_MAX = 50;

const markierungSchema = z.object({ x: z.number(), y: z.number(), bereich: z.string() });

const quelleSchema = z.object({
  inhalt: z.string(),
  verfasser: z.string().nullable(),
  datum: z.string().nullable(),
});

export const berichtsdokumentSchema = z.object({
  schema_version: z.literal(1),
  praxis: z.object({
    name: z.string(),
    street: z.string().nullish(),
    house_number: z.string().nullish(),
    postal_code: z.string().nullish(),
    city: z.string().nullish(),
    phone: z.string().nullish(),
    email: z.string().nullish(),
  }),
  empfaenger: z
    .object({
      title: z.string().nullable(),
      given_name: z.string().nullable(),
      family_name: z.string(),
      practice_name: z.string().nullable(),
      street: z.string().nullable(),
      house_number: z.string().nullable(),
      postal_code: z.string().nullable(),
      city: z.string().nullable(),
      fax: z.string().nullable(),
    })
    .nullable(),
  patient: z.object({
    given_name: z.string(),
    family_name: z.string(),
    date_of_birth: z.string().nullable(),
  }),
  verordnung: z.object({
    treatment_basis_kind: z.string(),
    issued_on: z.string(),
    diagnosis: z.string().nullable(),
    items: z.array(z.object({ remedy: z.string(), prescribed_quantity: z.number() })),
    termine_durchgefuehrt: z.number(),
    erster_termin: z.string().nullable(),
    letzter_termin: z.string().nullable(),
  }),
  eintraege: z.array(
    z.object({
      note_id: z.string(),
      datum: z.string(),
      verfasser: z.string().nullable(),
      inhalt: z.string(),
      ergaenzung: z.boolean(),
    }),
  ),
  koerperschema: z
    .object({ erhoben_am: z.string(), markierungen: z.array(markierungSchema) })
    .nullable(),
  text: quelleSchema.nullable(),
  empfehlung: quelleSchema.nullable(),
  abgeschlossen: z.object({ datum: z.string(), von: z.string().nullable() }).optional(),
});
export type Berichtsdokument = z.infer<typeof berichtsdokumentSchema>;

const berichtSchema = z.object({
  id: z.string(),
  patient_id: z.string(),
  treatment_basis_id: z.string(),
  status: z.enum(['entwurf', 'abgeschlossen']),
  report_text: z.string().nullable(),
  recommendation: z.string().nullable(),
  note_ids: z.array(z.string()),
  body_chart_response_id: z.string().nullable(),
  updated_at: z.string(),
  document: berichtsdokumentSchema,
});
export type Bericht = z.infer<typeof berichtSchema>;

const berichtszeileSchema = z.object({
  id: z.string(),
  treatment_basis_id: z.string(),
  status: z.enum(['entwurf', 'abgeschlossen']),
  created_at: z.string(),
  author_name: z.string().nullable(),
  completed_at: z.string().nullable(),
  completed_on: z.string().nullable(),
  completed_by_name: z.string().nullable(),
  recommendation: z.string().nullable(),
  recommendation_by_name: z.string().nullable(),
  recommendation_on: z.string().nullable(),
});
export type Berichtszeile = z.infer<typeof berichtszeileSchema>;

const quellenzeileSchema = z.object({
  kind: z.enum(['eintrag', 'koerperschema']),
  id: z.string(),
  occurred_on: z.string(),
  author_name: z.string().nullable(),
  content: z.string().nullable(),
  in_treatment_basis: z.boolean().nullable(),
  is_addendum: z.boolean(),
  body_chart: z.array(markierungSchema).nullable(),
});
export type Quellenzeile = z.infer<typeof quellenzeileSchema>;

export const berichteQueryKey = (patientId: string) => ['therapieberichte', patientId] as const;
export const berichtQueryKey = (berichtId: string) => ['therapiebericht', berichtId] as const;
export const quellenQueryKey = (berichtId: string) =>
  ['therapiebericht-quellen', berichtId] as const;

/**
 * Der Bericht wurde zwischenzeitlich von einer anderen Person gespeichert.
 * Eigener Typ, damit die Oberfläche den eigenen Text stehen lässt, statt ihn
 * mit dem neuen Stand zu überschreiben (PROJECT_PRINCIPLES.md §13).
 */
export class BerichtVeraendertError extends Error {
  constructor() {
    super(
      'Der Bericht wurde zwischenzeitlich von einer anderen Person gespeichert. Bitte den eigenen Text sichern, die Seite neu laden und die Änderung erneut vornehmen.',
    );
    this.name = 'BerichtVeraendertError';
  }
}

function meldungFuer(error: { message?: string }, standard: string): Error {
  const message = error.message ?? '';
  if (message.includes('changed in the meantime')) return new BerichtVeraendertError();
  if (message.includes('not allowed'))
    return new Error('Für diesen Schritt fehlt die Berechtigung.');
  if (message.includes('is completed')) {
    return new Error('Der Bericht ist abgeschlossen und lässt sich nicht mehr ändern.');
  }
  if (message.includes('is empty')) {
    return new Error(
      'Ein leerer Bericht lässt sich nicht abschließen — mindestens ein Eintrag, der eigene Text oder die Empfehlung.',
    );
  }
  if (message.includes('not usable')) {
    return new Error(
      'Ein angekreuzter Eintrag oder das Körperschema lässt sich nicht mehr übernehmen. Bitte die Seite neu laden.',
    );
  }
  if (message.includes('needs a prescription')) {
    return new Error('Einen Therapiebericht gibt es nur zu einer Verordnung.');
  }
  return new Error(standard);
}

export async function fetchBerichteDerAkte(patientId: string): Promise<Berichtszeile[]> {
  const { data, error } = (await getSupabase().rpc('list_patient_therapy_reports', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error('Die Therapieberichte konnten nicht geladen werden.');
  return z.array(berichtszeileSchema).parse(data ?? []);
}

export async function fetchBericht(berichtId: string): Promise<Bericht | null> {
  const { data, error } = (await getSupabase().rpc('get_therapy_report', {
    p_report_id: berichtId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error('Der Therapiebericht konnte nicht geladen werden.');
  const zeilen = z.array(berichtSchema).parse(data ?? []);
  return zeilen[0] ?? null;
}

export async function fetchBerichtQuellen(berichtId: string): Promise<Quellenzeile[]> {
  const { data, error } = (await getSupabase().rpc('list_therapy_report_sources', {
    p_report_id: berichtId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error('Die Einträge der Akte konnten nicht geladen werden.');
  return z.array(quellenzeileSchema).parse(data ?? []);
}

export async function berichtAnlegen(verordnungId: string): Promise<string> {
  const { data, error } = (await getSupabase().rpc('create_therapy_report', {
    p_treatment_basis_id: verordnungId,
  })) as { data: unknown; error: { message?: string } | null };
  if (error) throw meldungFuer(error, 'Der Therapiebericht konnte nicht angelegt werden.');
  return z.string().parse(data);
}

export interface BerichtEingabe {
  text: string;
  empfehlung: string;
  eintraege: readonly string[];
  koerperschema: string | null;
}

/** Speichert den Entwurf und liefert den neuen Stand für den nächsten Schritt. */
export async function berichtSpeichern(
  berichtId: string,
  eingabe: BerichtEingabe,
  erwarteterStand: string,
): Promise<string> {
  const { data, error } = (await getSupabase().rpc('update_therapy_report', {
    p_report_id: berichtId,
    p_report_text: eingabe.text.trim() === '' ? null : eingabe.text.trim(),
    p_recommendation: eingabe.empfehlung.trim() === '' ? null : eingabe.empfehlung.trim(),
    p_note_ids: [...eingabe.eintraege],
    p_body_chart_response_id: eingabe.koerperschema,
    p_expected_updated_at: erwarteterStand,
  })) as { data: unknown; error: { message?: string } | null };
  if (error) throw meldungFuer(error, 'Der Bericht konnte nicht gespeichert werden.');
  return z.string().parse(data);
}

export async function berichtAbschliessen(
  berichtId: string,
  erwarteterStand: string,
): Promise<void> {
  const { error } = (await getSupabase().rpc('complete_therapy_report', {
    p_report_id: berichtId,
    p_expected_updated_at: erwarteterStand,
  })) as { error: { message?: string } | null };
  if (error) throw meldungFuer(error, 'Der Bericht konnte nicht abgeschlossen werden.');
}

export async function berichtVerwerfen(berichtId: string): Promise<void> {
  const { error } = (await getSupabase().rpc('discard_therapy_report', {
    p_report_id: berichtId,
  })) as { error: { message?: string } | null };
  if (error) throw meldungFuer(error, 'Der Entwurf konnte nicht verworfen werden.');
}

/**
 * Der Druckknopf gilt als Export (ADR-010 Punkt 2 und 14): Ob wirklich
 * gedruckt wurde, sieht die Anwendung nicht. Erst protokollieren, dann den
 * Druckdialog öffnen — ohne Eintrag kein Druck aus der Anwendung.
 */
export async function druckVermerken(berichtId: string): Promise<void> {
  const { error } = (await getSupabase().rpc('log_therapy_report_export', {
    p_report_id: berichtId,
  })) as { error: { message?: string } | null };
  if (error) throw meldungFuer(error, 'Der Druck konnte nicht vermerkt werden.');
}

/**
 * Die Empfehlung zum Verordnungsende, wie sie an der Verordnung steht: aus dem
 * jüngsten abgeschlossenen Bericht dieser Verordnung, mit Quelle und Datum
 * (ANN-014). Ein Entwurf ist noch keine Empfehlung an irgendwen.
 */
export function empfehlungDerVerordnung(
  berichte: readonly Berichtszeile[],
  verordnungId: string,
): Berichtszeile | null {
  const passend = berichte
    .filter(
      (b) =>
        b.treatment_basis_id === verordnungId && b.status === 'abgeschlossen' && b.recommendation,
    )
    .sort((a, b) => (a.completed_at ?? '').localeCompare(b.completed_at ?? ''));
  return passend.at(-1) ?? null;
}

/** „Dr. med. Petra Probst" — Titel, Vor- und Nachname, ohne Lücken. */
export function empfaengerName(empfaenger: NonNullable<Berichtsdokument['empfaenger']>): string {
  return [empfaenger.title, empfaenger.given_name, empfaenger.family_name]
    .filter(Boolean)
    .join(' ');
}

/** „7 Termine, 12.02.2026 bis 30.03.2026" — gezählt, nicht bewertet. */
export function terminzeile(anzahl: number, erster: string | null, letzter: string | null): string {
  if (anzahl === 0) return 'Noch kein Termin durchgeführt';
  const termine = `${anzahl} ${anzahl === 1 ? 'Termin' : 'Termine'}`;
  if (!erster || !letzter) return termine;
  if (erster === letzter) return `${termine} am ${formatDate(erster)}`;
  return `${termine}, ${formatDate(erster)} bis ${formatDate(letzter)}`;
}
