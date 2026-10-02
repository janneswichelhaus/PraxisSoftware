import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';

/**
 * Die Zugangsmail an eine offene Einladung (FIX-002 innerhalb von FIX-001).
 *
 * Sie zeigte auf die Wurzel der Anwendung. Dort las niemand die Kennung aus
 * dem Link — die eingeladene Person sah die Anmeldemaske, an der sie gerade
 * vorbeikommen wollte.
 */

const verifyOtp = vi.fn();
const navigate = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { verifyOtp } }),
}));

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
}));

let sitzung: { user: { id: string; email?: string } } | null = null;

vi.mock('./sessionContext', () => ({
  useSession: () => ({ session: sitzung, initialising: false, signOut: vi.fn() }),
}));

const { ZugangPage } = await import('./ZugangPage');

const HASH = 'fedcba9876543210';

beforeEach(() => {
  sitzung = null;
  verifyOtp.mockReset().mockResolvedValue({ error: null });
  navigate.mockReset();
});

describe('ZugangPage', () => {
  it('liest den Code aus dem Fragment und nimmt ihn aus der Adresszeile (ANN-043)', async () => {
    renderWithProviders(<ZugangPage />, `/zugang#token_hash=${HASH}&type=magiclink`);

    await waitFor(() =>
      expect(verifyOtp).toHaveBeenCalledWith({ token_hash: HASH, type: 'magiclink' }),
    );
    expect(navigate).toHaveBeenCalledWith('/zugang', { replace: true });
  });

  it('löst den Link als Anmeldelink ein, nicht als Wiederherstellungslink', async () => {
    renderWithProviders(<ZugangPage />, `/zugang?token_hash=${HASH}&type=magiclink`);

    await waitFor(() =>
      expect(verifyOtp).toHaveBeenCalledWith({ token_hash: HASH, type: 'magiclink' }),
    );
  });

  it('hält die Person nicht mit einer Zwischenseite auf, während der Link geprüft wird', async () => {
    renderWithProviders(<ZugangPage />, `/zugang?token_hash=${HASH}&type=magiclink`);

    // Kein „Sie sind angemeldet, bitte weiterklicken": Sobald die Sitzung
    // steht, übernimmt die Anwendung von selbst.
    expect(screen.getByText('Der Link wird geprüft …')).toBeInTheDocument();
    await waitFor(() => expect(verifyOtp).toHaveBeenCalled());
  });

  it('sagt bei einem abgelaufenen Link, wer eine neue Mail schicken kann', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired' } });
    renderWithProviders(<ZugangPage />, `/zugang?token_hash=${HASH}&type=magiclink`);

    expect(
      await screen.findByText('Dieser Link lässt sich nicht mehr verwenden.'),
    ).toBeInTheDocument();
    // Zugänge verwaltet die Rolle Praxisinhaber (WRT-12).
    expect(
      screen.getByText(/Praxisinhaber:in kann eine neue Zugangsmail schicken/),
    ).toBeInTheDocument();
  });

  it('schickt ohne Kennung keinen leeren Aufruf los', async () => {
    renderWithProviders(<ZugangPage />, '/zugang');

    expect(
      await screen.findByText('Dieser Link lässt sich nicht mehr verwenden.'),
    ).toBeInTheDocument();
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('verbrennt die einmalige Kennung nicht durch einen zweiten Versuch', async () => {
    renderWithProviders(<ZugangPage />, `/zugang?token_hash=${HASH}&type=magiclink`);

    await waitFor(() => expect(verifyOtp).toHaveBeenCalled());
    expect(verifyOtp).toHaveBeenCalledOnce();
  });
});

describe('ZugangPage — die Befunde aus dem Review', () => {
  it('springt nach erfolgreichem Einlösen selbst weiter, statt auf dem Pfad stehen zu bleiben', async () => {
    // Das Gate hält /zugang offen, solange man darauf steht (istEinloesePfad).
    // Ohne diesen Sprung bliebe die Seite fuer immer im Ladezustand.
    renderWithProviders(<ZugangPage />, `/zugang?token_hash=${HASH}&type=magiclink`);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
  });

  it('nennt einen Verbindungsfehler als solchen, statt den Link für verbraucht zu erklären', async () => {
    verifyOtp.mockResolvedValue({
      error: { name: 'AuthRetryableFetchError', message: 'Failed to fetch' },
    });
    renderWithProviders(<ZugangPage />, `/zugang?token_hash=${HASH}&type=magiclink`);

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
    renderWithProviders(<ZugangPage />, `/zugang?token_hash=${HASH}&type=magiclink`);
    await screen.findByRole('button', { name: 'Erneut versuchen' });

    verifyOtp.mockResolvedValue({ error: null });
    await userEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith('/', { replace: true }));
    expect(verifyOtp).toHaveBeenCalledTimes(2);
  });

  it('fragt erst, wenn auf dem Gerät schon jemand angemeldet ist', async () => {
    sitzung = { user: { id: 'olivia' } };
    renderWithProviders(<ZugangPage />, `/zugang?token_hash=${HASH}&type=magiclink`);

    expect(
      await screen.findByText(/Auf diesem Gerät ist bereits ein Konto angemeldet/),
    ).toBeInTheDocument();
    // Entscheidend: noch nichts eingelöst und nichts weggeräumt.
    expect(verifyOtp).not.toHaveBeenCalled();
  });

  it('löst nach ausdrücklicher Bestätigung ein', async () => {
    sitzung = { user: { id: 'olivia' } };
    renderWithProviders(<ZugangPage />, `/zugang?token_hash=${HASH}&type=magiclink`);
    await screen.findByRole('button', { name: 'Trotzdem mit diesem Link anmelden' });

    await userEvent.click(
      screen.getByRole('button', { name: 'Trotzdem mit diesem Link anmelden' }),
    );

    await waitFor(() => expect(verifyOtp).toHaveBeenCalledOnce());
  });

  it('lässt die laufende Sitzung in Ruhe, wenn man sich dafür entscheidet', async () => {
    sitzung = { user: { id: 'olivia' } };
    renderWithProviders(<ZugangPage />, `/zugang?token_hash=${HASH}&type=magiclink`);

    // Ein Seitenwechsel, also ein Link (AUTH-12).
    const bleiben = await screen.findByRole('link', { name: 'Angemeldet bleiben' });
    expect(bleiben).toHaveAttribute('href', '/');
    expect(verifyOtp).not.toHaveBeenCalled();
  });
});

