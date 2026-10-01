import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';
import { EinloeseError, codeAusFragment } from './einladung';

/**
 * Eine Einladung zur Plattform einlösen (POR-003, ADR-023 Punkte 7 und 8).
 *
 * Der Zugangsdienst ist hier eingesetzt. Geprüft wird, dass der Code aus
 * der Adresszeile verschwindet, dass jeder ungültige Code dieselbe Auskunft
 * bekommt und dass nach dem Einrichten gewöhnlich angemeldet wird.
 */

const CODE = 'AbCdEfGhIjKlMnOpQrStUvWxYz012345';
const invoke = vi.fn();
const signInWithPassword = vi.fn();
const signOut = vi.fn();
const navigate = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ functions: { invoke }, auth: { signInWithPassword, signOut } }),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
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

async function ausfuellen(email = 'max@patient.invalid', kennwort = 'ein-langes-kennwort') {
  const nutzer = userEvent.setup();
  await nutzer.type(screen.getByLabelText('E-Mail-Adresse'), email);
  await nutzer.type(screen.getByLabelText(/^Kennwort$/), kennwort);
  await nutzer.type(screen.getByLabelText('Kennwort wiederholen'), kennwort);
  await nutzer.click(screen.getByRole('button', { name: 'Zugang einrichten' }));
}

beforeEach(() => {
  sitzung = null;
  invoke.mockReset().mockResolvedValue({
    data: { ok: true, value: { purpose: 'activate', organizationName: 'Testpraxis' } },
    error: null,
  });
  signInWithPassword.mockReset().mockResolvedValue({ error: null });
  signOut.mockReset().mockResolvedValue({ error: null });
  navigate.mockReset();
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
  it('nimmt den Code aus der Adresszeile', async () => {
    oeffne(`#code=${CODE}`);
    await waitFor(() => expect(window.location.hash).toBe(''));
    expect(screen.getByRole('button', { name: 'Zugang einrichten' })).toBeInTheDocument();
  });

  it('richtet den Zugang ein und meldet danach gewoehnlich an', async () => {
    oeffne(`#code=${CODE}`);
    await ausfuellen(' Max@Patient.invalid ');
    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(invoke).toHaveBeenCalledWith('platform-access', {
      body: {
        aufgabe: 'einloesen',
        code: CODE,
        email: 'max@patient.invalid',
        kennwort: 'ein-langes-kennwort',
      },
    });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: 'max@patient.invalid',
      password: 'ein-langes-kennwort',
    });
  });

  it('sagt ohne Code dasselbe wie bei einem ungueltigen', async () => {
    oeffne('');
    expect(await screen.findByText('Diese Einladung lässt sich nicht verwenden.')).toBeVisible();
  });

  it('zeigt fuer einen abgelehnten Code dieselbe Auskunft', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new Error('400'),
      response: new Response(JSON.stringify({ ok: false, error: 'invitation_invalid' }), {
        status: 400,
      }),
    });
    oeffne(`#code=${CODE}`);
    await ausfuellen();
    expect(await screen.findByText('Diese Einladung lässt sich nicht verwenden.')).toBeVisible();
    expect(signInWithPassword).not.toHaveBeenCalled();
  });

  it('fuehrt bei einer vergebenen Adresse an das Feld zurueck', async () => {
    invoke.mockResolvedValue({
      data: null,
      error: new Error('409'),
      response: new Response(JSON.stringify({ ok: false, error: 'email_taken' }), {
        status: 409,
      }),
    });
    oeffne(`#code=${CODE}`);
    await ausfuellen();
    expect(await screen.findByText(/gibt es schon ein Konto/)).toBeVisible();
  });

  it('prueft das Kennwort vor dem Absenden (ANN-027)', async () => {
    oeffne(`#code=${CODE}`);
    await ausfuellen('max@patient.invalid', 'kurz');
    expect(invoke).not.toHaveBeenCalled();
  });

  it('sagt bei einem nicht erreichbaren Dienst, dass der Code nicht verbraucht ist', async () => {
    invoke.mockResolvedValue({ data: null, error: new Error('Netz') });
    oeffne(`#code=${CODE}`);
    await ausfuellen();
    expect(await screen.findByText(/nicht verbraucht/)).toBeVisible();
  });

  it('fragt erst, wenn schon jemand angemeldet ist', async () => {
    sitzung = { user: { id: 'x', email: 'olivia.office@praxis.invalid' } };
    oeffne(`#code=${CODE}`);
    expect(await screen.findByText(/olivia.office@praxis.invalid angemeldet/)).toBeVisible();
    await userEvent
      .setup()
      .click(screen.getByRole('button', { name: 'Abmelden und Zugang einrichten' }));
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: 'local' }));
  });

  it('kennt eine Fehlerklasse als Eigenschaft', () => {
    expect(new EinloeseError('email_taken').art).toBe('email_taken');
  });
});
