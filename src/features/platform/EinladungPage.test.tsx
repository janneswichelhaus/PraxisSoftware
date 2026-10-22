import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';
import { EinloeseError, codeAusFragment } from './einladung';
import type * as PasskeyModul from '@/features/auth/passkey';
import type * as PinModul from '@/features/auth/appPin';

/**
 * Eine Einladung zur Plattform einlösen (POR-003; ADR-023 Fassung 4,
 * Punkte 7 und 8; ADR-025 Fassung 2, Punkt 13).
 *
 * Der Zugangsdienst ist hier eingesetzt. Geprüft wird, dass der Code aus der
 * Adresszeile verschwindet, dass jeder ungültige Code dieselbe Auskunft
 * bekommt, dass es kein Kennwort gibt und dass nach dem Einlösen mit der
 * Einmal-Anmeldung angemeldet und Passkey und PIN eingerichtet werden.
 */

const CODE = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const invoke = vi.fn();
const verifyOtp = vi.fn();
const signOut = vi.fn();
const navigate = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ functions: { invoke }, auth: { verifyOtp, signOut } }),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
}));

const anmeldenMitPasskey = vi.fn<() => Promise<void>>();
const passkeyEinrichten = vi.fn<() => Promise<void>>();
vi.mock('@/features/auth/passkey', async (importOriginal) => ({
  ...(await importOriginal<typeof PasskeyModul>()),
  anmeldenMitPasskey: () => anmeldenMitPasskey(),
  passkeyEinrichten: () => passkeyEinrichten(),
  passkeyMoeglich: () => true,
}));

const hatPin = vi.fn<() => Promise<boolean>>();
const setzePin = vi.fn<(pin: string) => Promise<void>>();
vi.mock('@/features/auth/appPin', async (importOriginal) => ({
  ...(await importOriginal<typeof PinModul>()),
  hatPin: () => hatPin(),
  setzePin: (pin: string) => setzePin(pin),
}));

let sitzung: { user: { id: string; email?: string } } | null = null;

vi.mock('@/features/auth/sessionContext', () => ({
  useSession: () => ({ session: sitzung, initialising: false, signOut: vi.fn() }),
}));

const { EinladungPage } = await import('./EinladungPage');

function oeffne(fragment: string) {
  window.history.replaceState(null, '', `/einladung${fragment}`);
  return renderWithProviders(<EinladungPage />, `/einladung${fragment}`);
}

async function ausfuellen(email = 'max@patient.invalid') {
  const nutzer = userEvent.setup();
  await nutzer.type(screen.getByLabelText('E-Mail-Adresse'), email);
  await nutzer.click(screen.getByRole('button', { name: 'Weiter' }));
}

function antwort(koerper: unknown, status: number) {
  return {
    data: null,
    error: new Error(String(status)),
    response: new Response(JSON.stringify(koerper), { status }),
  };
}

beforeEach(() => {
  sitzung = null;
  invoke.mockReset().mockResolvedValue({
    data: {
      ok: true,
      value: { purpose: 'activate', organizationName: 'Testpraxis', tokenHash: 'einmal-hash' },
    },
    error: null,
  });
  verifyOtp.mockReset().mockResolvedValue({ error: null });
  signOut.mockReset().mockResolvedValue({ error: null });
  navigate.mockReset();
  anmeldenMitPasskey.mockReset().mockResolvedValue(undefined);
  passkeyEinrichten.mockReset().mockResolvedValue(undefined);
  hatPin.mockReset().mockResolvedValue(false);
  setzePin.mockReset().mockResolvedValue(undefined);
});

describe('codeAusFragment', () => {
  it('liest nur einen Code in der erwarteten Form', () => {
    expect(codeAusFragment(`#code=${CODE}`)).toBe(CODE);
    expect(codeAusFragment('#code=kurz')).toBeNull();
    expect(codeAusFragment('')).toBeNull();
    expect(codeAusFragment('#code=<script>')).toBeNull();
  });
});

