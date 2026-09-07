import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Datenzugriff auf Verordnungen und Verordner:innen (VER-EPIC-001).
 *
 * Zwei sehr verschiedene Dinge liegen hier nebeneinander:
 *
 * Die **Verordnerkartei** enthält berufliche Kontaktdaten Dritter und keinen
 * Patientenbezug (ANN-013). Sie wird deshalb wie die Standortliste direkt aus
 * der Tabelle gelesen; die RLS entscheidet, was sichtbar ist.
 *
 * Die **Verordnung** enthält Gesundheitsdaten. Sie ist über keine Tabelle
 * erreichbar, sondern ausschließlich über Serverfunktionen, die je nach Rolle
 * eine andere Projektion liefern (ADR-004). Diese Datei ruft sie auf; welche
 * Felder zurückkommen, entscheidet die Datenbank.
 */

// -----------------------------------------------------------------------------
// Verordner:innen
// -----------------------------------------------------------------------------

const prescriberSchema = z.object({
  id: z.string(),
  title: z.string().nullable(),
  given_name: z.string().nullable(),
  family_name: z.string(),
  practice_name: z.string().nullable(),
  speciality: z.string().nullable(),
  street: z.string().nullable(),
  house_number: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
  phone: z.string().nullable(),
  fax: z.string().nullable(),
  email: z.string().nullable(),
});

export type Prescriber = z.infer<typeof prescriberSchema>;

const PRESCRIBER_SELECT = [
  'id, title, given_name, family_name, practice_name, speciality',
  'street, house_number, postal_code, city, phone, fax, email',
].join(', ');

export async function fetchPrescribers(): Promise<Prescriber[]> {
  const { data, error } = await getSupabase()
    .from('prescribers')
    .select(PRESCRIBER_SELECT)
    .order('family_name', { ascending: true });

  if (error) throw new Error('Die Verordner:innen konnten nicht geladen werden.');
  return z.array(prescriberSchema).parse(data ?? []);
}

export async function fetchPrescriber(prescriberId: string): Promise<Prescriber | null> {
  const { data, error } = await getSupabase()
    .from('prescribers')
    .select(PRESCRIBER_SELECT)
    .eq('id', prescriberId)
    .maybeSingle();

  if (error) throw new Error('Die Verordner:in konnte nicht geladen werden.');
  if (!data) return null;
  return prescriberSchema.parse(data);
}

/**
 * Anzeigename einer Verordner:in.
 *
 * Titel, Vorname und Nachname, dahinter in Klammern die Praxis. Zwei
 * gleichnamige Ärzt:innen sind so in einer Auswahlliste unterscheidbar - das
 * ist genau das Merkmal, über das auch der Eindeutigkeitsindex geht.
 */
export function prescriberName(prescriber: Prescriber): string {
  return [prescriber.title, prescriber.given_name, prescriber.family_name]
    .filter(Boolean)
    .join(' ');
}

export function prescriberLabel(prescriber: Prescriber): string {
  const name = prescriberName(prescriber);
  return prescriber.practice_name ? `${name} · ${prescriber.practice_name}` : name;
}

const optionalText = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value === '' ? null : value));

function hoechstens(zeichen: number, meldung: string) {
  return optionalText.refine((value) => value === null || value.length <= zeichen, meldung);
}

/**
 * Eingabe der Verordnerstammdaten.
 *
 * Nur der Nachname ist Pflicht: bei einer Gemeinschaftspraxis steht auf dem
 * Rezept oft nur „Dr. Probst" und der Praxisstempel. Verbindlich prüft und
 * normalisiert `create_prescriber` beziehungsweise `update_prescriber`.
 */
