import { describe, expect, it, vi } from 'vitest';
import { BENACHRICHTIGUNGSARTEN } from '../../../src/lib/begriffe.ts';
import { erstelleHandler } from './handler.ts';
import { erstellePushNachbildung, waehleWege, type Mail, type Wege } from './versand.ts';
import { mailtext, pushinhalt, zustellen, type Auftragsbuch, type Faellig } from './zustellen.ts';

/**
 * Zustellen (KOM-010, ADR-024 Punkte 14, 16, 17): Inhalt ohne Gesundheitsdatum
 * und ohne Anmeldelink, Ergebnis zurück ins Auftragsbuch, Adapter nur mit
 * ausdrücklicher Einrichtung.
 */

const AUFTRAG: Faellig = {
  id: '00000000-0000-4000-8000-000000000001',
  kind: 'appointment_reminder',
  channel: 'email',
  subject_at: '2026-10-13T08:00:00Z',
  time_zone: 'Europe/Berlin',
  email: 'erika@example.invalid',
  push_targets: null,
};

function buchMit(faellig: Faellig[]) {
  const meldungen: [string, string, readonly string[]][] = [];
  let gegeben = false;
  const buch: Auftragsbuch = {
    abholen: vi.fn((_anzahl: number) => {
      if (gegeben) return Promise.resolve([]);
      gegeben = true;
      return Promise.resolve(faellig);
    }),
    melden: vi.fn((id: string, ausgang: string, weg: readonly string[]) => {
      meldungen.push([id, ausgang, weg]);
      return Promise.resolve(true);
    }),
  };
  return { buch, meldungen };
}

function mailweg() {
  const gesendet: Mail[] = [];
  const wege: Wege = {
    mail: {
      id: 'mock',
      sende: (m) => {
        gesendet.push(m);
        return Promise.resolve('sent' as const);
      },
    },
    push: null,
  };
  return { wege, gesendet };
}