describe('EinladungPage', () => {
  it('nimmt den Code aus der Adresszeile und fragt kein Kennwort', async () => {
    oeffne(`#code=${CODE}`);
    await waitFor(() => expect(window.location.hash).toBe(''));
    expect(screen.getByRole('button', { name: 'Weiter' })).toBeInTheDocument();
    expect(screen.queryByLabelText(/Kennwort/)).toBeNull();
  });

  it('löst ein, meldet mit der Einmal-Anmeldung an und richtet Passkey und PIN ein', async () => {
    const nutzer = userEvent.setup();
    oeffne(`#code=${CODE}`);
    await ausfuellen(' Max@Patient.invalid ');
    expect(invoke).toHaveBeenCalledWith('platform-access', {
      body: { aufgabe: 'einloesen', code: CODE, email: 'max@patient.invalid' },
    });
    await waitFor(() =>
      expect(verifyOtp).toHaveBeenCalledWith({ token_hash: 'einmal-hash', type: 'magiclink' }),
    );

    await nutzer.click(
      await screen.findByRole('button', { name: 'Passkey auf diesem Gerät einrichten' }),
    );
    // DR-105: der Ort für einen zweiten Passkey in den Wörtern der Plattform.
    expect(
      screen.getByText(/unter „Ich → Einstellungen → Passkey und PIN“ einen zweiten Passkey ein/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Mein Konto/)).toBeNull();
    expect(passkeyEinrichten).toHaveBeenCalledTimes(1);
    await nutzer.type(await screen.findByLabelText(/^Neue PIN/), '483920');
    await nutzer.type(screen.getByLabelText('PIN wiederholen'), '483920');
    await nutzer.click(screen.getByRole('button', { name: 'PIN festlegen und fertig' }));
    await waitFor(() => expect(setzePin).toHaveBeenCalledWith('483920'));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('richtet beim verlorenen Passkey einen neuen auf diesem Gerät ein, die PIN bleibt', async () => {
    hatPin.mockResolvedValue(true);
    invoke.mockResolvedValue({
      data: {
        ok: true,
        value: { purpose: 'reset', organizationName: 'Testpraxis', tokenHash: 'einmal-hash' },
      },
      error: null,
    });
    const nutzer = userEvent.setup();
    oeffne(`#code=${CODE}`);
    await ausfuellen();
    await nutzer.click(
      await screen.findByRole('button', { name: 'Passkey auf diesem Gerät einrichten' }),
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(setzePin).not.toHaveBeenCalled();
  });

  it('sagt ohne Code dasselbe wie bei einem ungueltigen', async () => {
    oeffne('');
    expect(await screen.findByText('Diese Einladung lässt sich nicht verwenden.')).toBeVisible();
  });

  it('zeigt fuer einen abgelehnten Code dieselbe Auskunft', async () => {
    invoke.mockResolvedValue(antwort({ ok: false, error: 'invitation_invalid' }, 400));
    oeffne(`#code=${CODE}`);
    await ausfuellen();
    expect(await screen.findByText('Diese Einladung lässt sich nicht verwenden.')).toBeVisible();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('führt bei einer vergebenen Adresse über den Passkey zum eigenen Konto', async () => {
    invoke
      .mockResolvedValueOnce(antwort({ ok: false, error: 'email_taken' }, 409))
      .mockResolvedValueOnce({
        data: { ok: true, value: { purpose: 'activate', organizationName: 'T', tokenHash: null } },
        error: null,
      });
    oeffne(`#code=${CODE}`);
    await ausfuellen();
    expect(await screen.findByText(/gibt es schon ein Konto/)).toBeVisible();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Mit Passkey anmelden und einlösen' }));
    await waitFor(() => expect(anmeldenMitPasskey).toHaveBeenCalledTimes(1));
    // Mit Sitzung ohne Adresse: Der Dienst nimmt das angemeldete Konto.
    await waitFor(() =>
      expect(invoke).toHaveBeenLastCalledWith('platform-access', {
        body: { aufgabe: 'einloesen', code: CODE, email: '' },
      }),
    );
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('sagt, wenn die Einmal-Anmeldung nicht gelang - der Code ist verbraucht', async () => {
    invoke.mockResolvedValue(antwort({ ok: false, error: 'sign_in_not_created' }, 502));
    oeffne(`#code=${CODE}`);
    await ausfuellen();
    expect(
      await screen.findByText('Der Zugang ist eingerichtet, die Anmeldung gelang aber nicht.'),
    ).toBeVisible();
  });

  it('sagt bei einem nicht erreichbaren Dienst, dass der Code nicht verbraucht ist', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Netz') });
    oeffne(`#code=${CODE}`);
    await ausfuellen();
    expect(await screen.findByText(/nicht verbraucht/)).toBeVisible();
  });

  it('löst mit bestehender Sitzung für dieses Konto ein oder meldet ab', async () => {
    sitzung = { user: { id: 'x', email: 'max@patient.invalid' } };
    invoke.mockResolvedValue({
      data: { ok: true, value: { purpose: 'activate', organizationName: 'T', tokenHash: null } },
      error: null,
    });
    oeffne(`#code=${CODE}`);
    // Ohne Adresse: Die Seite liegt vor der Sitzungssperre (ADR-025 Punkt 3).
    expect(await screen.findByText(/bereits ein Konto angemeldet/)).toBeVisible();
    expect(screen.queryByText(/max@patient.invalid/)).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Abmelden und neues Konto einrichten' }),
    ).toBeInTheDocument();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Für dieses Konto einlösen' }));
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('löst mit gesperrter Sitzung nicht ein und sagt warum (ADR-025 Punkt 6)', async () => {
    sitzung = { user: { id: 'x', email: 'max@patient.invalid' } };
    invoke.mockResolvedValue(antwort({ ok: false, error: 'session_invalid' }, 401));
    oeffne(`#code=${CODE}`);
    await userEvent
      .setup()
      .click(await screen.findByRole('button', { name: 'Für dieses Konto einlösen' }));
    expect(await screen.findByText(/auf diesem Gerät gesperrt/)).toBeVisible();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('kennt eine Fehlerklasse als Eigenschaft', () => {
    expect(new EinloeseError('email_taken').art).toBe('email_taken');
  });
});