export const prescriberSchemaForm = z.object({
  family_name: z
    .string()
    .transform((value) => value.trim())
    .refine((value) => value.length > 0, 'Nachname ist erforderlich.')
    .refine((value) => value.length <= 100, 'Nachname ist zu lang.'),
  given_name: hoechstens(100, 'Vorname ist zu lang.'),
  title: hoechstens(60, 'Titel ist zu lang.'),
  practice_name: hoechstens(200, 'Der Praxisname ist zu lang.'),
  speciality: hoechstens(100, 'Die Fachrichtung ist zu lang.'),
  street: hoechstens(200, 'Die Straße ist zu lang.'),
  house_number: hoechstens(20, 'Die Hausnummer ist zu lang.'),
  postal_code: hoechstens(12, 'Die PLZ ist zu lang.'),
  city: hoechstens(100, 'Der Ort ist zu lang.'),
  phone: optionalText,
  fax: optionalText,
  email: optionalText.refine(
    (value) => value === null || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value),
    'Keine gültige E-Mail-Adresse.',
  ),
});

export type PrescriberInput = z.input<typeof prescriberSchemaForm>;
export type PrescriberValues = z.output<typeof prescriberSchemaForm>;
export type PrescriberFeld = keyof PrescriberInput;

export const leereVerordnerdaten: Record<PrescriberFeld, string> = {
  family_name: '',
  given_name: '',
  title: '',
  practice_name: '',
  speciality: '',
  street: '',
  house_number: '',
  postal_code: '',
  city: '',
  phone: '',
  fax: '',
  email: '',
};

export function prescriberToFormValues(prescriber: Prescriber): PrescriberInput {
  return {
    family_name: prescriber.family_name,
    given_name: prescriber.given_name ?? '',
    title: prescriber.title ?? '',
    practice_name: prescriber.practice_name ?? '',
    speciality: prescriber.speciality ?? '',
    street: prescriber.street ?? '',
    house_number: prescriber.house_number ?? '',
    postal_code: prescriber.postal_code ?? '',
    city: prescriber.city ?? '',
    phone: prescriber.phone ?? '',
    fax: prescriber.fax ?? '',
    email: prescriber.email ?? '',
  };
}

function rpcVerordner(values: PrescriberValues) {
  return {
    p_family_name: values.family_name,
    p_given_name: values.given_name,
    p_title: values.title,
    p_practice_name: values.practice_name,
    p_speciality: values.speciality,
    p_street: values.street,
    p_house_number: values.house_number,
    p_postal_code: values.postal_code,
    p_city: values.city,
    p_phone: values.phone,
    p_fax: values.fax,
    p_email: values.email,
  };
}

/**
 * Fehler, den die Oberfläche als Feldfehler statt als Banner zeigen soll.
 *
 * Der Eindeutigkeitsindex ist die einzige Regel, gegen die man beim Anlegen
 * versehentlich läuft. Sie hier zu benennen, ist Bedienkomfort - verbindlich
 * bleibt die Datenbank.
 */
export class VerordnerBereitsVorhanden extends Error {
  constructor() {
    super('Diese Verordner:in ist mit derselben Praxis bereits erfasst.');
    this.name = 'VerordnerBereitsVorhanden';
  }
}

function istDoppelt(error: unknown): boolean {
  const code = (error as { code?: string } | null)?.code;
  return code === '23505';
}

export async function createPrescriber(values: PrescriberValues): Promise<string> {
  const { data, error } = (await getSupabase().rpc('create_prescriber', {
    ...rpcVerordner(values),
  })) as { data: unknown; error: unknown };

  if (istDoppelt(error)) throw new VerordnerBereitsVorhanden();
  if (error) throw new Error('Die Verordner:in konnte nicht angelegt werden.');
  const id = z.string().uuid().safeParse(data);
  if (!id.success) throw new Error('Die Verordner:in konnte nicht angelegt werden.');
  return id.data;
}

export async function updatePrescriber(
  prescriberId: string,
  values: PrescriberValues,
): Promise<void> {
  const { error } = await getSupabase().rpc('update_prescriber', {
    p_prescriber_id: prescriberId,
    ...rpcVerordner(values),
  });

  if (istDoppelt(error)) throw new VerordnerBereitsVorhanden();
  // Keine Details aus der Datenbank nach außen: eine fremde und eine
  // unbekannte ID sollen auch in der Oberfläche gleich aussehen.
  if (error) throw new Error('Die Verordner:in konnte nicht gespeichert werden.');
}

