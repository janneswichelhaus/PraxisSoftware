import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

// -----------------------------------------------------------------------------
// Reiter „Termine": die eigenen Termine
// -----------------------------------------------------------------------------

export const terminSchema = z.object({
  id: z.string().uuid(),
  starts_at: z.string(),
  ends_at: z.string(),
  appointment_type: z.enum(['home_visit', 'practice', 'video']),
  /** Für die Person: dokumentiert und abgerechnet sind „durchgeführt". */
  status: z.enum(['confirmed', 'cancelled', 'no_show', 'completed']),
  staff_name: z.string().nullable(),
  location_name: z.string().nullable(),
  visit_street: z.string().nullable(),
  visit_house_number: z.string().nullable(),
  visit_postal_code: z.string().nullable(),
  visit_city: z.string().nullable(),
  /**
   * Ein Absagewunsch jetzt läge unter 24 Stunden - gerechnet vom
   * Server (ADR-018 Punkt 8), nur am bestätigten künftigen Termin.
   */
  late_notice: z.boolean().nullable(),
  /** Der offene Wunsch an diesem Termin. */
  open_request_kind: z.enum(['change', 'cancel']).nullable(),
});
export type Termin = z.infer<typeof terminSchema>;

export function termineSchluessel(zugangId: string) {
  return ['platform-appointments', zugangId] as const;
}

/**
 * Die eigenen Termine des gewählten Bereichs: künftige und die der letzten
 * zwölf Monate (ANN-251). Welche Zeilen, entscheidet der Server über den
 * Zugang; die Kennung wählt nur unter den eigenen aus (ADR-023 Punkt 19).
 */
export async function ladeTermine(zugangId: string): Promise<Termin[]> {
  const satz = 'Ihre Termine konnten nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_appointments', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(terminSchema), ergebnis.data ?? [], satz);
}

// -----------------------------------------------------------------------------
// Terminwünsche (PROJECT_PRINCIPLES.md 8, ANN-246)
// -----------------------------------------------------------------------------

export const TAGESZEITEN = ['morning', 'midday', 'afternoon'] as const;
export type Tageszeit = (typeof TAGESZEITEN)[number];
export const TAGESZEIT_NAME: Record<Tageszeit, string> = {
  morning: 'Vormittag',
  midday: 'Mittag',
  afternoon: 'Nachmittag',
};

export const wunschSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(['new', 'change', 'cancel']),
  appointment_id: z.string().uuid().nullable(),
  /** Kalendertage `YYYY-MM-DD`. */
  preferred_days: z.array(z.string()),
  preferred_times: z.array(z.enum(TAGESZEITEN)),
  note: z.string().nullable(),
  status: z.enum(['open', 'done', 'declined', 'withdrawn']),
  created_at: z.string(),
  resolved_at: z.string().nullable(),
  answer: z.string().nullable(),
});
export type Terminwunsch = z.infer<typeof wunschSchema>;

export function wuenscheSchluessel(zugangId: string) {
  return ['platform-appointment-requests', zugangId] as const;
}

/** Die eigenen Wünsche des Bereichs, offene zuerst. */
export async function ladeWuensche(zugangId: string): Promise<Terminwunsch[]> {
  const satz = 'Ihre Terminwünsche konnten nicht geladen werden.';
  const ergebnis = (await getSupabase().rpc('platform_appointment_requests', {
    p_access_id: zugangId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error) throw new Error(satz);
  return antwort(z.array(wunschSchema), ergebnis.data ?? [], satz);
}

/**
 * Einen Termin wünschen: Tage, Tageszeiten, eine freie Zeile. Ein Wunsch, kein
 * Termin - einen Termin macht daraus die Praxis (§8). Die Grenzen prüft der
 * Server; die Meldungen hier sagen, was zu tun ist (§13).
 */
export async function terminWuenschen(eingabe: {
  zugangId: string;
  tage: string[];
  zeiten: Tageszeit[];
  notiz: string;
}): Promise<string> {
  const ergebnis = (await getSupabase().rpc('request_platform_appointment', {
    p_access_id: eingabe.zugangId,
    p_days: eingabe.tage,
    p_times: eingabe.zeiten,
    p_note: eingabe.notiz.trim() === '' ? null : eingabe.notiz.trim(),
  })) as { data: unknown; error: { message?: string } | null };
  if (ergebnis.error) throw new Error(wunschfehler(ergebnis.error.message));
  return antwort(z.string().uuid(), ergebnis.data, 'Ihr Wunsch konnte nicht gesendet werden.');
}

/** Verständliche Sätze für die Abweisungen des Servers, ohne interne Details. */
export function wunschfehler(meldung: string | undefined): string {
  const m = meldung ?? '';
  if (m.includes('at least one day')) return 'Bitte wählen Sie mindestens einen Tag.';
  if (m.includes('too many days')) return 'Bitte wählen Sie höchstens 14 Tage.';
  if (m.includes('day out of range'))
    return 'Bitte wählen Sie Tage ab heute, höchstens ein Jahr voraus.';
  if (m.includes('note too long')) return 'Ihre Nachricht darf höchstens 500 Zeichen lang sein.';
  if (m.includes('not allowed'))
    return 'Ihr Zugang erlaubt das gerade nicht. Bitte wenden Sie sich an die Praxis.';
  return 'Ihr Wunsch konnte nicht gesendet werden. Bitte versuchen Sie es erneut.';
}

/** Einen offenen Wunsch zurückziehen. */
export async function wunschZurueckziehen(zugangId: string, wunschId: string): Promise<void> {
  const satz = 'Der Wunsch konnte nicht zurückgezogen werden.';
  const ergebnis = (await getSupabase().rpc('withdraw_platform_appointment_request', {
    p_access_id: zugangId,
    p_request_id: wunschId,
  })) as { data: unknown; error: unknown };
  if (ergebnis.error || ergebnis.data !== true) throw new Error(satz);
}

/**
 * Termin ändern oder absagen - als Wunsch (D4). Die Absage trägt
 * das Büro ein; als Eingang gilt der Zeitpunkt dieses Wunsches (ANN-247).
 */
export async function terminAendernWuenschen(eingabe: {
  zugangId: string;
  terminId: string;
  art: 'change' | 'cancel';
  tage: string[];
  zeiten: Tageszeit[];
  notiz: string;
}): Promise<string> {
  const ergebnis = (await getSupabase().rpc('request_platform_appointment_change', {
    p_access_id: eingabe.zugangId,
    p_appointment_id: eingabe.terminId,
    p_kind: eingabe.art,
    p_days: eingabe.tage,
    p_times: eingabe.zeiten,
    p_note: eingabe.notiz.trim() === '' ? null : eingabe.notiz.trim(),
  })) as { data: unknown; error: { message?: string } | null };
  if (ergebnis.error) {
    const m = ergebnis.error.message ?? '';
    if (m.includes('request already open'))
      throw new Error('Zu diesem Termin liegt schon ein Wunsch vor. Die Praxis meldet sich.');
    if (m.includes('not confirmed') || m.includes('has started') || m.includes('not found'))
      throw new Error('Dieser Termin lässt sich nicht mehr ändern. Bitte rufen Sie die Praxis an.');
    throw new Error(wunschfehler(m));
  }
  return antwort(z.string().uuid(), ergebnis.data, 'Ihr Wunsch konnte nicht gesendet werden.');
}
