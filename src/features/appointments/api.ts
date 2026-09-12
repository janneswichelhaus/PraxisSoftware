import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import type { StatusFilter } from './calendar';
import type { Serientermin } from './serie';

/**
 * Datenzugriff auf die Terminverwaltung.
 *
 * Gelesen wird die Sicht `appointment_directory`. Sie läuft mit
 * `security_invoker` - welche Zeilen zurückkommen, entscheidet die RLS der
 * Basistabellen, nicht diese Abfrage.
 *
 * Termine sind organisatorische Daten. Klinische Inhalte gehören ausdrücklich
 * nicht dazu (PROJECT_PRINCIPLES.md 4.6, 5).
 */

export const appointmentTypeSchema = z.enum(['home_visit', 'practice', 'video']);
export type AppointmentType = z.infer<typeof appointmentTypeSchema>;

/**
 * Zustände des Termins nach ADR-018.
 *
 * Sechs Werte, genau die der Datenbank-Constraint. „Angefragt" und
 * „vorgemerkt" sind im ADR beschrieben, aber nicht gebaut: ohne Portal gibt es
 * niemanden, der einen Termin anfragt (ADR-014). `invoiced` steht im
 * Wertebereich und bekommt seinen Schreibpfad mit ABR-003.
 */
export const appointmentStatusSchema = z.enum([
  'confirmed',
  'cancelled',
  'no_show',
  'completed',
  'documented',
  'invoiced',
]);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export const appointmentTypeLabels: Record<AppointmentType, string> = {
  home_visit: 'Hausbesuch',
  practice: 'Praxis',
  video: 'Video',
};

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  confirmed: 'Bestätigt',
  cancelled: 'Abgesagt',
  no_show: 'Nicht angetroffen',
  completed: 'Abgeschlossen',
  documented: 'Dokumentiert',
  invoiced: 'Abgerechnet',
};

/**
 * Ton des Statusabzeichens.
 *
 * An genau einer Stelle, weil ihn drei Ansichten brauchen — Kalender,
 * Tagesliste und Akte — und ein Zustand überall gleich aussehen muss. Der Ton
 * ergänzt nur: der Zustand steht immer als Wort daneben (`Badge`, WCAG 1.4.1).
 */
export const appointmentStatusTon: Record<AppointmentStatus, 'positiv' | 'warnung' | 'kritisch'> = {
  confirmed: 'positiv',
  cancelled: 'kritisch',
  no_show: 'warnung',
  completed: 'positiv',
  documented: 'positiv',
  invoiced: 'positiv',
};

/**
 * Absagegründe (CAL-008b, ANN-034).
 *
 * Eine codierte Auswahl, kein Freitext: ein freies Feld am Termin wäre die
 * wahrscheinlichste Stelle, an der eine Gesundheitsangabe in einen
 * organisatorischen Datensatz rutscht (PROJECT_PRINCIPLES.md §4.6, §5). Die
 * Reihenfolge ist die der Häufigkeit im Praxisalltag.
 */
export const cancellationReasonSchema = z.enum([
  'patient_request',
  'practice_request',
  'moved',
  'other',
]);
export type CancellationReason = z.infer<typeof cancellationReasonSchema>;

export const cancellationReasonLabels: Record<CancellationReason, string> = {
  patient_request: 'Patient:in hat abgesagt',
  practice_request: 'Praxis hat abgesagt',
  moved: 'Termin verlegt',
  other: 'Sonstiger Grund',
};

const appointmentSchema = z.object({
  id: z.string(),
  patient_id: z.string(),
  staff_member_id: z.string(),
  location_id: z.string().nullable(),
  appointment_type: appointmentTypeSchema,
  status: appointmentStatusSchema,
  starts_at: z.string(),
  ends_at: z.string(),
  // Grundlage der Konflikterkennung beim Bearbeiten (CAL-003). Bewusst als
  // Zeichenkette gefuehrt: ein Date verloere Bruchteile von Sekunden.
  updated_at: z.string(),
  visit_street: z.string().nullable(),
  visit_house_number: z.string().nullable(),
  visit_postal_code: z.string().nullable(),
  visit_city: z.string().nullable(),
  // Nur der Zeitpunkt, nicht die abschliessende Person: die Detailansicht
  // zeigt keine Akteure, die Historie steht im Auditlog (ADR-010).
  completed_at: z.string().nullable(),
  // `null` bei jeder Absage aus der Zeit vor CAL-008b - der Grund wird nicht
  // rueckwirkend erfunden.
  cancellation_reason: cancellationReasonSchema.nullable(),
  // Nur Zeitpunkt und Kennzeichen, nicht die vermerkende Person: die
  // Detailansicht zeigt keine Akteure (ADR-010).
  no_show_recorded_at: z.string().nullable(),
  no_show_fee: z.boolean().nullable(),
  patient_given_name: z.string(),
  patient_family_name: z.string(),
  staff_given_name: z.string(),
  staff_family_name: z.string(),
  location_name: z.string().nullable(),
  // Die Zeitzone der Praxis kommt aus der Datenbank mit. Ohne sie müsste die
  // Oberfläche eine Zeitzone annehmen - genau das soll sie nicht.
  organization_time_zone: z.string(),
});

