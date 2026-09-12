import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';

/**
 * Die Seite, die es bis FIX-001 nicht gab (F3).
 *
 * `LoginPage.test.tsx` prüfte, dass eine Mail **angefordert** wird. Was danach
 * passiert, prüfte nichts — und genau dort lag die Lücke: Der Link hatte
 * nirgends einen Empfänger, `/kennwort-neu` war eine Adresse ohne Route.
 *
 * Deshalb wird hier nicht die Anfrage geprüft, sondern der **Empfang**.
 */

const verifyOtp = vi.fn();
const updateUser = vi.fn();
const rpc = vi.fn();
const navigate = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc, auth: { verifyOtp, updateUser } }),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
}));

let sitzung: { user: { id: string } } | null = null;

vi.mock('./sessionContext', () => ({
  useSession: () => ({ session: sitzung, initialising: false, signOut: vi.fn() }),
}));

const { KennwortNeuPage } = await import('./KennwortNeuPage');

const HASH = 'abcdef0123456789';
const MIT_LINK = `/kennwort-neu?token_hash=${HASH}&type=recovery`;

beforeEach(() => {
  sitzung = null;
  verifyOtp.mockReset().mockResolvedValue({ error: null });
  updateUser.mockReset().mockResolvedValue({ error: null });
  rpc.mockReset().mockResolvedValue({ error: null });
  navigate.mockReset();
});

describe('KennwortNeuPage — den Link einlösen', () => {
  it('tauscht den Hash aus der Adresszeile gegen eine Sitzung', async () => {
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);

    await waitFor(() =>
      expect(verifyOtp).toHaveBeenCalledWith({ token_hash: HASH, type: 'recovery' }),
    );
  });

  it('zeigt das Formular erst, nachdem der Link eingelöst ist', async () => {
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);

    expect(await screen.findByLabelText(/Neues Kennwort$/)).toBeInTheDocument();
  });

  it('sagt bei einem abgelaufenen oder benutzten Link, was zu tun ist — ohne zu verraten, ob es das Konto gibt', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Email link is invalid or has expired' } });
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);

    expect(
      await screen.findByText('Dieser Link lässt sich nicht mehr verwenden.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Fordern Sie auf der Anmeldemaske einen neuen an/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Neues Kennwort$/)).not.toBeInTheDocument();
  });

  it('löst ohne Hash gar nichts ein, statt einen leeren Aufruf zu schicken', async () => {
    renderWithProviders(<KennwortNeuPage />, '/kennwort-neu');

    expect(
      await screen.findByText('Dieser Link lässt sich nicht mehr verwenden.'),
    ).toBeInTheDocument();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('verbrennt den einmaligen Hash nicht durch einen zweiten Versuch', async () => {
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);
    await screen.findByLabelText(/Neues Kennwort$/);

    expect(verifyOtp).toHaveBeenCalledOnce();
  });
});