// -----------------------------------------------------------------------------
// Verordnungen
// -----------------------------------------------------------------------------

const itemSchema = z.object({
  id: z.string(),
  sort_order: z.number(),
  remedy: z.string(),
  prescribed_quantity: z.number(),
  used_quantity: z.number(),
  // Wird serverseitig gerechnet und nirgends gespeichert (ANN-012).
  remaining_quantity: z.number(),
});

export type PrescriptionItem = z.infer<typeof itemSchema>;

const prescriptionSchema = z.object({
  id: z.string(),
  prescriber_id: z.string(),
  prescriber_name: z.string(),
  prescriber_practice_name: z.string().nullable(),
  prescription_kind: z.enum(['first', 'follow_up']),
  issued_on: z.string(),
  frequency_note: z.string().nullable(),
  note: z.string().nullable(),
  items: z.array(itemSchema),
  updated_at: z.string(),
});

/**
 * Die klinischen Felder kommen aus einer anderen Serverfunktion und sind
 * deshalb optional — nicht "nullable". Wer die organisatorische Sicht liest,
 * bekommt sie gar nicht erst (ADR-004, ANN-011).
 */
const clinicalPrescriptionSchema = prescriptionSchema.extend({
  diagnosis: z.string().nullable(),
  therapy_goal: z.string().nullable(),
  prescriber_note: z.string().nullable(),
  follow_up_recommendation: z.string().nullable(),
});

export type Prescription = z.infer<typeof prescriptionSchema>;
export type ClinicalPrescription = z.infer<typeof clinicalPrescriptionSchema>;

export async function fetchPatientPrescriptions(patientId: string): Promise<Prescription[]> {
  const { data, error } = (await getSupabase().rpc('list_patient_prescriptions', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Verordnungen konnten nicht geladen werden.');
  return z.array(prescriptionSchema).parse(data ?? []);
}

export async function fetchPatientPrescriptionsClinical(
  patientId: string,
): Promise<ClinicalPrescription[]> {
  const { data, error } = (await getSupabase().rpc('list_patient_prescriptions_clinical', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Verordnungen konnten nicht geladen werden.');
  return z.array(clinicalPrescriptionSchema).parse(data ?? []);
}

export const prescriptionKindLabels: Record<Prescription['prescription_kind'], string> = {
  first: 'Erstverordnung',
  follow_up: 'Folgeverordnung',
};

export function formatDate(value: string | null): string {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date);
}

/** Jahr der Ausstellung, für die Gruppierung in der Akte (VER-002). */
export function ausstellungsjahr(prescription: Prescription): string {
  return prescription.issued_on.slice(0, 4);
}

/**
 * Verordnungen nach Jahr, neueste zuerst.
 *
 * Die Serverfunktion liefert bereits absteigend sortiert; die Gruppierung
 * behält diese Reihenfolge bei, statt neu zu sortieren.
 */
export function nachJahr<T extends Prescription>(
  prescriptions: readonly T[],
): { jahr: string; verordnungen: T[] }[] {
  const gruppen: { jahr: string; verordnungen: T[] }[] = [];
  for (const verordnung of prescriptions) {
    const jahr = ausstellungsjahr(verordnung);
    const letzte = gruppen.at(-1);
    if (letzte && letzte.jahr === jahr) letzte.verordnungen.push(verordnung);
    else gruppen.push({ jahr, verordnungen: [verordnung] });
  }
  return gruppen;
}

/** Summe der noch offenen Behandlungen über alle Positionen. */
export function restkontingent(prescription: Prescription): number {
  return prescription.items.reduce((summe, item) => summe + item.remaining_quantity, 0);
}

/** Summe der verordneten Behandlungen über alle Positionen. */
export function gesamtkontingent(prescription: Prescription): number {
  return prescription.items.reduce((summe, item) => summe + item.prescribed_quantity, 0);
}