export type Appointment = z.infer<typeof appointmentSchema>;

const SELECT =
  'id, patient_id, staff_member_id, location_id, appointment_type, status, starts_at, ends_at, updated_at, ' +
  'visit_street, visit_house_number, visit_postal_code, visit_city, completed_at, ' +
  'cancellation_reason, no_show_recorded_at, no_show_fee, ' +
  'patient_given_name, patient_family_name, staff_given_name, staff_family_name, ' +
  'location_name, organization_time_zone';

export async function fetchAppointment(appointmentId: string): Promise<Appointment | null> {
  const { data, error } = await getSupabase()
    .from('appointment_directory')
    .select(SELECT)
    .eq('id', appointmentId)
    .maybeSingle();

  if (error) throw new Error('Der Termin konnte nicht geladen werden.');
  if (!data) return null;
  return appointmentSchema.parse(data);
}

const therapistSchema = z.object({
  staff_member_id: z.string(),
  display_name: z.string(),
});
export type AssignableTherapist = z.infer<typeof therapistSchema>;

/**
 * Zuordenbare behandelnde Personen.
 *
 * Bewusst über eine Serverfunktion: die RLS auf `user_roles` zeigt einem
 * Nicht-owner die Rollen anderer Accounts nicht, ein Join im Client bliebe
 * deshalb leer. Geliefert wird nur ID und Anzeigename (ADR-004).
 */
export async function fetchAssignableTherapists(): Promise<AssignableTherapist[]> {
  const { data, error } = (await getSupabase().rpc('list_assignable_therapists')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error('Die behandelnden Personen konnten nicht geladen werden.');
  return z.array(therapistSchema).parse(data ?? []);
}

const locationSchema = z.object({ id: z.string(), name: z.string() });
export type Location = z.infer<typeof locationSchema>;

export async function fetchLocations(): Promise<Location[]> {
  const { data, error } = await getSupabase()
    .from('locations')
    .select('id, name')
    .order('name', { ascending: true });

  if (error) throw new Error('Die Standorte konnten nicht geladen werden.');
  return z.array(locationSchema).parse(data ?? []);
}

// -----------------------------------------------------------------------------
// Darstellung in der Praxiszeitzone
//
// Ausschließlich über Intl.DateTimeFormat mit ausdrücklicher `timeZone`. Keine
// eigene Zeitzonenarithmetik: Sommer-/Winterzeit und Umstellungstage sind dort
// bereits korrekt abgebildet.
// -----------------------------------------------------------------------------

export function formatLocalDate(isoTimestamp: string, timeZone: string): string {
  return new Intl.DateTimeFormat('de-DE', { dateStyle: 'full', timeZone }).format(
    new Date(isoTimestamp),
  );
}

export function formatLocalTime(isoTimestamp: string, timeZone: string): string {
  return new Intl.DateTimeFormat('de-DE', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone,
  }).format(new Date(isoTimestamp));
}

export function formatLocalTimeRange(startIso: string, endIso: string, timeZone: string): string {
  return `${formatLocalTime(startIso, timeZone)}–${formatLocalTime(endIso, timeZone)} Uhr`;
}

/**
 * Heutiger Kalendertag in einer Zeitzone als `YYYY-MM-DD`.
 *
 * `en-CA` liefert genau dieses Format. Damit lässt sich im Formular gegen den
 * laufenden Praxistag prüfen, ohne die Browserzeitzone heranzuziehen.
 */
export function todayInTimeZone(timeZone: string, now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    timeZone,
  }).format(now);
}

/** Ortsangabe eines Termins in einer Zeile - passend zur Terminart. */
export function locationSummary(appointment: Appointment): string {
  if (appointment.appointment_type === 'practice') return appointment.location_name ?? '—';
  if (appointment.appointment_type === 'video') return 'Videotermin';

  const street = [appointment.visit_street, appointment.visit_house_number]
    .filter(Boolean)
    .join(' ');
  const city = [appointment.visit_postal_code, appointment.visit_city].filter(Boolean).join(' ');
  return [street, city].filter(Boolean).join(', ') || '—';
}

export function staffName(
  appointment: Pick<Appointment, 'staff_given_name' | 'staff_family_name'>,
): string {
  return `${appointment.staff_given_name} ${appointment.staff_family_name}`;
}

export function patientName(
  appointment: Pick<Appointment, 'patient_given_name' | 'patient_family_name'>,
): string {
  return `${appointment.patient_given_name} ${appointment.patient_family_name}`;
}

// -----------------------------------------------------------------------------
// Eingabe
//
// Die Prüfung hier ist Bedienkomfort. Verbindlich normalisiert und geprüft wird
// serverseitig in `create_appointment` - die UI ist keine Zusicherung (ADR-004).
// -----------------------------------------------------------------------------

