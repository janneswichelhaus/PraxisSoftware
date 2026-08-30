import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

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

export const appointmentStatusSchema = z.enum(['scheduled', 'cancelled']);
export type AppointmentStatus = z.infer<typeof appointmentStatusSchema>;

export const appointmentTypeLabels: Record<AppointmentType, string> = {
  home_visit: 'Hausbesuch',
  practice: 'Praxis',
  video: 'Video',
};

export const appointmentStatusLabels: Record<AppointmentStatus, string> = {
  scheduled: 'Geplant',
  cancelled: 'Abgesagt',
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
  visit_street: z.string().nullable(),
  visit_house_number: z.string().nullable(),
  visit_postal_code: z.string().nullable(),
  visit_city: z.string().nullable(),
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
  'id, patient_id, staff_member_id, location_id, appointment_type, status, starts_at, ends_at, ' +
  'visit_street, visit_house_number, visit_postal_code, visit_city, ' +
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
 * Legt einen Termin an und gibt dessen ID zurück.
 *
 * Übergeben werden Kalendertag und Uhrzeiten, kein fertiger Zeitstempel: die
 * Umrechnung übernimmt die Serverfunktion mit der Zeitzone der Organisation.
 * Eine Organisation wird nicht übergeben; sie stammt aus der Sitzung.
 */
export async function createAppointment(
  patientId: string,
  values: AppointmentFormValues,
): Promise<string> {
  const { data, error } = (await getSupabase().rpc('create_appointment', {
    p_patient_id: patientId,
    p_staff_member_id: values.staff_member_id,
    p_appointment_type: values.appointment_type,
    p_date: values.date,
    p_start_time: values.start_time,
    p_end_time: values.end_time,
    p_location_id: values.appointment_type === 'practice' ? values.location_id : null,
  })) as { data: unknown; error: { message?: string } | null };

  if (error) {
    // Keine Details aus der Datenbank nach außen. Die Überschneidung ist der
    // einzige Fall, den die bedienende Person unmittelbar auflösen kann.
    if (error.message?.includes('overlaps')) {
      throw new Error(
        'In diesem Zeitraum hat die behandelnde Person bereits einen Termin. Bitte eine andere Zeit wählen.',
      );
    }
    throw new Error('Der Termin konnte nicht angelegt werden.');
  }

  const appointmentId = z.string().uuid().safeParse(data);
  if (!appointmentId.success) throw new Error('Der Termin konnte nicht angelegt werden.');
  return appointmentId.data;
}
