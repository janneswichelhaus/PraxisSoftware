import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const VERORDNUNG = '88888888-8888-4888-8888-000000000002';

const fetchPatientAppointments = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchPatientAppointments: (patientId: string, query: AppointmentsApi.PatientAppointmentQuery) =>
      fetchPatientAppointments(patientId, query) as Promise<AppointmentsApi.PatientAppointment[]>,
  };
});

const { Terminbereich } = await import('./PatientAppointmentsPage');

const patient = testPatient({ id: PATIENT_ID });

function termin(
  rest: Partial<AppointmentsApi.PatientAppointment> = {},
): AppointmentsApi.PatientAppointment {
  return {
    id: 't1',
    starts_at: '2027-05-19T07:00:00.000Z',
    ends_at: '2027-05-19T08:00:00.000Z',
    appointment_type: 'home_visit',
    status: 'confirmed',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    notification_channels: [],
    prescription_id: null,
    prescription_issued_on: null,
    organization_time_zone: 'Europe/Berlin',
    ...rest,
  };
}

/** Was die Liste in welche Richtung anfragt - `kuenftig` trennt die Aufrufe. */
function antwortet(kuenftige: unknown[], vergangene: unknown[]) {
  fetchPatientAppointments.mockImplementation(
    (_id: string, query: AppointmentsApi.PatientAppointmentQuery) =>
      Promise.resolve(query.kuenftig ? kuenftige : vergangene),
  );
}

describe('Terminbereich der Akte (AKTE-003)', () => {
  beforeEach(() => {
    fetchPatientAppointments.mockReset();
    antwortet([], []);
  });

  it('zeigt kommende und vergangene Termine getrennt', async () => {
    antwortet(
      [termin({ id: 'kuenftig' })],
      [termin({ id: 'vergangen', starts_at: '2026-09-08T07:00:00.000Z' })],
    );
    renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

    expect(await screen.findByRole('heading', { name: 'Kommende Termine' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Vergangene Termine' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /19\. Mai 2027/ })).toHaveAttribute(
      'href',
      '/termine/kuenftig',
    );
    expect(screen.getByRole('link', { name: /8\. September 2026/ })).toHaveAttribute(
      'href',
      '/termine/vergangen',
    );
  });

  it('zeigt abgesagte Termine mit ihrem Zustand', async () => {
    antwortet([], [termin({ id: 'abgesagt', status: 'cancelled' })]);
    renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

    expect(await screen.findByText('Abgesagt')).toBeInTheDocument();
  });

  it('sagt es als Text, wenn es nichts gibt', async () => {
    renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

    expect(await screen.findByText('Kein weiterer Termin vereinbart.')).toBeInTheDocument();
    expect(
      screen.getByText('Für diese Person gibt es noch keinen vergangenen Termin.'),
    ).toBeInTheDocument();
  });

  describe('Verordnung und Termine finden einander', () => {
    it('nennt an jedem Termin seine Verordnung', async () => {
      antwortet(
        [
          termin({
            id: 'ausSerie',
            prescription_id: VERORDNUNG,
            prescription_issued_on: '2026-06-18',
          }),
        ],
        [],
      );
      renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

      expect(
        await screen.findByRole('link', { name: 'Verordnung vom 18.06.2026' }),
      ).toHaveAttribute('href', `/patienten/${PATIENT_ID}/verordnungen#verordnung-${VERORDNUNG}`);
    });

    it('filtert auf eine Verordnung und sagt das', async () => {
      antwortet([termin({ id: 'ausSerie', prescription_id: VERORDNUNG })], []);
      renderWithProviders(
        <Terminbereich patient={patient} user={testUser(['office'])} />,
        `/patienten/${PATIENT_ID}/termine?verordnung=${VERORDNUNG}`,
      );

      expect(await screen.findByText('Nur die Termine einer Verordnung.')).toBeInTheDocument();
      await waitFor(() =>
        expect(fetchPatientAppointments).toHaveBeenCalledWith(
          PATIENT_ID,
          expect.objectContaining({ verordnung: VERORDNUNG }),
        ),
      );
    });

    it('nimmt den Filter wieder heraus', async () => {
      const user = userEvent.setup();
      antwortet([termin({ prescription_id: VERORDNUNG })], []);
      renderWithProviders(
        <Terminbereich patient={patient} user={testUser(['office'])} />,
        `/patienten/${PATIENT_ID}/termine?verordnung=${VERORDNUNG}`,
      );

      await user.click(await screen.findByRole('button', { name: 'Alle Termine zeigen' }));

      await waitFor(() =>
        expect(screen.queryByText('Nur die Termine einer Verordnung.')).not.toBeInTheDocument(),
      );
      expect(fetchPatientAppointments).toHaveBeenCalledWith(
        PATIENT_ID,
        expect.objectContaining({ verordnung: null }),
      );
    });

    it('ignoriert eine verstellte Verordnungskennung still', async () => {
      renderWithProviders(
        <Terminbereich patient={patient} user={testUser(['office'])} />,
        `/patienten/${PATIENT_ID}/termine?verordnung=kein-uuid`,
      );

      await waitFor(() => expect(fetchPatientAppointments).toHaveBeenCalled());
      expect(fetchPatientAppointments).toHaveBeenCalledWith(
        PATIENT_ID,
        expect.objectContaining({ verordnung: null }),
      );
      expect(screen.queryByText('Nur die Termine einer Verordnung.')).not.toBeInTheDocument();
    });
  });

  describe('Uebergabe an den Kalender', () => {
    it('nimmt den Patientenfilter und den Tag des naechsten Termins mit', async () => {
      antwortet([termin({ starts_at: '2027-05-19T07:00:00.000Z' })], []);
      renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

      const link = await screen.findByRole('link', { name: 'Im Kalender zeigen' });
      await waitFor(() =>
        expect(link).toHaveAttribute(
          'href',
          `/kalender?ansicht=tag&datum=2027-05-19&patient=${PATIENT_ID}`,
        ),
      );
    });

    it('faellt ohne kommenden Termin auf den heutigen Tag zurueck', async () => {
      renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

      const link = await screen.findByRole('link', { name: 'Im Kalender zeigen' });
      expect(link.getAttribute('href')).toMatch(
        new RegExp(`^/kalender\\?ansicht=tag&datum=\\d{4}-\\d{2}-\\d{2}&patient=${PATIENT_ID}$`),
      );
    });
  });

  it('fuehrt den Weg zum Mitteilen der Termine', async () => {
    renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

    expect(await screen.findByRole('link', { name: 'Termine mitteilen' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT_ID}/terminzettel`,
    );
  });

  it('meldet einen Ladefehler ohne interne Details', async () => {
    fetchPatientAppointments.mockRejectedValue(new Error('interne Ursache'));
    renderWithProviders(<Terminbereich patient={patient} user={testUser(['office'])} />);

    expect(
      (await screen.findAllByText('Die Termine konnten nicht geladen werden.')).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText(/interne Ursache/)).not.toBeInTheDocument();
  });
});
