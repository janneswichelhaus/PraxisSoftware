import { describe, expect, it, vi } from 'vitest';
import { erstelleKasse } from './kasse.ts';

const RECHNUNG = '9a1b2c3d-4e5f-4a6b-8c7d-8e9f0a1b2c3d';

function antwort(status: number, koerper: unknown): Response {
  return new Response(JSON.stringify(koerper), { status });
}

function kasse(abrufen: typeof fetch) {
  return erstelleKasse({ supabaseUrl: 'http://instanz.test/', anonKey: 'oeffentlich', abrufen });
}

describe('Prüfen und Buchen über die Datenbank', () => {
  it('fragt mit dem Token der Person und dem öffentlichen Schlüssel, ohne Admin-Schlüssel', async () => {
    const abrufen = vi.fn(() => Promise.resolve(antwort(200, 'EUR')));
    expect(
      await kasse(abrufen as unknown as typeof fetch).pruefe('Bearer t', RECHNUNG, 14000),
    ).toEqual({
      ok: true,
      waehrung: 'EUR',
    });
    const [adresse, optionen] = abrufen.mock.calls[0] as unknown as [string, RequestInit];
    expect(adresse).toBe('http://instanz.test/rest/v1/rpc/card_payment_preflight');
    expect(optionen.headers).toEqual({
      apikey: 'oeffentlich',
      Authorization: 'Bearer t',
      'Content-Type': 'application/json',
    });
    expect(JSON.parse(optionen.body as string)).toEqual({
      p_invoice_id: RECHNUNG,
      p_amount_cents: 14000,
    });
  });

  it('übersetzt die Antworten der Datenbank in Gründe', async () => {
    const fall = async (status: number, koerper: unknown) =>
      kasse(() => Promise.resolve(antwort(status, koerper))).pruefe('Bearer t', RECHNUNG, 100);
    expect(await fall(401, {})).toEqual({ ok: false, grund: 'abgelehnt' });
    expect(await fall(403, { message: 'not allowed to manage invoices' })).toEqual({
      ok: false,
      grund: 'verweigert',
    });
    expect(await fall(400, { message: 'a card payment cannot exceed the open amount' })).toEqual({
      ok: false,
      grund: 'nicht_zahlbar',
      detail: 'open_amount',
    });
    expect(await fall(400, { message: 'a cancelled invoice takes no payment' })).toEqual({
      ok: false,
      grund: 'nicht_zahlbar',
      detail: 'cancelled',
    });
    expect(await fall(400, { message: 'etwas anderes' })).toEqual({
      ok: false,
      grund: 'nicht_pruefbar',
    });
    expect(await fall(404, {})).toEqual({ ok: false, grund: 'nicht_pruefbar' });
    expect(await fall(200, 'euro')).toEqual({ ok: false, grund: 'nicht_pruefbar' });
  });

  it('bucht mit der Kennung des Terminals und erkennt eine schon gebuchte', async () => {
    const abrufen = vi.fn(() =>
      Promise.resolve(antwort(200, 'b1c2d3e4-0000-4000-8000-000000000001')),
    );
    expect(
      await kasse(abrufen as unknown as typeof fetch).buche('Bearer t', RECHNUNG, 14000, 'mock-1'),
    ).toEqual({
      ok: true,
      zahlung: 'b1c2d3e4-0000-4000-8000-000000000001',
    });
    const [adresse, optionen] = abrufen.mock.calls[0] as unknown as [string, RequestInit];
    expect(adresse).toBe('http://instanz.test/rest/v1/rpc/record_card_payment');
    expect(JSON.parse(optionen.body as string)).toEqual({
      p_invoice_id: RECHNUNG,
      p_amount_cents: 14000,
      p_terminal_transaction: 'mock-1',
    });
    expect(
      await kasse(() =>
        Promise.resolve(antwort(409, { message: 'terminal transaction already booked' })),
      ).buche('Bearer t', RECHNUNG, 14000, 'mock-1'),
    ).toEqual({ ok: false, grund: 'schon_gebucht' });
  });

  it('meldet einen Ausfall und eine fehlende Einrichtung als nicht prüfbar', async () => {
    expect(
      await kasse(() => Promise.reject(new Error('weg'))).pruefe('Bearer t', RECHNUNG, 100),
    ).toEqual({ ok: false, grund: 'nicht_pruefbar' });
    const ohne = erstelleKasse({ supabaseUrl: '', anonKey: '', abrufen: vi.fn() });
    expect(await ohne.pruefe('Bearer t', RECHNUNG, 100)).toEqual({
      ok: false,
      grund: 'nicht_pruefbar',
    });
  });
});
