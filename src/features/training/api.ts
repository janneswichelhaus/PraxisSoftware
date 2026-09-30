import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { abgewiesen } from '@/lib/abgewiesen';
import { getSupabase } from '@/lib/supabase';
import {
  schreibfehler,
  type AppointmentFormValues,
  type CancellationReason,
} from '@/features/appointments/api';

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

// -----------------------------------------------------------------------------
// Vereinbarungen (TRN-005)
//
// Die Trainingsgrundlage heißt in der Oberfläche „Vereinbarung": Sie ist die
// Absprache über eine Anzahl Einheiten, keine Verordnung (ADR-022 Punkt 5).
// -----------------------------------------------------------------------------

const vereinbarungSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(['active', 'concluded']),
  started_on: datum,
  agreed_quantity: z.number().int().nullable(),
  appointment_count: z.number().int(),
});
export type TrainingBasis = z.infer<typeof vereinbarungSchema>;

export async function listTrainingBases(relationshipId: string): Promise<TrainingBasis[]> {
  const satz = 'Die Vereinbarungen konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_training_bases', {
    p_relationship_id: relationshipId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(z.array(vereinbarungSchema), data ?? [], satz);
}

/** „10 Einheiten" oder „ohne feste Anzahl" - mit der Zahl der geplanten Termine (ANN-179). */
export function vereinbarungText(
  basis: Pick<TrainingBasis, 'agreed_quantity' | 'appointment_count'>,
): string {
  const termine = basis.appointment_count === 1 ? '1 Termin' : `${basis.appointment_count} Termine`;
  return basis.agreed_quantity === null
    ? `ohne feste Anzahl · ${termine}`
    : `${termine} von ${basis.agreed_quantity}`;
}

export async function createTrainingBasis(
  relationshipId: string,
  startedOn: string | null,
  agreedQuantity: number | null,
): Promise<string> {
  const satz = 'Die Vereinbarung konnte nicht angelegt werden.';
  const ergebnis = await getSupabase().rpc('create_training_basis', {
    p_relationship_id: relationshipId,
    p_started_on: startedOn,
    p_agreed_quantity: agreedQuantity,
  });
  if (abgewiesen(ergebnis)) throw new Error(satz);
  return neueKennung(ergebnis.data, satz);
}

export async function setTrainingBasisConcluded(
  basisId: string,
  abgeschlossen: boolean,
): Promise<void> {
  const ergebnis = await getSupabase().rpc(
    abgeschlossen ? 'conclude_training_basis' : 'reopen_training_basis',
    { p_basis_id: basisId },
  );
  if (abgewiesen(ergebnis) || ergebnis.data === null) {
    throw new Error(
      abgeschlossen
        ? 'Die Vereinbarung konnte nicht abgeschlossen werden.'
        : 'Die Vereinbarung konnte nicht wieder geöffnet werden.',
    );
  }
}

// -----------------------------------------------------------------------------
// Trainingstermine (TRN-004, TRN-006)
//
// Angelegt über `create_training_appointment`; verschoben und abgesagt über
// die vorhandenen Wege `update_appointment` und `cancel_appointment` (ADR-022
// Punkt 1) - dafür stehen `updateAppointment` und `cancelAppointment` in
// `features/appointments/api.ts`.
// -----------------------------------------------------------------------------

const trainingsterminSchema = z.object({
  id: z.string().uuid(),
  training_relationship_id: z.string().uuid(),
  training_basis_id: z.string().uuid().nullable(),
  client_given_name: z.string(),
  client_family_name: z.string(),
  staff_member_id: z.string().uuid(),
  staff_given_name: z.string(),
  staff_family_name: z.string(),
  location_id: z.string().uuid().nullable(),
  location_name: z.string().nullable(),
  appointment_type: z.enum(['home_visit', 'practice', 'video']),
  status: z.enum(['confirmed', 'cancelled', 'no_show', 'completed', 'documented', 'invoiced']),
  starts_at: z.string(),
  ends_at: z.string(),
  updated_at: z.string(),
  visit_street: z.string().nullable(),
  visit_house_number: z.string().nullable(),
  visit_postal_code: z.string().nullable(),
  visit_city: z.string().nullable(),
  cancellation_reason: z.string().nullable(),
  cancellation_received_at: z.string().nullable(),
  organization_time_zone: z.string(),
});
export type TrainingAppointment = z.infer<typeof trainingsterminSchema>;

export async function getTrainingAppointment(id: string): Promise<TrainingAppointment | null> {
  const satz = 'Der Trainingstermin konnte nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_training_appointment', {
    p_appointment_id: id,
  })) as { data: unknown; error: { message?: string } | null };
  if (error) {
    // Ein anderer Kontext und eine unbekannte Kennung sind dasselbe (TRN-006).
    if (error.message?.includes('appointment not found')) return null;
    throw new Error(satz);
  }
  const zeilen = antwort(z.array(trainingsterminSchema), data ?? [], satz);
  return zeilen[0] ?? null;
}

