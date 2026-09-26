import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testAppointment, testUser } from '@/test-utils';

/**
 * Die ganze Fehlzeit bearbeiten (CAL-017).
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
  kind: 'internal',
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

const SERIE = '99999999-9999-4999-8999-000000000001';

const fetchAppointment = vi.fn();
const fetchEventParticipants = vi.fn();
const fetchEventSeries = vi.fn();
const updateAppointmentEvent = vi.fn();
const updateEventSeries = vi.fn();

/** Drei Vorkommen einer Dauerfehlzeit; das erste ist das gezeigte (CAL-021). */
const serienVorkommen: AppointmentsApi.EventSeriesOccurrence[] = [
  {
    event_group_id: GRUPPE,
    title: 'Teambesprechung',
    starts_at: ereignis.starts_at,
    ends_at: ereignis.ends_at,
    open_count: 2,
    cancelled_count: 0,
    series_updated_at: ereignis.updated_at,
  },
  {
    event_group_id: '88888888-8888-4888-8888-000000000002',
    title: 'Teambesprechung',
    starts_at: '2027-05-19T07:00:00.000Z',
    ends_at: '2027-05-19T07:25:00.000Z',
    open_count: 2,
    cancelled_count: 0,
    series_updated_at: ereignis.updated_at,
  },
  {
    event_group_id: '88888888-8888-4888-8888-000000000003',
    title: 'Teambesprechung',
    starts_at: '2027-05-26T07:00:00.000Z',
    ends_at: '2027-05-26T07:25:00.000Z',
    open_count: 2,
    cancelled_count: 0,
    series_updated_at: ereignis.updated_at,
  },
];

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAppointment: (id: string) =>
      fetchAppointment(id) as Promise<AppointmentsApi.Appointment | null>,
    fetchEventParticipants: (gruppe: string) =>
      fetchEventParticipants(gruppe) as Promise<AppointmentsApi.EventParticipant[]>,
    fetchEventSeries: (serie: string) =>
      fetchEventSeries(serie) as Promise<AppointmentsApi.EventSeriesOccurrence[]>,
    fetchLocations: () => Promise.resolve([{ id: ORT, name: 'Hauptstandort Tuebingen' }]),
    updateAppointmentEvent: (
      gruppe: string,
      erwartet: string,
      werte: AppointmentsApi.EreignisFormValues,
      bestaetigt: boolean,
    ) => updateAppointmentEvent(gruppe, erwartet, werte, bestaetigt) as Promise<number>,
    updateEventSeries: (
      serie: string,
      erwartet: string,
      werte: AppointmentsApi.EreignisFormValues,
      bestaetigt: boolean,
    ) => updateEventSeries(serie, erwartet, werte, bestaetigt) as Promise<number>,
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
    fetchEventSeries.mockReset().mockResolvedValue(serienVorkommen);
    updateAppointmentEvent.mockReset().mockResolvedValue(2);
    updateEventSeries.mockReset().mockResolvedValue(3);
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
    expect(screen.getByText(/einzelne Teilnahme und keine Fehlzeit/)).toBeInTheDocument();
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
      await screen.findByText(/Abgesagte Fehlzeiten werden nicht bearbeitet/),
    ).toBeInTheDocument();
  });

  it('fuehrt an einem Behandlungstermin auf den richtigen Weg', async () => {
    fetchAppointment.mockResolvedValue({
      ...ereignis,
      kind: 'therapy',
      title: null,
      event_group_id: null,
    });
    rendern();

    expect(await screen.findByText('Keine Fehlzeit')).toBeInTheDocument();
  });

  it('bietet einem Patientenkonto kein Formular an', async () => {
    rendern(['patient']);
    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
  });
  /**
   * Dauerfehlzeit (CAL-021): Ohne Serie gibt es nichts zu wählen - die Frage
   * steht dann auch nicht da.
   */
  it('fragt ohne Serie nicht nach dem Umfang', async () => {
    rendern();

    await screen.findByLabelText('Bezeichnung *');
    expect(screen.queryByText('Umfang der Änderung')).not.toBeInTheDocument();
    expect(fetchEventSeries).not.toHaveBeenCalled();
  });

  it('stellt bei einer Serie dieses Vorkommen und die ganze Serie zur Wahl', async () => {
    fetchAppointment.mockResolvedValue({ ...ereignis, event_series_id: SERIE });
    rendern();

    await screen.findByLabelText('Bezeichnung *');
    expect(await screen.findByText('Umfang der Änderung')).toBeInTheDocument();
    // Vorbelegt ist die kleinere Wirkung.
    expect(screen.getByRole('radio', { name: /Nur diese Fehlzeit/ })).toBeChecked();
    expect(screen.getByRole('radio', { name: /Die ganze Serie/ })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toBeInTheDocument();
  });

  it('schreibt die serienweite Aenderung auf dem Stand der SERIE', async () => {
    fetchAppointment.mockResolvedValue({ ...ereignis, event_series_id: SERIE });
    const user = userEvent.setup();
    rendern();

    const bezeichnung = await screen.findByLabelText('Bezeichnung *');
    await user.clear(bezeichnung);
    await user.type(bezeichnung, 'Teammeeting');
    await user.click(await screen.findByRole('radio', { name: /Die ganze Serie/ }));
    await user.click(screen.getByRole('button', { name: 'Ganze Serie ändern' }));

    await waitFor(() => expect(updateEventSeries).toHaveBeenCalledTimes(1));
    expect(updateEventSeries).toHaveBeenCalledWith(
      SERIE,
      ereignis.updated_at,
      expect.objectContaining({ title: 'Teammeeting' }),
      false,
    );
    expect(updateAppointmentEvent).not.toHaveBeenCalled();
  });

  it('aendert bei gewaehltem Vorkommen weiter nur dieses eine', async () => {
    fetchAppointment.mockResolvedValue({ ...ereignis, event_series_id: SERIE });
    const user = userEvent.setup();
    rendern();

    await screen.findByLabelText('Bezeichnung *');
    await screen.findByText('Umfang der Änderung');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(updateAppointmentEvent).toHaveBeenCalledTimes(1));
    expect(updateEventSeries).not.toHaveBeenCalled();
  });
});
