import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as RouterModul from 'react-router-dom';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as PatientsApi from '@/features/patients/api';
import type * as TreatmentBasesApi from './api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

/**
 * Termine übertragen (CAL-022).
 *
 * Geprüft wird, was diese Seite selbst verantwortet: **welche** Termine sie
 * anbietet, dass sich jeder einzeln abwählen lässt und dass sie den Vorgang in
 * **einem** Aufruf abschickt. Ob die Übertragung zulässig ist, entscheidet der
 * Server — dafür stehen die Fälle in `supabase/tests/appointment-coverage.test.ts`.
 */

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const ALT = '88888888-8888-4888-8888-000000000003';
const NEU = '88888888-8888-4888-8888-000000000004';

const fetchPatientTreatmentBasesClinical = vi.fn();
const fetchPatientTreatmentBasisSlots = vi.fn();
const transferAppointmentsToTreatmentBasis = vi.fn();
const fetchPatientAppointments = vi.fn();
const navigate = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof TreatmentBasesApi>();
  return {
    ...actual,
    fetchPatientTreatmentBases: () => Promise.resolve([]),
    fetchPatientTreatmentBasesClinical: (id: string) =>
      fetchPatientTreatmentBasesClinical(id) as Promise<TreatmentBasesApi.ClinicalTreatmentBasis[]>,
    fetchPatientTreatmentBasisSlots: (id: string) =>
      fetchPatientTreatmentBasisSlots(id) as Promise<TreatmentBasesApi.TreatmentBasisKontingent[]>,
    transferAppointmentsToTreatmentBasis: (ziel: string, ids: readonly string[]) =>
      transferAppointmentsToTreatmentBasis(ziel, ids) as Promise<number>,
  };
});

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchPatientAppointments: (id: string, abfrage: unknown) =>
      fetchPatientAppointments(id, abfrage) as Promise<AppointmentsApi.PatientAppointment[]>,
  };
});

vi.mock('@/features/patients/api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return { ...actual, fetchPatient: () => Promise.resolve(testPatient({ id: PATIENT_ID })) };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
  useParams: () => ({ patientId: PATIENT_ID }),
}));

const { TermineUebertragenPage } = await import('./TermineUebertragenPage');

function grundlage(
  rest: Partial<TreatmentBasesApi.ClinicalTreatmentBasis> = {},
): TreatmentBasesApi.ClinicalTreatmentBasis {
  return {
    id: ALT,
    prescriber_id: 'p1',
    prescriber_name: 'Dr. Test',
    prescriber_practice_name: null,
    treatment_basis_kind: 'first',
    issued_on: '2025-11-12',
    frequency_note: null,
    note: null,
    items: [],
    updated_at: '2026-01-01T10:00:00.000Z',
    diagnosis: null,
    therapy_goal: null,
    prescriber_note: null,
    follow_up_recommendation: null,
    ...rest,
  };
}

function kontingent(
  rest: Partial<TreatmentBasesApi.TreatmentBasisKontingent> = {},
): TreatmentBasesApi.TreatmentBasisKontingent {
  return {
    treatment_basis_id: ALT,
    prescribed: 6,
    used: 2,
    planned: 8,
    upcoming: 8,
    remaining: 0,
    covered: 6,
    uncovered: 2,
    ...rest,
  };
}

function termin(
  rest: Partial<AppointmentsApi.PatientAppointment> = {},
): AppointmentsApi.PatientAppointment {
  return {
    id: 't1',
    starts_at: '2027-05-19T07:00:00.000Z',
    ends_at: '2027-05-19T08:00:00.000Z',
    appointment_type: 'practice',
    status: 'confirmed',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    notification_channels: [],
    treatment_basis_id: ALT,
    treatment_basis_kind: 'first',
    treatment_basis_issued_on: '2025-11-12',
    treatment_basis_covered: false,
    organization_time_zone: 'Europe/Berlin',
    ...rest,
  };
}

function rendern(adresse = `/patienten/${PATIENT_ID}/termine-uebertragen?ziel=${NEU}`) {
  return renderWithProviders(
    <TermineUebertragenPage user={testUser(['office'], 'Olivia Office')} />,
    adresse,
  );
}