const kundenterminSchema = z.object({
  id: z.string().uuid(),
  training_basis_id: z.string().uuid().nullable(),
  staff_member_id: z.string().uuid(),
  staff_given_name: z.string(),
  staff_family_name: z.string(),
  appointment_type: z.enum(['home_visit', 'practice', 'video']),
  status: z.enum(['confirmed', 'cancelled', 'no_show', 'completed', 'documented', 'invoiced']),
  starts_at: z.string(),
  ends_at: z.string(),
});
export type TrainingClientAppointment = z.infer<typeof kundenterminSchema>;

/** Termine einer Trainingskund:in ab 30 Tagen zurück - nie eine Behandlung derselben Person. */
export async function listTrainingClientAppointments(
  relationshipId: string,
): Promise<TrainingClientAppointment[]> {
  const satz = 'Die Termine konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_training_client_appointments', {
    p_relationship_id: relationshipId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(z.array(kundenterminSchema), data ?? [], satz);
}

/**
 * Legt einen Trainingstermin an (TRN-004).
 *
 * Arbeitszeit und Vergangenheit kommen als eigene Fehlertypen zurück, damit
 * die Seite nachfragen und den Vorgang bestätigt neu schicken kann - dasselbe
 * Muster wie am Behandlungstermin (CAL-005, FIX-019).
 */
export async function createTrainingAppointment(
  relationshipId: string,
  values: AppointmentFormValues,
  basisId: string | null,
  allowOutsideWorkingHours = false,
  confirmedPast = false,
): Promise<string> {
  const satz = 'Der Trainingstermin konnte nicht angelegt werden.';
  const ergebnis = (await getSupabase().rpc('create_training_appointment', {
    p_training_relationship_id: relationshipId,
    p_staff_member_id: values.staff_member_id,
    p_appointment_type: values.appointment_type,
    p_date: values.date,
    p_start_time: values.start_time,
    p_end_time: values.end_time,
    p_location_id: values.appointment_type === 'practice' ? values.location_id : null,
    p_allow_outside_working_hours: allowOutsideWorkingHours,
    p_training_basis_id: basisId,
    p_confirmed_past: confirmedPast,
  })) as { data: unknown; error: { message?: string } | null; status?: number };
  if (ergebnis.error) throw schreibfehler(ergebnis.error, satz);
  if (abgewiesen(ergebnis)) throw new Error(satz);
  return neueKennung(ergebnis.data, satz);
}

/**
 * Absagegründe im Training (TRN-004).
 *
 * Dieselben Codes wie am Behandlungstermin (ANN-034) - nur mit dem Wort des
 * Bereichs: Eine Trainingskund:in ist keine Patient:in (ADR-021 Punkt 9).
 */
export const trainingAbsageLabels: Record<CancellationReason, string> = {
  patient_request: 'Kund:in hat abgesagt',
  practice_request: 'Praxis hat abgesagt',
  moved: 'Termin verlegt',
  other: 'Sonstiger Grund',
};

// -----------------------------------------------------------------------------
// Trainingsprotokoll (TRN-009, TRN-010)
//
// Ein Fachdatum des Trainingsverhältnisses, kein Befund und keine
// Behandlungsdokumentation (ADR-022 Punkt 7). Freitext, der erfasst und
// angezeigt wird - keine Auswertung, kein Vorschlag (ADR-006 Punkte 9 bis 13).
// Jedes Lesen protokolliert der Server (ADR-021 Punkt 8).
// -----------------------------------------------------------------------------

const protokollSchema = z.object({
  id: z.string().uuid(),
  appointment_id: z.string().uuid(),
  status: z.enum(['draft', 'final']),
  content: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  finalized_at: z.string().nullable(),
  author_name: z.string().nullable(),
  finalized_by_name: z.string().nullable(),
});
export type TrainingProtocol = z.infer<typeof protokollSchema>;

const einheitSchema = z.object({
  id: z.string().uuid(),
  appointment_id: z.string().uuid(),
  starts_at: z.string(),
  ends_at: z.string(),
  appointment_type: z.enum(['home_visit', 'practice', 'video']),
  staff_given_name: z.string(),
  staff_family_name: z.string(),
  status: z.enum(['draft', 'final']),
  content: z.string(),
  finalized_at: z.string().nullable(),
  author_name: z.string().nullable(),
  organization_time_zone: z.string(),
});
export type TrainingUnit = z.infer<typeof einheitSchema>;

/** Protokolliert werden kann nur, was stattgefunden hat oder gerade stattfindet. */
export function istProtokollierbar(status: TrainingAppointment['status']): boolean {
  return status !== 'cancelled' && status !== 'no_show';
}

/** Das Protokoll eines Trainingstermins oder `null`, wenn es noch keines gibt. */
export async function getTrainingProtocol(appointmentId: string): Promise<TrainingProtocol | null> {
  const satz = 'Das Trainingsprotokoll konnte nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('get_training_protocol', {
    p_appointment_id: appointmentId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  const zeilen = antwort(z.array(protokollSchema), data ?? [], satz);
  return zeilen[0] ?? null;
}

/** Die protokollierten Einheiten einer Trainingskund:in, neueste zuerst. */
export async function listTrainingProtocols(relationshipId: string): Promise<TrainingUnit[]> {
  const satz = 'Die Einheiten konnten nicht geladen werden.';
  const { data, error } = (await getSupabase().rpc('list_training_protocols', {
    p_relationship_id: relationshipId,
  })) as { data: unknown; error: unknown };
  if (error) throw new Error(satz);
  return antwort(z.array(einheitSchema), data ?? [], satz);
}

function protokollfehler(error: { message?: string } | null, standard: string): Error {
  if (error?.message?.includes('changed meanwhile')) {
    return new Error(
      'Das Protokoll wurde zwischenzeitlich von einer anderen Person geändert. Bitte die Ansicht neu laden.',
    );
  }
  // Zweitreview 5: Ein zweites Fenster hat das Protokoll inzwischen angelegt.
  if (error?.message?.includes('expected updated_at is required')) {
    return new Error('Das Protokoll wurde inzwischen angelegt. Bitte die Ansicht neu laden.');
  }
  if (error?.message?.includes('already exists')) {
    return new Error('Das Protokoll wurde inzwischen angelegt. Bitte die Ansicht neu laden.');
  }
  if (error?.message?.includes('cannot be changed')) {
    return new Error('Das Protokoll ist abgeschlossen und lässt sich nicht mehr ändern.');
  }
  if (error?.message?.includes('must not be empty')) {
    return new Error('Bitte festhalten, was in der Einheit gemacht wurde.');
  }
  if (error?.message?.includes('too long')) {
    return new Error('Das Protokoll ist zu lang (höchstens 20 000 Zeichen).');
  }
  return new Error(standard);
}

const speicherSchema = z.array(z.object({ id: z.string().uuid(), updated_at: z.string() }));

/** Speichert das Protokoll als Entwurf; gibt den neuen Stand zurück. */
export async function saveTrainingProtocol(
  appointmentId: string,
  content: string,
  expectedUpdatedAt: string | null,
): Promise<{ id: string; updated_at: string }> {
  const satz = 'Das Trainingsprotokoll konnte nicht gespeichert werden.';
  const ergebnis = (await getSupabase().rpc('save_training_protocol', {
    p_appointment_id: appointmentId,
    p_content: content,
    p_expected_updated_at: expectedUpdatedAt,
  })) as { data: unknown; error: { message?: string } | null; status?: number };
  if (ergebnis.error) throw protokollfehler(ergebnis.error, satz);
  if (abgewiesen(ergebnis)) throw new Error(satz);
  const zeile = antwort(speicherSchema, ergebnis.data ?? [], satz)[0];
  if (!zeile) throw new Error(satz);
  return zeile;
}

/**
 * Schließt das Protokoll ab. Der Server setzt den Termin im selben Vorgang
 * auf „dokumentiert" (ADR-018 Punkt 3); danach ist es unveränderlich
 * (ANN-185).
 */
export async function finalizeTrainingProtocol(
  appointmentId: string,
  content: string,
  expectedUpdatedAt: string | null,
): Promise<void> {
  const satz = 'Das Trainingsprotokoll konnte nicht abgeschlossen werden.';
  const ergebnis = (await getSupabase().rpc('finalize_training_protocol', {
    p_appointment_id: appointmentId,
    p_content: content,
    p_expected_updated_at: expectedUpdatedAt,
  })) as { data: unknown; error: { message?: string } | null; status?: number };
  if (ergebnis.error) throw protokollfehler(ergebnis.error, satz);
  if (abgewiesen(ergebnis) || ergebnis.data === null) throw new Error(satz);
}
