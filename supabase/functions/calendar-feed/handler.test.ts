import { describe, expect, it, vi } from 'vitest';
import { erstelleHandler } from './handler.ts';
import type { Abruf, Quelle } from './typen.ts';

const ADRESSE = 'Zz09_-'.padEnd(43, 'x');
const JETZT = new Date('2026-11-02T20:05:00Z');
const EINTRAG = {
  uid: 'd'.repeat(64),
  beginn: new Date('2026-11-03T09:00:00Z'),
  ende: new Date('2026-11-03T09:45:00Z'),
  art: 'home_visit' as const,
};

const KALENDER = { zeitzone: 'Europe/Berlin', eintraege: [EINTRAG] };

function mitQuelle(abruf: Abruf) {
  const lies = vi.fn((_adresse: string) => Promise.resolve(abruf));
  const quelle: Quelle = { lies };
  return { handler: erstelleHandler({ quelle, jetzt: () => JETZT }), lies };
}

function anfrage(pfad: string, method = 'GET'): Request {
  return new Request(`http://funktionen.test${pfad}`, { method });
}

describe('Die Function des Kalender-Abos (ANN-838)', () => {
  it('sagt der Anwendung, ob das Abo eingerichtet ist - mit CORS nur hier', async () => {
    const { handler } = mitQuelle({ ok: true, kalender: { ...KALENDER, eintraege: [] } });
    const ja = await handler(anfrage('/calendar-feed'));
    expect(await ja.json()).toEqual({ ok: true, value: { verfuegbar: true } });
    expect(ja.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(ja.headers.get('Cache-Control')).toBe('no-store');

    const ohne = erstelleHandler({ quelle: null });
    expect(await (await ohne(anfrage('/calendar-feed/'))).json()).toEqual({
      ok: true,
      value: { verfuegbar: false },
    });
    expect((await ohne(anfrage('/calendar-feed', 'OPTIONS'))).status).toBe(204);
    expect((await ohne(anfrage('/calendar-feed', 'POST'))).status).toBe(405);
  });

  it('liefert die Kalenderdatei unter jeder Schreibweise der Adresse', async () => {
    for (const pfad of [
      `/calendar-feed/${ADRESSE}`,
      `/calendar-feed/${ADRESSE}.ics`,
      `/functions/v1/calendar-feed/${ADRESSE}.ics`,
    ]) {
      const { handler, lies } = mitQuelle({ ok: true, kalender: KALENDER });
      const antwort = await handler(anfrage(pfad));
      expect(antwort.status).toBe(200);
      expect(antwort.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
      expect(antwort.headers.get('Cache-Control')).toBe('no-store');
      expect(antwort.headers.get('Referrer-Policy')).toBe('no-referrer');
      expect(antwort.headers.get('Access-Control-Allow-Origin')).toBeNull();
      const text = await antwort.text();
      expect(text).toContain('SUMMARY:Hausbesuch');
      expect(text).toContain('DTSTAMP:20261102T200500Z');
      expect(lies).toHaveBeenCalledWith(ADRESSE);
    }
  });

  it('antwortet auf HEAD ohne Inhalt', async () => {
    const { handler } = mitQuelle({ ok: true, kalender: KALENDER });
    const antwort = await handler(anfrage(`/calendar-feed/${ADRESSE}`, 'HEAD'));
    expect(antwort.status).toBe(200);
    expect(await antwort.text()).toBe('');
  });

  it('fragt bei falscher Form gar nicht erst und sagt nie, warum', async () => {
    for (const pfad of [
      '/calendar-feed/zu-kurz',
      `/calendar-feed/${ADRESSE}x`,
      `/calendar-feed/${ADRESSE.slice(0, 42)}+`,
      `/calendar-feed/${ADRESSE}/mehr`,
      `/calendar-feed/${ADRESSE}.ical`,
    ]) {
      const { handler, lies } = mitQuelle({ ok: true, kalender: KALENDER });
      const antwort = await handler(anfrage(pfad));
      expect(antwort.status).toBe(404);
      expect(await antwort.text()).toBe('');
      expect(lies).not.toHaveBeenCalled();
    }
  });

  it('gibt einer unbekannten oder beendeten Adresse eine leere Datei', async () => {
    const unbekannt = mitQuelle({ ok: true, kalender: null });
    const antwort = await unbekannt.handler(anfrage(`/calendar-feed/${ADRESSE}.ics`));
    expect(antwort.status).toBe(200);
    expect(antwort.headers.get('Content-Type')).toBe('text/calendar; charset=utf-8');
    expect(antwort.headers.get('Cache-Control')).toBe('no-store');
    const text = await antwort.text();
    expect(text).toContain('BEGIN:VCALENDAR');
    expect(text).not.toContain('BEGIN:VEVENT');
  });

  it('unterscheidet nicht eingerichtet und Ausfall - ohne Inhalt', async () => {
    const ausfall = mitQuelle({ ok: false });
    const antwort = await ausfall.handler(anfrage(`/calendar-feed/${ADRESSE}`));
    expect(antwort.status).toBe(502);
    expect(await antwort.text()).toBe('');

    const ohne = erstelleHandler({ quelle: null });
    expect((await ohne(anfrage(`/calendar-feed/${ADRESSE}`))).status).toBe(503);
  });

  it('nimmt nur GET und HEAD an', async () => {
    for (const methode of ['POST', 'PUT', 'DELETE', 'PATCH']) {
      const { handler, lies } = mitQuelle({ ok: true, kalender: { ...KALENDER, eintraege: [] } });
      const antwort = await handler(anfrage(`/calendar-feed/${ADRESSE}`, methode));
      expect(antwort.status).toBe(405);
      expect(antwort.headers.get('Allow')).toBe('GET, HEAD');
      expect(lies).not.toHaveBeenCalled();
    }
  });
});
