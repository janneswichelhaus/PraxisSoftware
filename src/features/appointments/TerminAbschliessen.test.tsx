import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import { renderWithProviders, testAppointment } from '@/test-utils';

/**
 * Der Haken (CAL-004, ANN-005): abschließen ohne Dokumentation.
 *
 * Bis 2026-10-03 prüfte das die Terminseite. Seit sie entfallen ist, steht
 * der Haken im Terminpanel und auf der Übersicht - die Fälle stehen deshalb
 * hier am Knopf selbst.
 */
const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const termin = testAppointment({ id: TERMIN_ID });

const completeAppointment = vi.fn();
const fetchAppointment = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof AppointmentsApi>()),
  completeAppointment: (id: string, erwartet: string) =>
    completeAppointment(id, erwartet) as Promise<void>,
  fetchAppointment: (id: string) =>
    fetchAppointment(id) as Promise<AppointmentsApi.Appointment | null>,
}));

const { TerminAbschliessenKnopf } = await import('./TerminAbschliessen');

describe('TerminAbschliessenKnopf', () => {
  beforeEach(() => {
    completeAppointment.mockReset().mockResolvedValue(undefined);
    fetchAppointment.mockReset().mockResolvedValue(termin);
  });

  it('schließt auf dem bekannten Stand ab - ohne Rückfrage nach einer Dokumentation', async () => {
    const user = userEvent.setup();
    const fertig = vi.fn();
    renderWithProviders(
      <TerminAbschliessenKnopf
        appointmentId={TERMIN_ID}
        stand="stand-1"
        onAbgeschlossen={fertig}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Termin abschließen' }));

    await waitFor(() => expect(completeAppointment).toHaveBeenCalledWith(TERMIN_ID, 'stand-1'));
    expect(fertig).toHaveBeenCalledTimes(1);
    expect(fetchAppointment).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('liest den Stand unmittelbar vorher, wenn die Liste ihn nicht kennt', async () => {
    const user = userEvent.setup();
    renderWithProviders(<TerminAbschliessenKnopf appointmentId={TERMIN_ID} />);

    await user.click(screen.getByRole('button', { name: 'Termin abschließen' }));

    await waitFor(() =>
      expect(completeAppointment).toHaveBeenCalledWith(TERMIN_ID, termin.updated_at),
    );
  });

  it('meldet, wenn der Server den Abschluss abweist', async () => {
    completeAppointment.mockRejectedValue(new Error('Der Termin ist nicht mehr bestätigt.'));
    const user = userEvent.setup();
    const fehler = vi.fn();
    renderWithProviders(
      <TerminAbschliessenKnopf appointmentId={TERMIN_ID} stand="stand-1" onFehler={fehler} />,
    );

    await user.click(screen.getByRole('button', { name: 'Termin abschließen' }));

    await waitFor(() =>
      expect(fehler).toHaveBeenCalledWith('Der Termin ist nicht mehr bestätigt.'),
    );
  });
});
