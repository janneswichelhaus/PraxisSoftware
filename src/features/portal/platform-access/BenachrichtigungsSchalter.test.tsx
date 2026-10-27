import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as SchalterApi from './benachrichtigungen-api';

/** owner schaltet eine Art für alle ab (KOM-011, ADR-024 Punkt 15). */

const ladeAbgeschalteteArten = vi.fn();
const schalteArt = vi.fn();

vi.mock('./benachrichtigungen-api', async (importOriginal) => ({
  ...(await importOriginal<typeof SchalterApi>()),
  ladeAbgeschalteteArten: () => ladeAbgeschalteteArten() as Promise<string[]>,
  schalteArt: (...args: unknown[]) => schalteArt(...args) as Promise<void>,
}));

const { BenachrichtigungsSchalter } = await import('./BenachrichtigungsSchalter');

beforeEach(() => {
  vi.clearAllMocks();
  ladeAbgeschalteteArten.mockResolvedValue(['plan_assigned']);
  schalteArt.mockResolvedValue(undefined);
});

describe('BenachrichtigungsSchalter (KOM-011)', () => {
  it('zeigt jede Art mit ihrem Wortlaut, abgeschaltete ohne Haken, und nichts über Personen', async () => {
    const { container } = renderWithProviders(<BenachrichtigungsSchalter />);
    expect(await screen.findByRole('checkbox', { name: 'Neuer Übungsplan' })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Erinnerung an einen Termin' })).toBeChecked();
    expect(screen.getAllByRole('checkbox')).toHaveLength(7);
    expect(
      screen.getByText(/Einschalten für eine Person kann die Praxis nicht/),
    ).toBeInTheDocument();
    expect(screen.queryByText(/eingeschaltet haben|Personen haben/)).toBeNull();
    await pruefeBarrierefreiheit(container);
  });

  it('schaltet ab und wieder frei', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<BenachrichtigungsSchalter />);
    await nutzer.click(await screen.findByRole('checkbox', { name: 'Erinnerung an einen Termin' }));
    await waitFor(() => expect(schalteArt).toHaveBeenCalledWith('appointment_reminder', false));
    await nutzer.click(screen.getByRole('checkbox', { name: 'Neuer Übungsplan' }));
    await waitFor(() => expect(schalteArt).toHaveBeenCalledWith('plan_assigned', true));
  });
});
