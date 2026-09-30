import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { abgewiesen } from '@/lib/abgewiesen';
import { getSupabase } from '@/lib/supabase';

/**
 * Trainingskund:innen (TRN-EPIC-001).
 *
 * Alle Wege laufen über Serverfunktionen; sie prüfen Rolle, Organisation und
 * Zustand selbst und protokollieren (ADR-021 Punkt 8). Diese Datei übersetzt
 * nur. Ein abgewiesener Schreibweg antwortet seit G6c mit HTTP 403 und dem
 * Körper `null` - `abgewiesen` fängt das ab (ANN-115).
 */

const datum = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listeneintragSchema = z.object({
  id: z.string().uuid(),
  person_id: z.string().uuid(),
  given_name: z.string(),
  family_name: z.string(),
  status: z.enum(['active', 'inactive']),
  contract_started_on: datum.nullable(),
  contract_ended_on: datum.nullable(),
});
export type TrainingClientListItem = z.infer<typeof listeneintragSchema>;

const detailSchema = listeneintragSchema.extend({
  date_of_birth: datum.nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  street: z.string().nullable(),
  postal_code: z.string().nullable(),
  city: z.string().nullable(),
});
export type TrainingClient = z.infer<typeof detailSchema>;

const dublettenSchema = z.object({
  kind: z.enum(['training', 'patient']),
  training_relationship_id: z.string().uuid().nullable(),
  person_id: z.string().uuid(),
  given_name: z.string(),
  family_name: z.string(),
  date_of_birth: datum.nullable(),
});
export type TrainingDuplicate = z.infer<typeof dublettenSchema>;

// -----------------------------------------------------------------------------
// Formular
// -----------------------------------------------------------------------------

export const TRAINING_FELDER = [
  'given_name',
  'family_name',
  'date_of_birth',
  'phone',
  'email',
  'street',
  'postal_code',
  'city',
  'contract_started_on',
] as const;
export type TrainingFeld = (typeof TRAINING_FELDER)[number];
export type TrainingWerte = Record<TrainingFeld, string>;

export const leereTrainingWerte: TrainingWerte = {
  given_name: '',
  family_name: '',
  date_of_birth: '',
  phone: '',
  email: '',
  street: '',
  postal_code: '',
  city: '',
  contract_started_on: '',
};

export const TRAINING_BESCHRIFTUNG: Record<TrainingFeld, string> = {
  given_name: 'Vorname',
  family_name: 'Nachname',
  date_of_birth: 'Geburtsdatum',
  phone: 'Telefon',
  email: 'E-Mail',
  street: 'Straße und Hausnummer',
  postal_code: 'PLZ',
  city: 'Ort',
  contract_started_on: 'Vertragsbeginn',
};

export function trainingFeldId(feld: TrainingFeld): string {
  return `training-${feld.replace(/_/g, '-')}`;
}

/** Heute als JJJJ-MM-TT in der Zeitzone des Geräts. */
export function heuteImGeraet(): string {
  const jetzt = new Date();
  const monat = String(jetzt.getMonth() + 1).padStart(2, '0');
  const tag = String(jetzt.getDate()).padStart(2, '0');
  return `${jetzt.getFullYear()}-${monat}-${tag}`;
}

/**
 * Prüfung im Formular - der Bedienbarkeit halber. Verbindlich prüft der
 * Server dieselben Grenzen (Namen, E-Mail, Telefon, PLZ, Geburtsdatum).
 */
export const trainingWerteSchema = z.object({
  given_name: z
    .string()
    .trim()
    .min(1, 'Bitte den Vornamen angeben.')
    .max(100, 'Höchstens 100 Zeichen.'),
  family_name: z
    .string()
    .trim()
    .min(1, 'Bitte den Nachnamen angeben.')
    .max(100, 'Höchstens 100 Zeichen.'),
  date_of_birth: z
    .string()
    .refine((wert) => wert === '' || datum.safeParse(wert).success, 'Bitte ein Datum wählen.')
    .refine(
      (wert) => wert === '' || wert <= heuteImGeraet(),
      'Das Geburtsdatum liegt in der Zukunft.',
    ),
  phone: z
    .string()
    .trim()
    .refine(
      (wert) => wert === '' || (wert.length >= 3 && wert.length <= 40),
      'Bitte eine Telefonnummer mit 3 bis 40 Zeichen angeben.',
    ),
  email: z
    .string()
    .trim()
    .refine(
      (wert) => wert === '' || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(wert),
      'Bitte eine gültige E-Mail-Adresse angeben.',
    ),
  street: z.string().trim().max(200, 'Höchstens 200 Zeichen.'),
  postal_code: z
    .string()
    .trim()
    .refine(
      (wert) => wert === '' || (wert.length >= 2 && wert.length <= 12),
      'Bitte eine Postleitzahl mit 2 bis 12 Zeichen angeben.',
    ),
  city: z.string().trim().max(100, 'Höchstens 100 Zeichen.'),
  contract_started_on: z
    .string()
    .refine((wert) => wert === '' || datum.safeParse(wert).success, 'Bitte ein Datum wählen.'),
});

