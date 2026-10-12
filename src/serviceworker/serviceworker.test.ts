import { describe, expect, it, vi } from 'vitest';
import { registriereServiceWorker } from '@/app/serviceworker';
import { BENACHRICHTIGUNGSARTEN } from '@/lib/begriffe';
import { antwortweg, geruestliste } from './geruest';
import { mitteilungAusPush } from './mitteilung';

/**
 * Der Service Worker (KOM-011, ADR-024 Abschnitt A und Punkt 14): Er
 * beantwortet nur Dateien des Gerüsts aus dem Speicher, nie eine Anfrage an
 * einen anderen Ursprung oder einen Pfad außerhalb der Liste, und zeigt nur
 * Mitteilungen aus dem Katalog.
 */

const HERKUNFT = 'https://app.praxis.invalid';
const LISTE = new Set(['/index.html', '/assets/index-abc123.js', '/marke/logo.svg']);
const get = (url: string, mode = 'cors') => ({ url, method: 'GET', mode });

describe('Gerüst (Punkt 1)', () => {
  it('beantwortet eine Datei der Liste aus dem Speicher', () => {
    expect(antwortweg(get(`${HERKUNFT}/assets/index-abc123.js`), HERKUNFT, LISTE)).toEqual({
      art: 'speicher',
      pfad: '/assets/index-abc123.js',
    });
  });

  it('lässt alles andere ins Netz: fremder Ursprung, Datenbank, Anmeldung, Dateien, Abfrage, POST', () => {
    for (const anfrage of [
      get('https://projekt.supabase.co/rest/v1/rpc/platform_context'),
      get('https://projekt.supabase.co/auth/v1/user'),
      get('https://projekt.supabase.co/storage/v1/object/sign/x'),
      get(`${HERKUNFT}/rest/v1/patients`),
      get(`${HERKUNFT}/assets/unbekannt.js`),
      get(`${HERKUNFT}/assets/index-abc123.js?v=2`),
      { url: `${HERKUNFT}/assets/index-abc123.js`, method: 'POST', mode: 'cors' },
      get('kein url'),
    ]) {
      expect(antwortweg(anfrage, HERKUNFT, LISTE), anfrage.url).toBeNull();
    }
  });

  it('führt eine Seitenanfrage zuerst ins Netz und nur ohne Netz auf die Einstiegsseite', () => {
    expect(antwortweg(get(`${HERKUNFT}/plattform/ich`, 'navigate'), HERKUNFT, LISTE)).toEqual({
      art: 'einstieg',
    });
    // TRK-008: auch mit Abfrage - das Gerüst trägt keine Daten.
    expect(
      antwortweg(
        get(`${HERKUNFT}/p/uebungen/einheit/x?bereich=training`, 'navigate'),
        HERKUNFT,
        LISTE,
      ),
    ).toEqual({ art: 'einstieg' });
    expect(antwortweg(get('https://fremd.invalid/', 'navigate'), HERKUNFT, LISTE)).toBeNull();
    expect(antwortweg(get(`${HERKUNFT}/`, 'navigate'), HERKUNFT, new Set())).toBeNull();
  });

  it('baut die Liste nur aus Dateien des Builds, ohne sich selbst, Karten und Textdateien', () => {
    expect(
      geruestliste(
        ['index.html', 'assets/index-abc.js', 'sw.js', 'assets/index-abc.js.map'],
        ['marke/logo.svg', 'schrift/OFL.txt', '.DS_Store', 'marke\\zwei.png'],
        'sw.js',
      ),
    ).toEqual(['/assets/index-abc.js', '/index.html', '/marke/logo.svg', '/marke/zwei.png']);
  });
});

describe('Mitteilung aus Push (Punkt 14)', () => {
  it('setzt den Text aus dem Katalog mit Datum und Uhrzeit', () => {
    expect(
      mitteilungAusPush({
        k: 'appointment_reminder',
        t: '2026-10-13T08:00:00Z',
        z: 'Europe/Berlin',
      }),
    ).toEqual({
      titel: 'Terminerinnerung',
      text: 'Erinnerung: Ihr Termin am 13.10.2026 um 10:00.',
      tag: 'appointment_reminder',
    });
  });

  it('zeigt für jede Art einen Text und für Fremdes nichts', () => {
    for (const art of BENACHRICHTIGUNGSARTEN) {
      expect(mitteilungAusPush({ k: art, t: '2026-10-13T08:00:00Z' })?.titel, art).toBeTruthy();
    }
    expect(mitteilungAusPush({ k: 'werbung', text: 'Jetzt kaufen' })).toBeNull();
    expect(mitteilungAusPush('appointment_reminder')).toBeNull();
    expect(mitteilungAusPush(null)).toBeNull();
    // Eine unbekannte Zeitzone fällt auf die der Praxis zurück, statt zu scheitern.
    expect(
      mitteilungAusPush({ k: 'appointment_cancelled', t: '2026-10-13T08:00:00Z', z: 'Mond/Basis' }),
    ).toEqual(
      expect.objectContaining({ text: 'Ihr Termin am 13.10.2026 um 10:00 wurde abgesagt.' }),
    );
  });
});

describe('Registrierung', () => {
  it('registriert nur im Auslieferungsstand und übersteht ein Scheitern', () => {
    const register = vi.fn(() => Promise.reject(new Error('nein')));
    const nav = { serviceWorker: { register } } as unknown as Pick<Navigator, 'serviceWorker'>;
    registriereServiceWorker(false, nav);
    expect(register).not.toHaveBeenCalled();
    registriereServiceWorker(true, nav);
    expect(register).toHaveBeenCalledWith('/sw.js');
    registriereServiceWorker(true, {} as Pick<Navigator, 'serviceWorker'>);
  });
});
