import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TrainingApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testUser } from '@/test-utils';

/**
 * Trainingstermine (TRN-004 bis TRN-006). Die Grenze sitzt im Server
 * (`training-appointments.test.ts`); geprüft wird hier, was die Seiten
 * anbieten und welche Aufrufe sie machen.
 */

const TINA = 'eeeeeeee-eeee-4eee-8eee-000000000001';
const TERMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000007';
const BASIS = 'ffffffff-ffff-4fff-8fff-000000000001';
const TOM = '55555555-5555-4555-8555-000000000006';
const ORT = '33333333-3333-4333-8333-000000000001';

const getTrainingAppointment = vi.fn();
const listTrainingBases = vi.fn();
const listTrainingClients = vi.fn();
const createTrainingAppointment = vi.fn();
const cancelAppointment = vi.fn();
const fetchAssignableTrainers = vi.fn();
const fetchLocations = vi.fn();
const navigate = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof TrainingApi>();
  return {
    ...actual,
    getTrainingAppointment: (id: string) => getTrainingAppointment(id) as Promise<unknown>,
    listTrainingBases: (id: string) => listTrainingBases(id) as Promise<unknown>,
    listTrainingClients: () => listTrainingClients() as Promise<unknown>,
    // TRN-009: Das Protokoll hat eigene Tests (training-protokoll.test.tsx).
    getTrainingProtocol: () => Promise.resolve(null),
    createTrainingAppointment: (...args: unknown[]) =>
      createTrainingAppointment(...args) as Promise<string>,
  };
});

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    cancelAppointment: (...args: unknown[]) => cancelAppointment(...args) as Promise<void>,
    fetchAssignableTrainers: () => fetchAssignableTrainers() as Promise<unknown>,
    fetchLocations: () => fetchLocations() as Promise<unknown>,
    todayInTimeZone: () => '2027-05-12',
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
  useParams: () => ({ appointmentId: TERMIN }),
}));

const { TrainingAppointmentPage } = await import('./TrainingAppointmentPage');
const { NewTrainingAppointmentPage } = await import('./NewTrainingAppointmentPage');
const { vereinbarungText } = await import('./api');

const termin = {
  id: TERMIN,
  training_relationship_id: TINA,
  training_basis_id: BASIS,
  client_given_name: 'Tina',
  client_family_name: 'Trainingskundin',
  staff_member_id: TOM,
  staff_given_name: 'Tom',
  staff_family_name: 'Trainingsbetreuung',
  location_id: ORT,
  location_name: 'Hauptstandort Tuebingen',
  appointment_type: 'practice',
  status: 'confirmed',
  starts_at: '2027-05-13T08:00:00+00:00',
  ends_at: '2027-05-13T09:00:00+00:00',
  updated_at: '2027-05-01T10:00:00.123456+00:00',
  visit_street: null,
  visit_house_number: null,
  visit_postal_code: null,
  visit_city: null,
  cancellation_reason: null,
  cancellation_received_at: null,
  organization_time_zone: 'Europe/Berlin',
};

beforeEach(() => {
  for (const f of [
    getTrainingAppointment,
    listTrainingBases,
    listTrainingClients,
    createTrainingAppointment,
    cancelAppointment,
    fetchAssignableTrainers,
    fetchLocations,
    navigate,
  ]) {
    f.mockReset();
  }
  getTrainingAppointment.mockResolvedValue(termin);
  listTrainingBases.mockResolvedValue([
    {
      id: BASIS,
      status: 'active',
      started_on: '2026-09-01',
      agreed_quantity: 10,
      appointment_count: 7,
    },
  ]);
  listTrainingClients.mockResolvedValue([
    {
      id: TINA,
      person_id: '44444444-4444-4444-8444-000000000009',
      given_name: 'Tina',
      family_name: 'Trainingskundin',
      status: 'active',
      contract_started_on: '2026-03-02',
      contract_ended_on: null,
    },
  ]);
  fetchAssignableTrainers.mockResolvedValue([
    { staff_member_id: TOM, display_name: 'Tom Trainingsbetreuung' },
  ]);
  fetchLocations.mockResolvedValue([{ id: ORT, name: 'Hauptstandort Tuebingen' }]);
  createTrainingAppointment.mockResolvedValue('aaaaaaaa-aaaa-4aaa-8aaa-0000000000aa');
  cancelAppointment.mockResolvedValue(undefined);
});

describe('vereinbarungText (ANN-179)', () => {
  it('nennt geplante und vereinbarte Einheiten - oder keine feste Anzahl', () => {
    expect(vereinbarungText({ agreed_quantity: 10, appointment_count: 7 })).toBe(
      '7 Termine von 10',
    );
    expect(vereinbarungText({ agreed_quantity: 10, appointment_count: 1 })).toBe('1 Termin von 10');
    expect(vereinbarungText({ agreed_quantity: null, appointment_count: 3 })).toBe(
      'ohne feste Anzahl · 3 Termine',
    );
  });
});

