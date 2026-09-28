import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Geocode from '@/lib/location/geocode';
import type * as Startort from './startort';
import { renderWithProviders } from '@/test-utils';

/** Startort der Touren (MAP-006a): verorten, bestätigen, speichern. */

const geocodiere = vi.fn();
const saveTourStart = vi.fn();
const fetchStandorte = vi.fn();

vi.mock('@/lib/location/geocode', async (importOriginal) => {
  const actual = await importOriginal<typeof Geocode>();
  return { ...actual, geocodiere: (...a: unknown[]) => geocodiere(...a) as unknown };
});

vi.mock('./startort', async (importOriginal) => {
  const actual = await importOriginal<typeof Startort>();
  return {
    ...actual,
    fetchStandorte: () => fetchStandorte() as unknown,
    saveTourStart: (...a: unknown[]) => saveTourStart(...a) as Promise<void>,
  };
});

const { StartortEinstellung } = await import('./StartortEinstellung');

const HAUPTSTANDORT = {
  id: 'loc',
  name: 'Hauptstandort',
  street: null,
  house_number: null,
  postal_code: null,
  city: null,
  lat: null,
  lon: null,
  geocode_precision: null,
};

const TREFFER = {
  ok: true,
  value: { position: { lat: 48.52, lon: 9.06 }, precision: 'street' },
  quelle: 'anbieter',
};

beforeEach(() => {
  geocodiere.mockReset();
  saveTourStart.mockReset();
  fetchStandorte.mockReset();
  saveTourStart.mockResolvedValue(undefined);
  fetchStandorte.mockResolvedValue([HAUPTSTANDORT]);
});

/** Füllt die Pflichtfelder aus - die Hausnummer bleibt frei. */
async function ausfuellen() {
  await userEvent.type(await screen.findByLabelText('Straße'), 'Praxisplatz');
  await userEvent.type(screen.getByLabelText('Postleitzahl'), '72072');
  await userEvent.type(screen.getByLabelText('Ort'), 'Tübingen');
}

