import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

/**
 * Datenzugriff auf Praxisraster und Arbeitszeiten (CAL-005).
 *
 * Gelesen wird direkt aus den Tabellen; welche Zeilen zurückkommen, entscheidet
 * die RLS (ADR-004). Geschrieben wird ausschließlich über SECURITY-DEFINER-RPCs
 * - `authenticated` hat auf beiden Tabellen nur SELECT.
 *
 * Alle Zeiten sind Ortszeiten der Praxis. Sie werden hier bewusst als
 * Zeichenketten `HH:MM` geführt und nirgends in ein `Date` überführt: eine
 * Uhrzeit ohne Datum hat keine Zeitzone, und ein `Date` würde ihr eine geben.
 */

/** Zulässige Praxisraster in Minuten. Serverseitig ebenso begrenzt. */
export const RASTER_WERTE = [5, 10, 15] as const;
export type RasterWert = (typeof RASTER_WERTE)[number];

export function istRasterWert(wert: number | null | undefined): wert is RasterWert {
  return RASTER_WERTE.includes(wert as RasterWert);
}

/** ISO-8601-Wochentage: 1 = Montag … 7 = Sonntag, wie in der Datenbank. */
export const WOCHENTAGE = [1, 2, 3, 4, 5, 6, 7] as const;
export type Wochentag = (typeof WOCHENTAGE)[number];

export const wochentagLabels: Record<Wochentag, string> = {
  1: 'Montag',
  2: 'Dienstag',
  3: 'Mittwoch',
  4: 'Donnerstag',
  5: 'Freitag',
  6: 'Samstag',
  7: 'Sonntag',
};

/** `08:00:00` aus der Datenbank wird zu `08:00` für das Eingabefeld. */
function kurzeZeit(wert: string): string {
  return wert.slice(0, 5);
}

const zeitSchema = z.string().transform(kurzeZeit);

const workingHourSchema = z.object({
  id: z.string(),
  staff_member_id: z.string(),
  weekday: z.number(),
  starts_at: zeitSchema,
  ends_at: zeitSchema,
});

export type WorkingHour = z.infer<typeof workingHourSchema>;

const exceptionSchema = z.object({
  id: z.string(),
  staff_member_id: z.string(),
  on_date: z.string(),
  kind: z.enum(['unavailable', 'block']),
  starts_at: zeitSchema.nullable(),
  ends_at: zeitSchema.nullable(),
});

export type WorkingHourException = z.infer<typeof exceptionSchema>;

/** Ein Zeitblock im Formular. Beide Werte sind `HH:MM` in Ortszeit. */
export interface Zeitblock {
  von: string;
  bis: string;
}

export async function fetchWorkingHours(): Promise<WorkingHour[]> {
  const { data, error } = await getSupabase()
    .from('staff_working_hours')
    .select('id, staff_member_id, weekday, starts_at, ends_at')
    .order('weekday')
    .order('starts_at');

  if (error) throw new Error('Die Arbeitszeiten konnten nicht geladen werden.');
  return z.array(workingHourSchema).parse(data ?? []);
}

/**
 * Datumsbezogene Abweichungen eines Zeitraums.
 *
 * Von und Bis sind Kalendertage der Praxis, kein Zeitstempel - die Tabelle
 * führt ein `date`, keine Zeitzone.
 */
export async function fetchWorkingHourExceptions(
  von: string,
  bis: string,
): Promise<WorkingHourException[]> {
  const { data, error } = await getSupabase()
    .from('staff_working_hour_exceptions')
    .select('id, staff_member_id, on_date, kind, starts_at, ends_at')
    .gte('on_date', von)
    .lte('on_date', bis)
    .order('on_date')
    .order('starts_at', { nullsFirst: true });

  if (error) throw new Error('Die Abweichungen konnten nicht geladen werden.');
  return z.array(exceptionSchema).parse(data ?? []);
}

function schreibfehler(error: { message?: string } | null, standard: string): Error {
  if (error?.message?.includes('overlap')) {
    return new Error('Die Zeitblöcke überschneiden sich. Bitte die Zeiten anpassen.');
  }
  if (error?.message?.includes('block is invalid')) {
    return new Error('Ein Zeitblock ist unvollständig oder endet vor seinem Beginn.');
  }
  return new Error(standard);
}

/** Ersetzt den Wochentag einer Person vollständig. Ein leeres Array löscht ihn. */
export async function saveWorkingHours(
  staffMemberId: string,
  weekday: Wochentag,
  bloecke: Zeitblock[],
): Promise<void> {
  const { error } = (await getSupabase().rpc('set_staff_working_hours', {
    p_staff_member_id: staffMemberId,
    p_weekday: weekday,
    p_blocks: bloecke,
  })) as { error: { message?: string } | null };

  if (error) throw schreibfehler(error, 'Die Arbeitszeit konnte nicht gespeichert werden.');
}

/**
 * Ersetzt einen Kalendertag vollständig.
 *
 * Ohne Abwesenheit und ohne Blöcke wird die Abweichung entfernt - danach gilt
 * für diesen Tag wieder der Wochenplan.
 */
export async function saveWorkingHourException(
  staffMemberId: string,
  datum: string,
  abwesend: boolean,
  bloecke: Zeitblock[],
): Promise<void> {
  const { error } = (await getSupabase().rpc('set_staff_working_hour_exception', {
    p_staff_member_id: staffMemberId,
    p_date: datum,
    p_unavailable: abwesend,
    p_blocks: abwesend ? [] : bloecke,
  })) as { error: { message?: string } | null };

  if (error) throw schreibfehler(error, 'Die Abweichung konnte nicht gespeichert werden.');
}

export async function saveAppointmentGrid(minuten: RasterWert): Promise<void> {
  const { error } = (await getSupabase().rpc('set_appointment_grid', {
    p_minutes: minuten,
  })) as { error: { message?: string } | null };

  if (error) throw new Error('Das Praxisraster konnte nicht gespeichert werden.');
}

/**
 * Fasst die Blöcke eines Wochentags zusammen, etwa `08:00–12:00, 13:00–18:00`.
 * Ohne Blöcke ein Gedankenstrich - das ist eine Aussage, keine fehlende Angabe.
 */
export function bloeckeText(bloecke: readonly Zeitblock[]): string {
  if (bloecke.length === 0) return '—';
  return bloecke.map((b) => `${b.von}–${b.bis}`).join(', ');
}

/** Blöcke einer Person an einem Wochentag, aufsteigend nach Beginn. */
export function wochenBloecke(
  alle: readonly WorkingHour[],
  staffMemberId: string,
  weekday: Wochentag,
): Zeitblock[] {
  return alle
    .filter((w) => w.staff_member_id === staffMemberId && w.weekday === weekday)
    .map((w) => ({ von: w.starts_at, bis: w.ends_at }))
    .sort((a, b) => a.von.localeCompare(b.von));
}
