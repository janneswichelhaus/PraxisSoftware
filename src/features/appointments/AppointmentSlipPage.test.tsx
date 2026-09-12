import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import type * as PatientsApi from '@/features/patients/api';
import type * as RouterModule from 'react-router-dom';
import { renderWithProviders, testPatient } from '@/test-utils';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

const patient: PatientsApi.Patient = testPatient({
  id: PATIENT_ID,
  status: 'active',
  given_name: 'Max',
  family_name: 'Mustermann',
});

const eintraege: AppointmentsApi.AppointmentSlipEntry[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
    starts_at: '2027-05-12T07:00:00.000Z',
    ends_at: '2027-05-12T08:00:00.000Z',
    appointment_type: 'home_visit',
    location_name: null,
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    organization_time_zone: 'Europe/Berlin',
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
    starts_at: '2027-05-19T12:00:00.000Z',
    ends_at: '2027-05-19T13:00:00.000Z',
    appointment_type: 'practice',
    location_name: 'Hauptstandort Tuebingen',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    organization_time_zone: 'Europe/Berlin',
  },
];

const fetchPatient = vi.fn();
const fetchAppointmentSlip = vi.fn();
const addAppointmentNotification = vi.fn();

vi.mock('@/features/patients/api', async (importOriginal) => ({
  ...(await importOriginal<typeof PatientsApi>()),
  fetchPatient: (id: string) => fetchPatient(id) as Promise<PatientsApi.Patient | null>,
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAppointmentSlip: (id: string) =>
      fetchAppointmentSlip(id) as Promise<AppointmentsApi.AppointmentSlipEntry[]>,
    addAppointmentNotification: (ids: readonly string[], kanal: string) =>
      addAppointmentNotification(ids, kanal) as Promise<number>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModule>()),
  useParams: () => ({ patientId: PATIENT_ID }),
}));

/** `window.print` gibt es in jsdom nicht - ohne Attrappe wirft der Klick. */
const drucken = vi.fn();
vi.stubGlobal('print', drucken);

const { AppointmentSlipPage } = await import('./AppointmentSlipPage');

function rendern() {
  return renderWithProviders(<AppointmentSlipPage />, `/patienten/${PATIENT_ID}/terminzettel`);
}

describe('AppointmentSlipPage', () => {
  beforeEach(() => {
    fetchPatient.mockReset();
    fetchAppointmentSlip.mockReset();
    addAppointmentNotification.mockReset();
    fetchPatient.mockResolvedValue(patient);
    fetchAppointmentSlip.mockResolvedValue(eintraege);
    addAppointmentNotification.mockResolvedValue(2);
    drucken.mockClear();
  });

  it('richtet sich an die Patient:in und listet Datum, Zeit, Ort und Person', async () => {
    rendern();

    expect(
      await screen.findByRole('heading', { name: 'Ihre nächsten Termine' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();
    expect(screen.getByText('Mittwoch, 12. Mai 2027')).toBeInTheDocument();
    expect(screen.getByText(/09:00–10:00 Uhr · bei Ihnen zu Hause/)).toBeInTheDocument();
    expect(screen.getByText(/14:00–15:00 Uhr · Hauptstandort Tuebingen/)).toBeInTheDocument();
    expect(screen.getAllByText('Anna Beispiel')).toHaveLength(2);
  });

  it('zeigt weder Status noch Verordnung noch Behandlungsinhalte', async () => {
    rendern();
    await screen.findByRole('heading', { name: 'Ihre nächsten Termine' });

    // Feste Muster statt eines aus einer Schleife gebauten RegExp - ein
    // nicht-literales Muster ist ein zu Recht gemeldeter Injektionspunkt.
    for (const verboten of [/bestätigt/i, /verordnung/i, /diagnose/i, /dokumentation/i]) {
      expect(screen.queryByText(verboten)).not.toBeInTheDocument();
    }
  });

  it('bietet das Drucken an und sagt, dass nichts versendet wird', async () => {
    rendern();
    await screen.findByRole('heading', { name: 'Ihre nächsten Termine' });

    expect(screen.getByRole('button', { name: 'Terminzettel drucken' })).toBeInTheDocument();
    expect(screen.getByText(/wird nicht versendet/)).toBeInTheDocument();
    // Kein Versandweg auf der Seite - B15 ist offen (ANN-039).
    expect(screen.queryByRole('button', { name: /senden|mail|sms/i })).not.toBeInTheDocument();
  });

  it('vermerkt beim Drucken alle aufgeführten Termine als ausgehändigt (CAL-012)', async () => {
    const user = userEvent.setup();
    rendern();
    await screen.findByRole('heading', { name: 'Ihre nächsten Termine' });

    await user.click(screen.getByRole('button', { name: 'Terminzettel drucken' }));

    await waitFor(() =>
      expect(addAppointmentNotification).toHaveBeenCalledWith(
        eintraege.map((eintrag) => eintrag.id),
        'slip',
      ),
    );
    await waitFor(() => expect(drucken).toHaveBeenCalledTimes(1));
    expect(screen.getByText(/als „Terminzettel ausgehändigt" vermerkt/)).toBeInTheDocument();
  });

  it('druckt nicht, wenn der Vermerk scheitert', async () => {
    addAppointmentNotification.mockRejectedValue(
      new Error('Der Vermerk konnte nicht gespeichert werden.'),
    );
    const user = userEvent.setup();
    rendern();
    await screen.findByRole('heading', { name: 'Ihre nächsten Termine' });

    await user.click(screen.getByRole('button', { name: 'Terminzettel drucken' }));

    expect(
      await screen.findByText(/Es wurde nichts gedruckt und nichts vermerkt/),
    ).toBeInTheDocument();
    expect(drucken).not.toHaveBeenCalled();
  });

  it('bietet ohne Termine nichts zum Drucken an', async () => {
    fetchAppointmentSlip.mockResolvedValue([]);
    rendern();

    expect(await screen.findByText('Keine bevorstehenden Termine')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Terminzettel drucken' })).not.toBeInTheDocument();
  });

  it('meldet einen nicht lesbaren Datensatz, ohne etwas zu zeigen', async () => {
    fetchAppointmentSlip.mockRejectedValue(new Error('nope'));
    rendern();

    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(screen.queryByText('Max Mustermann')).not.toBeInTheDocument();
  });

  it('nimmt den Rückweg vom Druck aus', async () => {
    rendern();
    await screen.findByRole('heading', { name: 'Ihre nächsten Termine' });

    const zurueck = screen.getByRole('link', { name: '← Zurück zur Akte' });
    expect(zurueck.closest('.nicht-drucken')).not.toBeNull();
  });
});