// Getippt wird Zeichen für Zeichen wie am Gerät; im vollen Lauf reichen dafür
// die fünf Sekunden der Voreinstellung nicht immer (wie BausteinFeld,
// EditStaffMemberPage).
describe('StartortEinstellung', { timeout: 20_000 }, () => {
  it('verlangt eine vollstaendige Adresse, bevor etwas hinausgeht', async () => {
    renderWithProviders(<StartortEinstellung />);
    await userEvent.click(await screen.findByRole('button', { name: 'Adresse verorten' }));

    // Der Fehler steht am Feld, nicht als neutrale Zeile darunter (TER-18).
    expect(screen.getByLabelText('Straße')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Bitte die Straße angeben.')).toBeInTheDocument();
    expect(screen.getByText('Bitte die Postleitzahl angeben.')).toBeInTheDocument();
    expect(screen.getByText('Bitte den Ort angeben.')).toBeInTheDocument();
    expect(screen.getByLabelText('Hausnummer')).not.toHaveAttribute('aria-invalid');
    // Der Fokus geht dorthin, wo zu tun ist.
    expect(screen.getByLabelText('Straße')).toHaveFocus();
    expect(geocodiere).not.toHaveBeenCalled();
  });

  it('nimmt den Fehler vom Feld, sobald es ausgefuellt ist', async () => {
    renderWithProviders(<StartortEinstellung />);
    await userEvent.click(await screen.findByRole('button', { name: 'Adresse verorten' }));
    await userEvent.type(screen.getByLabelText('Straße'), 'Praxisplatz');

    expect(screen.getByLabelText('Straße')).not.toHaveAttribute('aria-invalid');
    expect(screen.queryByText('Bitte die Straße angeben.')).toBeNull();
    expect(screen.getByText('Bitte den Ort angeben.')).toBeInTheDocument();
  });

  it('speichert erst nach dem Blick auf den Treffer - mit Bestaetigung unterhalb der Hausnummer', async () => {
    geocodiere.mockResolvedValue(TREFFER);
    renderWithProviders(<StartortEinstellung />);
    await ausfuellen();
    await userEvent.click(screen.getByRole('button', { name: 'Adresse verorten' }));

    expect(await screen.findByText(/nur auf die Straße genau/)).toBeInTheDocument();
    expect(saveTourStart).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Als Startort speichern' }));
    await waitFor(() => expect(saveTourStart).toHaveBeenCalledTimes(1));
    expect(saveTourStart.mock.calls[0]![3]).toBe(true);

    // Erfolg sieht anders aus als ein Fehler (TER-18, UIK-21).
    const erfolg = await screen.findByText('Der Startort ist gespeichert.');
    expect(erfolg).toHaveAttribute('role', 'status');
    expect(erfolg).toHaveTextContent('✓');
  });

  it('zeigt waehrend des Speicherns den Laufzustand (ZST-20)', async () => {
    geocodiere.mockResolvedValue(TREFFER);
    saveTourStart.mockReturnValue(new Promise(() => {}));
    renderWithProviders(<StartortEinstellung />);
    await ausfuellen();
    await userEvent.click(screen.getByRole('button', { name: 'Adresse verorten' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Als Startort speichern' }));

    expect(await screen.findByRole('button', { name: 'Wird gespeichert …' })).toBeDisabled();
  });

  it('meldet „kein Treffer" als Fehler, mit dem naechsten Schritt (ZST-12)', async () => {
    geocodiere.mockResolvedValue({ ok: false, error: { code: 'not_found', message: 'x' } });
    renderWithProviders(<StartortEinstellung />);
    await ausfuellen();
    await userEvent.click(screen.getByRole('button', { name: 'Adresse verorten' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Zu dieser Adresse hat der Kartendienst keinen Treffer gefunden. Bitte die Schreibweise prüfen.',
    );
  });

  it('nennt bei einer Stoerung keine Einrichtungsbegriffe (PAT-15, TER-07)', async () => {
    geocodiere.mockResolvedValue({
      ok: false,
      error: { code: 'function_unavailable', message: 'x' },
    });
    renderWithProviders(<StartortEinstellung />);
    await ausfuellen();
    await userEvent.click(screen.getByRole('button', { name: 'Adresse verorten' }));

    const fehler = await screen.findByRole('alert');
    expect(fehler).toHaveTextContent(
      'Die Verortung ist gerade nicht möglich. Bitte später erneut verorten.',
    );
    expect(fehler).not.toHaveTextContent(/Routenfunktion|Serverschlüssel/);
  });

  it('gibt der Postleitzahl die schmale Spalte und den Ziffernblock (RSP-12)', async () => {
    renderWithProviders(<StartortEinstellung />);
    const plz = await screen.findByLabelText('Postleitzahl');

    expect(plz).toHaveAttribute('inputmode', 'numeric');
    expect(plz.closest('.grid')).toHaveClass('sm:grid-cols-[8rem_1fr]');
    expect(screen.getByLabelText('Straße').closest('.grid')).toHaveClass('sm:grid-cols-[1fr_8rem]');
  });

  it('steht als Abschnitt ohne eigenen Kasten (UIK-20)', async () => {
    const { container } = renderWithProviders(<StartortEinstellung />);
    expect(await screen.findByRole('heading', { name: 'Startort der Touren' })).toBeInTheDocument();
    expect(container.querySelector('.bg-surface.rounded-card')).toBeNull();
  });

  it('sagt es, wenn die Standorte laden, fehlen oder nicht kommen', async () => {
    const user = userEvent.setup();
    fetchStandorte.mockReturnValueOnce(new Promise(() => {}));
    const { unmount } = renderWithProviders(<StartortEinstellung />);
    expect(screen.getByRole('status')).toHaveTextContent('Standorte werden geladen …');
    unmount();

    fetchStandorte.mockResolvedValueOnce([]);
    const zweiter = renderWithProviders(<StartortEinstellung />);
    expect(
      await screen.findByText('Für die Praxis ist noch kein Standort angelegt.'),
    ).toBeInTheDocument();
    zweiter.unmount();

    fetchStandorte.mockRejectedValueOnce(new Error('Funkloch'));
    renderWithProviders(<StartortEinstellung />);
    const fehler = (await screen.findByText('Die Standorte konnten nicht geladen werden.')).closest(
      '[role="alert"]',
    )!;
    expect(fehler).toHaveTextContent('Bitte die Verbindung prüfen und erneut versuchen.');
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await screen.findByLabelText('Straße')).toBeInTheDocument();
  });
});
