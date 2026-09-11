import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import type * as PatientsApi from '@/features/patients/api';
import type * as RouterModule from 'react-router-dom';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const STAFF_TIM = '55555555-5555-4555-8555-000000000004';
const ORT = '33333333-3333-4333-8333-000000000001';
const STAND = '2027-05-01T10:00:00.000000+00';

/** Praxistermin am 12.05.2027, 09:00-10:00 Ortszeit Europe/Berlin. */
const termin: AppointmentsApi.Appointment = {
  id: TERMIN_ID,
  patient_id: PATIENT_ID,
  staff_member_id: STAFF_ANNA,
  location_id: ORT,
  appointment_type: 'practice',
  status: 'confirmed',
  starts_at: '2027-05-12T07:00:00.000Z',
  ends_at: '2027-05-12T08:00:00.000Z',
  updated_at: STAND,
  visit_street: null,
  visit_house_number: null,
  visit_postal_code: null,
  visit_city: null,
  completed_at: null,
  cancellation_reason: null,
  patient_given_name: 'Berta',
  patient_family_name: 'Bestand',
  staff_given_name: 'Anna',
  staff_family_name: 'Beispiel',
  location_name: 'Hauptstandort Tuebingen',
  organization_time_zone: 'Europe/Berlin',
};

const patient: PatientsApi.Patient = testPatient({
  id: PATIENT_ID,
  status: 'active',
  care_started_on: '2026-01-05',
  given_name: 'Berta',
  family_name: 'Bestand',
  date_of_birth: '1970-05-06',
  email: null,
  phone: null,
  street: 'Altstrasse',
  house_number: '1',
  postal_code: '50667',
  city: 'Koeln',
});

const fetchAppointment = vi.fn();
const fetchAssignableTherapists = vi.fn();
const fetchLocations = vi.fn();
const updateAppointment = vi.fn();
const fetchPatient = vi.fn();
const navigate = vi.fn();

vi.mock('@/features/patients/api', async (importOriginal) => ({
  ...(await importOriginal<typeof PatientsApi>()),
  fetchPatient: (id: string) => fetchPatient(id) as Promise<PatientsApi.Patient | null>,
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAppointment: (id: string) =>
      fetchAppointment(id) as Promise<AppointmentsApi.Appointment | null>,
    fetchAssignableTherapists: () =>
      fetchAssignableTherapists() as Promise<AppointmentsApi.AssignableTherapist[]>,
    fetchLocations: () => fetchLocations() as Promise<AppointmentsApi.Location[]>,
    updateAppointment: (id: string, stand: string, werte: unknown) =>
      updateAppointment(id, stand, werte) as Promise<void>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModule>()),
  useNavigate: () => navigate,
  useParams: () => ({ appointmentId: TERMIN_ID }),
}));

const { EditAppointmentPage } = await import('./EditAppointmentPage');

function rendern() {
  return renderWithProviders(
    <EditAppointmentPage user={testUser(['office'], 'Olivia Office')} />,
    `/termine/${TERMIN_ID}/bearbeiten`,
  );
}

function formularAbwarten() {
  return screen.findByRole('button', { name: 'Änderungen speichern' });
}

