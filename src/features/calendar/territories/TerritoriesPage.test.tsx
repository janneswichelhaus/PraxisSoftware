import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TerritoriesApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchTerritories = vi.fn();
const saveTerritory = vi.fn();
const fetchActiveAddressPoints = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof TerritoriesApi>()),
  fetchTerritories: () => fetchTerritories() as Promise<TerritoriesApi.Territory[]>,
  saveTerritory: (t: unknown, v: unknown) => saveTerritory(t, v) as Promise<string>,
  fetchActiveAddressPoints: () =>
    fetchActiveAddressPoints() as Promise<TerritoriesApi.ActiveAddressPoint[]>,
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
    fetchActiveAddressPoints.mockReset();
    fetchActiveAddressPoints.mockResolvedValue([]);
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

  describe('Anschriften laufender Behandlungen (ANN-835)', () => {
    const PUNKTE: TerritoriesApi.ActiveAddressPoint[] = [
      { postal_code: '72072', lat: 48.516, lon: 9.035, addresses: 2 },
      { postal_code: '72070', lat: 48.531, lon: 9.049, addresses: 1 },
      { postal_code: '72076', lat: null, lon: null, addresses: 1 },
    ];

    it('zeigt sie je Postleitzahl mit Gebiet; ohne Gebiet als Zeichen und Wort', async () => {
      fetchTerritories.mockResolvedValue([NORD]);
      fetchActiveAddressPoints.mockResolvedValue(PUNKTE);
      renderWithProviders(<TerritoriesPage user={testUser(['office'])} />);

      const liste = await screen.findByRole('list', { name: 'Anschriften nach Postleitzahl' });
      const zeilen = within(liste).getAllByRole('listitem');
      expect(zeilen.map((z) => z.textContent)).toEqual([
        '720701 Anschrift · Gebiet Nord',
        '720722 Anschriften · Gebiet Nord',
        '720761 Anschrift!ohne Gebiet',
      ]);
      expect(
        screen.getByText('Eine Anschrift steht nicht auf der Karte: Sie ist nicht genau verortet.'),
      ).toBeInTheDocument();
      // Am Telefon bleibt die Karte zu und lädt nichts.
      expect(screen.getByRole('heading', { name: 'Karte' })).toBeInTheDocument();
      expect(screen.queryByText('Karte wird geladen …')).not.toBeInTheDocument();
    });

    it('steht für owner und Teamleitung, nicht für Therapeut:innen - die fragen gar nicht', async () => {
      fetchTerritories.mockResolvedValue([NORD]);
      fetchActiveAddressPoints.mockResolvedValue(PUNKTE);
      for (const rollen of [['owner'], ['therapist', 'team_lead']] as const) {
        const { unmount } = renderWithProviders(<TerritoriesPage user={testUser([...rollen])} />);
        expect(
          await screen.findByRole('heading', { name: 'Anschriften laufender Behandlungen' }),
        ).toBeInTheDocument();
        unmount();
      }

      fetchActiveAddressPoints.mockClear();
      renderWithProviders(<TerritoriesPage user={testUser(['therapist'])} />);
      expect(await screen.findByText('Nord')).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Anschriften laufender Behandlungen' }),
      ).not.toBeInTheDocument();
      expect(fetchActiveAddressPoints).not.toHaveBeenCalled();
    });

    it('wartet auf die Gebiete, damit keine Postleitzahl falsch „ohne Gebiet“ heißt', async () => {
      fetchTerritories.mockReturnValue(new Promise(() => undefined));
      fetchActiveAddressPoints.mockResolvedValue(PUNKTE);
      renderWithProviders(<TerritoriesPage user={testUser(['office'])} />);
      expect(await screen.findByText('Gebiete werden geladen …')).toBeInTheDocument();
      expect(screen.queryByText('ohne Gebiet')).toBeNull();
      expect(fetchActiveAddressPoints).not.toHaveBeenCalled();
    });

    it('nennt die Rechtssätze einmal am Seitenende', async () => {
      fetchTerritories.mockResolvedValue([NORD]);
      fetchActiveAddressPoints.mockResolvedValue(PUNKTE);
      renderWithProviders(<TerritoriesPage user={testUser(['office'])} />);
      const satz = await screen.findByText(
        /Gebietstage warnen beim Hausbesuch; sie verbieten nichts\. Anschriften als Punkte ohne Namen/,
      );
      const liste = await screen.findByRole('list', { name: 'Anschriften nach Postleitzahl' });
      expect(liste.compareDocumentPosition(satz) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('sagt, wenn nichts da ist oder nichts lädt', async () => {
      fetchTerritories.mockResolvedValue([]);
      const { unmount } = renderWithProviders(<TerritoriesPage user={testUser(['office'])} />);
      expect(
        await screen.findByText('Keine laufende Behandlung mit Anschrift'),
      ).toBeInTheDocument();
      unmount();

      fetchActiveAddressPoints.mockRejectedValue(
        new Error('Die Anschriften konnten nicht geladen werden.'),
      );
      renderWithProviders(<TerritoriesPage user={testUser(['office'])} />);
      expect(
        await screen.findByText('Die Anschriften konnten nicht geladen werden.'),
      ).toBeInTheDocument();
    });
  });
});
