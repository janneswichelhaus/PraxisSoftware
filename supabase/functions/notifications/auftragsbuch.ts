/**
 * Das Auftragsbuch in der Datenbank, über die REST-Schnittstelle (KOM-010).
 * Nur mit dem Dienstschlüssel: `claim_notification_deliveries` und
 * `finish_notification_delivery` sind allein `service_role` freigegeben.
 */

import type { Auftragsbuch, Ausgang, Faellig } from './zustellen.ts';

export interface BuchOptionen {
  readonly supabaseUrl: string;
  readonly dienstschluessel: string;
  readonly abrufen?: typeof fetch;
  readonly timeoutMs?: number;
}

export function erstelleAuftragsbuch({
  supabaseUrl,
  dienstschluessel,
  abrufen = fetch,
  timeoutMs = 8_000,
}: BuchOptionen): Auftragsbuch {
  const basis = supabaseUrl.trim().replace(/\/+$/, '');
  const kopf = {
    apikey: dienstschluessel,
    Authorization: `Bearer ${dienstschluessel}`,
    'Content-Type': 'application/json',
  };
  async function rufe(name: string, koerper: unknown): Promise<unknown> {
    try {
      const antwort = await abrufen(`${basis}/rest/v1/rpc/${name}`, {
        method: 'POST',
        headers: kopf,
        body: JSON.stringify(koerper),
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!antwort.ok) return undefined;
      const text = await antwort.text();
      return text === '' ? null : (JSON.parse(text) as unknown);
    } catch {
      return undefined;
    }
  }
  return {
    async abholen(anzahl) {
      const daten = await rufe('claim_notification_deliveries', { p_limit: anzahl });
      return Array.isArray(daten) ? (daten as Faellig[]) : null;
    },
    async melden(
      auftrag: Pick<Faellig, 'id' | 'claimed_at'>,
      ausgang: Ausgang,
      weg: readonly string[],
    ) {
      const daten = await rufe('finish_notification_delivery', {
        p_id: auftrag.id,
        p_claimed_at: auftrag.claimed_at,
        p_outcome: ausgang,
        p_gone_endpoints: weg,
      });
      return daten !== undefined;
    },
  };
}
