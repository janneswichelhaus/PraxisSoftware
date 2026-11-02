import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { readEnv } from '@/lib/env';
import { getSupabase } from '@/lib/supabase';

// Das Kalender-Abo des eigenen Kontos (ANN-838): erzeugen, beenden, das Datum lesen. Die Adresse
// kommt genau einmal vom Server und bleibt nur im Speicher dieser Seite.

const FUNKTION = 'calendar-feed';
const ADRESSE = /^[A-Za-z0-9_-]{43}$/;

const dienstSchema = z.object({
  ok: z.literal(true),
  value: z.object({ verfuegbar: z.boolean() }),
});
const aboSchema = z.array(z.object({ created_at: z.string() }));

export interface EigenesAbo {
  /** Zeitpunkt, seit dem die aktuelle Adresse gilt. */
  readonly seit: string;
}

/** Ob die Function eingerichtet ist; ein Ausfall wirft und heißt nicht „nicht eingerichtet“. */
export async function fetchAboDienst(signal?: AbortSignal): Promise<boolean> {
  const { data, error } = (await getSupabase().functions.invoke<unknown>(FUNKTION, {
    method: 'GET',
    ...(signal ? { signal } : {}),
  })) as { data: unknown; error: unknown };
  const stand = dienstSchema.safeParse(data);
  if (error !== null || !stand.success) {
    throw new Error('Das Kalender-Abo konnte nicht gefragt werden.');
  }
  return stand.data.value.verfuegbar;
}

export function useAboDienst() {
  return useQuery({
    queryKey: ['kalender-abo', 'dienst'],
    queryFn: ({ signal }) => fetchAboDienst(signal),
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export async function fetchEigenesAbo(): Promise<EigenesAbo | null> {
  const { data, error } = (await getSupabase().rpc('get_own_calendar_feed')) as {
    data: unknown;
    error: unknown;
  };
  const zeilen = aboSchema.safeParse(data);
  if (error || !zeilen.success) throw new Error('Das Kalender-Abo konnte nicht geladen werden.');
  const erste = zeilen.data[0];
  return erste ? { seit: erste.created_at } : null;
}

/** Die Anmeldung liegt zu lange zurück: erst mit dem Passkey bestätigen (ANN-325, ANN-838). */
export class AboErneutAnmelden extends Error {
  constructor() {
    super(
      'Zum Erstellen des Links bitte zuerst mit dem Passkey bestätigen. Danach bleiben zehn Minuten.',
    );
    this.name = 'AboErneutAnmelden';
  }
}

/** Erzeugt oder ersetzt die Adresse; nur hier kommt sie im Klartext vor. */
export async function erzeugeAbo(): Promise<string> {
  const { data, error } = (await getSupabase().rpc('create_own_calendar_feed')) as {
    data: unknown;
    error: { message?: unknown } | null;
  };
  if (typeof error?.message === 'string' && error.message.includes('reauthentication required')) {
    throw new AboErneutAnmelden();
  }
  if (error || typeof data !== 'string' || !ADRESSE.test(data)) {
    throw new Error('Der Abo-Link konnte nicht erstellt werden.');
  }
  return data;
}

export async function beendeAbo(): Promise<void> {
  const { error } = (await getSupabase().rpc('end_own_calendar_feed')) as { error: unknown };
  if (error) throw new Error('Das Abo konnte nicht beendet werden.');
}

/** Die Adresse für Google und Outlook (`https`) und zum Öffnen im Kalender des Geräts (`webcal`). */
export function aboAdressen(
  adresse: string,
  basis: string = readEnv().supabaseUrl,
): { readonly https: string; readonly webcal: string } {
  const https = `${basis.trim().replace(/\/+$/, '')}/functions/v1/${FUNKTION}/${adresse}.ics`;
  return { https, webcal: https.replace(/^https?:\/\//, 'webcal://') };
}