describe('EditAppointmentPage', () => {
  beforeEach(() => {
    fetchAppointment.mockReset();
    fetchAssignableTherapists.mockReset();
    fetchLocations.mockReset();
    updateAppointment.mockReset();
    fetchPatient.mockReset();
    navigate.mockReset();

    fetchAppointment.mockResolvedValue(termin);
    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: STAFF_ANNA, display_name: 'Anna Beispiel' },
      { staff_member_id: STAFF_TIM, display_name: 'Tim Teamleitung' },
    ]);
    fetchLocations.mockResolvedValue([{ id: ORT, name: 'Hauptstandort Tuebingen' }]);
    updateAppointment.mockResolvedValue(undefined);
    fetchPatient.mockResolvedValue(patient);
  });

  it('befuellt das Formular aus dem bestehenden Termin', async () => {
    rendern();
    await formularAbwarten();

    expect(screen.getByLabelText('Behandelnde Person *')).toHaveValue(STAFF_ANNA);
    expect(screen.getByLabelText('Terminart *')).toHaveValue('practice');
    // 07:00 UTC ist 09:00 Ortszeit - vorbefuellt wird die Praxiszeit.
    expect(screen.getByLabelText('Datum *')).toHaveValue('2027-05-12');
    expect(screen.getByLabelText('Beginn *')).toHaveValue('09:00');
    expect(screen.getByLabelText('Ende *')).toHaveValue('10:00');
    expect(screen.getByLabelText('Standort *')).toHaveValue(ORT);
  });

  it('zeigt den Patienten als Kontext und bietet keinen Wechsel an', async () => {
    rendern();
    await formularAbwarten();

    expect(screen.getAllByText('Berta Bestand').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Ein Termin kann nicht auf eine andere Person übertragen werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText(/Patient.*\*/)).not.toBeInTheDocument();
  });

  it('speichert gegen den gelesenen Stand', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.clear(screen.getByLabelText('Beginn *'));
    await user.type(screen.getByLabelText('Beginn *'), '11:00');
    await user.clear(screen.getByLabelText('Ende *'));
    await user.type(screen.getByLabelText('Ende *'), '12:00');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(updateAppointment).toHaveBeenCalledTimes(1));
    expect(updateAppointment).toHaveBeenCalledWith(TERMIN_ID, STAND, {
      staff_member_id: STAFF_ANNA,
      appointment_type: 'practice',
      date: '2027-05-12',
      start_time: '11:00',
      end_time: '12:00',
      location_id: ORT,
    });
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/termine/${TERMIN_ID}`, { replace: true }),
    );
  });

  it('wechselt die behandelnde Person', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_TIM);
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(updateAppointment).toHaveBeenCalledTimes(1));
    expect(updateAppointment.mock.calls[0]?.[2]).toMatchObject({ staff_member_id: STAFF_TIM });
  });

  it('zeigt beim Wechsel zu Hausbesuch die zu uebernehmende Adresse', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Terminart *'), 'home_visit');

    expect(await screen.findByText('Adresse des Hausbesuchs')).toBeInTheDocument();
    expect(screen.getByText('Altstrasse 1, 50667 Koeln')).toBeInTheDocument();
    expect(screen.queryByLabelText('Standort *')).not.toBeInTheDocument();
  });

  it('zeigt bei einem bleibenden Hausbesuch die festgehaltene Anschrift', async () => {
    fetchAppointment.mockResolvedValue({
      ...termin,
      appointment_type: 'home_visit',
      location_id: null,
      location_name: null,
      visit_street: 'Sicherungsweg',
      visit_house_number: '5',
      visit_postal_code: '12345',
      visit_city: 'Alteswohnort',
    });
    rendern();
    await formularAbwarten();

    // Der Snapshot bleibt - er haelt fest, wohin an diesem Tag gefahren wird.
    expect(await screen.findByText('Festgehaltene Anschrift')).toBeInTheDocument();
    expect(screen.getByText('Sicherungsweg 5, 12345 Alteswohnort')).toBeInTheDocument();
    expect(screen.queryByText('Altstrasse 1, 50667 Koeln')).not.toBeInTheDocument();
  });

  it('blendet beim Wechsel zu Video Standort und Adresse aus', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Terminart *'), 'video');

    expect(await screen.findByText(/noch kein Videolink erzeugt/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Standort *')).not.toBeInTheDocument();
    expect(screen.queryByText(/Adresse des Hausbesuchs/)).not.toBeInTheDocument();
  });

  it('meldet ein Ende vor dem Beginn inline und sendet nicht', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.clear(screen.getByLabelText('Ende *'));
    await user.type(screen.getByLabelText('Ende *'), '08:00');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    expect(await screen.findByText('Das Ende muss nach dem Beginn liegen.')).toBeInTheDocument();
    expect(updateAppointment).not.toHaveBeenCalled();
  });

  it('loest bei doppeltem Klick nur einen Schreibvorgang aus', async () => {
    let aufloesen: (() => void) | undefined;
    updateAppointment.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          aufloesen = resolve;
        }),
    );

    const user = userEvent.setup();
    rendern();
    const knopf = await formularAbwarten();

    await user.click(knopf);
    await user.click(knopf);

    expect(updateAppointment).toHaveBeenCalledTimes(1);
    aufloesen?.();
  });

  it('zeigt einen Bearbeitungskonflikt verstaendlich an', async () => {
    updateAppointment.mockRejectedValue(
      new Error(
        'Der Termin wurde zwischenzeitlich von einer anderen Person geändert. Bitte die Ansicht neu laden und die Änderung erneut vornehmen.',
      ),
    );
    const user = userEvent.setup();
    rendern();
    await user.click(await formularAbwarten());

    expect(
      await screen.findByText(/zwischenzeitlich von einer anderen Person/),
    ).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('zeigt eine Ueberschneidung verstaendlich an', async () => {
    updateAppointment.mockRejectedValue(
      new Error(
        'In diesem Zeitraum hat die behandelnde Person bereits einen Termin. Bitte eine andere Zeit wählen.',
      ),
    );
    const user = userEvent.setup();
    rendern();
    await user.click(await formularAbwarten());

    expect(
      await screen.findByText(/hat die behandelnde Person bereits einen Termin/),
    ).toBeInTheDocument();
  });

  it('bricht ohne Schreibvorgang zum Termin zurueck ab', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(updateAppointment).not.toHaveBeenCalled();
    expect(navigate).toHaveBeenCalledWith(`/termine/${TERMIN_ID}`);
  });

  it('bietet fuer einen abgesagten Termin kein Formular an', async () => {
    fetchAppointment.mockResolvedValue({ ...termin, status: 'cancelled' });
    rendern();

    expect(
      await screen.findByText('Abgesagte Termine werden nicht bearbeitet'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Änderungen speichern' })).not.toBeInTheDocument();
  });

  it('meldet einen nicht freigegebenen Termin ohne Details', async () => {
    fetchAppointment.mockResolvedValue(null);
    rendern();

    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Änderungen speichern' })).not.toBeInTheDocument();
  });
});
