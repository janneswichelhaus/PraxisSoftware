import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Das Passkey-Modul (SEC-EPIC-002, ADR-025 Punkt 10): die Prüfung am Gerät
 * wird verlangt, nicht nur gewünscht, und jeder Fehler wird ein Satz, der
 * nichts über fremde Konten verrät.
 */

const signInWithPasskey = vi.fn();
const registerPasskey = vi.fn();
const list = vi.fn();
const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc, auth: { signInWithPasskey, registerPasskey, passkey: { list } } }),
}));

const { anmeldenMitPasskey, passkeyEinrichten, ladePasskeys, PASSKEY_SAETZE, PasskeyFehler } =
  await import('./passkey');

const holenImBrowser = vi.fn((_o?: CredentialRequestOptions) => Promise.resolve(null));
const anlegenImBrowser = vi.fn((_o?: CredentialCreationOptions) => Promise.resolve(null));

beforeEach(() => {
  signInWithPasskey.mockReset();
  registerPasskey.mockReset();
  list.mockReset();
  rpc.mockReset().mockResolvedValue({ data: null, error: null });
  holenImBrowser.mockClear();
  anlegenImBrowser.mockClear();
  vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
  Object.defineProperty(navigator, 'credentials', {
    configurable: true,
    value: Object.create({ get: holenImBrowser, create: anlegenImBrowser }),
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Prüfung am Gerät (userVerification: required)', () => {
  it('verlangt sie bei der Anmeldung, auch wenn der Server sie nur bevorzugt', async () => {
    signInWithPasskey.mockImplementation(async () => {
      await navigator.credentials.get({
        publicKey: { challenge: new Uint8Array(1), userVerification: 'preferred' },
      });
      return { data: {}, error: null };
    });
    await anmeldenMitPasskey();
    expect(holenImBrowser.mock.calls[0]![0]!.publicKey!.userVerification).toBe('required');
  });

  it('verlangt sie beim Einrichten', async () => {
    registerPasskey.mockImplementation(async () => {
      await navigator.credentials.create({
        publicKey: {
          challenge: new Uint8Array(1),
          rp: { name: 'Praxis' },
          user: { id: new Uint8Array(1), name: 'a', displayName: 'a' },
          pubKeyCredParams: [],
          authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
        },
      });
      return { data: { id: 'neu' }, error: null };
    });
    await passkeyEinrichten();
    // Sofort freigegeben (ANN-329).
    expect(rpc).toHaveBeenCalledWith('approve_own_passkey', { p_credential_id: 'neu' });
    const auswahl = anlegenImBrowser.mock.calls[0]![0]!.publicKey!.authenticatorSelection!;
    expect(auswahl.userVerification).toBe('required');
    expect(auswahl.residentKey).toBe('required');
  });

  it('gibt danach die Funktionen des Browsers unverändert zurück', async () => {
    signInWithPasskey.mockResolvedValue({ data: {}, error: null });
    await anmeldenMitPasskey();
    expect(Object.hasOwn(navigator.credentials, 'get')).toBe(false);
    expect(Object.hasOwn(navigator.credentials, 'create')).toBe(false);
  });

  it('räumt auch nach einem Fehlschlag auf', async () => {
    signInWithPasskey.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(anmeldenMitPasskey()).rejects.toBeInstanceOf(PasskeyFehler);
    expect(Object.hasOwn(navigator.credentials, 'get')).toBe(false);
  });
});

describe('Fehler als Satz', () => {
  it.each([
    [
      { name: 'NotAllowedError', code: 'ERROR_PASSTHROUGH_SEE_CAUSE_PROPERTY' },
      PASSKEY_SAETZE.abgebrochen,
    ],
    [{ name: 'WebAuthnError', code: 'ERROR_CEREMONY_ABORTED' }, PASSKEY_SAETZE.abgebrochen],
    [{ name: 'WebAuthnError', code: 'ERROR_INVALID_RP_ID' }, PASSKEY_SAETZE.geraet],
    [{ name: 'AuthApiError', status: 404, code: 'passkey_disabled' }, PASSKEY_SAETZE.ausgeschaltet],
    [
      { name: 'AuthApiError', status: 400, code: 'webauthn_verification_failed' },
      PASSKEY_SAETZE.nichtAngenommen,
    ],
    [
      { name: 'AuthRetryableFetchError', status: 0 },
      'Keine Verbindung zum Anmeldedienst. Ihre Angaben wurden nicht geprüft.',
    ],
  ])('%o ergibt den passenden Satz', async (fehler, satz) => {
    signInWithPasskey.mockResolvedValue({ data: null, error: { message: 'x', ...fehler } });
    await expect(anmeldenMitPasskey()).rejects.toThrow(satz);
  });

  it('nennt einen schon eingerichteten Passkey beim Einrichten', async () => {
    registerPasskey.mockResolvedValue({
      data: null,
      error: {
        name: 'WebAuthnError',
        code: 'ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED',
        message: 'x',
      },
    });
    await expect(passkeyEinrichten()).rejects.toThrow(PASSKEY_SAETZE.schonEingerichtet);
  });

  it('ruft ohne WebAuthn den Anmeldedienst gar nicht erst an', async () => {
    vi.unstubAllGlobals();
    vi.stubGlobal('PublicKeyCredential', undefined);
    await expect(anmeldenMitPasskey()).rejects.toThrow(PASSKEY_SAETZE.nichtUnterstuetzt);
    expect(signInWithPasskey).not.toHaveBeenCalled();
  });
});

describe('Liste der Passkeys', () => {
  it('liefert nur, was die Seite zeigt', async () => {
    list.mockResolvedValue({
      data: [
        { id: 'p1', friendly_name: 'iPhone', created_at: '2026-10-10T08:00:00Z' },
        { id: 'p2', created_at: '2026-10-10T09:00:00Z' },
      ],
      error: null,
    });
    rpc.mockResolvedValue({ data: ['p1'], error: null });
    expect(await ladePasskeys()).toEqual([
      {
        id: 'p1',
        name: 'iPhone',
        angelegtAm: '2026-10-10T08:00:00Z',
        zuletztAm: null,
        freigegeben: true,
      },
      {
        id: 'p2',
        name: null,
        angelegtAm: '2026-10-10T09:00:00Z',
        zuletztAm: null,
        freigegeben: false,
      },
    ]);
  });

  it('meldet einen nicht freigegebenen Passkey nach dem Einrichten', async () => {
    registerPasskey.mockResolvedValue({ data: { id: 'neu' }, error: null });
    rpc.mockResolvedValue({ data: null, error: { message: 'passkey not approvable' } });
    await expect(passkeyEinrichten()).rejects.toThrow(PASSKEY_SAETZE.nichtFreigegeben);
  });
});
