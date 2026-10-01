import { describe, expect, it, vi } from 'vitest';
import { erstelleAnmeldedienst, fehlendeEinrichtung } from './anmeldedienst.ts';

/**
 * Die Aufrufe an die eigene Instanz (POR-003). Geprüft wird, welcher
 * Schlüssel an welchem Aufruf steht und wie die Antworten gelesen werden.
 */

const EINRICHTUNG = {
  supabaseUrl: 'https://instanz.invalid/',
  adminKey: 'dienst-schluessel',
  anonKey: 'oeffentlicher-schluessel',
};

function mitAntwort(status: number, koerper: unknown) {
  return vi.fn<typeof fetch>(() =>
    Promise.resolve(new Response(koerper === null ? '' : JSON.stringify(koerper), { status })),
  );
}

function kopf(abrufen: ReturnType<typeof mitAntwort>): Record<string, string> {
  return abrufen.mock.calls[0]![1]!.headers as Record<string, string>;
}

describe('Anmeldedienst des Zugangsdienstes', () => {
  it('nennt fehlende Einrichtung beim Namen, nicht beim Wert', () => {
    expect(fehlendeEinrichtung({ supabaseUrl: '', adminKey: '', anonKey: 'x' })).toEqual([
      'SUPABASE_URL',
      'PLATFORM_ACCESS_ADMIN_KEY',
    ]);
    expect(fehlendeEinrichtung(EINRICHTUNG)).toEqual([]);
  });

  it('schlaegt mit dem Dienstschluessel nach und liest keine Zeile als ungueltig', async () => {
    const abrufen = mitAntwort(200, []);
    const dienst = erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen });
    expect(await dienst.nachschlagen('code')).toEqual({ ok: true, value: null });
    expect(abrufen.mock.calls[0]![0]).toBe(
      'https://instanz.invalid/rest/v1/rpc/platform_invitation_lookup',
    );
    expect(kopf(abrufen).Authorization).toBe('Bearer dienst-schluessel');
  });

  it('liest eine gefundene Einladung', async () => {
    const abrufen = mitAntwort(200, [
      { purpose: 'reset', account_user_id: 'konto', organization_name: 'Testpraxis' },
    ]);
    const dienst = erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen });
    expect(await dienst.nachschlagen('code')).toEqual({
      ok: true,
      value: { purpose: 'reset', accountUserId: 'konto', organizationName: 'Testpraxis' },
    });
  });

  it('unterscheidet beim Binden Konflikt und ungueltige Einladung', async () => {
    const konflikt = erstelleAnmeldedienst({
      ...EINRICHTUNG,
      abrufen: mitAntwort(400, { message: 'account belongs to another person' }),
    });
    expect(await konflikt.einloesen('code', 'konto')).toEqual({
      ok: false,
      error: 'account_conflict',
    });
    const ungueltig = erstelleAnmeldedienst({
      ...EINRICHTUNG,
      abrufen: mitAntwort(400, { message: 'invitation not valid' }),
    });
    expect(await ungueltig.einloesen('code', 'konto')).toEqual({
      ok: false,
      error: 'invitation_invalid',
    });
    const gebunden = erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen: mitAntwort(200, 'zugang') });
    expect(await gebunden.einloesen('code', 'konto')).toEqual({ ok: true, value: 'zugang' });
  });

  it('legt Konten mit bestaetigter Adresse an und erkennt eine vergebene', async () => {
    const abrufen = mitAntwort(200, { id: 'neu' });
    const dienst = erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen });
    expect(await dienst.kontoAnlegen('a@b.invalid', 'kennwort')).toEqual({
      ok: true,
      value: 'neu',
    });
    expect(JSON.parse(abrufen.mock.calls[0]![1]!.body as string)).toEqual({
      email: 'a@b.invalid',
      password: 'kennwort',
      email_confirm: true,
      app_metadata: { platform_account: true },
    });

    const vergeben = erstelleAnmeldedienst({
      ...EINRICHTUNG,
      abrufen: mitAntwort(422, { error_code: 'email_exists' }),
    });
    expect(await vergeben.kontoAnlegen('a@b.invalid', 'k')).toEqual({
      ok: false,
      error: 'email_taken',
    });
    const schwach = erstelleAnmeldedienst({
      ...EINRICHTUNG,
      abrufen: mitAntwort(422, { error_code: 'weak_password' }),
    });
    expect(await schwach.kontoAnlegen('a@b.invalid', 'k')).toEqual({
      ok: false,
      error: 'weak_password',
    });
  });

  it('prueft ein Kennwort mit dem oeffentlichen Schluessel und beendet die Sitzung wieder', async () => {
    const abrufen = mitAntwort(200, { access_token: 'zugriff', user: { id: 'bestehend' } });
    const dienst = erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen });
    expect(await dienst.kennwortPruefen('a@b.invalid', 'k')).toEqual({
      ok: true,
      value: 'bestehend',
    });
    expect(kopf(abrufen).apikey).toBe('oeffentlicher-schluessel');
    expect(kopf(abrufen).Authorization).toBeUndefined();
    // Zweitreview: Die Sitzung aus der Prüfung wird sofort beendet.
    expect(abrufen.mock.calls[1]![0]).toBe('https://instanz.invalid/auth/v1/logout?scope=local');
    expect((abrufen.mock.calls[1]![1]!.headers as Record<string, string>).Authorization).toBe(
      'Bearer zugriff',
    );

    const falsch = erstelleAnmeldedienst({
      ...EINRICHTUNG,
      abrufen: mitAntwort(400, { error: 'invalid_grant' }),
    });
    expect(await falsch.kennwortPruefen('a@b.invalid', 'k')).toEqual({ ok: true, value: null });
  });

  it('fragt die Adresse mit der Sitzung der einladenden Person an, nicht mit dem Dienstschluessel', async () => {
    const abrufen = mitAntwort(200, [
      { email: 'max@patient.invalid', organization_name: 'Testpraxis', expires_at: '2026-10-14' },
    ]);
    const dienst = erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen });
    expect(await dienst.einladungsmail('Bearer sitzung', 'einladung', 'code')).toEqual({
      ok: true,
      value: {
        email: 'max@patient.invalid',
        organizationName: 'Testpraxis',
        expiresAt: '2026-10-14',
      },
    });
    expect(kopf(abrufen).Authorization).toBe('Bearer sitzung');
    expect(kopf(abrufen).apikey).toBe('oeffentlicher-schluessel');

    for (const [status, koerper, erwartet] of [
      [403, null, 'not_allowed'],
      [401, null, 'session_invalid'],
      [400, { message: 'address changed since invitation' }, 'address_changed'],
      [503, null, 'unavailable'],
    ] as const) {
      const d = erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen: mitAntwort(status, koerper) });
      expect(await d.einladungsmail('Bearer s', 'e', 'c')).toEqual({ ok: false, error: erwartet });
    }
  });

  it('meldet einen nicht erreichbaren Dienst als unavailable', async () => {
    const abrufen = vi.fn(() => Promise.reject(new Error('Netz')));
    const dienst = erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen });
    expect(await dienst.nachschlagen('code')).toEqual({ ok: false, error: 'unavailable' });
    expect(await dienst.kontoEntfernen('konto')).toEqual({ ok: false, error: 'unavailable' });
  });
});
