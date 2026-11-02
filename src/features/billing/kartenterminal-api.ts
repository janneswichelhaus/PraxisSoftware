import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';

// Der Weg zur Edge Function `card-terminal` (ANN-837): fragen, ob kassiert werden kann, und kassieren.
// Die Function prüft und bucht mit dem Token der Person; hier steht nur, was die Oberfläche sagt.

const FUNKTION = 'card-terminal';

const statusSchema = z.object({
  ok: z.literal(true),
  value: z.object({
    verfuegbar: z.boolean(),
    quelle: z.enum(['anbieter', 'nachbildung']).nullable(),
  }),
});

const zahlungSchema = z.object({
  ok: z.literal(true),
  value: z.object({
    zahlung: z.string(),
    transaktion: z.string(),
    quelle: z.enum(['anbieter', 'nachbildung']),
  }),
});

const FEHLERKLASSEN = [
  'session_invalid',
  'invalid_request',
  'forbidden',
  'not_configured',
  'not_payable',
  'declined',
  'cancelled',
  'unavailable',
  'timeout',
  'not_booked',
] as const;

const fehlerSchema = z.object({
  ok: z.literal(false),
  error: z.object({
    code: z.enum(FEHLERKLASSEN),
    detail: z.enum(['open_amount', 'cancelled', 'not_issued', 'amount']).optional(),
    transaktion: z.string().optional(),
  }),
});

export type Kartenterminal = { verfuegbar: boolean; nachbildung: boolean };

/** `verfuegbar` nur bei ausdrücklichem Ja; ein Fehler oder eine fremde Antwort heißt nein. */
export async function fetchKartenterminal(signal?: AbortSignal): Promise<Kartenterminal> {
  try {
    const { data, error } = (await getSupabase().functions.invoke<unknown>(FUNKTION, {
      method: 'GET',
      ...(signal ? { signal } : {}),
    })) as { data: unknown; error: unknown };
    const status = statusSchema.safeParse(data);
    if (error !== null || !status.success) return { verfuegbar: false, nachbildung: false };
    return {
      verfuegbar: status.data.value.verfuegbar,
      nachbildung: status.data.value.quelle === 'nachbildung',
    };
  } catch {
    return { verfuegbar: false, nachbildung: false };
  }
}

/** Fragt einmal je fünf Minuten; ohne Rechnungsrecht gar nicht (`aktiv`). */
export function useKartenterminal(aktiv: boolean) {
  return useQuery({
    queryKey: ['kartenterminal'],
    queryFn: ({ signal }) => fetchKartenterminal(signal),
    enabled: aktiv,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
}

export type Kassierergebnis =
  | { ok: true; transaktion: string; nachbildung: boolean }
  | { ok: false; satz: string; transaktion?: string };

const SAETZE: Record<(typeof FEHLERKLASSEN)[number], string> = {
  session_invalid: 'Die Anmeldung ist abgelaufen. Bitte neu anmelden. Nichts gebucht.',
  invalid_request: 'Der Betrag passt nicht. Nichts gebucht.',
  forbidden: 'Diese Rechnung lässt sich hier nicht mit Karte bezahlen.',
  not_configured: 'Die Kartenzahlung ist hier nicht eingerichtet.',
  not_payable: 'Die Rechnung lässt sich gerade nicht mit Karte bezahlen.',
  declined: 'Die Karte wurde abgelehnt. Nichts gebucht.',
  cancelled: 'Am Terminal abgebrochen. Nichts gebucht.',
  unavailable: 'Das Terminal ist nicht erreichbar. Nichts gebucht.',
  timeout:
    'Das Terminal antwortet nicht. Bitte am Terminal nachsehen, ob gezahlt wurde, bevor Sie es erneut versuchen.',
  not_booked: 'Am Terminal bezahlt, aber nicht gebucht. Bitte von Hand als Karte buchen.',
};

const ZAHLBARKEIT: Record<'open_amount' | 'cancelled' | 'not_issued' | 'amount', string> = {
  open_amount: 'Der Betrag ist höher als offen. Nichts gebucht.',
  cancelled: 'Die Rechnung ist storniert. Nichts gebucht.',
  not_issued: 'Die Rechnung ist nicht ausgestellt. Nichts gebucht.',
  amount: 'Bitte einen Betrag über null angeben.',
};

/** Kassiert am Terminal und bucht; wirft nicht, jeder Ausgang hat einen Satz. */
export async function kassiereMitKarte(
  rechnung: string,
  betragCent: number,
): Promise<Kassierergebnis> {
  let data: unknown;
  let error: unknown;
  let response: Response | undefined;
  try {
    ({ data, error, response } = (await getSupabase().functions.invoke<unknown>(FUNKTION, {
      body: { rechnung, betrag_cent: betragCent },
    })) as { data: unknown; error: unknown; response?: Response });
  } catch {
    return { ok: false, satz: SAETZE.unavailable };
  }

  if (error === null) {
    const zahlung = zahlungSchema.safeParse(data);
    return zahlung.success
      ? {
          ok: true,
          transaktion: zahlung.data.value.transaktion,
          nachbildung: zahlung.data.value.quelle === 'nachbildung',
        }
      : { ok: false, satz: SAETZE.timeout };
  }

  let koerper: unknown = null;
  try {
    koerper = await response?.json();
  } catch {
    koerper = null;
  }
  const fehler = fehlerSchema.safeParse(koerper);
  if (!fehler.success) return { ok: false, satz: SAETZE.timeout };
  const { code, detail, transaktion } = fehler.data.error;
  const satz = code === 'not_payable' && detail ? ZAHLBARKEIT[detail] : SAETZE[code];
  return transaktion ? { ok: false, satz, transaktion } : { ok: false, satz };
}
