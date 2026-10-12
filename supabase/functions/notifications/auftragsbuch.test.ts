import { describe, expect, it, vi } from 'vitest';
import { erstelleAuftragsbuch } from './auftragsbuch.ts';

describe('Auftragsbuch über REST (KOM-010)', () => {
  it('ruft die zwei Dienstfunktionen mit dem Dienstschlüssel', async () => {
    const abrufen = vi.fn(
      async (_url: string, _init?: RequestInit) =>
        new Response(JSON.stringify([]), { status: 200 }),
    );
    const buch = erstelleAuftragsbuch({
      supabaseUrl: 'https://db.invalid/',
      dienstschluessel: 'dienst',
      abrufen: abrufen as unknown as typeof fetch,
    });
    expect(await buch.abholen(10)).toEqual([]);
    expect(await buch.melden('id', 'gone', ['https://p.invalid/x'])).toBe(true);
    const [[url1, init1], [url2, init2]] = abrufen.mock.calls;
    expect(url1).toBe('https://db.invalid/rest/v1/rpc/claim_notification_deliveries');
    expect(JSON.parse(String(init1!.body))).toEqual({ p_limit: 10 });
    expect((init1!.headers as Record<string, string>)['Authorization']).toBe('Bearer dienst');
    expect(url2).toBe('https://db.invalid/rest/v1/rpc/finish_notification_delivery');
    expect(JSON.parse(String(init2!.body))).toEqual({
      p_id: 'id',
      p_outcome: 'gone',
      p_gone_endpoints: ['https://p.invalid/x'],
    });
  });

  it('meldet einen Fehler der Datenbank als null bzw. false', async () => {
    const buch = erstelleAuftragsbuch({
      supabaseUrl: 'https://db.invalid',
      dienstschluessel: 'dienst',
      abrufen: (async () => new Response('{}', { status: 403 })) as unknown as typeof fetch,
    });
    expect(await buch.abholen(10)).toBeNull();
    expect(await buch.melden('id', 'sent', [])).toBe(false);
  });
});
