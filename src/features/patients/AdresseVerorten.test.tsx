import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from './api';
import type * as Geocode from '@/lib/location/geocode';
import { renderWithProviders, testPatient } from '@/test-utils';

/**
 * Adresse verorten (MAP-006a, ANN-016): nur auf Handlung, nur ohne
 * Koordinate, unterhalb der Hausnummer nur mit Bestätigung.
 */

const geocodiere = vi.fn();
const setPatientAddressCoordinate = vi.fn();

vi.mock('@/lib/location/geocode', async (importOriginal) => {
  const actual = await importOriginal<typeof Geocode>();
  return { ...actual, geocodiere: (...args: unknown[]) => geocodiere(...args) as unknown };
});

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    setPatientAddressCoordinate: (...args: unknown[]) =>
      setPatientAddressCoordinate(...args) as Promise<void>,
  };
});

const { AdresseVerorten } = await import('./AdresseVerorten');

const OHNE = testPatient({
  id: 'p1',
  given_name: 'Erika',
  street: 'Musterweg',
  house_number: '1',
  postal_code: '72070',
  city: 'Tübingen',
  geocode_precision: null,
});

function treffer(precision: string, quelle = 'anbieter') {
  return {
    ok: true,
    value: { position: { lat: 48.52, lon: 9.05 }, precision, matchLabel: 'Musterweg 1' },
    quelle,
  };
}

beforeEach(() => {
  geocodiere.mockReset();
  setPatientAddressCoordinate.mockReset();
  setPatientAddressCoordinate.mockResolvedValue(undefined);
});

describe('AdresseVerorten', () => {
  it('geocodiert nicht beim Anzeigen - nur auf Knopfdruck', () => {
    renderWithProviders(<AdresseVerorten patient={OHNE} />);
    expect(geocodiere).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Adresse verorten' })).toBeInTheDocument();
  });

  it('bietet bei vorhandener Koordinate keinen Knopf an', () => {
    renderWithProviders(<AdresseVerorten patient={{ ...OHNE, geocode_precision: 'address' }} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText(/auf die Hausnummer genau/)).toBeInTheDocument();
  });

  it('schickt nur die Anschrift, nie den Namen', async () => {
    geocodiere.mockResolvedValue(treffer('address'));
    renderWithProviders(<AdresseVerorten patient={OHNE} />);
    await userEvent.click(screen.getByRole('button', { name: 'Adresse verorten' }));

    await waitFor(() => expect(geocodiere).toHaveBeenCalledTimes(1));
    expect(geocodiere.mock.calls[0]![0]).toEqual({
      street: 'Musterweg',
      houseNumber: '1',
      postalCode: '72070',
      city: 'Tübingen',
      countryCode: 'DE',
    });
    expect(JSON.stringify(geocodiere.mock.calls[0])).not.toContain('Erika');
  });

  it('speichert einen hausnummerngenauen Treffer des Anbieters ohne Rueckfrage', async () => {
    geocodiere.mockResolvedValue(treffer('address'));
    renderWithProviders(<AdresseVerorten patient={OHNE} />);
    await userEvent.click(screen.getByRole('button', { name: 'Adresse verorten' }));

    await waitFor(() => expect(setPatientAddressCoordinate).toHaveBeenCalledTimes(1));
    expect(setPatientAddressCoordinate.mock.calls[0]![3]).toBe(false);
    // Gespeichert wird die Anschrift, die geocodiert wurde.
    expect(setPatientAddressCoordinate.mock.calls[0]![1]).toEqual({
      street: 'Musterweg',
      houseNumber: '1',
      postalCode: '72070',
      city: 'Tübingen',
    });
  });

  it('verlangt unterhalb der Hausnummer eine Bestaetigung', async () => {
    geocodiere.mockResolvedValue(treffer('street'));
    renderWithProviders(<AdresseVerorten patient={OHNE} />);
    await userEvent.click(screen.getByRole('button', { name: 'Adresse verorten' }));

    expect(await screen.findByText(/nur auf die Straße genau/)).toBeInTheDocument();
    expect(setPatientAddressCoordinate).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('button', { name: 'Treffer übernehmen' }));
    await waitFor(() => expect(setPatientAddressCoordinate).toHaveBeenCalledTimes(1));
    expect(setPatientAddressCoordinate.mock.calls[0]![3]).toBe(true);
  });

  it('laesst eine Position der Nachbildung nie unbemerkt durch', async () => {
    geocodiere.mockResolvedValue(treffer('address', 'nachbildung'));
    renderWithProviders(<AdresseVerorten patient={OHNE} />);
    await userEvent.click(screen.getByRole('button', { name: 'Adresse verorten' }));

    expect(await screen.findByText(/Nachbildung ohne Kartendienst/)).toBeInTheDocument();
    expect(setPatientAddressCoordinate).not.toHaveBeenCalled();
  });

  it('verwirft einen Treffer ohne zu speichern', async () => {
    geocodiere.mockResolvedValue(treffer('locality'));
    renderWithProviders(<AdresseVerorten patient={OHNE} />);
    await userEvent.click(screen.getByRole('button', { name: 'Adresse verorten' }));
    await userEvent.click(await screen.findByRole('button', { name: 'Verwerfen' }));

    expect(setPatientAddressCoordinate).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Adresse verorten' })).toBeInTheDocument();
  });

  it('meldet "kein Treffer" verstaendlich', async () => {
    geocodiere.mockResolvedValue({ ok: false, error: { code: 'not_found', message: 'x' } });
    renderWithProviders(<AdresseVerorten patient={OHNE} />);
    await userEvent.click(screen.getByRole('button', { name: 'Adresse verorten' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/keinen Treffer/);
  });

  it('bietet bei unvollstaendiger Adresse nichts an', () => {
    renderWithProviders(<AdresseVerorten patient={{ ...OHNE, city: null }} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