export const appointmentFormSchema = z
  .object({
    staff_member_id: z.string().refine((v) => v.length > 0, 'Behandelnde Person ist erforderlich.'),
    appointment_type: appointmentTypeSchema,
    date: z.string().refine((v) => v.trim().length > 0, 'Datum ist erforderlich.'),
    start_time: z.string().refine((v) => v.trim().length > 0, 'Beginn ist erforderlich.'),
    end_time: z.string().refine((v) => v.trim().length > 0, 'Ende ist erforderlich.'),
    location_id: z.string(),
  })
  .superRefine((werte, ctx) => {
    if (werte.start_time && werte.end_time && werte.end_time <= werte.start_time) {
      ctx.addIssue({
        code: 'custom',
        path: ['end_time'],
        message: 'Das Ende muss nach dem Beginn liegen.',
      });
    }
    if (werte.appointment_type === 'practice' && werte.location_id.length === 0) {
      ctx.addIssue({
        code: 'custom',
        path: ['location_id'],
        message: 'Für einen Praxistermin ist ein Standort erforderlich.',
      });
    }
  });

export type AppointmentFormValues = z.infer<typeof appointmentFormSchema>;
export type AppointmentFormField = keyof AppointmentFormValues;

export const leererTermin: Record<AppointmentFormField, string> = {
  staff_member_id: '',
  appointment_type: 'practice',
  date: '',
  start_time: '',
  end_time: '',
  location_id: '',
};

/**
 * Länge eines angebotenen Terminfensters in Minuten (CAL-010a).
 *
 * `PROJECT_PRINCIPLES.md` §8.1: Ein angebotener Behandlungstermin MUSS ein
 * Zeitfenster von 60 Minuten haben, die Dokumentation eingeschlossen.
 *
 * Diese Konstante steuert die Oberfläche. Verbindlich ist sie **nicht**:
 * `app.appointment_window_minutes()` setzt dieselbe Zahl serverseitig durch
 * (§8.1: „eine Vorbelegung im Formular allein erfüllt sie nicht"). Ein
 * Datenbanktest hält beide gegeneinander.
 */
export const TERMINFENSTER_MINUTEN = 60;

const UHRZEIT_ZERLEGT = /^([01]\d|2[0-3]):([0-5]\d)/;

/** Minuten seit Mitternacht aus `HH:MM`; `null`, wenn die Eingabe keine Uhrzeit ist. */
function minutenAusZeit(zeit: string): number | null {
  const teile = UHRZEIT_ZERLEGT.exec(zeit);
  return teile ? Number(teile[1]) * 60 + Number(teile[2]) : null;
}

/**
 * Ende eines Zeitfensters aus Beginn und Länge, als `HH:MM`.
 *
 * Reine Minutenarithmetik auf der Ortszeit der Praxis - dieselbe Auslegung wie
 * serverseitig, wo Beginn und Ende als `time` in die Zeitzone der Organisation
 * gerechnet werden. Überschreitet das Ende Mitternacht, kommt eine leere
 * Zeichenkette zurück: ein Termin über den Tageswechsel ist keiner, und das
 * Formular soll dafür kein Ende erfinden.
 */
export function fensterEnde(beginn: string, minuten = TERMINFENSTER_MINUTEN): string {
  const start = minutenAusZeit(beginn);
  if (start === null) return '';
  const gesamt = start + minuten;
  if (gesamt >= 24 * 60) return '';
  const stunde = String(Math.floor(gesamt / 60)).padStart(2, '0');
  const minute = String(gesamt % 60).padStart(2, '0');
  return `${stunde}:${minute}`;
}

/**
 * Länge eines gespeicherten Termins in Minuten.
 *
 * Bestandstermine aus der Zeit vor §8.1 dürfen davon abweichen und bleiben
 * gültig. Das Bearbeitungsformular rechnet deshalb mit **dieser** Länge weiter,
 * solange niemand sie ausdrücklich auf das Terminfenster setzt (ANN-037).
 */
export function terminLaengeMinuten(appointment: Appointment): number {
  const werte = appointmentToFormValues(appointment);
  const beginn = minutenAusZeit(werte.start_time);
  const ende = minutenAusZeit(werte.end_time);
  if (beginn === null || ende === null) return TERMINFENSTER_MINUTEN;
  return ende - beginn;
}

// -----------------------------------------------------------------------------
// Künftige Termine in der Akte (UX-006)
// -----------------------------------------------------------------------------

const upcomingAppointmentSchema = z.object({
  id: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  appointment_type: appointmentTypeSchema,
  status: appointmentStatusSchema,
  staff_given_name: z.string(),
  staff_family_name: z.string(),
  organization_time_zone: z.string(),
});

export type UpcomingAppointment = z.infer<typeof upcomingAppointmentSchema>;

/**
 * Die nächsten Termine einer Patientin.
 *
 * Begrenzt über die Anzahl, nicht über einen Zeitraum: Ein Folgetermin kann
 * drei Monate entfernt liegen, und ein Zeitfenster, das ihn sicher einschließt,
 * wäre für die Akte zu weit. Ohne Adresse - die Akte braucht sie nicht.
 */
