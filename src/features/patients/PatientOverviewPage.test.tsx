import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as DokumentationApi from '@/features/documentation/api';
import type * as VerordnungenApi from '@/features/prescriptions/api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

const fetchUpcomingAppointments = vi.fn();
const fetchPatientPrescriptions = vi.fn();
const fetchPatientPrescriptionsClinical = vi.fn();
const fetchPatientPrescriptionSlots = vi.fn();
const fetchTreatmentEvidencePage = vi.fn();

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchUpcomingAppointments: (patientId: string, limit?: number) =>
      fetchUpcomingAppointments(patientId, limit) as Promise<AppointmentsApi.UpcomingAppointment[]>,
  };
});

vi.mock('@/features/prescriptions/api', async (importOriginal) => {
  const actual = await importOriginal<typeof VerordnungenApi>();
  return {
    ...actual,
    fetchPatientPrescriptions: (id: string) =>
      fetchPatientPrescriptions(id) as Promise<VerordnungenApi.Prescription[]>,
    fetchPatientPrescriptionsClinical: (id: string) =>
      fetchPatientPrescriptionsClinical(id) as Promise<VerordnungenApi.ClinicalPrescription[]>,
    fetchPatientPrescriptionSlots: (id: string) =>
      fetchPatientPrescriptionSlots(id) as Promise<VerordnungenApi.PrescriptionKontingent[]>,
  };
});

vi.mock('@/features/documentation/api', async (importOriginal) => {
  const actual = await importOriginal<typeof DokumentationApi>();
  return {
    ...actual,
    fetchTreatmentEvidencePage: (patientId: string, cursor: DokumentationApi.AkteCursor | null) =>
      fetchTreatmentEvidencePage(patientId, cursor) as Promise<
        DokumentationApi.TreatmentEvidenceEntry[]
      >,
  };
});

const { Uebersicht } = await import('./PatientOverviewPage');

const patient = testPatient({ id: PATIENT_ID });

const naechsterTermin: AppointmentsApi.UpcomingAppointment = {
  id: '77777777-7777-4777-8777-000000000001',
  starts_at: '2027-05-19T07:00:00.000Z',
  ends_at: '2027-05-19T08:00:00.000Z',
  appointment_type: 'home_visit',
  status: 'confirmed',
  staff_given_name: 'Anna',
  staff_family_name: 'Beispiel',
  notification_channels: [],
  organization_time_zone: 'Europe/Berlin',
};

const nachweis: DokumentationApi.TreatmentEvidenceEntry = {
  appointment_id: '77777777-7777-4777-8777-000000000002',
  starts_at: '2026-09-08T07:00:00.000Z',
  ends_at: '2026-09-08T08:00:00.000Z',
  appointment_type: 'practice',
  appointment_status: 'completed',
  staff_given_name: 'Anna',
  staff_family_name: 'Beispiel',
  organization_time_zone: 'Europe/Berlin',
  documentation_status: 'none',
  documented_at: null,
};

function verordnung(
  rest: Partial<VerordnungenApi.Prescription> = {},
): VerordnungenApi.Prescription {
  return {
    id: 'v1',
    prescriber_id: 'p1',
    prescriber_name: 'Dr. med. Petra Probst',
    prescriber_practice_name: null,
    prescription_kind: 'follow_up',
    issued_on: '2026-06-18',
    frequency_note: null,
    note: null,
    items: [
      {
        id: 'i1',
        sort_order: 1,
        remedy: 'Krankengymnastik',
        prescribed_quantity: 10,
        used_quantity: 7,
        remaining_quantity: 3,
      },
    ],
    updated_at: '2026-06-18T10:00:00.000Z',
    ...rest,
  };
}

/**
 * Die Übersicht der Akte (AKTE-001).
 *
 * Geprüft wird, was sie leisten soll: die drei Arbeitsauskünfte stehen da,
 * jede führt in ihren Bereich, und keine holt mehr, als sie zeigt.
 */
