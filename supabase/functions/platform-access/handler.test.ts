import { describe, expect, it, vi } from 'vitest';
import type { Anmeldedienst } from './anmeldedienst.ts';
import { erstelleHandler } from './handler.ts';
import { codeHash, type Ergebnis } from './typen.ts';
import type { Versandweg } from './versand.ts';

/**
 * Der Ablauf des Zugangsdienstes (POR-003, ADR-023 Punkte 7 bis 10).
 *
 * Anmeldedienst und Versand sind hier eingesetzt. Geprüft wird die Reihenfolge
 * — nachschlagen, anlegen oder bestätigen, binden, im Fehlerfall aufräumen —
 * und dass keine Antwort mehr sagt als die Fehlerklasse.
 */

const CODE = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
/** Nur dieser Wert erreicht die Datenbank (Zweitreview). */
const HASH = await codeHash(CODE);
const KONTO = '99999999-9999-4999-8999-000000000001';
const EINLADUNG = '99999999-9999-4999-8999-0000000000e1';

function dienst(ueberschreiben: Partial<Anmeldedienst> = {}): Anmeldedienst {
  const ok = <T>(value: T): Promise<Ergebnis<T>> => Promise.resolve({ ok: true, value });
  return {
    nachschlagen: vi.fn(() =>
      ok({ purpose: 'activate' as const, accountUserId: null, organizationName: 'Testpraxis' }),
    ),
    einloesen: vi.fn(() => ok('zugang')),
    kontoAnlegen: vi.fn(() => ok(KONTO)),
    sitzungskonto: vi.fn(() => ok<string | null>(null)),
    anmeldecode: vi.fn(() => ok('einmal-hash')),
    kontoEntfernen: vi.fn(() => ok(null)),
    loeschauftraege: vi.fn(() => ok<string[]>([])),
    loeschungBestaetigen: vi.fn(() => ok(null)),
    istDienstaufruf: vi.fn((kopf: string | null) => kopf === 'Bearer dienst-schluessel'),
    authMailErlaubt: vi.fn(() => ok(true)),
    fehlversuch: vi.fn(() => ok(null)),
    einladungsmail: vi.fn(() =>
      ok({
        email: 'max@patient.invalid',
        organizationName: 'Testpraxis',
        expiresAt: '2026-10-14T10:00:00Z',
      }),
    ),
    ...ueberschreiben,
  };
}

function versand(): Versandweg & { sende: ReturnType<typeof vi.fn> } {
  return { id: 'mock', sende: vi.fn(() => Promise.resolve({ ok: true as const, value: null })) };
}

function anfrage(koerper: unknown, kopf: Record<string, string> = {}): Request {
  return new Request('https://beispiel.invalid/platform-access', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...kopf },
    body: JSON.stringify(koerper),
  });
}

const EINLOESEN = {
  aufgabe: 'einloesen',
  code: CODE,
  email: ' Max@Patient.invalid ',
};

async function lies(antwort: Response): Promise<unknown> {
  return JSON.parse(await antwort.text()) as unknown;
}

