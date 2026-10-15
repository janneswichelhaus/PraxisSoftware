import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { testUser } from '@/test-utils';
import * as api from './api';
import { KeyPage } from './KeyPage';
import { TIM, testFlotte, testRad } from './testdaten';
import { rendereSeite } from './testseite';

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof api>()),
  fetchFleet: vi.fn(),
  takeKey: vi.fn(),
}));

const fetchFleet = vi.mocked(api.fetchFleet);
const takeKey = vi.mocked(api.takeKey);

function oeffne(pfad = '/betrieb/flotte/schluessel') {
  return rendereSeite(
    '/betrieb/flotte/schluessel',
    <KeyPage user={testUser(['therapist'])} />,
    pfad,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  const flotte = testFlotte();
  fetchFleet.mockResolvedValue({
    ...flotte,
    bikes: [
      ...flotte.bikes,
      testRad({
        id: 'rad-2',
        name: 'Lastenrad 2',
        key: { holder_staff_id: TIM.id, holder_name: TIM.name, taken_at: '2026-10-15T05:40:00Z' },
      }),
    ],
  });
  takeKey.mockResolvedValue();
});

/**
 * Schlüssel eintragen (FLT-EPIC-001): nur Räder mit Schlüssel im Tresor und
 * ohne Sperre, die Person aus dem Mitarbeiterstamm, das eigene Konto
 * vorbelegt; kein Rad vorgewählt außer aus der Adresszeile (VOR-18).
 */
describe('Schlüssel eintragen', () => {
  it('bietet weder einen vergebenen Schlüssel noch ein gesperrtes Rad an', async () => {
    oeffne();
    const rad = await screen.findByRole('combobox', { name: 'Rad' });
    const angebote = within(rad)
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(angebote).toEqual([
      'Bitte wählen …',
      'Lastenrad 1 · Raddepot Nord',
      'Lastenrad 4 · Raddepot Nord',
      'Lastenrad 5 (Ersatz) · Raddepot Süd',
    ]);
    expect(rad).toHaveValue('');
    expect(screen.getByRole('combobox', { name: 'Schlüssel bei' })).toHaveDisplayValue(
      'Anna Beispiel (Sie)',
    );
    expect(screen.getByRole('button', { name: 'Schlüssel eintragen' })).toBeDisabled();
  });

  it('trägt den Schlüssel für sich selbst ohne Personenangabe ein', async () => {
    const nutzer = userEvent.setup();
    oeffne('/betrieb/flotte/schluessel?rad=rad-4');
    expect(await screen.findByRole('combobox', { name: 'Rad' })).toHaveValue('rad-4');
    await nutzer.click(screen.getByRole('button', { name: 'Schlüssel eintragen' }));
    expect(takeKey).toHaveBeenCalledWith('rad-4', null);
    expect(await screen.findByTestId('ziel-meldung')).toHaveTextContent(
      'Schlüssel von Lastenrad 4 bei Ihnen eingetragen.',
    );
  });

  it('trägt den Schlüssel für eine Kollegin aus dem Stamm ein', async () => {
    const nutzer = userEvent.setup();
    oeffne();
    await nutzer.selectOptions(await screen.findByRole('combobox', { name: 'Rad' }), 'rad-5');
    await nutzer.selectOptions(screen.getByRole('combobox', { name: 'Schlüssel bei' }), TIM.id);
    await nutzer.click(screen.getByRole('button', { name: 'Schlüssel eintragen' }));
    expect(takeKey).toHaveBeenCalledWith('rad-5', TIM.id);
    expect(await screen.findByTestId('ziel-meldung')).toHaveTextContent(
      'Schlüssel von Lastenrad 5 (Ersatz) bei Tim Teamleitung eingetragen.',
    );
  });

  it('übernimmt kein Rad aus der Adresszeile, dessen Schlüssel schon vergeben ist', async () => {
    oeffne('/betrieb/flotte/schluessel?rad=rad-2');
    expect(await screen.findByRole('combobox', { name: 'Rad' })).toHaveValue('');
  });
});
