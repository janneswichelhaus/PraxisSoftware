import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import { renderWithProviders } from '@/test-utils';

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';

const setAppointmentNotification = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    setAppointmentNotification: (id: string, kanaele: unknown) =>
      setAppointmentNotification(id, kanaele) as Promise<AppointmentsApi.NotificationChannel[]>,
  };
});

const { MitteilungVermerken } = await import('./MitteilungVermerken');

function termin(kanaele: AppointmentsApi.NotificationChannel[] = []): AppointmentsApi.Appointment {
  return {
    id: TERMIN_ID,
    patient_id: '66666666-6666-4666-8666-000000000001',
    kind: 'therapy',
    title: null,
    event_group_id: null,
    event_series_id: null,
    staff_member_id: '55555555-5555-4555-8555-000000000002',
    location_id: null,
    appointment_type: 'home_visit',
    status: 'confirmed',
    starts_at: '2027-05-12T07:00:00.000Z',
    ends_at: '2027-05-12T08:00:00.000Z',
    updated_at: '2027-05-01T10:00:00.000000+00',
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_city: 'Tuebingen',
    completed_at: null,
    cancellation_reason: null,
    no_show_recorded_at: null,
    no_show_protocol_confirmed: null,
    cancellation_received_at: null,
    fee_basis: null,
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    location_name: null,
    notification_channels: kanaele,
    treatment_basis_covered: true,
    organization_time_zone: 'Europe/Berlin',
  };
}

describe('MitteilungVermerken', () => {
  beforeEach(() => {
    setAppointmentNotification.mockReset();
    setAppointmentNotification.mockImplementation((_id: string, kanaele: string[]) =>
      Promise.resolve([...kanaele].sort()),
    );
  });

  it('bietet die vier Wege an und sagt, wofuer die Auswahl da ist', () => {
    renderWithProviders(<MitteilungVermerken appointment={termin()} />);

    expect(screen.getByLabelText('Persönlich gesagt')).not.toBeChecked();
    expect(screen.getByLabelText('Telefonisch mitgeteilt')).not.toBeChecked();
    expect(screen.getByLabelText('Terminzettel ausgehändigt')).not.toBeChecked();
    expect(screen.getByLabelText('Per E-Mail mitgeteilt')).not.toBeChecked();
    // Seit CAL-013 vermerken sich Druck und E-Mail selbst; hier steht die
    // Nachhut für alles, was die Anwendung nicht sehen kann.
    expect(screen.getByText(/Nachtragen und zurücknehmen von Hand/)).toBeInTheDocument();
  });

  it('zeigt vorhandene Vermerke als gesetzt', () => {
    renderWithProviders(<MitteilungVermerken appointment={termin(['phone', 'slip'])} />);

    expect(screen.getByLabelText('Telefonisch mitgeteilt')).toBeChecked();
    expect(screen.getByLabelText('Terminzettel ausgehändigt')).toBeChecked();
    expect(screen.getByLabelText('Per E-Mail mitgeteilt')).not.toBeChecked();
  });

  it('speichert erst auf ausdrückliche Anweisung', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MitteilungVermerken appointment={termin()} />);

    expect(screen.getByRole('button', { name: 'Vermerk speichern' })).toBeDisabled();

    await user.click(screen.getByLabelText('Telefonisch mitgeteilt'));
    expect(setAppointmentNotification).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Vermerk speichern' }));
    await waitFor(() =>
      expect(setAppointmentNotification).toHaveBeenCalledWith(TERMIN_ID, ['phone']),
    );
    expect(await screen.findByText('Vermerk gespeichert.')).toBeInTheDocument();
  });

  it('nimmt den Vermerk mit einer leeren Auswahl zurück', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MitteilungVermerken appointment={termin(['slip'])} />);

    await user.click(screen.getByLabelText('Terminzettel ausgehändigt'));
    await user.click(screen.getByRole('button', { name: 'Vermerk speichern' }));

    await waitFor(() => expect(setAppointmentNotification).toHaveBeenCalledWith(TERMIN_ID, []));
    expect(await screen.findByText('Vermerk zurückgenommen.')).toBeInTheDocument();
  });

  it('sendet mehrere Wege zusammen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MitteilungVermerken appointment={termin()} />);

    await user.click(screen.getByLabelText('Persönlich gesagt'));
    await user.click(screen.getByLabelText('Per E-Mail mitgeteilt'));
    await user.click(screen.getByRole('button', { name: 'Vermerk speichern' }));

    await waitFor(() =>
      expect(setAppointmentNotification).toHaveBeenCalledWith(TERMIN_ID, ['in_person', 'email']),
    );
  });

  it('meldet einen Fehler, ohne einen Erfolg zu behaupten', async () => {
    setAppointmentNotification.mockRejectedValue(
      new Error('Der Vermerk konnte nicht gespeichert werden.'),
    );
    const user = userEvent.setup();
    renderWithProviders(<MitteilungVermerken appointment={termin()} />);

    await user.click(screen.getByLabelText('Telefonisch mitgeteilt'));
    await user.click(screen.getByRole('button', { name: 'Vermerk speichern' }));

    expect(
      await screen.findByText('Der Vermerk konnte nicht gespeichert werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Vermerk gespeichert.')).not.toBeInTheDocument();
  });

  it('nennt die Regel, dass der Vermerk mit einer Änderung verfällt', () => {
    renderWithProviders(<MitteilungVermerken appointment={termin()} />);
    expect(screen.getByText(/verfällt der Vermerk/)).toBeInTheDocument();
  });
});