describe('Inhalt (Punkt 14)', () => {
  it('nennt in der Mail nur Art, Datum und Uhrzeit und verlinkt die Startseite', () => {
    const { betreff, text } = mailtext(
      'appointment_reminder',
      '2026-10-13T08:00:00Z',
      'Europe/Berlin',
      'https://app.praxis.invalid/',
    );
    expect(betreff).toBe('Terminerinnerung');
    expect(text).toContain('Erinnerung: Ihr Termin am 13.10.2026 um 10:00.');
    expect(text).toContain('https://app.praxis.invalid/\n');
    // Kein Anmeldelink, keine Kennung, kein Fragment, keine Abfrage.
    expect(text).not.toMatch(/[?#]|einladung|code=|token/i);
  });

  it('trägt in keinem Text der sechs Arten einen Leistungsbereich, Namen oder Betrag', () => {
    for (const art of BENACHRICHTIGUNGSARTEN) {
      const { betreff, text } = mailtext(
        art,
        '2026-10-13T08:00:00Z',
        'Europe/Berlin',
        'https://a.invalid',
      );
      expect(`${betreff} ${text}`, art).not.toMatch(
        /Behandlung|Training|Therap|Physio|Diagnose|€|EUR|Rechnung|Abo|Paket|Angebot/i,
      );
    }
  });

  it('schickt per Push nur Schlüssel, Zeitpunkt und Zeitzone', () => {
    const lesen = (b: Uint8Array) => JSON.parse(new TextDecoder().decode(b)) as unknown;
    expect(
      lesen(pushinhalt('appointment_cancelled', '2026-10-13T08:00:00Z', 'Europe/Berlin')),
    ).toEqual({
      k: 'appointment_cancelled',
      t: '2026-10-13T08:00:00Z',
      z: 'Europe/Berlin',
    });
    expect(lesen(pushinhalt('message_answered', '2026-10-13T08:00:00Z', 'Europe/Berlin'))).toEqual({
      k: 'message_answered',
    });
  });
});

describe('zustellen', () => {
  it('sendet die Mail und meldet sent, das Protokoll ohne Adresse', async () => {
    const { buch, meldungen } = buchMit([AUFTRAG]);
    const { wege, gesendet } = mailweg();
    const protokoll = await zustellen(buch, wege, 'https://a.invalid');
    expect(gesendet).toHaveLength(1);
    expect(gesendet[0]!.an).toBe('erika@example.invalid');
    expect(meldungen).toEqual([[AUFTRAG.id, 'sent', []]]);
    expect(protokoll).toEqual([{ auftrag: AUFTRAG.id, weg: 'email', ergebnis: 'sent' }]);
    expect(JSON.stringify(protokoll)).not.toContain('@');
  });

  it('meldet failed, wenn der Weg fehlt oder die Art unbekannt ist', async () => {
    const { buch, meldungen } = buchMit([
      AUFTRAG,
      { ...AUFTRAG, id: 'b', kind: 'werbung' },
      { ...AUFTRAG, id: 'c', channel: 'push', push_targets: [] },
    ]);
    await zustellen(buch, { mail: null, push: null }, 'https://a.invalid');
    expect(meldungen.map(([, a]) => a)).toEqual(['failed', 'failed', 'failed']);
  });

  it('meldet abgewiesene Endpunkte und gone, wenn keines mehr erreichbar ist', async () => {
    const ziele = [
      { endpoint: 'https://push.invalid/weg', p256dh: 'x', auth: 'y' },
      { endpoint: 'https://push.invalid/da', p256dh: 'x', auth: 'y' },
    ];
    const liste = vi.fn(() => Promise.resolve(new Response(null, { status: 201 })));
    const wege: Wege = {
      mail: null,
      push: erstellePushNachbildung('https://liste.invalid', liste),
    };

    const eins = buchMit([{ ...AUFTRAG, channel: 'push', push_targets: ziele }]);
    await zustellen(eins.buch, wege, 'https://a.invalid');
    expect(eins.meldungen).toEqual([[AUFTRAG.id, 'sent', ['https://push.invalid/weg']]]);

    const zwei = buchMit([{ ...AUFTRAG, channel: 'push', push_targets: [ziele[0]!] }]);
    await zustellen(zwei.buch, wege, 'https://a.invalid');
    expect(zwei.meldungen).toEqual([[AUFTRAG.id, 'gone', ['https://push.invalid/weg']]]);
  });

  it('gibt null zurück, wenn das Auftragsbuch nicht antwortet', async () => {
    const buch: Auftragsbuch = {
      abholen: () => Promise.resolve(null),
      melden: () => Promise.resolve(true),
    };
    expect(await zustellen(buch, mailweg().wege, 'https://a.invalid')).toBeNull();
  });
});

describe('Adapterwahl (Punkt 11)', () => {
  it('wählt nichts ohne ausdrückliche Einrichtung, nie stillschweigend mock', () => {
    expect(waehleWege({})).toEqual({ mail: null, push: null });
    expect(waehleWege({ MAIL_PROVIDER: 'smtp', PUSH_PROVIDER: 'webpush' })).toEqual({
      mail: null,
      push: null,
    });
    expect(waehleWege({ MAIL_PROVIDER: 'mock' }).mail).toBeNull();
  });

  it('wählt mock mit Postfach bzw. Liste und webpush nur mit vollständigen Schlüsseln', () => {
    const wege = waehleWege({
      MAIL_PROVIDER: 'mock',
      MAIL_MOCK_URL: 'http://127.0.0.1:54324',
      PUSH_PROVIDER: 'mock',
      PUSH_MOCK_URL: 'http://127.0.0.1:9999/push',
    });
    expect(wege.mail?.id).toBe('mock');
    expect(wege.push?.id).toBe('mock');
    expect(
      waehleWege({
        PUSH_PROVIDER: 'webpush',
        VAPID_PUBLIC_KEY: 'B'.repeat(87),
        VAPID_PRIVATE_KEY: 'A'.repeat(43),
        VAPID_SUBJECT: 'mailto:praxis@praxis.invalid',
      }).push?.id,
    ).toBe('webpush');
    expect(
      waehleWege({
        PUSH_PROVIDER: 'webpush',
        VAPID_PUBLIC_KEY: 'B'.repeat(87),
        VAPID_PRIVATE_KEY: 'A'.repeat(43),
      }).push,
    ).toBeNull();
  });
});

describe('Handler', () => {
  const anfrage = (kopf?: string, methode = 'POST') =>
    new Request('https://f.invalid/notifications', {
      method: methode,
      headers: kopf === undefined ? {} : { Authorization: kopf },
    });

  it('läuft nur mit dem Dienstschlüssel', async () => {
    const { buch } = buchMit([]);
    const handler = erstelleHandler({
      buch,
      wege: mailweg().wege,
      dienstschluessel: 'geheim',
      appUrl: 'https://a.invalid',
    });
    expect((await handler(anfrage())).status).toBe(403);
    expect((await handler(anfrage('Bearer falsch'))).status).toBe(403);
    expect((await handler(anfrage('Bearer geheim', 'GET'))).status).toBe(405);
    expect(buch.abholen).not.toHaveBeenCalled();
    const ok = await handler(anfrage('Bearer geheim'));
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ ok: true, value: [] });
  });

  it('meldet not_configured ohne Weg und ohne leeren Schlüssel durchzulassen', async () => {
    const { buch } = buchMit([AUFTRAG]);
    const ohneWeg = erstelleHandler({
      buch,
      wege: { mail: null, push: null },
      dienstschluessel: 'geheim',
      appUrl: 'https://a.invalid',
    });
    expect((await ohneWeg(anfrage('Bearer geheim'))).status).toBe(503);
    expect(buch.abholen).not.toHaveBeenCalled();
    const ohneSchluessel = erstelleHandler({
      buch,
      wege: mailweg().wege,
      dienstschluessel: '',
      appUrl: 'https://a.invalid',
    });
    expect((await ohneSchluessel(anfrage('Bearer '))).status).toBe(403);
  });
});
