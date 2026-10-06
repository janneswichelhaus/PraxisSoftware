import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlattformApi from './api';
import type { Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * „Termin wünschen" (POR-009, DSN-001 4.1): Tage und Tageszeiten ankreuzen,
 * eine Zeile, ein Hauptknopf; ohne Tag kein Senden; der Wunsch geht als Wunsch
 * an den Server, nie als Termin.
 */

const terminWuenschen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  terminWuenschen: (...args: unknown[]) => terminWuenschen(...args) as Promise<string>,
}));

const { Terminwunsch, WUNSCHTAGE } = await import('./Terminwunsch');
const { naechsteWerktage, wochentagMitDatum } = await import('./zeit');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  terminWuenschen.mockResolvedValue('dddddddd-dddd-4ddd-8ddd-000000000001');
});

describe('Terminwunsch (POR-009)', () => {
  it('bietet die naechsten Werktage und drei Tageszeiten an', () => {
    renderWithProviders(<Terminwunsch zugang={ZUGANG} />, '/p/termine/wunsch?bereich=treatment');
    const tage = naechsteWerktage(WUNSCHTAGE);
    expect(tage).toHaveLength(14);
    for (const tag of tage) {
      expect(screen.getByRole('checkbox', { name: wochentagMitDatum(tag) })).toBeInTheDocument();
      expect(new Date(`${tag}T12:00:00`).getDay()).not.toBe(0);
      expect(new Date(`${tag}T12:00:00`).getDay()).not.toBe(6);
    }
    expect(screen.getByRole('checkbox', { name: 'Vormittag' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Mittag' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Nachmittag' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Wunsch senden' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
    expect(screen.getByText(/Ein vereinbarter Termin ist das noch nicht/)).toBeInTheDocument();
  });

  it('verlangt mindestens einen Tag, bevor es sendet', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<Terminwunsch zugang={ZUGANG} />, '/p/termine/wunsch');
    await nutzer.click(screen.getByRole('button', { name: 'Wunsch senden' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Bitte wählen Sie mindestens einen Tag.');
    expect(terminWuenschen).not.toHaveBeenCalled();
  });

  it('sendet Tage, Tageszeiten und Zeile als Wunsch an den Server', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<Terminwunsch zugang={ZUGANG} />, '/p/termine/wunsch?bereich=treatment');
    const [erster, zweiter] = naechsteWerktage(WUNSCHTAGE);
    await nutzer.click(screen.getByRole('checkbox', { name: wochentagMitDatum(erster!) }));
    await nutzer.click(screen.getByRole('checkbox', { name: wochentagMitDatum(zweiter!) }));
    await nutzer.click(screen.getByRole('checkbox', { name: 'Nachmittag' }));
    await nutzer.type(screen.getByLabelText(/Was sollen wir noch wissen/), 'Bitte nach 15 Uhr.');
    await nutzer.click(screen.getByRole('button', { name: 'Wunsch senden' }));
    await waitFor(() =>
      expect(terminWuenschen).toHaveBeenCalledWith({
        zugangId: ZUGANG.access_id,
        tage: [erster, zweiter],
        zeiten: ['afternoon'],
        notiz: 'Bitte nach 15 Uhr.',
      }),
    );
  });

  it('zeigt die Abweisung des Servers als Satz', async () => {
    const nutzer = userEvent.setup();
    terminWuenschen.mockRejectedValue(new Error('Bitte wählen Sie höchstens 14 Tage.'));
    renderWithProviders(<Terminwunsch zugang={ZUGANG} />, '/p/termine/wunsch');
    const [erster] = naechsteWerktage(WUNSCHTAGE);
    await nutzer.click(screen.getByRole('checkbox', { name: wochentagMitDatum(erster!) }));
    await nutzer.click(screen.getByRole('button', { name: 'Wunsch senden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('höchstens 14 Tage');
  });
});
