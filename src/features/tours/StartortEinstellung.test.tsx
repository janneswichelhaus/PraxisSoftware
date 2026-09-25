import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as Geocode from '@/lib/location/geocode';
import type * as Startort from './startort';
import { renderWithProviders } from '@/test-utils';

/** Startort der Touren (MAP-006a): verorten, bestätigen, speichern. */

const geocodiere = vi.fn();
const saveTourStart = vi.fn();

vi.mock('@/lib/location/geocode', async (importOriginal) => {
  const actual = await importOriginal<typeof Geocode>();
  return { ...actual, geocodiere: (...a: unknown[]) => geocodiere(...a) as unknown };
});

vi.mock('./startort', async (importOriginal) => {
  const actual = await importOriginal<typeof Startort>();
  return {
    ...actual,
    fetchStandorte: () =>
      Promise.resolve([
        {
          id: 'loc',
          name: 'Hauptstandort',
          street: null,
          house_number: null,
          postal_code: null,
          city: null,
          lat: null,
          lon: null,
          geocode_precision: null,
        },
      ]),
    saveTourStart: (...a: unknown[]) => saveTourStart(...a) as Promise<void>,
  };
});

const { StartortEinstellung } = await import('./StartortEinstellung');

beforeEach(() => {
  geocodiere.mockReset();
  saveTourStart.mockReset();
  saveTourStart.mockResolvedValue(undefined);
});

describe('StartortEinstellung', () => {
  it('verlangt eine vollstaendige Adresse, bevor etwas hinausgeht', async () => {
    renderWithProviders(<StartortEinstellung />);
    await userEvent.click(await screen.findByRole('button', { name: 'Adresse verorten' }));
    expect(screen.getByText(/sind nötig/)).toBeInTheDocument();
    expect(geocodiere).not.toHaveBeenCalled();
  });

  it('speichert erst nach dem Blick auf den Treffer - mit Bestaetigung unterhalb der Hausnummer', async () => {
    geocodiere.mockResolvedValue({
      ok: true,
      value: { position: { lat: 48.52, lon: 9.06 }, precision: 'street' },
      quelle: 'anbieter',
    });
    renderWithProviders(<StartortEinstellung />);
    await userEvent.type(await screen.findByLabelText('Straße'), 'Praxisplatz');
    await userEvent.type(screen.getByLabelText('Postleitzahl'), '72072');
    await userEvent.type(screen.getByLabelText('Ort'), 'Tübingen');
    await userEvent.click(screen.getByRole('button', { name: 'Adresse verorten' }));

    expect(await screen.findByText(/nur auf die Straße genau/)).toBeInTheDocument();
    expect(saveTourStart).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Als Startort speichern' }));
    await waitFor(() => expect(saveTourStart).toHaveBeenCalledTimes(1));
    expect(saveTourStart.mock.calls[0]![3]).toBe(true);
  });
});
