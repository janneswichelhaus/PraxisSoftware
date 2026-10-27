import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TerritoriesApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchTerritories = vi.fn();
const saveTerritory = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof TerritoriesApi>()),
  fetchTerritories: () => fetchTerritories() as Promise<TerritoriesApi.Territory[]>,
  saveTerritory: (t: unknown, v: unknown) => saveTerritory(t, v) as Promise<string>,
}));

const { TerritoriesPage } = await import('./TerritoriesPage');

const NORD: TerritoriesApi.Territory = {
  id: 't1',
  name: 'Nord',
  day_parts: [{ weekday: 1, part: 'am' }],
  postal_codes: ['72070', '72072'],
  updated_at: '2026-09-28T08:00:00+00:00',
};

describe('TerritoriesPage (PRX-002)', () => {
  beforeEach(() => {
    fetchTerritories.mockReset();
    saveTerritory.mockReset();
  });

  it('zeigt Gebiet, Tage und Postleitzahlen; Therapeut:innen lesen nur', async () => {
    fetchTerritories.mockResolvedValue([NORD]);
    renderWithProviders(<TerritoriesPage user={testUser(['therapist'])} />);
    // Jedes Gebiet ist eine Zeile der Liste (Design-Rollout B1), keine Karte
    // mit eigener Überschrift.
    expect(await screen.findByText('Nord')).toBeInTheDocument();
    expect(screen.getByText('Mo vormittags')).toBeInTheDocument();
    expect(screen.getByText('72070, 72072')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Bearbeiten/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gebiet anlegen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /entfernen/ })).not.toBeInTheDocument();
  });

  it('bearbeitet ein Gebiet an seiner Stelle; Entfernen steht leise am Ende', async () => {
    fetchTerritories.mockResolvedValue([NORD]);
    const user = userEvent.setup();
    renderWithProviders(<TerritoriesPage user={testUser(['office'])} />);

    await user.click(await screen.findByRole('button', { name: 'Bearbeiten: Nord' }));
    expect(screen.getByLabelText('Name des Gebiets')).toHaveValue('Nord');
    expect(screen.getByRole('button', { name: 'Gebiet entfernen' })).toBeInTheDocument();
    // Während bearbeitet wird, gibt es kein zweites Formular.
    expect(screen.queryByRole('button', { name: 'Gebiet anlegen' })).not.toBeInTheDocument();
  });

  it('legt ein Gebiet an: beide Hälften heißen ganztags', async () => {
    fetchTerritories.mockResolvedValue([]);
    saveTerritory.mockResolvedValue('t2');
    const user = userEvent.setup();
    renderWithProviders(<TerritoriesPage user={testUser(['office'])} />);

    await user.click(await screen.findByRole('button', { name: 'Gebiet anlegen' }));
    await user.type(screen.getByLabelText('Name des Gebiets'), 'Süd');
    await user.type(screen.getByLabelText(/Postleitzahlen/), '72074 72076, 72074');
    await user.click(screen.getByRole('checkbox', { name: 'Dienstag Vormittag' }));
    await user.click(screen.getByRole('checkbox', { name: 'Dienstag Nachmittag' }));
    await user.click(screen.getByRole('checkbox', { name: 'Freitag Nachmittag' }));
    await user.click(screen.getByRole('button', { name: 'Gebiet speichern' }));

    expect(saveTerritory).toHaveBeenCalledWith(null, {
      name: 'Süd',
      postalCodes: ['72074', '72076'],
      dayParts: [
        { weekday: 2, part: 'day' },
        { weekday: 5, part: 'pm' },
      ],
    });
  });

  it('nennt ungültige Postleitzahlen, bevor etwas gespeichert wird', async () => {
    fetchTerritories.mockResolvedValue([]);
    const user = userEvent.setup();
    renderWithProviders(<TerritoriesPage user={testUser(['office'])} />);

    await user.click(await screen.findByRole('button', { name: 'Gebiet anlegen' }));
    await user.type(screen.getByLabelText('Name des Gebiets'), 'Ost');
    await user.type(screen.getByLabelText(/Postleitzahlen/), '7207');
    await user.click(screen.getByRole('button', { name: 'Gebiet speichern' }));

    expect(await screen.findByText(/Keine Postleitzahl: 7207/)).toBeInTheDocument();
    expect(saveTerritory).not.toHaveBeenCalled();
  });
});