describe('KennwortNeuPage — das Kennwort setzen', () => {
  async function formularZeigen() {
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);
    await screen.findByLabelText(/Neues Kennwort$/);
  }

  it('verlangt dieselbe Mindestlänge wie „Mein Konto" (ANN-027)', async () => {
    await formularZeigen();

    await userEvent.type(screen.getByLabelText(/Neues Kennwort$/), 'zu-kurz');
    await userEvent.type(screen.getByLabelText(/wiederholen/), 'zu-kurz');
    await userEvent.click(screen.getByRole('button', { name: 'Kennwort setzen' }));

    expect(screen.getByText('Das Kennwort braucht mindestens 12 Zeichen.')).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('weist zwei verschiedene Eingaben ab', async () => {
    await formularZeigen();

    await userEvent.type(screen.getByLabelText(/Neues Kennwort$/), 'ein-langes-kennwort');
    await userEvent.type(screen.getByLabelText(/wiederholen/), 'ein-anderes-kennwort');
    await userEvent.click(screen.getByRole('button', { name: 'Kennwort setzen' }));

    expect(screen.getByText('Die beiden Eingaben stimmen nicht überein.')).toBeInTheDocument();
    expect(updateUser).not.toHaveBeenCalled();
  });

  it('setzt das Kennwort und bestätigt sichtbar, statt still weiterzuspringen', async () => {
    await formularZeigen();

    await userEvent.type(screen.getByLabelText(/Neues Kennwort$/), 'ein-langes-kennwort');
    await userEvent.type(screen.getByLabelText(/wiederholen/), 'ein-langes-kennwort');
    await userEvent.click(screen.getByRole('button', { name: 'Kennwort setzen' }));

    expect(await screen.findByText(/Das Kennwort ist gesetzt/)).toBeInTheDocument();
    expect(updateUser).toHaveBeenCalledWith({ password: 'ein-langes-kennwort' });
  });

  it('sagt, dass andere Geräte angemeldet bleiben, und wo man das ändert', async () => {
    await formularZeigen();

    await userEvent.type(screen.getByLabelText(/Neues Kennwort$/), 'ein-langes-kennwort');
    await userEvent.type(screen.getByLabelText(/wiederholen/), 'ein-langes-kennwort');
    await userEvent.click(screen.getByRole('button', { name: 'Kennwort setzen' }));

    expect(await screen.findByText(/Andere Geräte bleiben angemeldet/)).toBeInTheDocument();
  });

  it('protokolliert die Änderung wie jede andere Kennwortänderung', async () => {
    await formularZeigen();

    await userEvent.type(screen.getByLabelText(/Neues Kennwort$/), 'ein-langes-kennwort');
    await userEvent.type(screen.getByLabelText(/wiederholen/), 'ein-langes-kennwort');
    await userEvent.click(screen.getByRole('button', { name: 'Kennwort setzen' }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith('log_account_security_event', {
        p_event: 'password_changed',
      }),
    );
  });

  it('bleibt auf der Seite, wenn das Setzen scheitert', async () => {
    updateUser.mockResolvedValue({ error: { message: 'weak password' } });
    await formularZeigen();

    await userEvent.type(screen.getByLabelText(/Neues Kennwort$/), 'ein-langes-kennwort');
    await userEvent.type(screen.getByLabelText(/wiederholen/), 'ein-langes-kennwort');
    await userEvent.click(screen.getByRole('button', { name: 'Kennwort setzen' }));

    expect(await screen.findByText(/konnte nicht geändert werden/)).toBeInTheDocument();
    expect(screen.queryByText(/Das Kennwort ist gesetzt/)).not.toBeInTheDocument();
  });
});

describe('KennwortNeuPage — die Befunde aus dem Review', () => {
  it('nennt einen Verbindungsfehler als solchen, statt den Link für verbraucht zu erklären', async () => {
    // Ein Funkloch als "Link verbraucht" auszugeben brächte jemanden dazu,
    // einen noch gültigen Link wegzuwerfen (Checkliste Punkt 6).
    verifyOtp.mockResolvedValue({
      error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' },
    });
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);

    expect(
      await screen.findByText('Der Anmeldedienst ist gerade nicht erreichbar.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ihr Link ist deswegen nicht verbraucht/)).toBeInTheDocument();
    expect(
      screen.queryByText('Dieser Link lässt sich nicht mehr verwenden.'),
    ).not.toBeInTheDocument();
  });

  it('löst nach einem Verbindungsfehler auf Knopfdruck erneut ein', async () => {
    verifyOtp.mockResolvedValue({
      error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' },
    });
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);
    await screen.findByRole('button', { name: 'Erneut versuchen' });

    verifyOtp.mockResolvedValue({ error: null });
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    expect(await screen.findByLabelText(/Neues Kennwort$/)).toBeInTheDocument();
    expect(verifyOtp).toHaveBeenCalledTimes(2);
  });

  it('fragt erst, wenn auf dem Gerät schon jemand angemeldet ist', async () => {
    sitzung = { user: { id: 'olivia' } };
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);

    expect(
      await screen.findByText(/Auf diesem Gerät ist bereits jemand angemeldet/),
    ).toBeInTheDocument();
    expect(verifyOtp).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(/Neues Kennwort$/)).not.toBeInTheDocument();
  });

  it('löst nach ausdrücklicher Bestätigung ein', async () => {
    sitzung = { user: { id: 'olivia' } };
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);
    await screen.findByRole('button', { name: 'Trotzdem fortfahren' });

    await userEvent.click(screen.getByRole('button', { name: 'Trotzdem fortfahren' }));

    expect(await screen.findByLabelText(/Neues Kennwort$/)).toBeInTheDocument();
  });

  it('lässt die laufende Sitzung in Ruhe, wenn man sich dafür entscheidet', async () => {
    sitzung = { user: { id: 'olivia' } };
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);
    await screen.findByRole('button', { name: 'Angemeldet bleiben' });

    await userEvent.click(screen.getByRole('button', { name: 'Angemeldet bleiben' }));

    expect(verifyOtp).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith('/', { replace: true });
  });
});