describe('Termine übertragen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPatientTreatmentBasesClinical.mockResolvedValue([
      grundlage(),
      grundlage({ id: NEU, treatment_basis_kind: 'follow_up', issued_on: '2026-09-08' }),
    ]);
    fetchPatientTreatmentBasisSlots.mockResolvedValue([
      kontingent(),
      kontingent({
        treatment_basis_id: NEU,
        prescribed: 10,
        used: 0,
        planned: 0,
        upcoming: 0,
        remaining: 10,
        covered: 0,
        uncovered: 0,
      }),
    ]);
    fetchPatientAppointments.mockResolvedValue([
      termin({ id: 'ungedeckt-1' }),
      termin({ id: 'ungedeckt-2', starts_at: '2027-05-26T07:00:00.000Z' }),
      termin({ id: 'gedeckt', treatment_basis_covered: true }),
    ]);
    transferAppointmentsToTreatmentBasis.mockResolvedValue(2);
  });

  it('bietet nur die ungedeckten künftigen Termine an', async () => {
    rendern();

    expect(await screen.findByText('Mittwoch, 19. Mai 2027')).toBeInTheDocument();
    expect(screen.getByText('Mittwoch, 26. Mai 2027')).toBeInTheDocument();
    // Der gedeckte Termin steht nicht zur Wahl - er hat seine Grundlage.
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    // Gefragt wird ausdrücklich nach den kommenden Terminen.
    expect(fetchPatientAppointments).toHaveBeenCalledWith(
      PATIENT_ID,
      expect.objectContaining({ kuenftig: true }),
    );
  });

  it('nimmt das Ziel aus der Adresse und überträgt alles in einem Vorgang', async () => {
    const user = userEvent.setup();
    rendern();

    await screen.findByText('Mittwoch, 19. Mai 2027');
    expect(screen.getByLabelText('Auf welche Behandlungsgrundlage? *')).toHaveValue(NEU);

    await user.click(screen.getByRole('button', { name: '2 Termine übertragen' }));

    expect(transferAppointmentsToTreatmentBasis).toHaveBeenCalledTimes(1);
    expect(transferAppointmentsToTreatmentBasis).toHaveBeenCalledWith(NEU, [
      'ungedeckt-1',
      'ungedeckt-2',
    ]);
  });

  it('lässt jeden Termin einzeln abwählen', async () => {
    const user = userEvent.setup();
    rendern();

    await screen.findByText('Mittwoch, 19. Mai 2027');
    await user.click(screen.getAllByRole('checkbox')[0]!);

    await user.click(screen.getByRole('button', { name: '1 Termin übertragen' }));
    expect(transferAppointmentsToTreatmentBasis).toHaveBeenCalledWith(NEU, ['ungedeckt-2']);
  });

  it('fragt ohne Ziel in der Adresse danach und schickt vorher nichts ab', async () => {
    const user = userEvent.setup();
    rendern(`/patienten/${PATIENT_ID}/termine-uebertragen`);

    await screen.findByText('Mittwoch, 19. Mai 2027');
    expect(screen.getByLabelText('Auf welche Behandlungsgrundlage? *')).toHaveValue('');
    expect(screen.getByRole('button', { name: '2 Termine übertragen' })).toBeDisabled();

    await user.selectOptions(screen.getByLabelText('Auf welche Behandlungsgrundlage? *'), NEU);
    await user.click(screen.getByRole('button', { name: '2 Termine übertragen' }));
    expect(transferAppointmentsToTreatmentBasis).toHaveBeenCalledWith(NEU, [
      'ungedeckt-1',
      'ungedeckt-2',
    ]);
  });

  it('nennt die Termine des Ziels nicht als Angebot', async () => {
    rendern(`/patienten/${PATIENT_ID}/termine-uebertragen?ziel=${ALT}`);

    // Alle ungedeckten Termine hängen an ALT - auf sich selbst wandert nichts.
    expect(await screen.findByText('Kein ungedeckter Termin')).toBeInTheDocument();
    expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
  });

  it('sagt es, wenn der Server ablehnt, und behält die Auswahl', async () => {
    const user = userEvent.setup();
    transferAppointmentsToTreatmentBasis.mockRejectedValue(
      new Error('Die Termine konnten nicht übertragen werden.'),
    );
    rendern();

    await screen.findByText('Mittwoch, 19. Mai 2027');
    await user.click(screen.getByRole('button', { name: '2 Termine übertragen' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      /Die Termine konnten nicht übertragen werden/,
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(2);
    expect(navigate).not.toHaveBeenCalled();
  });
});