describe('TrainingAppointmentPage', () => {
  it('zeigt Kund:in, Betreuung, Ort und Vereinbarung', async () => {
    renderWithProviders(<TrainingAppointmentPage user={testUser(['trainer'], 'Tom')} />);
    expect(await screen.findByRole('link', { name: 'Tina Trainingskundin' })).toHaveAttribute(
      'href',
      expect.stringContaining(`/training/${TINA}`),
    );
    expect(screen.getByText('Tom Trainingsbetreuung')).toBeInTheDocument();
    expect(await screen.findByText(/7 Termine von 10/)).toBeInTheDocument();
    // Kein Wort über eine Behandlung (ADR-021 Punkt 9).
    expect(screen.queryByText(/Patient/)).toBeNull();
  });

  it('sagt ab mit den Gründen des Trainings - ohne Frage nach Eingang oder Ausfallhonorar (ANN-178)', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<TrainingAppointmentPage user={testUser(['trainer'], 'Tom')} />);
    await nutzer.click(await screen.findByRole('button', { name: 'Termin absagen' }));

    const grund = screen.getByLabelText('Absagegrund');
    const optionen = within(grund)
      .getAllByRole('option')
      .map((o) => o.textContent);
    expect(optionen).toContain('Kund:in hat abgesagt');
    expect(optionen).not.toContain('Patient:in hat abgesagt');
    expect(screen.queryByLabelText(/Wann ist die Absage eingegangen/)).toBeNull();
    expect(screen.queryByText(/Ausfallhonorar/)).toBeNull();

    await nutzer.selectOptions(grund, 'patient_request');
    await nutzer.click(screen.getByRole('button', { name: 'Ja, Termin absagen' }));
    await waitFor(() =>
      expect(cancelAppointment).toHaveBeenCalledWith(TERMIN, termin.updated_at, 'patient_request'),
    );
  });

  it('bietet einer Rolle ohne Schreibrecht weder Verschieben noch Absagen', async () => {
    renderWithProviders(<TrainingAppointmentPage user={testUser(['patient'])} />);
    await screen.findByRole('link', { name: 'Tina Trainingskundin' });
    expect(screen.queryByRole('link', { name: 'Verschieben' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Termin absagen' })).toBeNull();
  });

  it('sagt „nicht gefunden", wenn der Server keinen Trainingstermin kennt', async () => {
    getTrainingAppointment.mockResolvedValue(null);
    renderWithProviders(<TrainingAppointmentPage user={testUser(['office'], 'Olivia')} />);
    expect(await screen.findByText('Trainingstermin nicht gefunden')).toBeInTheDocument();
  });
});

describe('NewTrainingAppointmentPage', () => {
  it('legt ohne gewählte Kund:in nichts an', async () => {
    renderWithProviders(
      <NewTrainingAppointmentPage user={testUser(['trainer'], 'Tom')} />,
      '/training/termine/neu?datum=2027-05-13&beginn=10:00',
    );
    const knopf = await screen.findByRole('button', { name: 'Trainingstermin anlegen' });
    expect(knopf).toBeDisabled();
  });

  it('legt eine Einzelstunde an, wenn keine Vereinbarung gewählt ist (ADR-022 Punkt 5)', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(
      <NewTrainingAppointmentPage user={testUser(['trainer'], 'Tom')} />,
      `/training/termine/neu?kunde=${TINA}&datum=2027-05-13&beginn=10:00&person=${TOM}`,
    );
    const vereinbarung = await screen.findByLabelText('Vereinbarung');
    await waitFor(() =>
      expect(
        within(vereinbarung)
          .getAllByRole('option')
          .map((o) => o.textContent),
      ).toEqual(['Einzelstunde ohne Vereinbarung', 'Seit 01.09.2026 · 7 Termine von 10']),
    );
    await waitFor(() => expect(screen.getByLabelText('Betreuende Person *')).toHaveValue(TOM));

    await nutzer.click(screen.getByRole('button', { name: 'Trainingstermin anlegen' }));
    await waitFor(() => expect(createTrainingAppointment).toHaveBeenCalled());
    const [kunde, werte, basis] = createTrainingAppointment.mock.calls[0] as [
      string,
      Record<string, string>,
      string | null,
    ];
    expect(kunde).toBe(TINA);
    expect(basis).toBeNull();
    expect(werte).toMatchObject({
      staff_member_id: TOM,
      date: '2027-05-13',
      start_time: '10:00',
      end_time: '11:00',
    });
  });

  it('hängt den Termin an die gewählte Vereinbarung', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(
      <NewTrainingAppointmentPage user={testUser(['office'], 'Olivia')} />,
      `/training/termine/neu?kunde=${TINA}&datum=2027-05-13&beginn=10:00&person=${TOM}`,
    );
    const vereinbarung = await screen.findByLabelText('Vereinbarung');
    await waitFor(() => expect(within(vereinbarung).getAllByRole('option')).toHaveLength(2));
    await nutzer.selectOptions(vereinbarung, BASIS);
    await waitFor(() => expect(screen.getByLabelText('Betreuende Person *')).toHaveValue(TOM));
    await nutzer.click(screen.getByRole('button', { name: 'Trainingstermin anlegen' }));
    await waitFor(() => expect(createTrainingAppointment).toHaveBeenCalled());
    expect(createTrainingAppointment.mock.calls[0]![2]).toBe(BASIS);
  });
});
