/**
 * Der Draht zur eigenen Instanz (BEF-181), nach dem Vorbild von
 * `patient-file-verify/instanz.ts`.
 *
 * Drei Aufrufe, alle an dieselbe Instanz, keiner nach außen:
 *
 *   * die Sitzung der Person beim Anmeldedienst - liefert die Kontokennung;
 *   * die Wegpunkte ihrer Touren über PostgREST, **mit ihrem eigenen Token**:
 *     Rolle, Praxis und Sitzungssperre prüft die Datenbank wie beim
 *     Beantragen (`electricity_tour_points`);
 *   * das Eintragen der Monatssumme mit dem **Dienstschlüssel**, den nur diese
 *     Function hat (`record_electricity_tour_distance`, nur `service_role`).
 *
 * Kein Client-Paket: Jeder Aufruf ist ausgeschrieben und ohne Laufzeit
 * prüfbar, weil `fetchImpl` von außen kommt.
 */

import type { Coordinate } from '../location-provider/typen.ts';

const TIMEOUT_MS = 8_000;

/** Ein Aufruf an die eigene Instanz: Ergebnis oder Fehlerklasse, nie Inhalt. */
export type Result<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly reason: 'refused' | 'unavailable' };

export interface Recorded {
  readonly km: number;
  readonly amountCents: number;
}

export interface Instance {
  /** Die Kontokennung der aufrufenden Person, `null` ohne gültige Sitzung. */
  readonly account: (authorization: string | null) => Promise<Result<string | null>>;
  /** Je Tag mit Fahrt die Wegpunkte - mit der Sitzung der Person. */
  readonly tourPoints: (authorization: string, month: string) => Promise<Result<Coordinate[][]>>;
  /** Trägt die Summe am eben gestellten Antrag ein - mit dem Dienstschlüssel. */
  readonly record: (
    reimbursementId: string,
    accountId: string,
    km: number,
  ) => Promise<Result<Recorded>>;
}

export interface Setup {
  readonly supabaseUrl: string;
  /** Eigenes Secret dieser Function; ohne es rechnet sie nichts (`index.ts`). */
  readonly serviceKey: string;
  readonly anonKey: string;
}

/** Was fehlt - Namen, keine Werte. */
export function missingSetup(setup: Setup): string[] {
  const missing: string[] = [];
  if (setup.supabaseUrl.trim() === '') missing.push('SUPABASE_URL');
  if (setup.serviceKey.trim() === '') missing.push('ELECTRICITY_DISTANCE_SERVICE_KEY');
  if (setup.anonKey.trim() === '') missing.push('SUPABASE_ANON_KEY');
  return missing;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Die Antwort von `electricity_tour_points` - oder `null`, wenn sie nicht stimmt. */
export function parseTourPoints(value: unknown): Coordinate[][] | null {
  if (!Array.isArray(value)) return null;
  const days: Coordinate[][] = [];
  for (const day of value as unknown[]) {
    if (!Array.isArray(day)) return null;
    const points: Coordinate[] = [];
    for (const point of day as unknown[]) {
      if (typeof point !== 'object' || point === null) return null;
      const { lat, lon } = point as Record<string, unknown>;
      if (typeof lat !== 'number' || typeof lon !== 'number') return null;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      if (lat < -90 || lat > 90 || lon < -180 || lon > 180) return null;
      points.push({ lat, lon });
    }
    days.push(points);
  }
  return days;
}

export function createInstance(
  setup: Setup,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = TIMEOUT_MS,
): Instance {
  const base = setup.supabaseUrl.trim().replace(/\/+$/, '');
  const service = setup.serviceKey.trim();
  const anon = setup.anonKey.trim();

  async function rpc(
    name: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
  ): Promise<Result<unknown>> {
    try {
      const response = await fetchImpl(`${base}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      });
      // 4xx: Die Datenbank hat abgewiesen (Recht, Monat, Antrag) - eine
      // Aussage, kein Ausfall. Der Grund bleibt bei ihr.
      if (response.status >= 400 && response.status < 500) return { ok: false, reason: 'refused' };
      if (!response.ok) return { ok: false, reason: 'unavailable' };
      return { ok: true, value: (await response.json()) as unknown };
    } catch {
      return { ok: false, reason: 'unavailable' };
    }
  }

  return {
    async account(authorization) {
      if (!authorization?.startsWith('Bearer ') || authorization.length <= 'Bearer '.length) {
        return { ok: true, value: null };
      }
      try {
        const response = await fetchImpl(`${base}/auth/v1/user`, {
          method: 'GET',
          headers: { Authorization: authorization, apikey: anon },
          signal: AbortSignal.timeout(timeoutMs),
        });
        if (response.status >= 500) return { ok: false, reason: 'unavailable' };
        if (!response.ok) return { ok: true, value: null };
        const body = (await response.json()) as { id?: unknown };
        return {
          ok: true,
          value: typeof body.id === 'string' && UUID.test(body.id) ? body.id : null,
        };
      } catch {
        return { ok: false, reason: 'unavailable' };
      }
    },

    async tourPoints(authorization, month) {
      const result = await rpc(
        'electricity_tour_points',
        { p_month: month },
        { Authorization: authorization, apikey: anon },
      );
      if (!result.ok) return result;
      const days = parseTourPoints(result.value);
      return days === null ? { ok: false, reason: 'unavailable' } : { ok: true, value: days };
    },

    async record(reimbursementId, accountId, km) {
      const result = await rpc(
        'record_electricity_tour_distance',
        { p_reimbursement_id: reimbursementId, p_account_id: accountId, p_km: km },
        { Authorization: `Bearer ${service}`, apikey: service },
      );
      if (!result.ok) return result;
      const value = result.value as { tour_km?: unknown; amount_cents?: unknown } | null;
      if (typeof value?.tour_km !== 'number' || typeof value.amount_cents !== 'number') {
        return { ok: false, reason: 'unavailable' };
      }
      return { ok: true, value: { km: value.tour_km, amountCents: value.amount_cents } };
    },
  };
}
