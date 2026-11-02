import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQuery } from '@tanstack/react-query';
import type * as AboApi from './kalenderabo-api';
import { renderWithProviders } from '@/test-utils';

const fetchAboDienst = vi.fn<() => Promise<boolean>>();
const fetchEigenesAbo = vi.fn<() => Promise<AboApi.EigenesAbo | null>>();
const erzeugeAbo = vi.fn<() => Promise<string>>();
const beendeAbo = vi.fn<() => Promise<void>>();

vi.mock('./kalenderabo-api', async (importOriginal) => {
  const actual = await importOriginal<typeof AboApi>();
  return {
    ...actual,
    useAboDienst: () =>
      useQuery({
        queryKey: ['kalender-abo', 'dienst'],
        queryFn: () => fetchAboDienst(),
        retry: false,
      }),
    fetchEigenesAbo: () => fetchEigenesAbo(),
    erzeugeAbo: () => erzeugeAbo(),
    beendeAbo: () => beendeAbo(),
    aboAdressen: (adresse: string) => actual.aboAdressen(adresse, 'https://instanz.test'),
  };
});

const { KalenderAboAbschnitt } = await import('./KalenderAboAbschnitt');

const ADRESSE = 'Zz09_-'.padEnd(43, 'q');
const HTTPS = `https://instanz.test/functions/v1/calendar-feed/${ADRESSE}.ics`;

describe('Kalender-Abo in „Mein Konto“ (ANN-838)', () => {
  beforeEach(() => {
    fetchAboDienst.mockReset();
    fetchEigenesAbo.mockReset();
    erzeugeAbo.mockReset();
    beendeAbo.mockReset();
    fetchAboDienst.mockResolvedValue(true);
  });

  it('erzeugt die Adresse und zeigt sie genau einmal, zum Kopieren und Öffnen', async () => {
    const nutzer = userEvent.setup();
    fetchEigenesAbo.mockResolvedValueOnce(null).mockResolvedValue({ seit: '2026-11-02T17:00:00Z' });
    erzeugeAbo.mockResolvedValue(ADRESSE);
    const schreiben = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    renderWithProviders(<KalenderAboAbschnitt />);

    expect(await screen.findByText(/nur Uhrzeit und Art\./)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Abo-Adresse erzeugen' }));

    expect(await screen.findByLabelText('Abo-Adresse')).toHaveValue(HTTPS);
    expect(screen.getByText(/Die Adresse steht nur jetzt hier\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Im Kalender öffnen' })).toHaveAttribute(
      'href',
      HTTPS.replace('https://', 'webcal://'),
    );
    // Gleich nach dem Erzeugen wäre „Neue Adresse erzeugen“ doppelt.
    expect(screen.queryByRole('button', { name: 'Neue Adresse erzeugen' })).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Adresse kopieren' }));
    expect(schreiben).toHaveBeenCalledWith(HTTPS);
    expect(await screen.findByText('Kopiert.')).toBeInTheDocument();
    expect(erzeugeAbo).toHaveBeenCalledTimes(1);
  });

  it('zeigt bei bestehendem Abo nur das Datum, nie die Adresse', async () => {
    fetchEigenesAbo.mockResolvedValue({ seit: '2026-11-02T17:00:00Z' });
    renderWithProviders(<KalenderAboAbschnitt />);
    expect(await screen.findByText(/Abo aktiv seit 02\.11\.2026\./)).toBeInTheDocument();
    expect(screen.queryByLabelText('Abo-Adresse')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abo-Adresse erzeugen' })).toBeNull();
  });

  it('erzeugt eine neue Adresse erst nach der Rückfrage', async () => {
    const nutzer = userEvent.setup();
    fetchEigenesAbo.mockResolvedValue({ seit: '2026-11-02T17:00:00Z' });
    erzeugeAbo.mockResolvedValue(ADRESSE);
    renderWithProviders(<KalenderAboAbschnitt />);

    await nutzer.click(await screen.findByRole('button', { name: 'Neue Adresse erzeugen' }));
    const frage = screen.getByRole('group', { name: 'Neue Adresse erzeugen' });
    expect(within(frage).getByText(/Die bisherige Adresse gilt danach nicht mehr\./)).toBeVisible();
    expect(erzeugeAbo).not.toHaveBeenCalled();
    await nutzer.click(within(frage).getByRole('button', { name: 'Neue Adresse erzeugen' }));
    expect(await screen.findByLabelText('Abo-Adresse')).toHaveValue(HTTPS);
  });

  it('beendet das Abo nach der Rückfrage und bietet dann wieder das Erzeugen an', async () => {
    const nutzer = userEvent.setup();
    fetchEigenesAbo.mockResolvedValueOnce({ seit: '2026-11-02T17:00:00Z' }).mockResolvedValue(null);
    beendeAbo.mockResolvedValue(undefined);
    renderWithProviders(<KalenderAboAbschnitt />);

    await nutzer.click(await screen.findByRole('button', { name: 'Abo beenden' }));
    const frage = screen.getByRole('group', { name: 'Abo beenden' });
    await nutzer.click(within(frage).getByRole('button', { name: 'Abo beenden' }));
    await waitFor(() => expect(beendeAbo).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: 'Abo-Adresse erzeugen' })).toBeInTheDocument();
  });

  it('sagt, wenn das Abo hier nicht eingerichtet ist oder nicht gefragt werden konnte', async () => {
    fetchAboDienst.mockResolvedValue(false);
    const { unmount } = renderWithProviders(<KalenderAboAbschnitt />);
    expect(
      await screen.findByText('Das Kalender-Abo ist hier noch nicht eingerichtet.'),
    ).toBeInTheDocument();
    expect(fetchEigenesAbo).not.toHaveBeenCalled();
    unmount();

    fetchAboDienst.mockRejectedValue(new Error('weg'));
    renderWithProviders(<KalenderAboAbschnitt />);
    expect(
      await screen.findByText('Das Kalender-Abo konnte nicht gefragt werden.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });

  it('meldet ein gescheitertes Erzeugen und lässt es erneut versuchen', async () => {
    const nutzer = userEvent.setup();
    fetchEigenesAbo.mockResolvedValue(null);
    erzeugeAbo.mockRejectedValue(new Error('x'));
    renderWithProviders(<KalenderAboAbschnitt />);
    await nutzer.click(await screen.findByRole('button', { name: 'Abo-Adresse erzeugen' }));
    expect(
      await screen.findByText(/Die Abo-Adresse konnte nicht erzeugt werden\./),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abo-Adresse erzeugen' })).toBeEnabled();
  });
});