describe('Uebersicht der Akte', () => {
  beforeEach(() => {
    for (const mock of [
      fetchUpcomingAppointments,
      fetchPatientPrescriptions,
      fetchPatientPrescriptionsClinical,
      fetchPatientPrescriptionSlots,
      fetchTreatmentEvidencePage,
    ]) {
      mock.mockReset();
    }
    fetchUpcomingAppointments.mockResolvedValue([]);
    fetchPatientPrescriptions.mockResolvedValue([]);
    fetchPatientPrescriptionsClinical.mockResolvedValue([]);
    fetchPatientPrescriptionSlots.mockResolvedValue([]);
    fetchTreatmentEvidencePage.mockResolvedValue([]);
  });

  it('zeigt die drei Arbeitsauskuenfte nebeneinander', async () => {
    renderWithProviders(<Uebersicht patient={patient} user={testUser(['office'])} />);

    expect(await screen.findByRole('heading', { name: 'Nächste Termine' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Laufende Verordnungen' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Letzter Behandlungsstand' })).toBeInTheDocument();
  });

  describe('Naechste Termine', () => {
    it('zeigt den naechsten Termin und fuehrt zu ihm', async () => {
      fetchUpcomingAppointments.mockResolvedValue([naechsterTermin]);
      renderWithProviders(<Uebersicht patient={patient} user={testUser(['therapist'])} />);

      const link = await screen.findByRole('link', { name: /19\. Mai 2027/ });
      expect(link).toHaveAttribute('href', `/termine/${naechsterTermin.id}`);
      expect(screen.getByText(/09:00–10:00 Uhr · Hausbesuch · Anna Beispiel/)).toBeInTheDocument();
    });

    it('zeigt hinter dem Termin die Mitteilungswege (CAL-012)', async () => {
      fetchUpcomingAppointments.mockResolvedValue([
        { ...naechsterTermin, notification_channels: ['phone', 'slip'] },
      ]);
      renderWithProviders(<Uebersicht patient={patient} user={testUser(['therapist'])} />);

      await screen.findByText(/19\. Mai 2027/);
      expect(screen.getByText('Telefon')).toBeInTheDocument();
      expect(screen.getByText('Zettel')).toBeInTheDocument();
    });

    it('fuehrt in die vollstaendige Terminliste', async () => {
      renderWithProviders(<Uebersicht patient={patient} user={testUser(['office'])} />);

      expect(
        await screen.findByRole('link', { name: 'Alle Termine und Historie' }),
      ).toHaveAttribute('href', `/patienten/${PATIENT_ID}/termine`);
    });

    it('sagt es als Text, wenn nichts vereinbart ist', async () => {
      renderWithProviders(<Uebersicht patient={patient} user={testUser(['therapist'])} />);
      expect(await screen.findByText('Kein weiterer Termin vereinbart.')).toBeInTheDocument();
    });

    it('fragt fuer ein Patientenkonto gar nicht erst', async () => {
      renderWithProviders(<Uebersicht patient={patient} user={testUser(['patient'])} />);

      await waitFor(() => expect(fetchUpcomingAppointments).not.toHaveBeenCalled());
      expect(screen.queryByRole('heading', { name: 'Nächste Termine' })).toBeNull();
    });
  });

  describe('Laufende Verordnungen', () => {
    it('nennt offene Einheiten und bevorstehende Termine getrennt', async () => {
      fetchPatientPrescriptions.mockResolvedValue([verordnung()]);
      fetchPatientPrescriptionSlots.mockResolvedValue([
        {
          prescription_id: 'v1',
          prescribed: 10,
          used: 7,
          planned: 8,
          upcoming: 2,
          remaining: 2,
        },
      ]);
      renderWithProviders(<Uebersicht patient={patient} user={testUser(['office'])} />);

      expect(await screen.findByText('3 von 10 offen')).toBeInTheDocument();
      expect(screen.getByText('2 bevorstehend')).toBeInTheDocument();
    });

    it('laesst ausgeschoepfte Verordnungen weg und sagt das', async () => {
      fetchPatientPrescriptions.mockResolvedValue([verordnung()]);
      fetchPatientPrescriptionSlots.mockResolvedValue([
        {
          prescription_id: 'v1',
          prescribed: 10,
          used: 10,
          planned: 10,
          upcoming: 0,
          remaining: 0,
        },
      ]);
      renderWithProviders(<Uebersicht patient={patient} user={testUser(['office'])} />);

      expect(
        await screen.findByText('Keine laufende Verordnung — alle erfassten sind ausgeschöpft.'),
      ).toBeInTheDocument();
    });

    it('fuehrt in den Verordnungsbereich', async () => {
      renderWithProviders(<Uebersicht patient={patient} user={testUser(['office'])} />);

      expect(await screen.findByRole('link', { name: 'Alle Verordnungen' })).toHaveAttribute(
        'href',
        `/patienten/${PATIENT_ID}/verordnungen`,
      );
    });
  });

  describe('Letzter Behandlungsstand', () => {
    it('liest den datensparsamen Nachweis, nicht die klinische Sicht', async () => {
      fetchTreatmentEvidencePage.mockResolvedValue([nachweis]);
      renderWithProviders(<Uebersicht patient={patient} user={testUser(['therapist'])} />);

      await screen.findByText('Keine Dokumentation.');
      expect(fetchTreatmentEvidencePage).toHaveBeenCalledWith(PATIENT_ID, null);
    });

    it('benennt einen offenen Entwurf als offenen Stand', async () => {
      fetchTreatmentEvidencePage.mockResolvedValue([
        { ...nachweis, documentation_status: 'draft' },
      ]);
      renderWithProviders(<Uebersicht patient={patient} user={testUser(['therapist'])} />);

      expect(
        await screen.findByText('Dokumentation liegt als Entwurf vor, noch nicht finalisiert.'),
      ).toBeInTheDocument();
    });

    it('nennt den Zeitpunkt einer finalisierten Dokumentation', async () => {
      fetchTreatmentEvidencePage.mockResolvedValue([
        {
          ...nachweis,
          documentation_status: 'final',
          documented_at: '2026-09-08T09:30:00.000Z',
        },
      ]);
      renderWithProviders(<Uebersicht patient={patient} user={testUser(['office'])} />);

      expect(await screen.findByText(/Dokumentation finalisiert am/)).toBeInTheDocument();
    });

    it('fuehrt zum Termin und in den Verlauf', async () => {
      fetchTreatmentEvidencePage.mockResolvedValue([nachweis]);
      renderWithProviders(<Uebersicht patient={patient} user={testUser(['office'])} />);

      expect(await screen.findByRole('link', { name: 'Zum Termin' })).toHaveAttribute(
        'href',
        `/termine/${nachweis.appointment_id}`,
      );
      expect(screen.getByRole('link', { name: 'Behandlungsverlauf' })).toHaveAttribute(
        'href',
        `/patienten/${PATIENT_ID}/verlauf`,
      );
    });

    it('fragt fuer ein Patientenkonto gar nicht erst', async () => {
      renderWithProviders(<Uebersicht patient={patient} user={testUser(['patient'])} />);

      await waitFor(() => expect(fetchTreatmentEvidencePage).not.toHaveBeenCalled());
    });
  });

  describe('Hinweise vor dem Hausbesuch', () => {
    it('holt den Zugangshinweis nach vorn', async () => {
      renderWithProviders(
        <Uebersicht
          patient={testPatient({
            id: PATIENT_ID,
            home_visit_access_note: '2. OG links, Klingel "Mustermann".',
          })}
          user={testUser(['therapist'])}
        />,
      );

      expect(
        await screen.findByRole('heading', { name: 'Vor dem Hausbesuch' }),
      ).toBeInTheDocument();
      expect(screen.getByText('2. OG links, Klingel "Mustermann".')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Alle Stammdaten' })).toHaveAttribute(
        'href',
        `/patienten/${PATIENT_ID}/stammdaten`,
      );
    });

    it('zeigt den Abschnitt nicht, wenn es nichts zu sagen gibt', async () => {
      renderWithProviders(<Uebersicht patient={patient} user={testUser(['therapist'])} />);

      await screen.findByRole('heading', { name: 'Nächste Termine' });
      expect(screen.queryByRole('heading', { name: 'Vor dem Hausbesuch' })).not.toBeInTheDocument();
    });
  });
});
