import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as TerritoriesApi from './api';
import { renderWithProviders } from '@/test-utils';

const checkTerritoryDays = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof TerritoriesApi>()),
  checkTerritoryDays: (plz: string, slots: unknown) =>
    checkTerritoryDays(plz, slots) as Promise<TerritoriesApi.TerritoryCheck[]>,
}));

const { TerritoryHint } = await import('./TerritoryHint');

const NORD = [{ weekday: 1, part: 'am' as const }];

describe('TerritoryHint (PRX-002)', () => {
  beforeEach(() => checkTerritoryDays.mockReset());

  it('warnt bei einem Termin außerhalb und sagt, wann das Gebiet dran ist', async () => {
    checkTerritoryDays.mockResolvedValue([
      { slot_index: 0, status: 'outside', territory_name: 'Nord', day_parts: NORD },
    ]);
    renderWithProviders(
      <TerritoryHint postalCode="72070" slots={[{ datum: '2026-10-06', beginn: '09:00' }]} />,
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      'Außerhalb des Gebietstags. Die Postleitzahl 72070 gehört zum Gebiet Nord (Mo vormittags). Der Termin lässt sich trotzdem anlegen.',
    );
  });

  it('zählt in der Serie, welche Termine außerhalb liegen', async () => {
    checkTerritoryDays.mockResolvedValue([
      { slot_index: 0, status: 'match', territory_name: 'Nord', day_parts: NORD },
      { slot_index: 1, status: 'outside', territory_name: 'Nord', day_parts: NORD },
    ]);
    renderWithProviders(
      <TerritoryHint
        postalCode="72070"
        slots={[
          { datum: '2026-10-05', beginn: '09:00' },
          { datum: '2026-10-06', beginn: '09:00' },
        ]}
      />,
    );
    expect(await screen.findByRole('status')).toHaveTextContent(
      /1 von 2 Terminen liegen außerhalb des Gebietstags: 06\.10\.2026/,
    );
  });

  it('bleibt stumm im Gebietstag, ohne Gebiet und ohne Postleitzahl', async () => {
    checkTerritoryDays.mockResolvedValue([
      { slot_index: 0, status: 'none', territory_name: null, day_parts: null },
    ]);
    const { container } = renderWithProviders(
      <TerritoryHint postalCode="72108" slots={[{ datum: '2026-10-06', beginn: '09:00' }]} />,
    );
    await vi.waitFor(() => expect(checkTerritoryDays).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();

    renderWithProviders(
      <TerritoryHint postalCode={null} slots={[{ datum: '2026-10-06', beginn: '09:00' }]} />,
    );
    expect(checkTerritoryDays).toHaveBeenCalledTimes(1);
  });
});