function leerZuNull(wert: string): string | null {
  const getrimmt = wert.trim();
  return getrimmt === '' ? null : getrimmt;
}

function rpcWerte(werte: TrainingWerte) {
  return {
    p_given_name: werte.given_name.trim(),
    p_family_name: werte.family_name.trim(),
    p_date_of_birth: leerZuNull(werte.date_of_birth),
    p_email: leerZuNull(werte.email),
    p_phone: leerZuNull(werte.phone),
    p_street: leerZuNull(werte.street),
    p_postal_code: leerZuNull(werte.postal_code),
    p_city: leerZuNull(werte.city),
    p_contract_started_on: leerZuNull(werte.contract_started_on),
  };
}

export function werteAus(kundin: TrainingClient): TrainingWerte {
  return {
    given_name: kundin.given_name,
    family_name: kundin.family_name,
    date_of_birth: kundin.date_of_birth ?? '',
    phone: kundin.phone ?? '',
    email: kundin.email ?? '',
    street: kundin.street ?? '',
    postal_code: kundin.postal_code ?? '',
    city: kundin.city ?? '',
    contract_started_on: kundin.contract_started_on ?? '',
  };
}

// -----------------------------------------------------------------------------
// Aufrufe
// -----------------------------------------------------------------------------

const kennung = z.string().uuid();

function neueKennung(data: unknown, satz: string): string {
  const ergebnis = kennung.safeParse(data);
  if (!ergebnis.success) throw new Error(satz);
  return ergebnis.data;
}

export async function listTrainingClients(): Promise<TrainingClientListItem[]> {
  const satz = 'Die Trainingskund:innen konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_training_clients')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error(satz);
  return antwort(z.array(listeneintragSchema), data ?? [], satz);
}

/** Öffnet eine Trainingskund:in - der Server protokolliert das (ADR-021 Punkt 8). */
export async function getTrainingClient(id: string): Promise<TrainingClient | null> {
  const satz = 'Die Trainingskund:in konnte nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_training_client', {
    p_relationship_id: id,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  const zeilen = antwort(z.array(detailSchema), data ?? [], satz);
  return zeilen[0] ?? null;
}

export async function findPossibleTrainingDuplicates(
  givenName: string,
  familyName: string,
  dateOfBirth: string | null,
): Promise<TrainingDuplicate[]> {
  const satz = 'Die Prüfung auf Dubletten ist fehlgeschlagen.';
  const { data, error } = (await getSupabase().rpc('find_possible_training_duplicates', {
    p_given_name: givenName,
    p_family_name: familyName,
    p_date_of_birth: dateOfBirth,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(z.array(dublettenSchema), data ?? [], satz);
}

export async function createTrainingClient(werte: TrainingWerte): Promise<string> {
  const satz = 'Die Trainingskund:in konnte nicht angelegt werden.';
  const ergebnis = await getSupabase().rpc('create_training_client', rpcWerte(werte));
  if (abgewiesen(ergebnis)) throw new Error(satz);
  return neueKennung(ergebnis.data, satz);
}

/**
 * Das zweite Verhältnis einer Person, die schon eine Akte hat (ANN-173).
 *
 * Aus der Akte kommt nichts; Kontakt und Vertragsbeginn sind die Eingaben
 * aus dem Formular. Der Name bleibt der der Person - ein abweichend
 * geschriebener Name im Formular ändert ihn nicht.
 */
export async function startTrainingForPerson(
  personId: string,
  werte: TrainingWerte,
): Promise<string> {
  const satz = 'Das Training konnte nicht begonnen werden.';
  const alle = rpcWerte(werte);
  const ergebnis = await getSupabase().rpc('start_training_for_person', {
    p_person_id: personId,
    p_contract_started_on: alle.p_contract_started_on,
    p_date_of_birth: alle.p_date_of_birth,
    p_email: alle.p_email,
    p_phone: alle.p_phone,
    p_street: alle.p_street,
    p_postal_code: alle.p_postal_code,
    p_city: alle.p_city,
  });
  if (abgewiesen(ergebnis)) throw new Error(satz);
  return neueKennung(ergebnis.data, satz);
}

export async function updateTrainingClient(id: string, werte: TrainingWerte): Promise<void> {
  const ergebnis = await getSupabase().rpc('update_training_client', {
    p_relationship_id: id,
    ...rpcWerte(werte),
  });
  if (abgewiesen(ergebnis) || ergebnis.data === null) {
    throw new Error('Die Angaben konnten nicht gespeichert werden.');
  }
}

export async function endTrainingRelationship(id: string, endedOn: string): Promise<void> {
  const ergebnis = await getSupabase().rpc('end_training_relationship', {
    p_relationship_id: id,
    p_ended_on: endedOn,
  });
  if (abgewiesen(ergebnis) || ergebnis.data === null) {
    throw new Error('Der Vertrag konnte nicht beendet werden.');
  }
}

export async function reopenTrainingRelationship(id: string): Promise<void> {
  const ergebnis = await getSupabase().rpc('reopen_training_relationship', {
    p_relationship_id: id,
  });
  if (abgewiesen(ergebnis) || ergebnis.data === null) {
    throw new Error('Der Vertrag konnte nicht wieder aufgenommen werden.');
  }
}
