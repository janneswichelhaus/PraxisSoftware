import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { testUser } from '@/test-utils';
import * as api from './api';
import { BikeNewPage } from './BikeNewPage';
import { DepotsPage } from './DepotsPage';
import { NINA, testFlotte } from './testdaten';
import { rendereSeite } from './testseite';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fetchFleet: vi.fn(),
  saveBike: vi.fn(),
  saveDepot: vi.fn(),
  deleteDepot: vi.fn(),
}));

const fetchFleet = vi.mocked(api.fetchFleet);
const saveBike = vi.mocked(api.saveBike);
const saveDepot = vi.mocked(api.saveDepot);

beforeEach(() => {
  vi.clearAllMocks();
  fetchFleet.mockResolvedValue(testFlotte({ can_manage: true }));
  saveBike.mockResolvedValue('rad-neu');
  saveDepot.mockResolvedValue('depot-neu');
});

/**
 * Rad anlegen und Depots (FLT-EPIC-001, nur owner nach BEF-066): Die Seiten
 * bieten an, was der Server annimmt; die Felder gehen vollständig hinaus.
 */
describe('Rad hinzufügen', () => {
  it('legt ein Rad mit Stammnutzer:in und Tagen an und öffnet es danach', async () => {
    const nutzer = userEvent.setup();
    rendereSeite(
      '/betrieb/flotte/rad/neu',
      <BikeNewPage user={testUser(['owner'])} />,
      '/betrieb/flotte/rad/neu',
    );
    await nutzer.type(await screen.findByRole('textbox', { name: 'Name' }), 'Lastenrad 7');
    await nutzer.selectOptions(screen.getByRole('combobox', { name: 'Stammnutzer:in' }), NINA.id);
    await nutzer.click(screen.getByRole('checkbox', { name: 'Mi' }));
    await nutzer.click(screen.getByRole('checkbox', { name: 'Fr' }));
    await nutzer.click(screen.getByRole('button', { name: 'Rad anlegen' }));

    expect(saveBike).toHaveBeenCalledWith({
      id: null,
      name: 'Lastenrad 7',
      homeDepotId: 'depot-nord',
      currentDepotId: 'depot-nord',
      specialLocation: '',
      isSpare: false,
      regularRiderId: NINA.id,
      plannedWeekdays: [3, 5],
      battery: '',
      note: '',
      expectedUpdatedAt: null,
    });
    expect(await screen.findByTestId('ziel')).toHaveTextContent(
      '/betrieb/flotte/rad/rad-neu?bereich=angaben',
    );
    expect(screen.getByTestId('ziel-meldung')).toHaveTextContent('Rad angelegt.');
  });

  it('verlangt Namen und, an einem anderen Ort, dessen Bezeichnung', async () => {
    const nutzer = userEvent.setup();
    rendereSeite(
      '/betrieb/flotte/rad/neu',
      <BikeNewPage user={testUser(['owner'])} />,
      '/betrieb/flotte/rad/neu',
    );
    await nutzer.selectOptions(
      await screen.findByRole('combobox', { name: 'Steht gerade' }),
      'anders',
    );
    await nutzer.click(screen.getByRole('button', { name: 'Rad anlegen' }));
    expect(screen.getByText('Bitte einen Namen angeben.')).toBeInTheDocument();
    expect(screen.getByText('Bitte den Ort nennen.')).toBeInTheDocument();
    expect(saveBike).not.toHaveBeenCalled();
  });

  it('bietet ohne Recht kein Formular an', async () => {
    fetchFleet.mockResolvedValue(testFlotte({ can_manage: false }));
    rendereSeite(
      '/betrieb/flotte/rad/neu',
      <BikeNewPage user={testUser(['therapist'])} />,
      '/betrieb/flotte/rad/neu',
    );
    expect(await screen.findByText('Räder legt die Praxisinhaber:in an.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rad anlegen' })).toBeNull();
  });
});

describe('Depots', () => {
  it('legt ein Depot an und bietet „Entfernen“ nur für ein leeres an', async () => {
    const nutzer = userEvent.setup();
    rendereSeite(
      '/betrieb/flotte/depots',
      <DepotsPage user={testUser(['owner'])} />,
      '/betrieb/flotte/depots',
    );
    expect(await screen.findByText('Raddepot Nord')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Raddepot Nord ändern' }));
    // Im Depot Nord stehen Räder: kein Entfernen.
    expect(screen.queryByRole('button', { name: 'Entfernen' })).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Abbrechen' }));

    const namen = screen.getAllByRole('textbox', { name: 'Name' });
    await nutzer.type(namen[namen.length - 1]!, 'Raddepot West');
    await nutzer.click(screen.getByRole('button', { name: 'Depot anlegen' }));
    expect(saveDepot).toHaveBeenCalledWith({ id: null, name: 'Raddepot West', note: '' });
    expect(await screen.findByText('Depot angelegt.')).toBeInTheDocument();
  });

  it('sagt ohne Recht, wer die Depots verwaltet', async () => {
    fetchFleet.mockResolvedValue(testFlotte({ can_manage: false }));
    rendereSeite(
      '/betrieb/flotte/depots',
      <DepotsPage user={testUser(['therapist'])} />,
      '/betrieb/flotte/depots',
    );
    expect(await screen.findByText('Depots verwaltet die Praxisinhaber:in.')).toBeInTheDocument();
  });
});