describe('Zugangsdienst: einloesen ohne Kennwort (ADR-025 Fassung 2, Punkt 13)', () => {
  const RESET = {
    purpose: 'reset' as const,
    accountUserId: KONTO,
    organizationName: 'Testpraxis',
  };

  it('legt das Konto ohne Kennwort an, bindet es und gibt eine Einmal-Anmeldung zurueck', async () => {
    const d = dienst();
    const handler = erstelleHandler({ anmeldedienst: d, versand: null, appUrl: '' });
    const antwort = await handler(anfrage(EINLOESEN));
    expect(antwort.status).toBe(200);
    expect(await lies(antwort)).toEqual({
      ok: true,
      value: { purpose: 'activate', organizationName: 'Testpraxis', tokenHash: 'einmal-hash' },
    });
    expect(d.kontoAnlegen).toHaveBeenCalledWith('max@patient.invalid');
    expect(d.einloesen).toHaveBeenCalledWith(HASH, KONTO);
    expect(d.anmeldecode).toHaveBeenCalledWith(KONTO);
    expect(d.kontoEntfernen).not.toHaveBeenCalled();
  });

  it('nimmt kein Kennwort mehr an', async () => {
    const d = dienst();
    const handler = erstelleHandler({ anmeldedienst: d, versand: null, appUrl: '' });
    const antwort = await handler(anfrage({ ...EINLOESEN, kennwort: 'ein-langes-kennwort' }));
    expect(await lies(antwort)).toEqual({ ok: false, error: 'invalid_request' });
    expect(d.nachschlagen).not.toHaveBeenCalled();
  });

  it('gibt fuer einen ungueltigen Code dieselbe Auskunft, ohne ein Konto anzulegen', async () => {
    const d = dienst({
      nachschlagen: vi.fn(() => Promise.resolve({ ok: true as const, value: null })),
    });
    const handler = erstelleHandler({ anmeldedienst: d, versand: null, appUrl: '' });
    const antwort = await handler(anfrage(EINLOESEN));
    expect(antwort.status).toBe(400);
    expect(await lies(antwort)).toEqual({ ok: false, error: 'invitation_invalid' });
    expect(d.kontoAnlegen).not.toHaveBeenCalled();
    expect(d.anmeldecode).not.toHaveBeenCalled();

    const form = await handler(anfrage({ ...EINLOESEN, code: 'kurz' }));
    expect(await lies(form)).toEqual({ ok: false, error: 'invitation_invalid' });
  });

  it('uebernimmt ein bestehendes Konto nie ueber seine Adresse (Punkt 4)', async () => {
    const d = dienst({
      kontoAnlegen: vi.fn(() =>
        Promise.resolve({ ok: false as const, error: 'email_taken' as const }),
      ),
    });
    const handler = erstelleHandler({ anmeldedienst: d, versand: null, appUrl: '' });
    const antwort = await handler(anfrage(EINLOESEN));
    expect(antwort.status).toBe(409);
    expect(await lies(antwort)).toEqual({ ok: false, error: 'email_taken' });
    expect(d.einloesen).not.toHaveBeenCalled();
    expect(d.anmeldecode).not.toHaveBeenCalled();
    // Der Versuch zählt an der Einladung.
    expect(d.fehlversuch).toHaveBeenCalledWith(HASH);
  });

  it('loest mit Sitzung fuer das eigene Konto ein, ohne Konto und ohne Einmal-Anmeldung', async () => {
    const d = dienst({
      sitzungskonto: vi.fn(() => Promise.resolve({ ok: true as const, value: KONTO })),
    });
    const handler = erstelleHandler({ anmeldedienst: d, versand: null, appUrl: '' });
    const antwort = await handler(
      anfrage({ aufgabe: 'einloesen', code: CODE }, { Authorization: 'Bearer sitzung' }),
    );
    expect(await lies(antwort)).toEqual({
      ok: true,
      value: { purpose: 'activate', organizationName: 'Testpraxis', tokenHash: null },
    });
    expect(d.sitzungskonto).toHaveBeenCalledWith('Bearer sitzung');
    expect(d.einloesen).toHaveBeenCalledWith(HASH, KONTO);
    expect(d.kontoAnlegen).not.toHaveBeenCalled();
    expect(d.anmeldecode).not.toHaveBeenCalled();
  });

  it('zaehlt mit Sitzung ein fremdes Konto als Fehlversuch', async () => {
    const d = dienst({
      sitzungskonto: vi.fn(() => Promise.resolve({ ok: true as const, value: KONTO })),
      einloesen: vi.fn(() =>
        Promise.resolve({ ok: false as const, error: 'account_conflict' as const }),
      ),
    });
    const handler = erstelleHandler({ anmeldedienst: d, versand: null, appUrl: '' });
    const antwort = await handler(anfrage(EINLOESEN, { Authorization: 'Bearer sitzung' }));
    expect(await lies(antwort)).toEqual({ ok: false, error: 'account_conflict' });
    expect(d.fehlversuch).toHaveBeenCalledWith(HASH);
    expect(d.kontoEntfernen).not.toHaveBeenCalled();
  });

  it('verlangt ohne Sitzung eine Adresse', async () => {
    const d = dienst();
    const handler = erstelleHandler({ anmeldedienst: d, versand: null, appUrl: '' });
    const antwort = await handler(anfrage({ aufgabe: 'einloesen', code: CODE }));
    expect(await lies(antwort)).toEqual({ ok: false, error: 'invalid_request' });
    expect(d.kontoAnlegen).not.toHaveBeenCalled();
  });

  it('entfernt ein gerade angelegtes Konto wieder, wenn das Binden scheitert', async () => {
    const d = dienst({
      einloesen: vi.fn(() =>
        Promise.resolve({ ok: false as const, error: 'account_conflict' as const }),
      ),
    });
    const handler = erstelleHandler({ anmeldedienst: d, versand: null, appUrl: '' });
    const antwort = await handler(anfrage(EINLOESEN));
    expect(await lies(antwort)).toEqual({ ok: false, error: 'email_taken' });
    expect(d.kontoEntfernen).toHaveBeenCalledWith(KONTO);
    expect(d.fehlversuch).toHaveBeenCalledWith(HASH);
    expect(d.anmeldecode).not.toHaveBeenCalled();
  });

  it('gibt fuer einen verlorenen Passkey eine Einmal-Anmeldung des gebundenen Kontos (Punkt 12)', async () => {
    const d = dienst({
      nachschlagen: vi.fn(() => Promise.resolve({ ok: true as const, value: RESET })),
    });
    const handler = erstelleHandler({ anmeldedienst: d, versand: null, appUrl: '' });
    const antwort = await handler(anfrage({ aufgabe: 'einloesen', code: CODE }));
    expect(await lies(antwort)).toEqual({
      ok: true,
      value: { purpose: 'reset', organizationName: 'Testpraxis', tokenHash: 'einmal-hash' },
    });
    expect(d.kontoAnlegen).not.toHaveBeenCalled();
    expect(d.einloesen).toHaveBeenCalledWith(HASH, KONTO);
    expect(d.anmeldecode).toHaveBeenCalledWith(KONTO);
  });

  it('loest beim verlorenen Passkey erst ein und meldet dann an (Zweitreview)', async () => {
    const reihenfolge: string[] = [];
    const d = dienst({
      nachschlagen: vi.fn(() => Promise.resolve({ ok: true as const, value: RESET })),
      einloesen: vi.fn(() => {
        reihenfolge.push('einloesen');
        return Promise.resolve({ ok: false as const, error: 'invitation_invalid' as const });
      }),
      anmeldecode: vi.fn(() => {
        reihenfolge.push('anmelden');
        return Promise.resolve({ ok: true as const, value: 'x' });
      }),
    });
    const handler = erstelleHandler({ anmeldedienst: d, versand: null, appUrl: '' });
    expect(await lies(await handler(anfrage(EINLOESEN)))).toEqual({
      ok: false,
      error: 'invitation_invalid',
    });
    // Ein verbrauchter Code meldet niemanden an.
    expect(reihenfolge).toEqual(['einloesen']);
  });

  it('meldet eine nicht erzeugte Einmal-Anmeldung eigens', async () => {
    const d = dienst({
      anmeldecode: vi.fn(() =>
        Promise.resolve({ ok: false as const, error: 'unavailable' as const }),
      ),
    });
    const handler = erstelleHandler({ anmeldedienst: d, versand: null, appUrl: '' });
    const antwort = await handler(anfrage(EINLOESEN));
    expect(antwort.status).toBe(502);
    expect(await lies(antwort)).toEqual({ ok: false, error: 'sign_in_not_created' });
  });

  it('laesst ein neues Konto stehen, wenn offen ist, ob es gebunden wurde', async () => {
    const d = dienst({
      einloesen: vi.fn(() =>
        Promise.resolve({ ok: false as const, error: 'unavailable' as const }),
      ),
    });
    const handler = erstelleHandler({ anmeldedienst: d, versand: null, appUrl: '' });
    expect(await lies(await handler(anfrage(EINLOESEN)))).toEqual({
      ok: false,
      error: 'unavailable',
    });
    expect(d.kontoEntfernen).not.toHaveBeenCalled();
  });

  it('antwortet ohne Einrichtung mit not_configured', async () => {
    const handler = erstelleHandler({ anmeldedienst: null, versand: null, appUrl: '' });
    const antwort = await handler(anfrage(EINLOESEN));
    expect(antwort.status).toBe(503);
    expect(await lies(antwort)).toEqual({ ok: false, error: 'not_configured' });
  });

  it('beantwortet die Vorabanfrage und lehnt andere Methoden ab', async () => {
    const handler = erstelleHandler({ anmeldedienst: dienst(), versand: null, appUrl: '' });
    const vorab = await handler(
      new Request('https://beispiel.invalid/platform-access', { method: 'OPTIONS' }),
    );
    expect(vorab.status).toBe(204);
    const get = await handler(new Request('https://beispiel.invalid/platform-access'));
    expect(get.status).toBe(405);
  });

  it('gibt weder Code noch Adresse in einer Antwort zurueck', async () => {
    const handler = erstelleHandler({ anmeldedienst: dienst(), versand: null, appUrl: '' });
    const text = await (await handler(anfrage(EINLOESEN))).text();
    expect(text).not.toContain(CODE);
    expect(text).not.toContain('max@patient.invalid');
  });
});

