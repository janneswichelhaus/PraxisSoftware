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

let sitzung: { user: { id: string; email?: string } } | null = null;

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
      await screen.findByText(/Auf diesem Gerät ist bereits ein Konto angemeldet/),
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

    // Ein Seitenwechsel, also ein Link (AUTH-12) - er ersetzt den Eintrag im
    // Verlauf, damit „Zurück" nicht wieder auf den Link führt.
    const bleiben = await screen.findByRole('link', { name: 'Angemeldet bleiben' });
    expect(bleiben).toHaveAttribute('href', '/');
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe('KennwortNeuPage — UXR-002', () => {
  it('nennt das angemeldete Konto, statt einen anderen Zugang zu behaupten (AUTH-04)', async () => {
    sitzung = { user: { id: 'olivia', email: 'olivia.office@praxis.invalid' } };
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);

    const hinweis = await screen.findByText(/olivia\.office@praxis\.invalid/);
    expect(hinweis).toHaveTextContent(
      'Auf diesem Gerät ist olivia.office@praxis.invalid angemeldet. Gehört der Link zu einem anderen Konto, endet diese Sitzung; nicht gespeicherte Eingaben gehen dann verloren.',
    );
    expect(hinweis).not.toHaveTextContent('eines anderen Zugangs');
  });

  it('führt nach einem gescheiterten Link zurück in die bestehende Sitzung (AUTH-04)', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Email link is invalid or has expired' } });
    sitzung = { user: { id: 'olivia', email: 'olivia.office@praxis.invalid' } };
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);
    await userEvent.click(await screen.findByRole('button', { name: 'Trotzdem fortfahren' }));

    expect(
      await screen.findByText('Dieser Link lässt sich nicht mehr verwenden.'),
    ).toBeInTheDocument();
    expect(screen.getByText(/nach dem Abmelden auf der Anmeldemaske/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zurück zur Anwendung' })).toHaveAttribute('href', '/');
    expect(screen.queryByRole('button', { name: 'Zur Anmeldung' })).toBeNull();
  });

  it('nennt dem Passwortmanager das Konto zu den Kennwortfeldern (AUTH-05)', async () => {
    sitzung = { user: { id: 'anna', email: 'anna.beispiel@praxis.invalid' } };
    const { container } = renderWithProviders(<KennwortNeuPage />, MIT_LINK);
    await userEvent.click(await screen.findByRole('button', { name: 'Trotzdem fortfahren' }));
    await screen.findByLabelText(/Neues Kennwort$/);

    const benutzername = container.querySelector('input[autocomplete="username"]');
    expect(benutzername).toHaveValue('anna.beispiel@praxis.invalid');
    expect(benutzername).toHaveAttribute('hidden');
    expect(screen.getByText('anna.beispiel@praxis.invalid')).toBeInTheDocument();
  });

  it('stellt „zu kurz" an das erste Feld und setzt den Fokus dorthin (AUTH-10)', async () => {
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);
    const erstes = await screen.findByLabelText(/Neues Kennwort$/);

    await userEvent.type(erstes, 'zu-kurz');
    await userEvent.type(screen.getByLabelText(/wiederholen/), 'zu-kurz');
    await userEvent.click(screen.getByRole('button', { name: 'Kennwort setzen' }));

    expect(erstes).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText(/wiederholen/)).not.toHaveAttribute('aria-invalid');
    expect(erstes).toHaveFocus();
  });

  it('stellt eine Abweichung an das Wiederholungsfeld', async () => {
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);
    const erstes = await screen.findByLabelText(/Neues Kennwort$/);

    await userEvent.type(erstes, 'ein-langes-kennwort');
    await userEvent.type(screen.getByLabelText(/wiederholen/), 'ein-anderes-kennwort');
    await userEvent.click(screen.getByRole('button', { name: 'Kennwort setzen' }));

    const zweites = screen.getByLabelText(/wiederholen/);
    expect(zweites).toHaveAttribute('aria-invalid', 'true');
    expect(erstes).not.toHaveAttribute('aria-invalid');
    expect(zweites).toHaveFocus();
  });

  it('meldet einen Fehlschlag des Dienstes über dem Knopf, mit Ausweg (AUTH-10)', async () => {
    updateUser.mockResolvedValue({ error: { message: 'same_password' } });
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);
    const erstes = await screen.findByLabelText(/Neues Kennwort$/);

    await userEvent.type(erstes, 'ein-langes-kennwort');
    await userEvent.type(screen.getByLabelText(/wiederholen/), 'ein-langes-kennwort');
    await userEvent.click(screen.getByRole('button', { name: 'Kennwort setzen' }));

    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen');
    expect(meldung).toHaveTextContent('vom bisherigen unterscheiden');
    // Kein Feld ist schuld - keines ist als fehlerhaft markiert.
    expect(erstes).not.toHaveAttribute('aria-invalid');
    expect(screen.getByLabelText(/wiederholen/)).not.toHaveAttribute('aria-invalid');
  });

  it('setzt den Fokus ins Formular, sobald der Link eingelöst ist (AUTH-06)', async () => {
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);

    expect(await screen.findByLabelText(/Neues Kennwort$/)).toHaveFocus();
  });

  it('setzt den Fokus auf die Auskunft, wenn der Link nicht mehr gilt (AUTH-06)', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Email link is invalid or has expired' } });
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);

    const titel = await screen.findByText('Dieser Link lässt sich nicht mehr verwenden.');
    expect(titel.closest('[tabindex="-1"]')).toHaveFocus();
  });

  it('trägt Überschrift und Hauptbereich der Vollseite (AUTH-12, AUTH-13)', async () => {
    renderWithProviders(<KennwortNeuPage />, '/kennwort-neu');

    const titel = await screen.findByRole('heading', { level: 1, name: 'Neues Kennwort setzen' });
    expect(screen.getByRole('main')).toContainElement(titel);
  });

  it('führt nach dem Setzen mit einem Link zu „Mein Konto“', async () => {
    renderWithProviders(<KennwortNeuPage />, MIT_LINK);
    const erstes = await screen.findByLabelText(/Neues Kennwort$/);
    await userEvent.type(erstes, 'ein-langes-kennwort');
    await userEvent.type(screen.getByLabelText(/wiederholen/), 'ein-langes-kennwort');
    await userEvent.click(screen.getByRole('button', { name: 'Kennwort setzen' }));

    expect(await screen.findByRole('link', { name: 'Weiter zu „Mein Konto“' })).toHaveAttribute(
      'href',
      '/mein-konto',
    );
  });
});
