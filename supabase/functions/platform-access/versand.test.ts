import { describe, expect, it, vi } from 'vitest';
import { einladungstext, waehleVersand } from './versand.ts';

/** Versand hinter einem Adapter (ADR-023 Punkt 10, R8). */
describe('Versandweg der Einladung', () => {
  it('ist ohne ausdrueckliche Einrichtung nicht eingerichtet, nie stillschweigend mock', () => {
    expect(waehleVersand({})).toBeNull();
    expect(waehleVersand({ MAIL_PROVIDER: 'mock' })).toBeNull();
    expect(waehleVersand({ MAIL_PROVIDER: 'smtp', MAIL_MOCK_URL: 'http://x' })).toBeNull();
    expect(waehleVersand({ MAIL_PROVIDER: 'mock', MAIL_MOCK_URL: 'http://postfach' })?.id).toBe(
      'mock',
    );
  });

  it('stellt ueber die Schnittstelle des lokalen Postfachs zu', async () => {
    const abrufen = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status: 200 })));
    const weg = waehleVersand(
      { MAIL_PROVIDER: 'mock', MAIL_MOCK_URL: 'http://postfach/' },
      abrufen,
    );
    expect(await weg!.sende({ an: 'max@patient.invalid', betreff: 'B', text: 'T' })).toEqual({
      ok: true,
      value: null,
    });
    expect(abrufen.mock.calls[0]![0]).toBe('http://postfach/api/v1/send');
    expect(JSON.parse(abrufen.mock.calls[0]![1]!.body as string)).toMatchObject({
      To: [{ Email: 'max@patient.invalid' }],
      Subject: 'B',
      Text: 'T',
    });
  });

  it('meldet ein nicht erreichbares Postfach', async () => {
    const weg = waehleVersand({ MAIL_PROVIDER: 'mock', MAIL_MOCK_URL: 'http://postfach' }, () =>
      Promise.reject(new Error('weg')),
    );
    expect(await weg!.sende({ an: 'a@b.invalid', betreff: 'B', text: 'T' })).toEqual({
      ok: false,
      error: 'unavailable',
    });
  });

  it('schreibt den Code ins Fragment und sonst nichts ueber die Person', () => {
    const { betreff, text } = einladungstext(
      'https://praxis.invalid/',
      'Testpraxis',
      'CODE123',
      '2026-10-14T10:00:00Z',
    );
    expect(betreff).toContain('Testpraxis');
    expect(text).toContain('https://praxis.invalid/einladung#code=CODE123');
    expect(text).toContain('14.10.2026');
    expect(text).not.toMatch(/\?code=/);
  });
});