describe('Zugangsdienst: versenden', () => {
  const VERSENDEN = { aufgabe: 'versenden', einladungId: EINLADUNG, code: CODE };

  it('schickt die Mail an die Adresse, die der Server nennt', async () => {
    const d = dienst();
    const v = versand();
    const handler = erstelleHandler({
      anmeldedienst: d,
      versand: v,
      appUrl: 'https://praxis.invalid/',
    });
    const antwort = await handler(anfrage(VERSENDEN, { Authorization: 'Bearer sitzung' }));
    expect(antwort.status).toBe(200);
    expect(d.einladungsmail).toHaveBeenCalledWith('Bearer sitzung', EINLADUNG, HASH);
    const nachricht = v.sende.mock.calls[0]![0] as { an: string; text: string };
    expect(nachricht.an).toBe('max@patient.invalid');
    expect(nachricht.text).toContain(`https://praxis.invalid/einladung#code=${CODE}`);
    // Die Antwort nennt die Adresse nicht.
    expect(await antwort.text()).not.toContain('max@patient.invalid');
  });

  it('verlangt eine Sitzung', async () => {
    const d = dienst();
    const handler = erstelleHandler({ anmeldedienst: d, versand: versand(), appUrl: 'x' });
    const antwort = await handler(anfrage(VERSENDEN));
    expect(antwort.status).toBe(401);
    expect(d.einladungsmail).not.toHaveBeenCalled();
  });

  it('meldet einen fehlenden Versandweg, ohne nachzufragen', async () => {
    const d = dienst();
    const handler = erstelleHandler({ anmeldedienst: d, versand: null, appUrl: 'x' });
    const antwort = await handler(anfrage(VERSENDEN, { Authorization: 'Bearer sitzung' }));
    expect(await lies(antwort)).toEqual({ ok: false, error: 'not_configured' });
    expect(d.einladungsmail).not.toHaveBeenCalled();
  });

  it('reicht die Abweisung der Datenbank durch', async () => {
    const d = dienst({
      einladungsmail: vi.fn(() =>
        Promise.resolve({ ok: false as const, error: 'address_changed' as const }),
      ),
    });
    const v = versand();
    const handler = erstelleHandler({ anmeldedienst: d, versand: v, appUrl: 'x' });
    const antwort = await handler(anfrage(VERSENDEN, { Authorization: 'Bearer sitzung' }));
    expect(await lies(antwort)).toEqual({ ok: false, error: 'address_changed' });
    expect(v.sende).not.toHaveBeenCalled();
  });
});

