import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as StaffApi from './api';
import { renderWithProviders, testStaffMember } from '@/test-utils';

/**
 * Der Einsatz einer Person: im Kalender ohne eigenen Zugang (AKTE-009,
 * ANN-226) und das Vergütungsmodell (STA-005) - ein Formular, ein Speichern
 * (Welle B, B7). Speichern ruft nur, was sich geändert hat.
 */

const setzeKalender = vi.fn();
const fetchVerguetungsmodell = vi.fn();
const setzeVerguetungsmodell = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof StaffApi>()),
  setzeKalender: (id: string, kalender: { behandlung: boolean; training: boolean }) =>
    setzeKalender(id, kalender) as Promise<void>,
  fetchVerguetungsmodell: (id: string) =>
    fetchVerguetungsmodell(id) as Promise<StaffApi.Verguetungsmodell | null>,
  setzeVerguetungsmodell: (id: string, modell: string | null) =>
    setzeVerguetungsmodell(id, modell) as Promise<void>,
}));

const { StaffEinsatz } = await import('./StaffEinsatz');

const NINA = testStaffMember({
  id: '55555555-5555-4555-8555-000000000005',
  given_name: 'Nina',
  family_name: 'Neu',
});

describe('StaffEinsatz (AKTE-009, STA-005)', () => {
  beforeEach(() => {
    setzeKalender.mockReset().mockResolvedValue(undefined);
    fetchVerguetungsmodell.mockReset().mockResolvedValue(null);
    setzeVerguetungsmodell.mockReset().mockResolvedValue(undefined);
  });

  it('nimmt eine Person ohne Zugang in den Kalender fuer Behandlungen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StaffEinsatz staff={NINA} />);

    const behandlung = screen.getByRole('checkbox', { name: 'Im Kalender für Behandlungen' });
    const training = screen.getByRole('checkbox', { name: 'Im Kalender für Personal Training' });
    expect(behandlung).not.toBeChecked();
    expect(training).not.toBeChecked();

    await user.click(behandlung);
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(setzeKalender).toHaveBeenCalledWith(NINA.id, { behandlung: true, training: false }),
    );
    // Nur, was sich geändert hat, geht an den Server.
    expect(setzeVerguetungsmodell).not.toHaveBeenCalled();
    expect(await screen.findByText('Gespeichert.')).toBeInTheDocument();
  });

  it('zeigt den gespeicherten Stand und nimmt die Person wieder heraus', async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <StaffEinsatz staff={{ ...NINA, schedulable_treatment: true, schedulable_training: true }} />,
    );
    const training = screen.getByRole('checkbox', { name: 'Im Kalender für Personal Training' });
    expect(training).toBeChecked();
    await user.click(training);
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() =>
      expect(setzeKalender).toHaveBeenCalledWith(NINA.id, { behandlung: true, training: false }),
    );
  });

  it('sperrt die Auswahl fuer eine inaktive Person und sagt warum', () => {
    renderWithProviders(<StaffEinsatz staff={{ ...NINA, employment_status: 'inactive' }} />);
    expect(screen.getByRole('checkbox', { name: 'Im Kalender für Behandlungen' })).toBeDisabled();
    expect(screen.getByText(/Inaktiv – wird unabhängig davon nicht/)).toBeInTheDocument();
  });

  it('meldet einen Fehler als Text und nennt, was nicht gespeichert ist', async () => {
    setzeKalender.mockRejectedValue(
      new Error('Die Angabe zum Kalender konnte nicht gespeichert werden.'),
    );
    const user = userEvent.setup();
    renderWithProviders(<StaffEinsatz staff={NINA} />);
    await user.click(screen.getByRole('checkbox', { name: 'Im Kalender für Behandlungen' }));
    await user.click(screen.getByRole('button', { name: 'Speichern' }));
    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent('Der Kalender wurde nicht gespeichert');
    expect(meldung).toHaveTextContent('Die Angabe zum Kalender konnte nicht gespeichert werden.');
  });

  it('speichert Kalender und Vergütung mit einem Knopf', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StaffEinsatz staff={NINA} />);

    // Ein Speichern je Formular, nicht einer je Abschnitt.
    expect(screen.getAllByRole('button', { name: /Speichern/ })).toHaveLength(1);

    const auswahl = await screen.findByRole('combobox', { name: /Vergütungsmodell/ });
    await waitFor(() => expect(auswahl).toBeEnabled());
    await user.click(screen.getByRole('checkbox', { name: 'Im Kalender für Personal Training' }));
    await user.selectOptions(auswahl, 'fixed_salary');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    await waitFor(() =>
      expect(setzeVerguetungsmodell).toHaveBeenCalledWith(NINA.id, 'fixed_salary'),
    );
    expect(setzeKalender).toHaveBeenCalledWith(NINA.id, { behandlung: false, training: true });
  });

  it('sagt, wenn das Vergütungsmodell nicht geladen ist, und bietet einen neuen Versuch an', async () => {
    fetchVerguetungsmodell.mockRejectedValueOnce(new Error('netz'));
    renderWithProviders(<StaffEinsatz staff={NINA} />);
    expect(
      await screen.findByText('Das Vergütungsmodell konnte nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });
});
