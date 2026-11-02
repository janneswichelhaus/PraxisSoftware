import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQuery } from '@tanstack/react-query';
import type * as AboApi from './kalenderabo-api';
import type * as Core from '@/features/core';
import { renderWithProviders } from '@/test-utils';

const anmelden = vi.fn<() => Promise<void>>();
let kontoNachher = 'konto-a';
const getSession = vi.fn(() => Promise.resolve({ data: { session: { user: { id: 'konto-a' } } } }));

vi.mock('@/features/core', async (importOriginal) => ({
  ...(await importOriginal<typeof Core>()),
  anmeldenMitPasskey: () => anmelden(),
}));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ auth: { getSession } }) }));

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
const { AboErneutAnmelden } = await import('./kalenderabo-api');

const ADRESSE = 'Zz09_-'.padEnd(43, 'q');
const HTTPS = `https://instanz.test/functions/v1/calendar-feed/${ADRESSE}.ics`;
const VERBINDUNG = /Bitte die Verbindung prüfen und erneut versuchen\./;

describe('Kalender-Abo in „Mein Konto“ (ANN-838)', () => {
  beforeEach(() => {
    fetchAboDienst.mockReset();
    fetchEigenesAbo.mockReset();
    erzeugeAbo.mockReset();
    beendeAbo.mockReset();
    anmelden.mockReset();
    getSession.mockReset();
    fetchAboDienst.mockResolvedValue(true);
    kontoNachher = 'konto-a';
    let aufrufe = 0;
    getSession.mockImplementation(() => {
      aufrufe += 1;
      const id = aufrufe === 1 ? 'konto-a' : kontoNachher;
      return Promise.resolve({ data: { session: { user: { id } } } });
    });
  });

  it('erstellt den Link und zeigt ihn genau einmal, zum Kopieren und Öffnen', async () => {
    const nutzer = userEvent.setup();
    fetchEigenesAbo.mockResolvedValueOnce(null).mockResolvedValue({ seit: '2026-11-02T17:00:00Z' });
    erzeugeAbo.mockResolvedValue(ADRESSE);
    const schreiben = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    renderWithProviders(<KalenderAboAbschnitt />);

    expect(screen.getByText('Eigene Termine im Kalender des Telefons.')).toBeInTheDocument();
    await nutzer.click(await screen.findByRole('button', { name: 'Abo-Link erstellen' }));

    expect(await screen.findByLabelText('Abo-Link')).toHaveValue(HTTPS);
    expect(screen.getByText(/Der Link steht nur jetzt hier\./)).toBeInTheDocument();
    expect(screen.queryByText(/Das alte Abo/)).toBeNull();
    expect(screen.getByRole('link', { name: 'Im Kalender öffnen' })).toHaveAttribute(
      'href',
      HTTPS.replace('https://', 'webcal://'),
    );
    // Gleich nach dem Erstellen wäre „Neuen Link erstellen“ doppelt.
    expect(screen.queryByRole('button', { name: 'Neuen Link erstellen' })).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Link kopieren' }));
    expect(schreiben).toHaveBeenCalledWith(HTTPS);
    expect(await screen.findByText('Kopiert.')).toBeInTheDocument();
    expect(erzeugeAbo).toHaveBeenCalledTimes(1);
  });

  it('zeigt bei bestehendem Abo nur das Datum, nie den Link', async () => {
    fetchEigenesAbo.mockResolvedValue({ seit: '2026-11-02T17:00:00Z' });
    renderWithProviders(<KalenderAboAbschnitt />);
    expect(await screen.findByText('Link erstellt am 02.11.2026.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Abo-Link')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abo-Link erstellen' })).toBeNull();
  });

  it('erstellt einen neuen Link erst nach der Rückfrage und sagt, was mit dem alten Abo ist', async () => {
    const nutzer = userEvent.setup();
    fetchEigenesAbo.mockResolvedValue({ seit: '2026-11-02T17:00:00Z' });
    erzeugeAbo.mockResolvedValue(ADRESSE);
    renderWithProviders(<KalenderAboAbschnitt />);

    await nutzer.click(await screen.findByRole('button', { name: 'Neuen Link erstellen' }));
    const frage = screen.getByRole('group', { name: 'Neuen Link erstellen' });
    expect(within(frage).getByText(/Der bisherige Link gilt danach nicht mehr/)).toBeVisible();
    expect(erzeugeAbo).not.toHaveBeenCalled();
    await nutzer.click(within(frage).getByRole('button', { name: 'Neuen Link erstellen' }));
    expect(await screen.findByLabelText('Abo-Link')).toHaveValue(HTTPS);
    expect(
      screen.getByText(/Das alte Abo im Kalender des Telefons bleibt leer stehen/),
    ).toBeVisible();
  });

  it('sagt, wenn der neue Link am Server gilt, die Antwort aber nicht ankam', async () => {
    const nutzer = userEvent.setup();
    fetchEigenesAbo
      .mockResolvedValueOnce({ seit: '2026-11-02T17:00:00Z' })
      .mockResolvedValue({ seit: '2026-11-03T08:00:00Z' });
    erzeugeAbo.mockRejectedValue(new Error('Netz weg'));
    renderWithProviders(<KalenderAboAbschnitt />);

    await nutzer.click(await screen.findByRole('button', { name: 'Neuen Link erstellen' }));
    const frage = screen.getByRole('group', { name: 'Neuen Link erstellen' });
    await nutzer.click(within(frage).getByRole('button', { name: 'Neuen Link erstellen' }));
    expect(
      await within(frage).findByText(/Der neue Link kam nicht an, der bisherige gilt schon nicht/),
    ).toBeVisible();
  });

  it('sagt beim ersten Erstellen, wenn der Link angelegt ist, aber nicht ankam', async () => {
    const nutzer = userEvent.setup();
    fetchEigenesAbo.mockResolvedValueOnce(null).mockResolvedValue({ seit: '2026-11-02T17:00:00Z' });
    erzeugeAbo.mockRejectedValue(new Error('Netz weg'));
    renderWithProviders(<KalenderAboAbschnitt />);

    await nutzer.click(await screen.findByRole('button', { name: 'Abo-Link erstellen' }));
    expect(
      await screen.findByText('Der Link kam nicht an. Bitte einen neuen erstellen.'),
    ).toBeVisible();
    expect(screen.getByText('Link erstellt am 02.11.2026.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Neuen Link erstellen' })).toBeEnabled();
  });

  it('meldet ein gescheitertes Erstellen ohne Änderung am Server und lässt es erneut versuchen', async () => {
    const nutzer = userEvent.setup();
    fetchEigenesAbo.mockResolvedValue(null);
    erzeugeAbo.mockRejectedValue(new Error('x'));
    renderWithProviders(<KalenderAboAbschnitt />);
    await nutzer.click(await screen.findByRole('button', { name: 'Abo-Link erstellen' }));
    expect(await screen.findByText(/Der Link konnte nicht erstellt werden\./)).toHaveTextContent(
      VERBINDUNG,
    );
    expect(screen.getByRole('button', { name: 'Abo-Link erstellen' })).toBeEnabled();
  });

  it('beendet das Abo nach der Rückfrage und bietet dann wieder das Erstellen an', async () => {
    const nutzer = userEvent.setup();
    fetchEigenesAbo.mockResolvedValueOnce({ seit: '2026-11-02T17:00:00Z' }).mockResolvedValue(null);
    beendeAbo.mockResolvedValue(undefined);
    renderWithProviders(<KalenderAboAbschnitt />);

    await nutzer.click(await screen.findByRole('button', { name: 'Abo beenden' }));
    const frage = screen.getByRole('group', { name: 'Abo beenden' });
    expect(within(frage).getByText(/bleibt leer stehen und lässt sich dort löschen/)).toBeVisible();
    await nutzer.click(within(frage).getByRole('button', { name: 'Abo beenden' }));
    await waitFor(() => expect(beendeAbo).toHaveBeenCalledTimes(1));
    expect(await screen.findByRole('button', { name: 'Abo-Link erstellen' })).toBeInTheDocument();
  });

  it('meldet ein gescheitertes Beenden in der Rückfrage; Abbrechen räumt die Meldung ab', async () => {
    const nutzer = userEvent.setup();
    fetchEigenesAbo.mockResolvedValue({ seit: '2026-11-02T17:00:00Z' });
    beendeAbo.mockRejectedValue(new Error('x'));
    renderWithProviders(<KalenderAboAbschnitt />);

    await nutzer.click(await screen.findByRole('button', { name: 'Abo beenden' }));
    const frage = screen.getByRole('group', { name: 'Abo beenden' });
    await nutzer.click(within(frage).getByRole('button', { name: 'Abo beenden' }));
    expect(
      await within(frage).findByText(/Das Abo konnte nicht beendet werden\./),
    ).toHaveTextContent(VERBINDUNG);
    await nutzer.click(within(frage).getByRole('button', { name: 'Abbrechen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Abo beenden' }));
    expect(screen.queryByText(/Das Abo konnte nicht beendet werden\./)).toBeNull();
  });

  it('verlangt nach langer Anmeldung erst den Passkey und erstellt dann ohne neues Tippen', async () => {
    const nutzer = userEvent.setup();
    fetchEigenesAbo.mockResolvedValueOnce(null).mockResolvedValue({ seit: '2026-11-02T17:00:00Z' });
    erzeugeAbo.mockRejectedValueOnce(new AboErneutAnmelden()).mockResolvedValue(ADRESSE);
    anmelden.mockResolvedValue(undefined);
    renderWithProviders(<KalenderAboAbschnitt />);

    await nutzer.click(await screen.findByRole('button', { name: 'Abo-Link erstellen' }));
    expect(
      await screen.findByText(/Zum Erstellen des Links bitte zuerst mit dem Passkey bestätigen\./),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Abo-Link erstellen' })).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Mit Passkey bestätigen' }));
    expect(await screen.findByLabelText('Abo-Link')).toHaveValue(HTTPS);
    expect(anmelden).toHaveBeenCalledTimes(1);
    expect(erzeugeAbo).toHaveBeenCalledTimes(2);
  });

  it('erstellt nichts, wenn der Passkey zu einem anderen Zugang gehört', async () => {
    const nutzer = userEvent.setup();
    fetchEigenesAbo.mockResolvedValue(null);
    erzeugeAbo.mockRejectedValueOnce(new AboErneutAnmelden()).mockResolvedValue(ADRESSE);
    anmelden.mockResolvedValue(undefined);
    kontoNachher = 'konto-b';
    renderWithProviders(<KalenderAboAbschnitt />);

    await nutzer.click(await screen.findByRole('button', { name: 'Abo-Link erstellen' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Mit Passkey bestätigen' }));
    expect(
      await screen.findByText('Der Passkey gehört zu einem anderen Zugang. Es gibt keinen Link.'),
    ).toBeVisible();
    expect(erzeugeAbo).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Abo-Link')).toBeNull();
  });

  it('fragt auch beim neuen Link erst nach dem Passkey, in der Rückfrage', async () => {
    const nutzer = userEvent.setup();
    fetchEigenesAbo.mockResolvedValue({ seit: '2026-11-02T17:00:00Z' });
    erzeugeAbo.mockRejectedValueOnce(new AboErneutAnmelden()).mockResolvedValue(ADRESSE);
    anmelden.mockResolvedValue(undefined);
    renderWithProviders(<KalenderAboAbschnitt />);

    await nutzer.click(await screen.findByRole('button', { name: 'Neuen Link erstellen' }));
    const frage = screen.getByRole('group', { name: 'Neuen Link erstellen' });
    await nutzer.click(within(frage).getByRole('button', { name: 'Neuen Link erstellen' }));
    expect(await within(frage).findByText(/bitte zuerst mit dem Passkey bestätigen/)).toBeVisible();
    await nutzer.click(within(frage).getByRole('button', { name: 'Mit Passkey bestätigen' }));
    expect(await screen.findByLabelText('Abo-Link')).toHaveValue(HTTPS);
    expect(
      screen.getByText(/Das alte Abo im Kalender des Telefons bleibt leer stehen/),
    ).toBeVisible();
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
});
