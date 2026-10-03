import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as StaffApi from './api';
import { renderWithProviders, testStaffMember } from '@/test-utils';

/**
 * Im Kalender, ohne eigenen Zugang (AKTE-009, ANN-226).
 */

const setzeKalender = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof StaffApi>()),
  setzeKalender: (id: string, kalender: { behandlung: boolean; training: boolean }) =>
    setzeKalender(id, kalender) as Promise<void>,
}));

const { StaffCalendarSection } = await import('./StaffCalendarSection');

const NINA = testStaffMember({
  id: '55555555-5555-4555-8555-000000000005',
  given_name: 'Nina',
  family_name: 'Neu',
});

describe('StaffCalendarSection (AKTE-009)', () => {
  beforeEach(() => {
    setzeKalender.mockReset().mockResolvedValue(undefined);
  });

  it('nimmt eine Person ohne Zugang in den Kalender fuer Behandlungen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StaffCalendarSection staff={NINA} />);

    const behandlung = screen.getByRole('checkbox', { name: 'Im Kalender für Behandlungen' });
    const training = screen.getByRole('checkbox', { name: 'Im Kalender für Personal Training' });
    expect(behandlung).not.toBeChecked();
    expect(training).not.toBeChecked();
    // Ohne Änderung gibt es nichts zu speichern.
    expect(screen.getByRole('button', { name: 'Kalender speichern' })).toBeDisabled();

    await user.click(behandlung);
    await user.click(screen.getByRole('button', { name: 'Kalender speichern' }));

    await waitFor(() =>
      expect(setzeKalender).toHaveBeenCalledWith(NINA.id, { behandlung: true, training: false }),
    );
  });

  it('zeigt den gespeicherten Stand und nimmt die Person wieder heraus', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StaffCalendarSection
        staff={{ ...NINA, schedulable_treatment: true, schedulable_training: true }}
      />,
    );
    const training = screen.getByRole('checkbox', { name: 'Im Kalender für Personal Training' });
    expect(training).toBeChecked();
    await user.click(training);
    await user.click(screen.getByRole('button', { name: 'Kalender speichern' }));
    await waitFor(() =>
      expect(setzeKalender).toHaveBeenCalledWith(NINA.id, { behandlung: true, training: false }),
    );
  });

  it('sperrt die Auswahl fuer eine inaktive Person und sagt warum', () => {
    renderWithProviders(
      <StaffCalendarSection staff={{ ...NINA, employment_status: 'inactive' }} />,
    );
    expect(screen.getByRole('checkbox', { name: 'Im Kalender für Behandlungen' })).toBeDisabled();
    expect(screen.getByText(/Inaktiv – wird unabhängig davon nicht/)).toBeInTheDocument();
  });

  it('meldet einen Fehler als Text', async () => {
    setzeKalender.mockRejectedValue(
      new Error('Die Angabe zum Kalender konnte nicht gespeichert werden.'),
    );
    const user = userEvent.setup();
    renderWithProviders(<StaffCalendarSection staff={NINA} />);
    await user.click(screen.getByRole('checkbox', { name: 'Im Kalender für Behandlungen' }));
    await user.click(screen.getByRole('button', { name: 'Kalender speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Angabe zum Kalender konnte nicht gespeichert werden.',
    );
  });
});