describe('ZugangPage — UXR-002', () => {
  it('trägt in jedem Zustand eine Überschrift (AUTH-13)', async () => {
    renderWithProviders(<ZugangPage />, `/zugang?token_hash=${HASH}&type=magiclink`);

    const titel = screen.getByRole('heading', { level: 1, name: 'Mit Link anmelden' });
    expect(screen.getByRole('main')).toContainElement(titel);
    await waitFor(() => expect(verifyOtp).toHaveBeenCalled());
  });

  it('nennt das angemeldete Konto, statt eine andere Person zu behaupten (AUTH-04)', async () => {
    sitzung = { user: { id: 'olivia', email: 'olivia.office@praxis.invalid' } };
    renderWithProviders(<ZugangPage />, `/zugang?token_hash=${HASH}&type=magiclink`);

    const hinweis = await screen.findByText(/olivia\.office@praxis\.invalid angemeldet/);
    expect(hinweis).toHaveTextContent(
      'Gehört der Link zu einem anderen Konto, endet diese Sitzung',
    );
    expect(hinweis).not.toHaveTextContent('als andere Person');
  });

  it('führt nach einem gescheiterten Link zurück in die bestehende Sitzung (AUTH-04)', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired' } });
    sitzung = { user: { id: 'olivia', email: 'olivia.office@praxis.invalid' } };
    renderWithProviders(<ZugangPage />, `/zugang?token_hash=${HASH}&type=magiclink`);
    await userEvent.click(
      await screen.findByRole('button', { name: 'Trotzdem mit diesem Link anmelden' }),
    );

    expect(await screen.findByRole('link', { name: 'Zurück zur Anwendung' })).toHaveAttribute(
      'href',
      '/',
    );
    // Im Präsens: Die bisherige Sitzung besteht weiter.
    expect(
      screen.getByText(
        'Hinweis: Auf diesem Gerät ist weiterhin olivia.office@praxis.invalid angemeldet.',
      ),
    ).toBeInTheDocument();
  });

  it('führt ohne Sitzung mit einem Link zur Anmeldung', async () => {
    renderWithProviders(<ZugangPage />, '/zugang');

    expect(await screen.findByRole('link', { name: 'Zur Anmeldung' })).toHaveAttribute('href', '/');
    expect(screen.queryByText(/weiterhin/)).toBeNull();
  });

  it('setzt den Fokus auf die Auskunft, wenn der Link nicht mehr gilt (AUTH-06)', async () => {
    verifyOtp.mockResolvedValue({ error: { message: 'Token has expired' } });
    renderWithProviders(<ZugangPage />, `/zugang?token_hash=${HASH}&type=magiclink`);

    const titel = await screen.findByText('Dieser Link lässt sich nicht mehr verwenden.');
    expect(titel.closest('[tabindex="-1"]')).toHaveFocus();
  });
});
