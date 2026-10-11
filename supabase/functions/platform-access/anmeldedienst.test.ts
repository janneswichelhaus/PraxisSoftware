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

  it('legt Konten ohne Kennwort mit bestaetigter Adresse an und erkennt eine vergebene', async () => {
    const abrufen = mitAntwort(200, { id: 'neu' });
    const dienst = erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen });
    expect(await dienst.kontoAnlegen('a@b.invalid')).toEqual({ ok: true, value: 'neu' });
    // Kein Kennwort im Aufruf (ADR-025 Punkt 9).
    expect(JSON.parse(abrufen.mock.calls[0]![1]!.body as string)).toEqual({
      email: 'a@b.invalid',
      email_confirm: true,
      app_metadata: { platform_account: true },
    });
    expect(kopf(abrufen).Authorization).toBe('Bearer dienst-schluessel');

    const vergeben = erstelleAnmeldedienst({
      ...EINRICHTUNG,
      abrufen: mitAntwort(422, { error_code: 'email_exists' }),
    });
    expect(await vergeben.kontoAnlegen('a@b.invalid')).toEqual({
      ok: false,
      error: 'email_taken',
    });
  });

  it('prueft die Sitzung mit dem oeffentlichen Schluessel und kennt keine ohne Kopf', async () => {
    const abrufen = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'eigenes' })))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ locked: false }])));
    const dienst = erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen });
    expect(await dienst.sitzungskonto('Bearer sitzung')).toEqual({ ok: true, value: 'eigenes' });
    expect(abrufen.mock.calls[0]![0]).toBe('https://instanz.invalid/auth/v1/user');
    expect(kopf(abrufen).apikey).toBe('oeffentlicher-schluessel');
    expect(kopf(abrufen).Authorization).toBe('Bearer sitzung');
    // Die Sitzungssperre fragt die Datenbank, mit der Sitzung der Person.
    expect(abrufen.mock.calls[1]![0]).toBe('https://instanz.invalid/rest/v1/rpc/session_status');
    expect((abrufen.mock.calls[1]![1]!.headers as Record<string, string>).Authorization).toBe(
      'Bearer sitzung',
    );

    // Eine gesperrte Sitzung bindet keinen Code (ADR-025 Punkt 6).
    const gesperrt = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'eigenes' })))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ locked: true, reason: 'inaktiv' }])));
    expect(
      await erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen: gesperrt }).sitzungskonto('Bearer s'),
    ).toEqual({ ok: false, error: 'session_invalid' });

    // Ohne Kopf oder nur mit dem öffentlichen Schlüssel wird gar nicht gefragt.
    const still = mitAntwort(200, { id: 'x' });
    const ohne = erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen: still });
    expect(await ohne.sitzungskonto(null)).toEqual({ ok: true, value: null });
    expect(await ohne.sitzungskonto('Bearer oeffentlicher-schluessel')).toEqual({
      ok: true,
      value: null,
    });
    expect(still).not.toHaveBeenCalled();

    const abgelaufen = erstelleAnmeldedienst({
      ...EINRICHTUNG,
      abrufen: mitAntwort(401, { error_code: 'bad_jwt' }),
    });
    expect(await abgelaufen.sitzungskonto('Bearer alt')).toEqual({ ok: true, value: null });
  });

  it('erzeugt eine Einmal-Anmeldung ohne Mail, nur mit dem Admin-Schluessel', async () => {
    const abrufen = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ id: 'konto', email: 'a@b.invalid' })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ hashed_token: 'einmal-hash', action_link: 'x' })),
      );
    const dienst = erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen });
    expect(await dienst.anmeldecode('konto')).toEqual({ ok: true, value: 'einmal-hash' });
    expect(abrufen.mock.calls[0]![0]).toBe('https://instanz.invalid/auth/v1/admin/users/konto');
    expect(abrufen.mock.calls[1]![0]).toBe('https://instanz.invalid/auth/v1/admin/generate_link');
    expect(JSON.parse(abrufen.mock.calls[1]![1]!.body as string)).toEqual({
      type: 'magiclink',
      email: 'a@b.invalid',
    });
    expect((abrufen.mock.calls[1]![1]!.headers as Record<string, string>).Authorization).toBe(
      'Bearer dienst-schluessel',
    );

    // Die Form des SDK (`properties`) wird ebenso gelesen.
    const sdk = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response(JSON.stringify({ email: 'a@b.invalid' })))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ properties: { hashed_token: 'aus-properties' } })),
      );
    expect(await erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen: sdk }).anmeldecode('k')).toEqual({
      ok: true,
      value: 'aus-properties',
    });

    const ohne = erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen: mitAntwort(404, {}) });
    expect(await ohne.anmeldecode('k')).toEqual({ ok: false, error: 'unavailable' });
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

  /** ABN-011: Löschaufträge abholen, Konto entfernen, bestätigen — alles mit dem Admin-Schlüssel. */
  it('holt Loeschauftraege ab, entfernt ueber die Admin-API und bestaetigt', async () => {
    const auftraege = mitAntwort(200, [{ account_user_id: 'konto-1' }]);
    expect(
      await erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen: auftraege }).loeschauftraege(),
    ).toEqual({ ok: true, value: ['konto-1'] });
    expect(auftraege.mock.calls[0]![0]).toBe(
      'https://instanz.invalid/rest/v1/rpc/claim_platform_account_deletions',
    );
    expect(kopf(auftraege).Authorization).toBe('Bearer dienst-schluessel');

    const entfernen = mitAntwort(200, {});
    expect(
      await erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen: entfernen }).kontoEntfernen('konto-1'),
    ).toEqual({ ok: true, value: null });
    expect(entfernen.mock.calls[0]![0]).toBe('https://instanz.invalid/auth/v1/admin/users/konto-1');
    expect(entfernen.mock.calls[0]![1]!.method).toBe('DELETE');

    // Schon fort: gilt als entfernt.
    expect(
      await erstelleAnmeldedienst({
        ...EINRICHTUNG,
        abrufen: mitAntwort(404, { error_code: 'user_not_found' }),
      }).kontoEntfernen('konto-1'),
    ).toEqual({ ok: true, value: null });

    const bestaetigen = mitAntwort(200, null);
    expect(
      await erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen: bestaetigen }).loeschungBestaetigen(
        'konto-1',
      ),
    ).toEqual({ ok: true, value: null });
    expect(bestaetigen.mock.calls[0]![0]).toBe(
      'https://instanz.invalid/rest/v1/rpc/confirm_platform_account_deletion',
    );
  });

  it('erkennt den Dienstaufruf nur am vollstaendigen Admin-Schluessel', () => {
    const dienst = erstelleAnmeldedienst(EINRICHTUNG);
    expect(dienst.istDienstaufruf('Bearer dienst-schluessel')).toBe(true);
    expect(dienst.istDienstaufruf('Bearer dienst-schluesse')).toBe(false);
    expect(dienst.istDienstaufruf('Bearer oeffentlicher-schluessel')).toBe(false);
    expect(dienst.istDienstaufruf(null)).toBe(false);
  });

  it('meldet einen nicht erreichbaren Dienst als unavailable', async () => {
    const abrufen = vi.fn(() => Promise.reject(new Error('Netz')));
    const dienst = erstelleAnmeldedienst({ ...EINRICHTUNG, abrufen });
    expect(await dienst.nachschlagen('code')).toEqual({ ok: false, error: 'unavailable' });
    expect(await dienst.kontoEntfernen('konto')).toEqual({ ok: false, error: 'unavailable' });
  });
});
