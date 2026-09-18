import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testAppointment, testUser } from '@/test-utils';

/**
 * Das ganze Ereignis bearbeiten (CAL-017).
 *
 * Geprüft wird die Trennung, um die es geht: Diese Seite ändert Bezeichnung,
 * Zeit und Ort **für alle Beteiligten**, und sie ändert ausdrücklich nicht,
 * wer teilnimmt. Der Schreibpfad selbst hat seine Prüfungen in
 * `supabase/tests/appointment-events.test.ts`.
 */

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const GRUPPE = '88888888-8888-4888-8888-000000000001';
const ORT = '33333333-3333-4333-8333-000000000001';

/** Ereignis am 12.05.2027, 09:00-09:25 Ortszeit Europe/Berlin (CEST, +02:00). */
const ereignis = testAppointment({
  id: TERMIN_ID,
  patient_id: null,
  kind: 'event',
  title: 'Teambesprechung',
  event_group_id: GRUPPE,
  location_id: ORT,
  ends_at: '2027-05-12T07:25:00.000Z',
  patient_given_name: null,
  patient_family_name: null,
});

const beteiligte: AppointmentsApi.EventParticipant[] = [
  {
    appointment_id: TERMIN_ID,
    staff_member_id: '55555555-5555-4555-8555-000000000002',
    display_name: 'Anna Beispiel',
    status: 'confirmed',
    group_updated_at: ereignis.updated_at,
  },
  {
    appointment_id: '77777777-7777-4777-8777-000000000002',
    staff_member_id: '55555555-5555-4555-8555-000000000004',
    display_name: 'Tim Teamleitung',
    status: 'confirmed',
    group_updated_at: ereignis.updated_at,
  },
];

const fetchAppointment = vi.fn();
const fetchEventParticipants = vi.fn();
const updateAppointmentEvent = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAppointment: (id: string) =>
      fetchAppointment(id) as Promise<AppointmentsApi.Appointment | null>,
    fetchEventParticipants: (gruppe: string) =>
      fetchEventParticipants(gruppe) as Promise<AppointmentsApi.EventParticipant[]>,
    fetchLocations: () => Promise.resolve([{ id: ORT, name: 'Hauptstandort Tuebingen' }]),
    updateAppointmentEvent: (
      gruppe: string,
      erwartet: string,
      werte: AppointmentsApi.EreignisFormValues,
      bestaetigt: boolean,
    ) => updateAppointmentEvent(gruppe, erwartet, werte, bestaetigt) as Promise<number>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useParams: () => ({ appointmentId: TERMIN_ID }),
}));

const { EditEventPage } = await import('./EditEventPage');

function rendern(rollen: Parameters<typeof testUser>[0] = ['office']) {
  return renderWithProviders(
    <EditEventPage user={testUser(rollen)} />,
    `/termine/${TERMIN_ID}/ereignis-bearbeiten`,
  );
}

describe('EditEventPage', () => {
  beforeEach(() => {
    fetchAppointment.mockReset().mockResolvedValue(ereignis);
    fetchEventParticipants.mockReset().mockResolvedValue(beteiligte);
    updateAppointmentEvent.mockReset().mockResolvedValue(2);
  });

  it('belegt Bezeichnung, Tag und beide Enden aus dem Bestand vor', async () => {
    rendern();

    expect(await screen.findByLabelText('Bezeichnung *')).toHaveValue('Teambesprechung');
    expect(screen.getByLabelText('Datum *')).toHaveValue('2027-05-12');
    // Ortszeit der Praxis, nicht UTC.
    expect(screen.getByLabelText('Beginn *')).toHaveValue('09:00');
    expect(screen.getByLabelText('Ende *')).toHaveValue('09:25');
  });

  it('nennt die Beteiligten, bietet sie aber nicht zur Wahl an', async () => {
    rendern();

    expect(await screen.findByText('Anna Beispiel')).toBeInTheDocument();
    expect(screen.getByText('Tim Teamleitung')).toBeInTheDocument();
    // Keine Ankreuzfelder: Wer teilnimmt, ist eine Teilnahme und kein Ereignis.
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(screen.getByText(/einzelne Teilnahme und kein Ereignis/)).toBeInTheDocument();
  });

  it('schreibt die Aenderung auf dem Stand der GRUPPE', async () => {
    const user = userEvent.setup();
    rendern();

    const bezeichnung = await screen.findByLabelText('Bezeichnung *');
    await user.clear(bezeichnung);
    await user.type(bezeichnung, 'Fallbesprechung');
    await user.clear(screen.getByLabelText('Beginn *'));
    await user.type(screen.getByLabelText('Beginn *'), '10:00');
    await user.clear(screen.getByLabelText('Ende *'));
    await user.type(screen.getByLabelText('Ende *'), '10:25');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(updateAppointmentEvent).toHaveBeenCalledTimes(1));
    expect(updateAppointmentEvent).toHaveBeenCalledWith(
      GRUPPE,
      ereignis.updated_at,
      expect.objectContaining({
        title: 'Fallbesprechung',
        start_time: '10:00',
        end_time: '10:25',
      }) as AppointmentsApi.EreignisFormValues,
      false,
    );
  });

  it('fragt bei einer Zeit ausserhalb der Arbeitszeit nach und schreibt erst dann', async () => {
    const user = userEvent.setup();
    const { AusserhalbArbeitszeitError } = await import('./api');
    updateAppointmentEvent.mockRejectedValueOnce(new AusserhalbArbeitszeitError());
    rendern();

    await screen.findByLabelText('Bezeichnung *');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    const rueckfrage = await screen.findByRole('dialog', { name: 'Außerhalb der Arbeitszeit' });
    expect(rueckfrage).toHaveTextContent('noch nichts geschrieben');

    updateAppointmentEvent.mockResolvedValue(2);
    await user.click(screen.getByRole('button', { name: 'Trotzdem ändern' }));

    await waitFor(() => expect(updateAppointmentEvent).toHaveBeenCalledTimes(2));
    expect(updateAppointmentEvent.mock.calls[1]?.[3]).toBe(true);
  });

  it('bearbeitet ein abgesagtes Ereignis nicht', async () => {
    fetchAppointment.mockResolvedValue({ ...ereignis, status: 'cancelled' });
    rendern();

    expect(
      await screen.findByText(/Abgesagte Ereignisse werden nicht bearbeitet/),
    ).toBeInTheDocument();
  });

  it('fuehrt an einem Behandlungstermin auf den richtigen Weg', async () => {
    fetchAppointment.mockResolvedValue({
      ...ereignis,
      kind: 'treatment',
      title: null,
      event_group_id: null,
    });
    rendern();

    expect(await screen.findByText('Kein Ereignis')).toBeInTheDocument();
  });

  it('bietet einem Patientenkonto kein Formular an', async () => {
    rendern(['patient']);
    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
  });
});
