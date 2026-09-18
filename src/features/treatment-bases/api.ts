import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import {
  abstecherAblegen,
  abstecherAnsehen,
  abstecherEntfernen,
  abstecherErgaenzen,
  alleAbstecherVerwerfen,
} from '@/lib/abstecher';

/**
 * Datenzugriff auf Behandlungsgrundlagen und Verordner:innen (VER-EPIC-001,
 * GRD-001).
 *
 * Zwei sehr verschiedene Dinge liegen hier nebeneinander:
 *
 * Die **Verordnerkartei** enthält berufliche Kontaktdaten Dritter und keinen
 * Patientenbezug (ANN-013). Sie wird deshalb wie die Standortliste direkt aus
 * der Tabelle gelesen; die RLS entscheidet, was sichtbar ist. Sie bleibt hier,
 * obwohl der Ordner die Grundlage benennt: Eine Verordner:in gibt es nur, weil
 * es Verordnungen gibt — eine der beiden Bauarten (ADR-020).
 *
 * Die **Behandlungsgrundlage** enthält Gesundheitsdaten. Sie ist über keine
 * Tabelle erreichbar, sondern ausschließlich über Serverfunktionen, die je nach
 * Rolle eine andere Projektion liefern (ADR-004). Diese Datei ruft sie auf;
 * welche Felder zurückkommen, entscheidet die Datenbank.
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

type PrescriberInput = z.input<typeof prescriberSchemaForm>;
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
// Behandlungsgrundlagen
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

export type TreatmentBasisItem = z.infer<typeof itemSchema>;

/**
 * Die Bauarten einer Behandlungsgrundlage (ADR-020 Punkt 1).
 *
 * `first` und `follow_up` sind Verordnungen, `self_pay` ist der Selbstzahler.
 * Weitere Bauarten sind möglich und werden **nicht** vorgebaut (ADR-014).
 */
export const BAUARTEN = ['first', 'follow_up', 'self_pay'] as const;
export type Bauart = (typeof BAUARTEN)[number];

