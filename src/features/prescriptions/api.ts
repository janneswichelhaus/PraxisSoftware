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
