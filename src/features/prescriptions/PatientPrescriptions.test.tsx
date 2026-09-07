import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as PrescriptionsApi from './api';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

const fetchPatientPrescriptions = vi.fn();
const fetchPatientPrescriptionsClinical = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PrescriptionsApi>();
  return {
    ...actual,
    fetchPatientPrescriptions: (id: string) =>
      fetchPatientPrescriptions(id) as Promise<PrescriptionsApi.Prescription[]>,
    fetchPatientPrescriptionsClinical: (id: string) =>
      fetchPatientPrescriptionsClinical(id) as Promise<PrescriptionsApi.ClinicalPrescription[]>,
  };
});

const { PatientPrescriptions } = await import('./PatientPrescriptions');

const patient = testPatient();

function position(
  rest: Partial<PrescriptionsApi.PrescriptionItem> = {},
): PrescriptionsApi.PrescriptionItem {
  return {
    id: 'i1',
    sort_order: 1,
    remedy: 'Krankengymnastik',
    prescribed_quantity: 10,
    used_quantity: 7,
    remaining_quantity: 3,
    ...rest,
  };
}

function verordnung(
  rest: Partial<PrescriptionsApi.ClinicalPrescription> = {},
): PrescriptionsApi.ClinicalPrescription {
  return {
    id: 'v1',
    prescriber_id: 'p1',
    prescriber_name: 'Dr. med. Petra Probst',
    prescriber_practice_name: 'Praxis Fiktiv',
    prescription_kind: 'follow_up',
    issued_on: '2026-06-18',
    frequency_note: '2x pro Woche',
    note: null,
    items: [position()],
    updated_at: '2026-06-18T10:00:00.000Z',
    diagnosis: 'Synthetisch: Schulter rechts.',
    therapy_goal: null,
    prescriber_note: null,
    follow_up_recommendation: null,
    ...rest,
  };
}

describe('PatientPrescriptions', () => {
  beforeEach(() => {
    fetchPatientPrescriptions.mockReset();
    fetchPatientPrescriptionsClinical.mockReset();
    fetchPatientPrescriptions.mockResolvedValue([]);
    fetchPatientPrescriptionsClinical.mockResolvedValue([]);
  });

  it('gruppiert die Verordnungen nach Jahr, neueste zuerst', async () => {
    fetchPatientPrescriptionsClinical.mockResolvedValue([
      verordnung({ id: 'v2', issued_on: '2026-06-18' }),
      verordnung({ id: 'v1', issued_on: '2026-02-05', prescription_kind: 'first' }),
      verordnung({ id: 'v0', issued_on: '2025-11-12', prescription_kind: 'first' }),
    ]);
    renderWithProviders(<PatientPrescriptions patient={patient} user={testUser(['therapist'])} />);

    const jahre = await screen.findAllByRole('heading', { level: 3 });
    expect(jahre.map((h) => h.textContent)).toEqual(['2026', '2025']);
    expect(screen.getByText('Folgeverordnung vom 18.06.2026')).toBeInTheDocument();
    expect(screen.getByText('Erstverordnung vom 12.11.2025')).toBeInTheDocument();
  });

  it('zeigt der Therapeut:in die klinischen Felder', async () => {
    fetchPatientPrescriptionsClinical.mockResolvedValue([
      verordnung({
        diagnosis: 'Synthetisch: Schulter rechts.',
        follow_up_recommendation: 'Synthetisch: Folgeverordnung sinnvoll.',
      }),
    ]);
    renderWithProviders(<PatientPrescriptions patient={patient} user={testUser(['therapist'])} />);

    expect(await screen.findByText('Synthetisch: Schulter rechts.')).toBeInTheDocument();
    // ANN-014: die Beschriftung nennt ausdrücklich, wessen Empfehlung das ist.
    expect(screen.getByText('Empfehlung der Therapeut:in zum Verordnungsende')).toBeInTheDocument();
    expect(fetchPatientPrescriptions).not.toHaveBeenCalled();
  });

  it('ruft fuer office die organisatorische Sicht und zeigt keine Diagnose', async () => {
    fetchPatientPrescriptions.mockResolvedValue([
      {
        id: 'v1',
        prescriber_id: 'p1',
        prescriber_name: 'Dr. med. Petra Probst',
        prescriber_practice_name: 'Praxis Fiktiv',
        prescription_kind: 'follow_up',
        issued_on: '2026-06-18',
        frequency_note: '2x pro Woche',
        note: null,
        items: [position()],
        updated_at: '2026-06-18T10:00:00.000Z',
      } satisfies PrescriptionsApi.Prescription,
    ]);
    renderWithProviders(<PatientPrescriptions patient={patient} user={testUser(['office'])} />);

    expect(await screen.findByText('Folgeverordnung vom 18.06.2026')).toBeInTheDocument();
    expect(fetchPatientPrescriptionsClinical).not.toHaveBeenCalled();
    expect(screen.queryByText('Diagnose')).not.toBeInTheDocument();
  });

  it('rechnet das Restkontingent und nennt eine ausgeschoepfte Verordnung als Sachsatz', async () => {
    fetchPatientPrescriptionsClinical.mockResolvedValue([
      verordnung({
        items: [
          position({ id: 'a', prescribed_quantity: 10, used_quantity: 10, remaining_quantity: 0 }),
          position({
            id: 'b',
            sort_order: 2,
            remedy: 'Waermetherapie',
            prescribed_quantity: 10,
            used_quantity: 10,
            remaining_quantity: 0,
          }),
        ],
      }),
    ]);
    renderWithProviders(<PatientPrescriptions patient={patient} user={testUser(['therapist'])} />);

    expect(await screen.findByText('noch 0 von 20')).toBeInTheDocument();
    // ANN-014: eine Zustandsangabe, keine Empfehlung.
    expect(screen.getByText('Kontingent ausgeschöpft')).toBeInTheDocument();
    expect(screen.queryByText(/empfohlen|sollte|anfordern/i)).not.toBeInTheDocument();
  });

  it('bietet den therapeutischen Rollen das Erfassen an, office nicht', async () => {
    renderWithProviders(<PatientPrescriptions patient={patient} user={testUser(['therapist'])} />);
    expect(await screen.findByRole('link', { name: 'Verordnung erfassen' })).toHaveAttribute(
      'href',
      `/patienten/${patient.id}/verordnungen/neu`,
    );

    renderWithProviders(<PatientPrescriptions patient={patient} user={testUser(['office'])} />);
    const links = await screen.findAllByRole('link', { name: 'Verordnung erfassen' });
    expect(links).toHaveLength(1);
  });

  it('zeigt einem Patientenkonto den Abschnitt gar nicht', () => {
    const { container } = renderWithProviders(
      <PatientPrescriptions patient={patient} user={testUser(['patient'])} />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(fetchPatientPrescriptions).not.toHaveBeenCalled();
    expect(fetchPatientPrescriptionsClinical).not.toHaveBeenCalled();
  });

  it('meldet einen Ladefehler ohne interne Details', async () => {
    fetchPatientPrescriptionsClinical.mockRejectedValue(new Error('interne Ursache'));
    renderWithProviders(<PatientPrescriptions patient={patient} user={testUser(['team_lead'])} />);

    expect(
      await screen.findByText('Die Verordnungen konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/interne Ursache/)).not.toBeInTheDocument();
  });

  it('sagt bei leerer Akte, wo die erste Verordnung entsteht', async () => {
    renderWithProviders(<PatientPrescriptions patient={patient} user={testUser(['therapist'])} />);

    expect(await screen.findByText('Noch keine Verordnung erfasst')).toBeInTheDocument();
  });
});