const treatmentBasisSchema = z.object({
  id: z.string(),
  // Null beim Selbstzahler: Er hat keine Verordner:in (ADR-020 Punkt 3).
  prescriber_id: z.string().nullable(),
  prescriber_name: z.string().nullable(),
  prescriber_practice_name: z.string().nullable(),
  treatment_basis_kind: z.enum(BAUARTEN),
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
const clinicalTreatmentBasisSchema = treatmentBasisSchema.extend({
  diagnosis: z.string().nullable(),
  therapy_goal: z.string().nullable(),
  prescriber_note: z.string().nullable(),
  follow_up_recommendation: z.string().nullable(),
});

export type TreatmentBasis = z.infer<typeof treatmentBasisSchema>;
export type ClinicalTreatmentBasis = z.infer<typeof clinicalTreatmentBasisSchema>;

export async function fetchPatientTreatmentBases(patientId: string): Promise<TreatmentBasis[]> {
  const { data, error } = (await getSupabase().rpc('list_patient_treatment_bases', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Behandlungsgrundlagen konnten nicht geladen werden.');
  return z.array(treatmentBasisSchema).parse(data ?? []);
}

export async function fetchPatientTreatmentBasesClinical(
  patientId: string,
): Promise<ClinicalTreatmentBasis[]> {
  const { data, error } = (await getSupabase().rpc('list_patient_treatment_bases_clinical', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Behandlungsgrundlagen konnten nicht geladen werden.');
  return z.array(clinicalTreatmentBasisSchema).parse(data ?? []);
}

export const bauartLabels: Record<Bauart, string> = {
  first: 'Erstverordnung',
  follow_up: 'Folgeverordnung',
  self_pay: 'Selbstzahler',
};

/** Verordnungen tragen ein Ausstellungsdatum, ein Selbstzahler eine Vereinbarung. */
export const bauartDatumsBeschriftung: Record<Bauart, string> = {
  first: 'Ausstellungsdatum',
  follow_up: 'Ausstellungsdatum',
  self_pay: 'Vereinbart am',
};

/** `true`, wenn diese Bauart eine Verordner:in und klinische Felder trägt. */
export function istVerordnung(bauart: Bauart): boolean {
  return bauart !== 'self_pay';
}

/**
 * Wie die Oberfläche eine Grundlage nennt (ADR-020 Punkt 7).
 *
 * Sie nennt die **Bauart**, nicht das Oberwort: „Erstverordnung vom 3.
 * September 2026" oder „Selbstzahler seit 3. September 2026". Das Wort
 * Behandlungsgrundlage erscheint nur dort, wo beide Bauarten zugleich gemeint
 * sind — in der Überschrift des Bereichs, nicht an der einzelnen Karte.
 */
export function grundlageBezeichnung(grundlage: Pick<TreatmentBasis, 'treatment_basis_kind'>): {
  bauart: string;
  praeposition: string;
} {
  const bauart = bauartLabels[grundlage.treatment_basis_kind];
  return { bauart, praeposition: grundlage.treatment_basis_kind === 'self_pay' ? 'seit' : 'vom' };
}

/** Jahr der Ausstellung, für die Gruppierung in der Akte (VER-002). */
function ausstellungsjahr(grundlage: TreatmentBasis): string {
  return grundlage.issued_on.slice(0, 4);
}

/**
 * Verordnungen nach Jahr, neueste zuerst.
 *
 * Die Serverfunktion liefert bereits absteigend sortiert; die Gruppierung
 * behält diese Reihenfolge bei, statt neu zu sortieren.
 */
export function nachJahr<T extends TreatmentBasis>(
  grundlagen: readonly T[],
): { jahr: string; verordnungen: T[] }[] {
  const gruppen: { jahr: string; verordnungen: T[] }[] = [];
  for (const verordnung of grundlagen) {
    const jahr = ausstellungsjahr(verordnung);
    const letzte = gruppen.at(-1);
    if (letzte && letzte.jahr === jahr) letzte.verordnungen.push(verordnung);
    else gruppen.push({ jahr, verordnungen: [verordnung] });
  }
  return gruppen;
}

// -----------------------------------------------------------------------------
// Einheiten und Termine je Verordnung (AKTE-002)
// -----------------------------------------------------------------------------

const kontingentSchema = z.object({
  treatment_basis_id: z.string(),
  /** Verordnete Leistungseinheiten aus den Positionen. */
  prescribed: z.number(),
  /** Genutzte Leistungseinheiten; bis ABR-002 von Hand gepflegt (ANN-012). */
  used: z.number(),
  /** Zugeordnete Termine ohne abgesagte - eine Terminzahl, keine Einheit. */
  planned: z.number(),
  /** Davon noch bevorstehend. */
  upcoming: z.number(),
  /** Was sich noch planen lässt: verordnet minus dem größeren Wert (ANN-038). */
  remaining: z.number(),
});

export type TreatmentBasisKontingent = z.infer<typeof kontingentSchema>;

/**
 * Kontingent und Terminzahlen aller Verordnungen einer Person.
 *
 * Der Grund für diesen Lesepfad ist die Trennung zweier Zahlen, die vorher
 * beide „Kontingent" hießen: **Leistungseinheiten** stehen an den Positionen
 * der Verordnung, **Termine** an den Terminen. Die Akte nennt sie deshalb
 * getrennt — und `remaining` ist das, was die Serienplanung noch anbietet
 * (ANN-038).
 */
export async function fetchPatientTreatmentBasisSlots(
  patientId: string,
): Promise<TreatmentBasisKontingent[]> {
  const { data, error } = (await getSupabase().rpc('list_patient_treatment_basis_slots', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Kontingente konnten nicht geladen werden.');
  return z.array(kontingentSchema).parse(data ?? []);
}

/** Die Kontingente nach Verordnung, für den Zugriff je Karte. */
export function kontingentJeGrundlage(
  zeilen: readonly TreatmentBasisKontingent[],
): Map<string, TreatmentBasisKontingent> {
  return new Map(zeilen.map((zeile) => [zeile.treatment_basis_id, zeile]));
}

// -----------------------------------------------------------------------------
// Verordnung anlegen und ändern (VER-003)
// -----------------------------------------------------------------------------

const singleClinicalSchema = clinicalTreatmentBasisSchema.extend({ patient_id: z.string() });

export type TreatmentBasisDetail = z.infer<typeof singleClinicalSchema>;

/**
 * Eine Verordnung für das Änderungsformular.
 *
 * Die Serverfunktion liefert eine Zeile oder keine; eine fremde und eine
 * unbekannte ID sehen gleich aus. Der Aufruf ist auditpflichtig — er legt
 * klinischen Inhalt offen (ADR-010).
 */
export async function fetchTreatmentBasis(
  grundlageId: string,
): Promise<TreatmentBasisDetail | null> {
  const { data, error } = (await getSupabase().rpc('get_treatment_basis', {
    p_treatment_basis_id: grundlageId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Behandlungsgrundlage konnte nicht geladen werden.');
  const zeilen = z.array(singleClinicalSchema).parse(data ?? []);
  return zeilen[0] ?? null;
}

/** Eine Position im Formular. Mengen bleiben Text, bis der Server sie prüft. */
export interface PositionEingabe {
  id: string | null;
  remedy: string;
  prescribed_quantity: string;
  used_quantity: string;
}

export const leerePosition: PositionEingabe = {
  id: null,
  remedy: '',
  prescribed_quantity: '',
  used_quantity: '0',
};

const ganzeZahl = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => /^\d+$/.test(value), 'Bitte eine ganze Zahl eingeben.')
  .transform((value) => Number(value));

export const positionSchema = z
  .object({
    id: z.string().nullable(),
    remedy: z
      .string()
      .transform((value) => value.trim())
      .refine((value) => value.length > 0, 'Heilmittel ist erforderlich.')
      .refine((value) => value.length <= 200, 'Das Heilmittel ist zu lang.'),
    prescribed_quantity: ganzeZahl.refine(
      (value) => value >= 1 && value <= 500,
      'Zwischen 1 und 500.',
    ),
    used_quantity: ganzeZahl.refine((value) => value <= 500, 'Zwischen 0 und 500.'),
  })
  .refine((position) => position.used_quantity <= position.prescribed_quantity, {
    message: 'Genutzt kann nicht größer sein als verordnet.',
    path: ['used_quantity'],
  });

export const treatmentBasisFormSchema = z
  .object({
    // Ob sie Pflicht ist, hängt an der Bauart - siehe superRefine unten.
    prescriber_id: optionalText,
    treatment_basis_kind: z.enum(BAUARTEN),
    issued_on: z
      .string()
      .refine((value) => value.trim().length > 0, 'Das Datum ist erforderlich.')
      .refine(
        (value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()),
        'Kein gültiges Datum.',
      )
      .refine(
        (value) => new Date(`${value}T00:00:00`) <= new Date(),
        'Das Datum darf nicht in der Zukunft liegen.',
      ),
    frequency_note: hoechstens(100, 'Die Frequenz ist zu lang.'),
    note: hoechstens(2000, 'Die Bemerkung ist zu lang.'),
    diagnosis: hoechstens(2000, 'Die Diagnose ist zu lang.'),
    therapy_goal: hoechstens(2000, 'Das Therapieziel ist zu lang.'),
    prescriber_note: hoechstens(2000, 'Der Hinweis ist zu lang.'),
    follow_up_recommendation: hoechstens(2000, 'Die Empfehlung ist zu lang.'),
  })
  // ADR-020 Punkt 3: Was eine Verordnung braucht, verlangt auch das Formular
  // weiter - aber nur von ihr. Verbindlich prüft das die Datenbank
  // (app.assert_treatment_basis_input und die Constraint dahinter); hier steht
  // es, damit der Fehler am Feld erscheint statt als Banner.
  .superRefine((werte, ctx) => {
    if (istVerordnung(werte.treatment_basis_kind) && werte.prescriber_id === null) {
      ctx.addIssue({
        code: 'custom',
        message: 'Verordner:in ist erforderlich.',
        path: ['prescriber_id'],
      });
    }
  });

type TreatmentBasisFormInput = z.input<typeof treatmentBasisFormSchema>;
type TreatmentBasisFormValues = z.output<typeof treatmentBasisFormSchema>;
export type TreatmentBasisFeld = keyof TreatmentBasisFormInput;

export const leereGrundlage: Record<TreatmentBasisFeld, string> = {
  prescriber_id: '',
  treatment_basis_kind: 'first',
  issued_on: '',
  frequency_note: '',
  note: '',
  diagnosis: '',
  therapy_goal: '',
  prescriber_note: '',
  follow_up_recommendation: '',
};

export function treatmentBasisToFormValues(
  grundlage: TreatmentBasisDetail,
): Record<TreatmentBasisFeld, string> {
  return {
    prescriber_id: grundlage.prescriber_id ?? '',
    treatment_basis_kind: grundlage.treatment_basis_kind,
    issued_on: grundlage.issued_on,
    frequency_note: grundlage.frequency_note ?? '',
    note: grundlage.note ?? '',
    diagnosis: grundlage.diagnosis ?? '',
    therapy_goal: grundlage.therapy_goal ?? '',
    prescriber_note: grundlage.prescriber_note ?? '',
    follow_up_recommendation: grundlage.follow_up_recommendation ?? '',
  };
}

export function itemsToFormValues(grundlage: TreatmentBasisDetail): PositionEingabe[] {
  return grundlage.items.map((item) => ({
    id: item.id,
    remedy: item.remedy,
    prescribed_quantity: String(item.prescribed_quantity),
    used_quantity: String(item.used_quantity),
  }));
}

/**
 * Entwurf einer Verordnung, der einen Abstecher zum Anlegen einer fehlenden
 * Verordner:in überlebt (VER-003).
 *
 * Eigener In-Memory-Speicher, bewusst **nicht** im TanStack-Query-Cache: ein
 * dort über `setQueryData` abgelegter Wert hat ohne beobachtenden `useQuery`
 * keinen aktiven Beobachter und gilt deshalb sofort als inaktiv - die normale
 * Garbage Collection (`gcTime`, Standard fünf Minuten) kann ihn verwerfen,
 * während die Verordner-Anlage in der Praxis auch mal länger dauert (ANN-019).
 * Eine einzelne Abfrage global länger vorzuhalten hätte das für jede andere
 * Abfrage mitgeändert; ein eigener, schlanker Speicher lässt alle anderen
 * Caches unberührt.
 *
 * Ein Neuladen der Seite oder ein Schließen des Tabs verwirft ihn wie jeden
 * anderen In-Memory-Zustand. Es gibt bewusst keinen Weg über die URL
 * (verordnerAnlegenZiel trägt nur den Rücksprungpfad) und keinen über
 * `localStorage`/`sessionStorage`: die Verordnung kann klinische Freitexte
 * enthalten (Diagnose, Therapieziel), die nirgendwo länger liegen bleiben
 * sollen als für diesen einen Abstecher (§18, ADR-011).
 *
 * Gebunden an Vorgang **und** Benutzer (ANN-019): der Schlüssel verbindet eine
 * **Vorgangskennung** mit der Benutzer-ID, damit ein Kontowechsel im selben
 * Tab nie den Entwurf einer anderen Person übernimmt.
 *
 * **Seit UX-009 ist die Vorgangskennung eine Zufallskennung je Abstecher, nicht
 * mehr der Rücksprungpfad.** Das behebt den in ANN-019 dokumentierten
 * Restpunkt: Wer die Verordner-Anlage über die Hauptnavigation verließ statt
 * über „Abbrechen", ließ einen Entwurf liegen, der bei einem **unabhängigen
 * neuen** Versuch auf demselben Pfad wieder auftauchte - der Pfad war für
 * beide Versuche derselbe Schlüssel. Die Kennung entsteht je Besuch des
 * Formulars neu und reist im Rücksprungpfad mit; ein neuer Besuch bringt eine
 * neue Kennung mit und findet deshalb nichts vor. `ENTWURF_MAX_ALTER_MS`
 * bleibt als zweite Grenze bestehen - jetzt aber, damit ein aufgegebener
 * Entwurf nicht unbegrenzt im Arbeitsspeicher liegt, und nicht mehr als
 * einziger Schutz gegen ein Wiederauftauchen.
 */
export interface TreatmentBasisDraft {
  werte: Record<TreatmentBasisFeld, string>;
  positionen: PositionEingabe[];
  /** Von der Verordner-Anlage nachgetragen, siehe `entwurfVerordnerNachtragen`. */
  neuerVerordnerId?: string;
}

/**
 * Die Mechanik steht seit UX-012 in `@/lib/abstecher`: Dieselben Regeln
 * brauchen auch die Terminanlage (Patient:in fehlt) und der Terminzettel
 * (Adresse fehlt). Hier bleiben die getypten Zugänge - der Entwurf einer
 * Verordnung hat eine feste Form, und die soll an der Aufrufstelle sichtbar
 * sein. `neueVorgangskennung` und `vorgangAusPfad` holen die Aufrufer direkt
 * aus `@/lib/abstecher`.
 */
/** Legt den Formularzustand vor dem Abstecher zur Verordner-Anlage ab (VER-003). */
export function entwurfAblegen(
  vorgang: string,
  userId: string,
  entwurf: TreatmentBasisDraft,
): void {
  abstecherAblegen(vorgang, userId, entwurf);
}

/** Liest einen Entwurf, ohne ihn zu entfernen (siehe `entwurfEntfernen`). */
export function entwurfAnsehen(vorgang: string, userId: string): TreatmentBasisDraft | undefined {
  return abstecherAnsehen<TreatmentBasisDraft>(vorgang, userId);
}

/** Entfernt einen Entwurf endgültig - nach dem Wiederaufbau des Formulars. */
export function entwurfEntfernen(vorgang: string, userId: string): void {
  abstecherEntfernen(vorgang, userId);
}

/**
 * Trägt die neu angelegte Verordner:in in einen vorhandenen Entwurf nach.
 * Ohne passenden Entwurf (Aufruf direkt aus der Verordnerkartei oder ein
 * Entwurf einer anderen Person) passiert nichts.
 */
export function entwurfVerordnerNachtragen(
  vorgang: string,
  userId: string,
  verordnerId: string,
): void {
  abstecherErgaenzen<TreatmentBasisDraft>(vorgang, userId, { neuerVerordnerId: verordnerId });
}

/** Verwirft alle Entwürfe aller Benutzer:innen - bei Abmeldung (VER-003). */
export function alleEntwuerfeVerwerfen(): void {
  alleAbstecherVerwerfen();
}

/**
 * Die Felder für `create_treatment_basis` und `update_treatment_basis`.
 *
 * Beim Selbstzahler gehen Verordner:in und die klinischen Felder als `null`
 * hinaus (ADR-020 Punkt 3 und 4). Das Formular zeigt sie dort gar nicht erst;
 * dass sie hier trotzdem ausdrücklich geleert werden, ist die zweite Sicherung -
 * ein Wechsel der Bauart soll nie eine Diagnose an einem Selbstzahler
 * zurücklassen. Verbindlich prüft die Verordner:in die Datenbank.
 */
function rpcGrundlage(values: TreatmentBasisFormValues, items: z.output<typeof positionSchema>[]) {
  const verordnung = istVerordnung(values.treatment_basis_kind);
  const nurVerordnung = <T>(wert: T) => (verordnung ? wert : null);
  return {
    p_prescriber_id: nurVerordnung(values.prescriber_id),
    p_treatment_basis_kind: values.treatment_basis_kind,
    p_issued_on: values.issued_on,
    p_items: items,
    p_frequency_note: values.frequency_note,
    p_note: values.note,
    p_diagnosis: nurVerordnung(values.diagnosis),
    p_therapy_goal: nurVerordnung(values.therapy_goal),
    p_prescriber_note: nurVerordnung(values.prescriber_note),
    p_follow_up_recommendation: nurVerordnung(values.follow_up_recommendation),
  };
}

export async function createTreatmentBasis(
  patientId: string,
  values: TreatmentBasisFormValues,
  items: z.output<typeof positionSchema>[],
): Promise<string> {
  const { data, error } = (await getSupabase().rpc('create_treatment_basis', {
    p_patient_id: patientId,
    ...rpcGrundlage(values, items),
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Behandlungsgrundlage konnte nicht gespeichert werden.');
  const id = z.string().uuid().safeParse(data);
  if (!id.success) throw new Error('Die Behandlungsgrundlage konnte nicht gespeichert werden.');
  return id.data;
}

export async function updateTreatmentBasis(
  grundlageId: string,
  values: TreatmentBasisFormValues,
  items: z.output<typeof positionSchema>[],
): Promise<void> {
  const { error } = await getSupabase().rpc('update_treatment_basis', {
    p_treatment_basis_id: grundlageId,
    ...rpcGrundlage(values, items),
  });

  // Keine Details aus der Datenbank nach außen: eine fremde und eine
  // unbekannte ID sollen auch in der Oberfläche gleich aussehen.
  if (error) throw new Error('Die Behandlungsgrundlage konnte nicht gespeichert werden.');
}

export async function deleteTreatmentBasis(grundlageId: string): Promise<void> {
  const { error } = await getSupabase().rpc('delete_treatment_basis', {
    p_treatment_basis_id: grundlageId,
  });
  if (error) throw new Error('Die Behandlungsgrundlage konnte nicht gelöscht werden.');
}