export async function fetchUpcomingAppointments(
  patientId: string,
  limit = 5,
): Promise<UpcomingAppointment[]> {
  const { data, error } = (await getSupabase().rpc('list_patient_upcoming_appointments', {
    p_patient_id: patientId,
    p_limit: limit,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die nächsten Termine konnten nicht geladen werden.');
  return z.array(upcomingAppointmentSchema).parse(data ?? []);
}

// -----------------------------------------------------------------------------
// Vorbelegung des Terminformulars (UX-003)
//
// Der häufigste Einzelvorgang am Ende eines Besuchs ist der nächste Termin
// derselben Person. Er soll nicht bei einem leeren Formular anfangen.
//
// Die Vorbelegung reist über die Adresszeile, nicht über einen Zustand im
// Arbeitsspeicher: so überlebt sie ein Neuladen, lässt sich teilen und
// funktioniert vom Termin genauso wie aus dem Kalender. Ungültige Werte fallen
// still auf den Standard zurück - eine Fehlermeldung für eine verstellte
// Adresszeile wäre für die bedienende Person wertlos (wie in `leseParameter`).
//
// Verbindlich prüft `create_appointment` ohnehin alles erneut: Raster,
// Arbeitszeit, Überschneidung, Zuordenbarkeit (ADR-004).
// -----------------------------------------------------------------------------

export interface TerminVorbelegung {
  datum?: string;
  beginn?: string;
  ende?: string;
  art?: AppointmentType;
  person?: string;
}

const UHRZEIT = /^([01]\d|2[0-3]):[0-5]\d$/;
const UUID_MUSTER = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_TAG = /^\d{4}-\d{2}-\d{2}$/;

export function leseTerminVorbelegung(suche: URLSearchParams): TerminVorbelegung {
  const datum = suche.get('datum');
  const beginn = suche.get('beginn');
  const ende = suche.get('ende');
  const art = suche.get('art');
  const person = suche.get('person');

  const vorbelegung: TerminVorbelegung = {};
  if (datum && ISO_TAG.test(datum)) vorbelegung.datum = datum;
  if (beginn && UHRZEIT.test(beginn)) vorbelegung.beginn = beginn;
  if (ende && UHRZEIT.test(ende)) vorbelegung.ende = ende;
  if (art && appointmentTypeSchema.safeParse(art).success) {
    vorbelegung.art = art as AppointmentType;
  }
  if (person && UUID_MUSTER.test(person)) vorbelegung.person = person;
  return vorbelegung;
}

/** Die Vorbelegung als Suchteil einer Adresse - leere Felder bleiben weg. */
export function schreibeTerminVorbelegung(vorbelegung: TerminVorbelegung): string {
  const suche = new URLSearchParams();
  if (vorbelegung.datum) suche.set('datum', vorbelegung.datum);
  if (vorbelegung.beginn) suche.set('beginn', vorbelegung.beginn);
  if (vorbelegung.ende) suche.set('ende', vorbelegung.ende);
  if (vorbelegung.art) suche.set('art', vorbelegung.art);
  if (vorbelegung.person) suche.set('person', vorbelegung.person);
  const text = suche.toString();
  return text ? `?${text}` : '';
}

/**
 * Der Folgetermin zu einem Termin: dieselbe Person, dieselbe Art, dieselbe
 * Uhrzeit - `tageSpaeter` Tage später.
 *
 * Das Ende kommt aus dem Terminfenster und **nicht** aus der Dauer des
 * Ausgangstermins: ein Folgetermin ist ein neu angebotener Termin und damit
 * 60 Minuten lang (§8.1, CAL-010a). Hinge er an einem Bestandstermin mit
 * abweichender Länge, würde der Server ihn abweisen.
 *
 * Eine Woche ist die übliche Taktung einer Verordnung und bewusst nur eine
 * Vorbelegung: Datum und Uhrzeit stehen im Formular und sind mit einem Tap
 * änderbar. Für eine ganze Verordnung gibt es die Serie (CAL-007).
 *
 * Der Kalendertag wird in der Zeitzone der Praxis gebildet, nicht im Browser:
 * sonst verschöbe sich ein Abendtermin je nach Gerät um einen Tag.
 */
export function folgeterminVorbelegung(
  appointment: Appointment,
  tageSpaeter = 7,
): TerminVorbelegung {
  const werte = appointmentToFormValues(appointment);
  return {
    datum: naechsterTag(werte.date, tageSpaeter),
    beginn: werte.start_time,
    ende: fensterEnde(werte.start_time),
    art: appointment.appointment_type,
    person: appointment.staff_member_id,
  };
}

/**
 * Verschiebt einen Kalendertag um ganze Tage.
 *
 * Reine Kalenderarithmetik auf `YYYY-MM-DD` über ein UTC-verankertes `Date`;
 * daraus wird nie eine Ortszeit abgeleitet (dieselbe Regel wie in
 * `calendar.ts`, wo `tagePlus` für die Kalenderansichten dasselbe tut).
 */
function naechsterTag(iso: string, tage: number): string {
  const tag = new Date(`${iso}T00:00:00Z`);
  tag.setUTCDate(tag.getUTCDate() + tage);
  return tag.toISOString().slice(0, 10);
}

/**
 * Legt einen Termin an und gibt dessen ID zurück.
 *
 * Übergeben werden Kalendertag und Uhrzeiten, kein fertiger Zeitstempel: die
 * Umrechnung übernimmt die Serverfunktion mit der Zeitzone der Organisation.
 * Eine Organisation wird nicht übergeben; sie stammt aus der Sitzung.
 */
/**
 * Der Server hat den Vorgang wegen der Arbeitszeit abgewiesen (CAL-005).
 *
 * Ein eigener Typ statt eines Textvergleichs in der Oberfläche: nur so lässt
 * sich die Rückfrage sicher von einem echten Fehler unterscheiden. Der
 * Vorgang ist dabei NICHT ausgeführt worden - die Bestätigung schickt ihn
 * vollständig neu, und der Server prüft dann wieder alles.
 */
export class AusserhalbArbeitszeitError extends Error {
  constructor() {
    super('Dieser Zeitraum liegt außerhalb der hinterlegten Arbeitszeit.');
    this.name = 'AusserhalbArbeitszeitError';
  }
}

export function istAusserhalbArbeitszeit(fehler: unknown): boolean {
  return fehler instanceof AusserhalbArbeitszeitError;
}

export async function createAppointment(
  patientId: string,
  values: AppointmentFormValues,
  allowOutsideWorkingHours = false,
): Promise<string> {
  const { data, error } = (await getSupabase().rpc('create_appointment', {
    p_patient_id: patientId,
    p_staff_member_id: values.staff_member_id,
    p_appointment_type: values.appointment_type,
    p_date: values.date,
    p_start_time: values.start_time,
    p_end_time: values.end_time,
    p_location_id: values.appointment_type === 'practice' ? values.location_id : null,
    p_allow_outside_working_hours: allowOutsideWorkingHours,
  })) as { data: unknown; error: { message?: string } | null };

  if (error) {
    if (error.message?.includes('outside_working_hours')) throw new AusserhalbArbeitszeitError();
    // Keine Details aus der Datenbank nach außen. Die Überschneidung ist der
    // einzige Fall, den die bedienende Person unmittelbar auflösen kann.
    if (error.message?.includes('overlaps')) {
      throw new Error(
        'In diesem Zeitraum hat die behandelnde Person bereits einen Termin. Bitte eine andere Zeit wählen.',
      );
    }
    if (error.message?.includes('not on the appointment grid')) {
      throw new Error(
        'Der Beginn passt nicht zum Praxisraster. Bitte eine Uhrzeit im Raster der Praxis wählen.',
      );
    }
    if (error.message?.includes('appointment window')) {
      throw new Error(TERMINFENSTER_MELDUNG);
    }
    throw new Error('Der Termin konnte nicht angelegt werden.');
  }

  const appointmentId = z.string().uuid().safeParse(data);
  if (!appointmentId.success) throw new Error('Der Termin konnte nicht angelegt werden.');
  return appointmentId.data;
}

// -----------------------------------------------------------------------------
// Kalender (CAL-002)
// -----------------------------------------------------------------------------

const calendarEntrySchema = z.object({
  id: z.string(),
  patient_id: z.string(),
  staff_member_id: z.string(),
  location_id: z.string().nullable(),
  appointment_type: appointmentTypeSchema,
  status: appointmentStatusSchema,
  starts_at: z.string(),
  ends_at: z.string(),
  patient_given_name: z.string(),
  patient_family_name: z.string(),
  staff_given_name: z.string(),
  staff_family_name: z.string(),
  location_name: z.string().nullable(),
});

export type CalendarEntry = z.infer<typeof calendarEntrySchema>;

export interface CalendarQuery {
  von: string;
  bis: string;
  person: string | null;
  standort: string | null;
  status: StatusFilter;
}

/**
 * Termine eines begrenzten Zeitfensters.
 *
 * Der Zeitbereich wird serverseitig geprüft und begrenzt; eine freie
 * organisationsübergreifende Abfrage ist nicht möglich. Von und Bis sind
 * Kalendertage der Praxiszeitzone, keine Zeitstempel.
 */
export async function fetchAppointments(query: CalendarQuery): Promise<CalendarEntry[]> {
  const { data, error } = (await getSupabase().rpc('list_appointments', {
    p_from: query.von,
    p_to: query.bis,
    p_staff_member_id: query.person,
    p_location_id: query.standort,
    p_status: query.status,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Termine konnten nicht geladen werden.');
  return z.array(calendarEntrySchema).parse(data ?? []);
}

/**
 * Kalendertag eines Zeitpunkts in einer Zeitzone als `YYYY-MM-DD`.
 *
 * Damit landet ein Termin in genau der Tagesspalte, in der er für die Praxis
 * stattfindet - unabhängig davon, in welcher Zeitzone der Browser läuft.
 */
export function dayKey(isoTimestamp: string, timeZone: string): string {
  return todayInTimeZone(timeZone, new Date(isoTimestamp));
}

/** Minuten seit Mitternacht in einer Zeitzone - Grundlage der Anordnung. */
export function minutesOfDay(isoTimestamp: string, timeZone: string): number {
  const teile = new Intl.DateTimeFormat('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).formatToParts(new Date(isoTimestamp));

  const zahl = (typ: string) => Number(teile.find((t) => t.type === typ)?.value ?? '0');
  return zahl('hour') * 60 + zahl('minute');
}

// -----------------------------------------------------------------------------
// Bearbeiten und Absagen (CAL-003)
// -----------------------------------------------------------------------------

/**
 * Füllt das Formular aus einem gelesenen Termin.
 *
 * Datum und Uhrzeiten werden in der Praxiszeitzone gebildet - dieselbe
 * Auslegung wie beim Speichern, sonst verschöbe sich ein Termin bei jedem
 * Öffnen des Formulars.
 */
export function appointmentToFormValues(
  appointment: Appointment,
): Record<AppointmentFormField, string> {
  const zone = appointment.organization_time_zone;
  const uhrzeit = (iso: string) =>
    new Intl.DateTimeFormat('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
      timeZone: zone,
    }).format(new Date(iso));

  return {
    staff_member_id: appointment.staff_member_id,
    appointment_type: appointment.appointment_type,
    date: todayInTimeZone(zone, new Date(appointment.starts_at)),
    start_time: uhrzeit(appointment.starts_at),
    end_time: uhrzeit(appointment.ends_at),
    location_id: appointment.location_id ?? '',
  };
}

/**
 * Meldung zum Terminfenster (CAL-010a).
 *
 * An einer Stelle, weil beide Schreibpfade sie brauchen. Sie nennt die Regel
 * und den Ausweg, ohne interne Details preiszugeben.
 */
const TERMINFENSTER_MELDUNG =
  `Ein Terminfenster ist ${TERMINFENSTER_MINUTEN} Minuten lang, die Dokumentation eingeschlossen. ` +
  'Bitte den Beginn wählen; das Ende ergibt sich daraus.';

function schreibfehler(error: { message?: string } | null, standard: string): Error {
  if (error?.message?.includes('outside_working_hours')) {
    return new AusserhalbArbeitszeitError();
  }
  if (error?.message?.includes('appointment window')) {
    return new Error(TERMINFENSTER_MELDUNG);
  }
  if (error?.message?.includes('not on the appointment grid')) {
    return new Error(
      'Der Beginn passt nicht zum Praxisraster. Bitte eine Uhrzeit im Raster der Praxis wählen.',
    );
  }
  // Zwei Fälle kann die bedienende Person selbst auflösen; alles andere bleibt
  // bewusst unspezifisch, damit keine internen Details nach außen gelangen.
  if (error?.message?.includes('overlaps')) {
    return new Error(
      'In diesem Zeitraum hat die behandelnde Person bereits einen Termin. Bitte eine andere Zeit wählen.',
    );
  }
  if (error?.message?.includes('changed meanwhile')) {
    return new Error(
      'Der Termin wurde zwischenzeitlich von einer anderen Person geändert. Bitte die Ansicht neu laden und die Änderung erneut vornehmen.',
    );
  }
  if (error?.message?.includes('must be reopened first')) {
    return new Error(
      'Der Termin ist bereits abgeschlossen oder als „nicht angetroffen" geführt. Er muss erst wieder geöffnet werden, bevor er geändert oder abgesagt werden kann.',
    );
  }
  if (error?.message?.includes('cancellation reason is required')) {
    return new Error('Bitte einen Absagegrund auswählen.');
  }
  if (error?.message?.includes('no-show fee decision is required')) {
    return new Error('Bitte entscheiden, ob ein Ausfallhonorar berechnet wird.');
  }
  if (error?.message?.includes('cannot be recorded as no-show')) {
    return new Error(
      'Für diesen Termin lässt sich „nicht angetroffen" nicht vermerken: Er ist abgesagt oder es hängt bereits eine Dokumentation daran.',
    );
  }
  if (error?.message?.includes('documented appointment cannot be changed')) {
    return new Error(
      'Der Termin ist dokumentiert und lässt sich nicht mehr ändern. Eine Korrektur gehört in die Behandlungsdokumentation.',
    );
  }
  return new Error(standard);
}

/**
 * Ändert einen geplanten Termin.
 *
 * `expectedUpdatedAt` ist der Stand, auf dem die Bearbeitung beruht. Er wird
 * unverändert so zurückgegeben, wie er gelesen wurde - insbesondere NICHT über
 * ein `Date` geführt, das Bruchteile von Sekunden verlieren würde.
 */
export async function updateAppointment(
  appointmentId: string,
  expectedUpdatedAt: string,
  values: AppointmentFormValues,
  allowOutsideWorkingHours = false,
): Promise<void> {
  const { error } = (await getSupabase().rpc('update_appointment', {
    p_appointment_id: appointmentId,
    p_expected_updated_at: expectedUpdatedAt,
    p_staff_member_id: values.staff_member_id,
    p_appointment_type: values.appointment_type,
    p_date: values.date,
    p_start_time: values.start_time,
    p_end_time: values.end_time,
    p_location_id: values.appointment_type === 'practice' ? values.location_id : null,
    p_allow_outside_working_hours: allowOutsideWorkingHours,
  })) as { error: { message?: string } | null };

  if (error) throw schreibfehler(error, 'Der Termin konnte nicht geändert werden.');
}

/**
 * Sagt einen bestätigten Termin ab.
 *
 * Absage ist ein Statuswechsel, kein Löschen: der Termin bleibt vollständig
 * erhalten und nachvollziehbar. Der Grund ist Pflicht und wird serverseitig
 * erneut geprüft — die Auswahl im Formular ist nur Bedienkomfort (ADR-004).
 */
export async function cancelAppointment(
  appointmentId: string,
  expectedUpdatedAt: string,
  reason: CancellationReason,
): Promise<void> {
  const { error } = (await getSupabase().rpc('cancel_appointment', {
    p_appointment_id: appointmentId,
    p_expected_updated_at: expectedUpdatedAt,
    p_reason: reason,
  })) as { error: { message?: string } | null };

  if (error) throw schreibfehler(error, 'Der Termin konnte nicht abgesagt werden.');
}

/**
 * Schließt einen geplanten Termin ab.
 *
 * Der Abschluss ist die organisatorische Feststellung, dass die Behandlung
 * stattgefunden hat - keine Aussage über ihren Inhalt. Eine
 * Behandlungsdokumentation wird ausdrücklich nicht vorausgesetzt und auch
 * nicht als fehlend markiert.
 */
export async function completeAppointment(
  appointmentId: string,
  expectedUpdatedAt: string,
): Promise<void> {
  const { error } = (await getSupabase().rpc('complete_appointment', {
    p_appointment_id: appointmentId,
    p_expected_updated_at: expectedUpdatedAt,
  })) as { error: { message?: string } | null };

  if (error) throw schreibfehler(error, 'Der Termin konnte nicht abgeschlossen werden.');
}

/**
 * Sagt alle bestätigten Termine einer Person an einem Kalendertag ab (CAL-009).
 *
 * Ein Vorgang, eine Transaktion: Entweder der ganze Tag ist umgeplant oder
 * keiner der Termine. Serverseitig löst das n Einzelabsagen aus — mit je
 * eigener Prüfung und eigenem Auditeintrag.
 *
 * Gibt die Anzahl der abgesagten Termine zurück.
 */
export async function cancelStaffDay(
  staffMemberId: string,
  datum: string,
  reason: CancellationReason,
): Promise<number> {
  const { data, error } = (await getSupabase().rpc('cancel_staff_day', {
    p_staff_member_id: staffMemberId,
    p_date: datum,
    p_reason: reason,
  })) as { data: unknown; error: { message?: string } | null };

  if (error) throw schreibfehler(error, 'Der Tag konnte nicht umgeplant werden.');
  return z.number().parse(data);
}

/**
 * Vermerkt einen bestätigten Termin als „nicht angetroffen".
 *
 * Das Ausfallhonorar-Kennzeichen gehört in denselben Schritt und hat keine
 * Vorbelegung: Der Termin sagt damit nur, **ob** abgerechnet werden soll — wie
 * viel, steht im Leistungskatalog (ADR-018 Punkt 4, ABR-001).
 */
export async function recordNoShow(
  appointmentId: string,
  expectedUpdatedAt: string,
  fee: boolean,
): Promise<void> {
  const { error } = (await getSupabase().rpc('record_no_show', {
    p_appointment_id: appointmentId,
    p_expected_updated_at: expectedUpdatedAt,
    p_fee: fee,
  })) as { error: { message?: string } | null };

  if (error) throw schreibfehler(error, 'Der Termin konnte nicht vermerkt werden.');
}

/**
 * Öffnet einen versehentlich abgeschlossenen Termin wieder.
 *
 * Danach ist er ein ganz normaler geplanter Termin. Dass er abgeschlossen war,
 * bleibt über das Auditlog nachvollziehbar; dort wird nichts entfernt.
 */
export async function reopenAppointment(
  appointmentId: string,
  expectedUpdatedAt: string,
): Promise<void> {
  const { error } = (await getSupabase().rpc('reopen_appointment', {
    p_appointment_id: appointmentId,
    p_expected_updated_at: expectedUpdatedAt,
  })) as { error: { message?: string } | null };

  if (error) throw schreibfehler(error, 'Der Termin konnte nicht wieder geöffnet werden.');
}

// -----------------------------------------------------------------------------
// Terminserie aus einer Verordnung (CAL-007)
//
// Drei Serverfunktionen, drei Aufgaben: das Kontingent lesen, die geplanten
// Zeiten prüfen, die Serie anlegen. Die Rhythmusrechnung selbst steht in
// `serie.ts` und spricht mit keinem Server (§6.2).
// -----------------------------------------------------------------------------

const prescriptionSlotsSchema = z.object({
  patient_id: z.string(),
  frequency_note: z.string().nullable(),
  prescribed: z.number(),
  used: z.number(),
  planned: z.number(),
  remaining: z.number(),
});

export type PrescriptionSlots = z.infer<typeof prescriptionSlotsSchema>;

/**
 * Kontingent einer Verordnung: verordnet, genutzt, verplant und offen.
 *
 * Ausschließlich organisatorische Zahlen - Diagnose und Therapieziel bleiben
 * bei der klinischen Sicht (ANN-011). „Verplant" zählt die nicht abgesagten
 * Termine dieser Verordnung; verplant ist nicht genutzt (ANN-012, ANN-038).
 */
export async function fetchPrescriptionSlots(prescriptionId: string): Promise<PrescriptionSlots> {
  const { data, error } = (await getSupabase().rpc('get_prescription_slots', {
    p_prescription_id: prescriptionId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Das Kontingent der Verordnung konnte nicht geladen werden.');
  const zeilen = z.array(prescriptionSlotsSchema).parse(data ?? []);
  const erste = zeilen[0];
  if (!erste) throw new Error('Das Kontingent der Verordnung konnte nicht geladen werden.');
  return erste;
}

/**
 * Befund einer geplanten Terminzeit (CAL-007).
 *
 * Der Server liefert ein Wort, nicht den kollidierenden Termin - die
 * Serienplanung braucht ihn nicht (ADR-004, Datenminimierung).
 */
export const slotConflictSchema = z.enum([
  'invalid',
  'past',
  'off_grid',
  'duplicate',
  'overlap',
  'outside_working_hours',
]);
export type SlotConflict = z.infer<typeof slotConflictSchema>;

export const slotConflictLabels: Record<SlotConflict, string> = {
  invalid: 'Datum oder Uhrzeit unvollständig',
  past: 'Liegt in der Vergangenheit',
  off_grid: 'Beginn passt nicht zum Praxisraster',
  duplicate: 'Steht doppelt in dieser Serie',
  overlap: 'Zeitraum ist bereits belegt',
  outside_working_hours: 'Außerhalb der Arbeitszeit',
};

/**
 * Befunde, die das Anlegen verhindern.
 *
 * „Außerhalb der Arbeitszeit" gehört ausdrücklich nicht dazu: Es ist eine
 * Rückfrage, keine Grenze (CAL-005). Alles andere würde der Server abweisen,
 * und weil die Serie alles oder nichts ist, käme kein einziger Termin an.
 */
export function istHinderlich(conflict: SlotConflict | null): boolean {
  return conflict !== null && conflict !== 'outside_working_hours';
}

const slotCheckSchema = z.object({
  slot_index: z.number(),
  conflict: slotConflictSchema.nullable(),
});

/** Prüft geplante Terminzeiten, ohne etwas anzulegen. */
export async function checkAppointmentSlots(
  staffMemberId: string,
  slots: Serientermin[],
): Promise<(SlotConflict | null)[]> {
  const { data, error } = (await getSupabase().rpc('check_appointment_slots', {
    p_staff_member_id: staffMemberId,
    p_slots: slots,
  })) as { data: unknown; error: { message?: string } | null };

  if (error) throw new Error('Die Termine konnten nicht geprüft werden.');

  const zeilen = z.array(slotCheckSchema).parse(data ?? []);
  const befunde: (SlotConflict | null)[] = slots.map(() => null);
  for (const zeile of zeilen) {
    if (zeile.slot_index >= 0 && zeile.slot_index < befunde.length) {
      befunde[zeile.slot_index] = zeile.conflict;
    }
  }
  return befunde;
}

/**
 * Legt die Termine einer Verordnung in einem Vorgang an.
 *
 * Alles oder nichts: Scheitert ein Termin, entsteht keiner. Gibt die Anzahl
 * der angelegten Termine zurück.
 */
export async function createAppointmentSeries(
  patientId: string,
  prescriptionId: string,
  values: AppointmentFormValues,
  slots: Serientermin[],
  allowOutsideWorkingHours = false,
): Promise<number> {
  const { data, error } = (await getSupabase().rpc('create_appointment_series', {
    p_patient_id: patientId,
    p_prescription_id: prescriptionId,
    p_staff_member_id: values.staff_member_id,
    p_appointment_type: values.appointment_type,
    p_slots: slots,
    p_location_id: values.appointment_type === 'practice' ? values.location_id : null,
    p_allow_outside_working_hours: allowOutsideWorkingHours,
  })) as { data: unknown; error: { message?: string } | null };

  if (error) throw schreibfehler(error, 'Die Terminserie konnte nicht angelegt werden.');
  return z.number().parse(data);
}

// -----------------------------------------------------------------------------
// Terminzettel (CAL-011, IDEA-PRX-006)
// -----------------------------------------------------------------------------

const appointmentSlipSchema = z.object({
  id: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  appointment_type: appointmentTypeSchema,
  location_name: z.string().nullable(),
  staff_given_name: z.string(),
  staff_family_name: z.string(),
  organization_time_zone: z.string(),
});

export type AppointmentSlipEntry = z.infer<typeof appointmentSlipSchema>;

/**
 * Die nächsten bestätigten Termine für den Terminzettel.
 *
 * Eigener Lesepfad und nicht `fetchUpcomingAppointments`: Der Zettel braucht
 * den Standortnamen, die Akte braucht ihn nicht (ADR-004, Datenminimierung).
 * Der Server protokolliert den Aufruf als `patient_record.viewed` — das
 * Dokument verlässt die Praxis.
 */
export async function fetchAppointmentSlip(
  patientId: string,
  limit = 20,
): Promise<AppointmentSlipEntry[]> {
  const { data, error } = (await getSupabase().rpc('list_patient_appointment_slip', {
    p_patient_id: patientId,
    p_limit: limit,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Der Terminzettel konnte nicht geladen werden.');
  return z.array(appointmentSlipSchema).parse(data ?? []);
}

/**
 * Ortsangabe für den Zettel — aus Sicht der Patient:in, nicht der Praxis.
 *
 * Beim Hausbesuch steht dort bewusst kein Standortname und keine Adresse: Es
 * ist ihre eigene Wohnung, und der Zettel soll sagen, was sie wissen muss.
 */
export function slipOrt(eintrag: AppointmentSlipEntry): string {
  if (eintrag.appointment_type === 'home_visit') return 'bei Ihnen zu Hause';
  if (eintrag.appointment_type === 'video') return 'Videotermin';
  return eintrag.location_name ?? 'in der Praxis';
}
