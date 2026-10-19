import { describe, expect, it, vi } from 'vitest';
import { erstelleAuftragsbuch } from './auftragsbuch.ts';

describe('Auftragsbuch über REST (KOM-010)', () => {
  it('ruft die zwei Dienstfunktionen mit dem Dienstschlüssel', async () => {
    const abrufen = vi.fn((_url: string, _init?: RequestInit) =>
      Promise.resolve(new Response(JSON.stringify([]), { status: 200 })),
    );
    const buch = erstelleAuftragsbuch({
      supabaseUrl: 'https://db.invalid/',
      dienstschluessel: 'dienst',
      abrufen: abrufen as unknown as typeof fetch,
    });
    expect(await buch.abholen(10)).toEqual([]);
    const anspruch = '2026-10-19T23:00:00.123456+00:00';
    expect(
      await buch.melden({ id: 'id', claimed_at: anspruch }, 'gone', ['https://p.invalid/x']),
    ).toBe(true);
    const [url1, init1] = abrufen.mock.calls[0]!;
    const [url2, init2] = abrufen.mock.calls[1]!;
    expect(url1).toBe('https://db.invalid/rest/v1/rpc/claim_notification_deliveries');
    expect(JSON.parse(init1!.body as string)).toEqual({ p_limit: 10 });
    expect((init1!.headers as Record<string, string>)['Authorization']).toBe('Bearer dienst');
    expect(url2).toBe('https://db.invalid/rest/v1/rpc/finish_notification_delivery');
    expect(JSON.parse(init2!.body as string)).toEqual({
      p_id: 'id',
      // BEF-148: der Anspruch aus dem Abholen, unverändert zurück.
      p_claimed_at: anspruch,
      p_outcome: 'gone',
      p_gone_endpoints: ['https://p.invalid/x'],
    });
  });

  it('meldet einen Fehler der Datenbank als null bzw. false', async () => {
    const buch = erstelleAuftragsbuch({
      supabaseUrl: 'https://db.invalid',
      dienstschluessel: 'dienst',
      abrufen: () => Promise.resolve(new Response('{}', { status: 403 })),
    });
    expect(await buch.abholen(10)).toBeNull();
    expect(await buch.melden({ id: 'id', claimed_at: 'x' }, 'sent', [])).toBe(false);
  });
});
