import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
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

const { ZugangPage } = await import('./ZugangPage');

const HASH = 'fedcba9876543210';

beforeEach(() => {
  verifyOtp.mockReset().mockResolvedValue({ error: null });
  navigate.mockReset();
});

describe('ZugangPage', () => {
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
    expect(
      screen.getByText(/Praxisleitung kann eine neue Zugangsmail schicken/),
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
