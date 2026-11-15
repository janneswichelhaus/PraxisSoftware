import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import type { TimeWindow } from '@/features/calendar/waitlist/api';

// Der Weg zur Edge Function `auto-booking` (ANN-865): Sie lässt die Wege beim Kartendienst rechnen und
// die Datenbank buchen. Hier steht nur, was die Oberfläche schickt und was sie danach sagt.

const FUNKTION = 'auto-booking';

export interface Buchungsauftrag {
  patientId: string;
  staffMemberId: string | null;
  duration: number;
  from: string;
  to: string;
  windows: TimeWindow[];
  basisId: string | null;
  waitlistId: string | null;
}

const terminSchema = z.object({
  id: z.string(),
  person: z.string(),
  name: z.string().nullable(),
  datum: z.string(),
  beginn: z.string(),
  ende: z.string(),
  gebiet: z.enum(['none', 'match', 'outside']),
});
export type GebuchterTermin = z.infer<typeof terminSchema>;

const erfolgSchema = z.object({
  ok: z.literal(true),
  value: z.discriminatedUnion('ergebnis', [
    z.object({ ergebnis: z.literal('gebucht'), termin: terminSchema }),
    z.object({ ergebnis: z.literal('kein_platz'), ungeprueft: z.number(), knapp: z.number() }),
  ]),
});

const FEHLERKLASSEN = [
  'session_invalid',
  'invalid_request',
  'forbidden',
  'not_configured',
  'not_found',
  'address_incomplete',
  'address_not_located',
  'waitlist_closed',
  'travel_unavailable',
  'unavailable',
  'outcome_unknown',
  'busy',
] as const;

const fehlerSchema = z.object({
  ok: z.literal(false),
  error: z.object({ code: z.enum(FEHLERKLASSEN) }),
});

const UNKLAR = 'Unklar, ob gebucht wurde. Bitte im Kalender nachsehen.';
const NICHT_EINGERICHTET = 'Automatisch buchen ist hier nicht eingerichtet. Nichts gebucht.';

const SAETZE: Record<(typeof FEHLERKLASSEN)[number], string> = {
  session_invalid: 'Die Anmeldung ist abgelaufen. Bitte neu anmelden. Nichts gebucht.',
  invalid_request: 'Dauer oder Zeitraum passen nicht. Nichts gebucht.',
  forbidden: 'Termine anlegen ist mit dieser Rolle nicht erlaubt.',
  not_configured: NICHT_EINGERICHTET,
  not_found: 'Akte, Person oder Grundlage gibt es nicht mehr. Nichts gebucht.',
  address_incomplete: 'Für den Hausbesuch fehlt die vollständige Anschrift. Nichts gebucht.',
  address_not_located: 'Die Anschrift ist noch nicht auf der Karte verortet. Nichts gebucht.',
  waitlist_closed: 'Der Wartelisteneintrag ist nicht mehr offen. Nichts gebucht.',
  travel_unavailable: 'Die Fahrzeiten lassen sich gerade nicht berechnen. Nichts gebucht.',
  unavailable: 'Der Kalender antwortet gerade nicht. Nichts gebucht.',
  outcome_unknown: UNKLAR,
  busy: 'Der Kalender ändert sich gerade. Bitte noch einmal versuchen. Nichts gebucht.',
};

/**
 * `unklar`: Die Antwort fehlt, der Termin kann trotzdem stehen; erst nachsehen, dann erneut buchen.
 * `ungeprueft` zählt freie Stellen, an denen Fahrzeit oder Ort des Nachbartermins fehlten.
 */
export type Buchungsergebnis =
  | { art: 'gebucht'; termin: GebuchterTermin }
  | { art: 'kein_platz'; ungeprueft: number }
  | { art: 'nichts_gebucht' | 'unklar'; satz: string };

/** Bucht den nächsten passenden Hausbesuch; wirft nicht, jeder Ausgang hat eine Art. */
export async function bucheNaechstenTermin(auftrag: Buchungsauftrag): Promise<Buchungsergebnis> {
  let data: unknown;
  let error: unknown;
  let response: Response | undefined;
  try {
    ({ data, error, response } = (await getSupabase().functions.invoke<unknown>(FUNKTION, {
      body: {
        patient: auftrag.patientId,
        person: auftrag.staffMemberId,
        dauer_minuten: auftrag.duration,
        von: auftrag.from,
        bis: auftrag.to,
        wunschzeiten: auftrag.windows,
        grundlage: auftrag.basisId,
        warteliste: auftrag.waitlistId,
      },
    })) as { data: unknown; error: unknown; response?: Response });
  } catch {
    // Ob die Anfrage ankam, weiß hier niemand.
    return { art: 'unklar', satz: UNKLAR };
  }

  if (error === null) {
    const erfolg = erfolgSchema.safeParse(data);
    if (!erfolg.success) return { art: 'unklar', satz: UNKLAR };
    const wert = erfolg.data.value;
    return wert.ergebnis === 'gebucht'
      ? { art: 'gebucht', termin: wert.termin }
      : { art: 'kein_platz', ungeprueft: wert.ungeprueft };
  }

  // Die Function gibt es in dieser Umgebung nicht: Dann hat auch niemand gebucht.
  if (response?.status === 404) return { art: 'nichts_gebucht', satz: NICHT_EINGERICHTET };
  let koerper: unknown = null;
  try {
    koerper = await response?.json();
  } catch {
    koerper = null;
  }
  const fehler = fehlerSchema.safeParse(koerper);
  if (!fehler.success) return { art: 'unklar', satz: UNKLAR };
  const { code } = fehler.data.error;
  return { art: code === 'outcome_unknown' ? 'unklar' : 'nichts_gebucht', satz: SAETZE[code] };
}
