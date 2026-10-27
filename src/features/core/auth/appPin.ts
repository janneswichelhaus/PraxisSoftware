import { z } from 'zod';
import { antwort } from '@/lib/antwort';
import { getSupabase } from '@/lib/supabase';

/**
 * Die App-PIN (SEC-EPIC-002, ADR-025 Punkt 11).
 *
 * Sie gibt eine gesperrte Sitzung auf diesem Gerät frei und meldet nie an.
 * Geprüft wird nur in der Datenbank (`unlock_with_pin`); hier steht keine PIN
 * und kein Hash, und nichts davon wird auf dem Gerät gespeichert.
 */

/** Länge der PIN; maßgeblich ist `app.pin_problem` im Server (ANN-324). */
export const PIN_LAENGE = 6;

/** Gleiche Ziffern oder eine auf- oder absteigende Reihe - wie im Server (ANN-324). */
export function pinProblem(pin: string): 'format' | 'trivial' | null {
  if (!/^[0-9]{6}$/.test(pin)) return 'format';
  if (/^(.)\1{5}$/.test(pin)) return 'trivial';
  if ('0123456789'.includes(pin) || '9876543210'.includes(pin)) return 'trivial';
  return null;
}

export const PIN_SAETZE = {
  format: `Die PIN hat ${PIN_LAENGE} Ziffern.`,
  trivial: 'Diese PIN ist zu leicht zu erraten. Bitte keine gleichen Ziffern und keine Reihe.',
  ungleich: 'Die beiden Eingaben stimmen nicht überein.',
  erneutAnmelden:
    'Zum Festlegen der PIN bitte zuerst mit dem Passkey bestätigen. Danach bleiben zehn Minuten.',
  nichtGesetzt: 'Die PIN ließ sich nicht festlegen. Bitte erneut versuchen.',
  anderesKonto:
    'Der Passkey gehört zu einem anderen Zugang. Die PIN wurde nicht gesetzt; angemeldet ist jetzt der andere Zugang.',
} as const;

/** Die Anmeldung liegt zu lange zurück: erst mit dem Passkey bestätigen (ANN-325). */
export class ErneutAnmeldenError extends Error {
  constructor() {
    super(PIN_SAETZE.erneutAnmelden);
    this.name = 'ErneutAnmeldenError';
  }
}

/** Legt die PIN des eigenen Kontos fest. Wirft `ErneutAnmeldenError` oder einen Fehler mit Satz. */
export async function setzePin(pin: string): Promise<void> {
  const problem = pinProblem(pin);
  if (problem) throw new Error(PIN_SAETZE[problem]);
  const { error } = await getSupabase().rpc('set_own_pin', { p_pin: pin });
  if (!error) return;
  if (error.message.includes('reauthentication required')) throw new ErneutAnmeldenError();
  if (error.message.includes('pin rejected: trivial')) throw new Error(PIN_SAETZE.trivial);
  throw new Error(PIN_SAETZE.nichtGesetzt);
}

/** Hat das eigene Konto eine PIN? Auch in gesperrter Sitzung. */
export async function hatPin(): Promise<boolean> {
  const { data, error } = (await getSupabase().rpc('own_pin_status')) as {
    data: unknown;
    error: unknown;
  };
  if (error) throw new Error('Der Stand der PIN konnte nicht geladen werden.');
  return antwort(z.boolean(), data, 'Der Stand der PIN konnte nicht geladen werden.');
}

export type PinErgebnis =
  | { art: 'frei' }
  | { art: 'falsch'; versucheUebrig: number }
  /** Fünf Fehlversuche: Die Sitzung ist verbraucht, weiter nur per Passkey. */
  | { art: 'verbraucht' };

const versuchSchema = z.array(
  z.object({
    unlocked: z.boolean(),
    attempts_left: z.number().int().nonnegative(),
    consumed: z.boolean(),
  }),
);

/** Gibt die laufende Sitzung mit der PIN frei. Wirft nur bei Netz- oder Serverfehlern. */
export async function gibMitPinFrei(pin: string): Promise<PinErgebnis> {
  const satz = 'Die PIN konnte nicht geprüft werden.';
  const ergebnis = (await getSupabase().rpc('unlock_with_pin', { p_pin: pin })) as {
    data: unknown;
    error: unknown;
  };
  if (ergebnis.error) throw new Error(satz);
  const [zeile] = antwort(versuchSchema, ergebnis.data ?? [], satz);
  if (!zeile) throw new Error(satz);
  if (zeile.unlocked) return { art: 'frei' };
  if (zeile.consumed) return { art: 'verbraucht' };
  return { art: 'falsch', versucheUebrig: zeile.attempts_left };
}
