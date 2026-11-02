import type { Zahlbarkeit } from './typen.ts';

// Die Datenbank prüft und bucht, mit dem Token der Person und dem öffentlichen Schlüssel: Rolle,
// Organisation und Rechnung entscheiden `card_payment_preflight` und `record_card_payment`.

const TIMEOUT_MS = 5_000;

/** `abgelehnt`: Token ungültig; `verweigert`: Rolle oder Rechnung passt nicht; `nicht_pruefbar`: Ausfall. */
export type Kassenfehler =
  | { readonly grund: 'abgelehnt' | 'verweigert' | 'nicht_pruefbar' | 'schon_gebucht' }
  | { readonly grund: 'nicht_zahlbar'; readonly detail: Zahlbarkeit };

export type Vorpruefung =
  { readonly ok: true; readonly waehrung: string } | ({ readonly ok: false } & Kassenfehler);
export type Buchung =
  { readonly ok: true; readonly zahlung: string } | ({ readonly ok: false } & Kassenfehler);

export interface Kasse {
  readonly pruefe: (
    authorization: string,
    rechnung: string,
    betragCent: number,
  ) => Promise<Vorpruefung>;
  readonly buche: (
    authorization: string,
    rechnung: string,
    betragCent: number,
    transaktion: string,
  ) => Promise<Buchung>;
}

interface Optionen {
  readonly supabaseUrl: string;
  readonly anonKey: string;
  /** Für Tests; sonst der `fetch` der Laufzeit. */
  readonly abrufen?: typeof fetch;
  readonly timeoutMs?: number;
}

const ZAHLBARKEIT: readonly [RegExp, Zahlbarkeit][] = [
  [/cannot exceed the open amount/, 'open_amount'],
  [/cancelled invoice takes no payment/, 'cancelled'],
  [/belongs to an issued invoice/, 'not_issued'],
  [/positive amount/, 'amount'],
];

export function erstelleKasse({
  supabaseUrl,
  anonKey,
  abrufen = fetch,
  timeoutMs = TIMEOUT_MS,
}: Optionen): Kasse {
  const adresse = supabaseUrl.trim().replace(/\/+$/, '');
  const schluessel = anonKey.trim();

  async function rufe(
    authorization: string,
    funktion: 'card_payment_preflight' | 'record_card_payment',
    koerper: Record<string, unknown>,
  ): Promise<
    { readonly ok: true; readonly wert: unknown } | ({ readonly ok: false } & Kassenfehler)
  > {
    if (adresse === '' || schluessel === '') return { ok: false, grund: 'nicht_pruefbar' };
    let antwort: Response;
    try {
      antwort = await abrufen(`${adresse}/rest/v1/rpc/${funktion}`, {
        method: 'POST',
        headers: {
          apikey: schluessel,
          Authorization: authorization,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(koerper),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      return { ok: false, grund: 'nicht_pruefbar' };
    }
    let wert: unknown;
    try {
      wert = await antwort.json();
    } catch {
      return { ok: false, grund: 'nicht_pruefbar' };
    }
    if (antwort.status === 200) return { ok: true, wert };
    if (antwort.status === 401) return { ok: false, grund: 'abgelehnt' };
    if (antwort.status === 403) return { ok: false, grund: 'verweigert' };
    if (antwort.status === 409) return { ok: false, grund: 'schon_gebucht' };
    const roh =
      typeof wert === 'object' && wert !== null ? (wert as { message?: unknown }).message : null;
    const meldung = typeof roh === 'string' ? roh : '';
    const treffer = ZAHLBARKEIT.find(([muster]) => muster.test(meldung));
    if (antwort.status === 400 && treffer)
      return { ok: false, grund: 'nicht_zahlbar', detail: treffer[1] };
    return { ok: false, grund: 'nicht_pruefbar' };
  }

  return {
    pruefe: async (authorization, rechnung, betragCent) => {
      const r = await rufe(authorization, 'card_payment_preflight', {
        p_invoice_id: rechnung,
        p_amount_cents: betragCent,
      });
      if (!r.ok) return r;
      return typeof r.wert === 'string' && /^[A-Z]{3}$/.test(r.wert)
        ? { ok: true, waehrung: r.wert }
        : { ok: false, grund: 'nicht_pruefbar' };
    },
    buche: async (authorization, rechnung, betragCent, transaktion) => {
      const r = await rufe(authorization, 'record_card_payment', {
        p_invoice_id: rechnung,
        p_amount_cents: betragCent,
        p_terminal_transaction: transaktion,
      });
      if (!r.ok) return r;
      return typeof r.wert === 'string' && r.wert !== ''
        ? { ok: true, zahlung: r.wert }
        : { ok: false, grund: 'nicht_pruefbar' };
    },
  };
}