/**
 * ABN-011 (BEF-115): Der Zugangsdienst löscht Plattformkonten über die
 * Admin-API — nur auf Aufruf mit dem Admin-Schlüssel, bestätigt je Konto.
 */
describe('Zugangsdienst: konten_loeschen', () => {
  const ZWEITES = '99999999-9999-4999-8999-000000000002';

  it('weist einen Aufruf ohne den Admin-Schlüssel ab und löscht nichts', async () => {
    const d = dienst({
      loeschauftraege: vi.fn(() => Promise.resolve({ ok: true as const, value: [KONTO] })),
    });
    const handler = erstelleHandler({ anmeldedienst: d, versand: null, appUrl: '' });
    for (const kopf of [{}, { Authorization: 'Bearer falsch' }]) {
      const antwort = await handler(anfrage({ aufgabe: 'konten_loeschen' }, kopf));
      expect(antwort.status).toBe(403);
    }
    expect(d.loeschauftraege).not.toHaveBeenCalled();
    expect(d.kontoEntfernen).not.toHaveBeenCalled();
  });

  it('entfernt jedes Konto und bestätigt es, ein gescheitertes bleibt offen', async () => {
    const d = dienst({
      loeschauftraege: vi.fn(() => Promise.resolve({ ok: true as const, value: [KONTO, ZWEITES] })),
      kontoEntfernen: vi.fn((id: string) =>
        Promise.resolve(
          id === KONTO
            ? { ok: true as const, value: null }
            : { ok: false as const, error: 'unavailable' as const },
        ),
      ),
    });
    const handler = erstelleHandler({ anmeldedienst: d, versand: null, appUrl: '' });
    const antwort = await handler(
      anfrage({ aufgabe: 'konten_loeschen' }, { Authorization: 'Bearer dienst-schluessel' }),
    );
    expect(antwort.status).toBe(200);
    expect(await lies(antwort)).toEqual({ ok: true, value: { deleted: 1, pending: 1 } });
    expect(d.loeschungBestaetigen).toHaveBeenCalledTimes(1);
    expect(d.loeschungBestaetigen).toHaveBeenCalledWith(KONTO);
  });
});
