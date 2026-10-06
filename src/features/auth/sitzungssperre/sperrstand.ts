import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Die Sitzungssperre (SEC-EPIC-001, ADR-025): was der Server über die laufende
 * Sitzung sagt, und wann die Oberfläche sich deshalb sperrt.
 *
 * Die Fristen selbst stehen im Server (`app.session_max_duration()`,
 * `app.session_idle_timeout()`, ANN-256). Die Oberfläche rechnet nicht mit
 * eigenen Minuten, sondern mit den Sekunden, die der Server meldet - ab dem
 * Augenblick der Antwort. So kann eine falsch gehende Uhr am Gerät die Sperre
 * weder verschieben noch verhindern.
 */

/** Für Texte und Tests; maßgeblich sind die Werte im Server. */
export const SPERRFRISTEN = { inaktivMinuten: 30, hoechstMinuten: 60 } as const;

/**
 * Wie oft eine Bedienung dem Server gemeldet wird (W2 (a)): höchstens einmal
 * je Minute. Die Oberfläche sperrt deshalb höchstens eine Minute früher, als
 * es die letzte Bedienung verlangte - nie später als der Server.
 */
export const BEDIENUNG_MELDEN_ALLE_MS = 60_000;

/**
 * So viel früher als der Server sperrt die Oberfläche: Zeit, offene Texte
 * noch als Entwurf zu sichern, solange der Server sie annimmt (Punkt 4).
 */
export const VORLAUF_MS = 20_000;

/** Wie lange die Sicherung offener Texte vor der Sperre dauern darf. */
export const SICHERUNG_HOECHSTENS_MS = 10_000;

export type Sperrgrund = 'inaktiv' | 'hoechstdauer' | 'unbekannt';

export type Sperrstand =
  | { gesperrt: true; grund: Sperrgrund }
  | { gesperrt: false; sekundenBisInaktiv: number; sekundenBisHoechstdauer: number };

const zeilenSchema = z.array(
  z.object({
    locked: z.boolean(),
    reason: z.enum(['inaktiv', 'hoechstdauer', 'unbekannt']).nullable(),
    seconds_until_idle: z.number().int().nonnegative(),
    seconds_until_max: z.number().int().nonnegative(),
  }),
);

/**
 * Fragt den Stand der Sperre. Mit `bedient` vermerkt der Server eine
 * Bedienung - nur, solange die Sitzung offen ist.
 */
export async function ladeSperrstand(bedient: boolean): Promise<Sperrstand> {
  const satz = 'Die Sitzung konnte nicht geprüft werden.';
  const ergebnis = (await getSupabase().rpc('session_status', { p_bedient: bedient })) as {
    data: unknown;
    error: unknown;
  };
  if (ergebnis.error) throw new Error(satz);
  const [zeile] = antwort(zeilenSchema, ergebnis.data ?? [], satz);
  if (!zeile) throw new Error(satz);
  if (zeile.locked) return { gesperrt: true, grund: zeile.reason ?? 'unbekannt' };
  return {
    gesperrt: false,
    sekundenBisInaktiv: zeile.seconds_until_idle,
    sekundenBisHoechstdauer: zeile.seconds_until_max,
  };
}

/**
 * Der Zeitpunkt (Uhr des Geräts), zu dem die Oberfläche sich sperrt: die
 * frühere der beiden Fristen ab der Antwort, abzüglich des Vorlaufs. Liegt er
 * schon zurück, ist die Sperre fällig.
 */
export function sperrzeitpunkt(
  stand: Extract<Sperrstand, { gesperrt: false }>,
  antwortAm: number,
): number {
  const sekunden = Math.min(stand.sekundenBisInaktiv, stand.sekundenBisHoechstdauer);
  return antwortAm + sekunden * 1000 - VORLAUF_MS;
}

/** Welche Frist zuerst endet - für den Satz auf der Sperrseite. */
export function ersteFrist(stand: Extract<Sperrstand, { gesperrt: false }>): Sperrgrund {
  return stand.sekundenBisHoechstdauer <= stand.sekundenBisInaktiv ? 'hoechstdauer' : 'inaktiv';
}
