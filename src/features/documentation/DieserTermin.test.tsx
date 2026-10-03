import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type * as DokumentationApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as PatientsApi from '@/features/patients/api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

/**
 * „Dieser Termin" oben im Reiter Doku (AKTE-008, ANN-225): Von der
 * Tageskarte kommt man mit `?termin=` in die Akte; oben steht der Eintrag zu
 * diesem Termin, neu oder vorhanden.
 */

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const DOKU = `/patienten/${PATIENT_ID}/doku?termin=${TERMIN_ID}`;

const patient: PatientsApi.Patient = testPatient({ id: PATIENT_ID, status: 'active' });

/** Synthetischer Inhalt. */
const INHALT = 'Synthetisch: Gangschule im Flur, Treppe mit Gelaender.';

function eintrag(
  rest: Partial<DokumentationApi.TreatmentNote> = {},
): DokumentationApi.TreatmentNote {
  return {
    id: '99999999-9999-4999-8999-000000000001',
    appointment_id: TERMIN_ID,
    addendum_to_note_id: null,
    status: 'draft',
    content: INHALT,
    visit_without_treatment: false,
    created_at: '2027-05-12T08:10:00.000000+00:00',
    updated_at: '2027-05-12T08:30:00.000000+00:00',
    finalized_at: null,
    finalisation_kind: null,
    version_count: 0,
    author_name: 'Anna Beispiel',
    last_editor_name: 'Anna Beispiel',
    finalized_by_name: null,
    ...rest,
  };
}

const termin = {
  id: TERMIN_ID,
  patient_id: PATIENT_ID,
  appointment_type: 'home_visit',
  status: 'confirmed',
  starts_at: '2027-05-12T07:00:00+00:00',
  ends_at: '2027-05-12T08:00:00+00:00',
  staff_given_name: 'Anna',
  staff_family_name: 'Beispiel',
  organization_time_zone: 'Europe/Berlin',
} as unknown as AppointmentsApi.Appointment;

const fetchAppointment = vi.fn();
const fetchTreatmentDocumentation = vi.fn();

vi.mock('@/features/appointments/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AppointmentsApi>()),
  fetchAppointment: (id: string) => fetchAppointment(id) as Promise<AppointmentsApi.Appointment>,
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof DokumentationApi>()),
  fetchTreatmentDocumentation: (id: string) =>
    fetchTreatmentDocumentation(id) as Promise<DokumentationApi.TreatmentDocumentation>,
  fetchDocumentationDeadline: () => Promise.resolve(1),
}));

const { DieserTermin } = await import('./PatientRecordDocumentation');

function zeigen(rollen: Parameters<typeof testUser>[0] = ['therapist']) {
  return renderWithProviders(
    <DieserTermin patient={patient} user={testUser(rollen)} terminId={TERMIN_ID} />,
    DOKU,
  );
}

describe('Dieser Termin in der Doku (AKTE-008)', () => {
  beforeEach(() => {
    fetchAppointment.mockReset().mockResolvedValue(termin);
    fetchTreatmentDocumentation.mockReset();
  });

  it('zeigt einen vorhandenen Entwurf und führt zum Weiterschreiben - mit Rückweg in die Doku', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: eintrag(), addenda: [] });
    zeigen();

    expect(await screen.findByRole('heading', { name: 'Dieser Termin' })).toBeInTheDocument();
    expect(await screen.findByText(INHALT)).toBeInTheDocument();
    expect(screen.getByText('12.05.2027')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Weiterschreiben' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/abschluss?zurueck=${encodeURIComponent(DOKU)}`,
    );
    expect(fetchTreatmentDocumentation).toHaveBeenCalledWith(TERMIN_ID);
  });

  it('bietet ohne Eintrag das Schreiben an', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: null, addenda: [] });
    zeigen();

    expect(await screen.findByText('Noch kein Eintrag.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Eintrag schreiben' })).toHaveAttribute(
      'href',
      `/termine/${TERMIN_ID}/abschluss?zurueck=${encodeURIComponent(DOKU)}`,
    );
  });

  it('bietet an einem festgeschriebenen Eintrag kein Schreiben an - korrigiert wird am Termin', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({
      primary: eintrag({
        status: 'final',
        version_count: 1,
        finalized_at: '2027-05-12T09:00:00.000000+00:00',
        finalisation_kind: 'manual',
        finalized_by_name: 'Anna Beispiel',
      }),
      addenda: [],
    });
    zeigen();

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /schreiben/i })).toBeNull();
  });

  it('zeigt dem Büro den Eintrag, aber keinen Weg zum Schreiben', async () => {
    fetchTreatmentDocumentation.mockResolvedValue({ primary: eintrag(), addenda: [] });
    zeigen(['office']);

    expect(await screen.findByText(INHALT)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /schreiben/i })).toBeNull();
  });

  it('zeigt nichts und liest keine Doku, wenn der Termin zu einer anderen Person gehört', async () => {
    fetchAppointment.mockResolvedValue({ ...termin, patient_id: 'jemand-anderes' });
    const { container } = zeigen();

    await waitFor(() => expect(fetchAppointment).toHaveBeenCalledWith(TERMIN_ID));
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(fetchTreatmentDocumentation).not.toHaveBeenCalled();
  });

  it('fragt für ein Patientenkonto gar nicht erst', () => {
    const { container } = zeigen(['patient']);
    expect(container).toBeEmptyDOMElement();
    expect(fetchAppointment).not.toHaveBeenCalled();
  });
});
