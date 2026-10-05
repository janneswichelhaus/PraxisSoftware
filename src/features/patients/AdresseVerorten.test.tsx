import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from './api';
import type * as Geocode from '@/lib/location/geocode';
import type * as AppointmentsApi from '@/features/appointments/api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

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

// UBK-006: künftige Hausbesuche mit alter Anschrift und ihr Umstellen.
const fetchVeralteteHausbesuche = vi.fn();
const aktualisiereHausbesuchAdressen = vi.fn();
vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchVeralteteHausbesuche: (...args: unknown[]) =>
      fetchVeralteteHausbesuche(...args) as unknown,
    aktualisiereHausbesuchAdressen: (...args: unknown[]) =>
      aktualisiereHausbesuchAdressen(...args) as unknown,
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

function treffer(precision: string, quelle = 'anbieter', unique = true, matchCount = 1) {
  return {
    ok: true,
    value: {
      position: { lat: 48.52, lon: 9.05 },
      precision,
      unique,
      matchCount,
      matchLabel: 'Musterweg 1',
    },
    quelle,
  };
}

beforeEach(() => {
  fetchVeralteteHausbesuche.mockReset();
  fetchVeralteteHausbesuche.mockResolvedValue([]);
  aktualisiereHausbesuchAdressen.mockReset();
  aktualisiereHausbesuchAdressen.mockResolvedValue(2);
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

  // ADR-019 Punkt 37 (ANN-095 Fassung 2): zwei Treffer, auch hausnummergenau -
  // dann entscheidet die Person.
  it('fragt bei mehreren Treffern nach und sagt, wie viele es sind', async () => {
    geocodiere.mockResolvedValue(treffer('address', 'anbieter', false, 2));
    renderWithProviders(<AdresseVerorten patient={OHNE} />);
    await userEvent.click(screen.getByRole('button', { name: 'Adresse verorten' }));

    expect(await screen.findByText(/kennt 2 Treffer/)).toBeInTheDocument();
    expect(setPatientAddressCoordinate).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Treffer übernehmen' }));
    await waitFor(() => expect(setPatientAddressCoordinate).toHaveBeenCalledTimes(1));
    expect(setPatientAddressCoordinate.mock.calls[0]![3]).toBe(true);
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

  it('bietet bei unvollstaendiger Adresse nichts an und sagt, was fehlt (PAT-15)', () => {
    renderWithProviders(<AdresseVerorten patient={{ ...OHNE, city: null }} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(
      screen.getByText('Für die Kartenposition fehlen Straße, PLZ oder Ort.'),
    ).toBeInTheDocument();
  });

  // PAT-15: Eigene Sätze mit Handlung statt der Titel aus der Routenberechnung.
  it.each([
    ['unavailable', 'Der Kartendienst ist gerade nicht erreichbar. Bitte später erneut verorten.'],
    ['timeout', 'Der Kartendienst ist gerade nicht erreichbar. Bitte später erneut verorten.'],
    [
      'not_configured',
      'Für die Praxis ist kein Kartendienst eingerichtet. Die Adresse bleibt vorerst ohne Kartenposition.',
    ],
    [
      'session_invalid',
      'Die Anmeldung gilt nicht mehr. Bitte neu anmelden und dann erneut verorten.',
    ],
    // Die eigene Funktion war es - der Satz schiebt es nicht dem Kartendienst zu.
    [
      'function_unavailable',
      'Die Verortung ist gerade nicht möglich. Bitte später erneut verorten.',
    ],
  ])('meldet „%s" mit einem Satz, der sagt, was jetzt geht', async (code, satz) => {
    geocodiere.mockResolvedValue({ ok: false, error: { code, message: 'x' } });
    renderWithProviders(<AdresseVerorten patient={OHNE} />);
    await userEvent.click(screen.getByRole('button', { name: 'Adresse verorten' }));

    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent(satz);
    expect(meldung.textContent).not.toMatch(/Routenfunktion|Serverschlüssel|Anfrage nicht gültig/);
  });

  describe('UBK-006: nach dem Verorten die alten Hausbesuche mitfragen (ANN-236)', () => {
    const besuch = (id: string) => ({
      id,
      starts_at: '2026-10-06T08:30:00Z',
      ends_at: '2026-10-06T09:30:00Z',
      staff_given_name: 'Jannes',
      staff_family_name: 'Test',
      visit_street: 'Altweg',
      visit_house_number: '3',
      visit_postal_code: '72070',
      visit_city: 'Tübingen',
      organization_time_zone: 'Europe/Berlin',
    });

    it('fragt nach dem Verorten, ob die kuenftigen Hausbesuche umgestellt werden', async () => {
      geocodiere.mockResolvedValue(treffer('address'));
      fetchVeralteteHausbesuche.mockResolvedValue([besuch('a'), besuch('b')]);
      const user = testUser(['therapist']);
      const { rerender } = renderWithProviders(<AdresseVerorten patient={OHNE} user={user} />);
      await userEvent.click(screen.getByRole('button', { name: 'Adresse verorten' }));
      await waitFor(() => expect(setPatientAddressCoordinate).toHaveBeenCalled());

      // Die Akte lädt neu, jetzt mit Koordinate.
      rerender(<AdresseVerorten patient={{ ...OHNE, geocode_precision: 'address' }} user={user} />);
      expect(
        await screen.findByText(/2 künftige Hausbesuche nennen noch die alte Anschrift/),
      ).toBeInTheDocument();

      await userEvent.click(
        screen.getByRole('button', { name: 'Alle 2 auf die neue Anschrift umstellen' }),
      );
      await waitFor(() => expect(aktualisiereHausbesuchAdressen).toHaveBeenCalledWith(['a', 'b']));
      expect(await screen.findByText(/Umgestellt/)).toBeInTheDocument();
    });

    it('fragt nicht, wenn nichts abweicht, und nicht ohne Recht an Terminen', async () => {
      geocodiere.mockResolvedValue(treffer('address'));
      fetchVeralteteHausbesuche.mockResolvedValue([besuch('a')]);
      const ohneRecht = testUser(['trainer']);
      const { rerender } = renderWithProviders(<AdresseVerorten patient={OHNE} user={ohneRecht} />);
      await userEvent.click(screen.getByRole('button', { name: 'Adresse verorten' }));
      await waitFor(() => expect(setPatientAddressCoordinate).toHaveBeenCalled());
      rerender(
        <AdresseVerorten patient={{ ...OHNE, geocode_precision: 'address' }} user={ohneRecht} />,
      );
      expect(screen.queryByText(/alte Anschrift/)).toBeNull();
      expect(fetchVeralteteHausbesuche).not.toHaveBeenCalled();
    });

    it('fragt beim blossen Anzeigen einer verorteten Adresse nicht', () => {
      renderWithProviders(
        <AdresseVerorten
          patient={{ ...OHNE, geocode_precision: 'address' }}
          user={testUser(['therapist'])}
        />,
      );
      expect(fetchVeralteteHausbesuche).not.toHaveBeenCalled();
    });
  });
});
