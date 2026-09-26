import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from '@/features/patients/api';
import type * as GrundlagenApi from '@/features/treatment-bases/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testUser } from '@/test-utils';

const navigate = vi.fn();
const searchPatients = vi.fn();
const fetchPatient = vi.fn();
const fetchPatientTreatmentBases = vi.fn();
const fetchPatientTreatmentBasesClinical = vi.fn();
const fetchPatientTreatmentBasisSlots = vi.fn();

vi.mock('@/features/patients/api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    searchPatients: (begriff: string) =>
      searchPatients(begriff) as Promise<PatientsApi.PatientSearchHit[]>,
    fetchPatient: (id: string) => fetchPatient(id) as Promise<PatientsApi.Patient | null>,
  };
});

vi.mock('@/features/treatment-bases/api', async (importOriginal) => {
  const actual = await importOriginal<typeof GrundlagenApi>();
  return {
    ...actual,
    fetchPatientTreatmentBases: (id: string) =>
      fetchPatientTreatmentBases(id) as Promise<GrundlagenApi.TreatmentBasis[]>,
    fetchPatientTreatmentBasesClinical: (id: string) =>
      fetchPatientTreatmentBasesClinical(id) as Promise<GrundlagenApi.ClinicalTreatmentBasis[]>,
    fetchPatientTreatmentBasisSlots: (id: string) =>
      fetchPatientTreatmentBasisSlots(id) as Promise<GrundlagenApi.TreatmentBasisKontingent[]>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
}));

const { DauerterminStartPage } = await import('./DauerterminStartPage');

const MAX = {
  id: '66666666-6666-4666-8666-000000000001',
  given_name: 'Max',
  family_name: 'Mustermann',
  date_of_birth: '1957-04-30',
  status: 'active' as const,
};

function grundlage(id: string, issued_on: string) {
  return {
    id,
    prescriber_id: null,
    prescriber_name: 'Dr. Beispiel',
    prescriber_practice_name: null,
    treatment_basis_kind: 'first' as const,
    issued_on,
    frequency_note: null,
    note: null,
    items: [],
    updated_at: '2027-01-01T00:00:00Z',
  };
}

function kontingent(treatment_basis_id: string, prescribed: number, used: number, planned = used) {
  return {
    treatment_basis_id,
    prescribed,
    used,
    planned,
    upcoming: planned - used,
    remaining: Math.max(prescribed - Math.max(used, planned), 0),
    covered: Math.min(prescribed, planned),
    uncovered: Math.max(planned - prescribed, 0),
  };
}

const G1 = '99999999-9999-4999-8999-000000000001';
const G2 = '99999999-9999-4999-8999-000000000002';
const MIT_PERSON = `/termine/dauertermin?datum=2027-05-12&beginn=09%3A00&patient=${MAX.id}`;
const SERIE = (g: string) =>
  `/patienten/${MAX.id}/verordnungen/${g}/serie?datum=2027-05-12&beginn=09%3A00`;

function rendern(pfad: string) {
  return renderWithProviders(<DauerterminStartPage user={testUser(['therapist'])} />, pfad);
}

/**
 * Dauertermin ohne Vorauswahl (BEF-042): erst die Person, dann - nur wenn
 * nötig - die Grundlage, dann die eine Serienseite.
 */
describe('DauerterminStartPage', () => {
  beforeEach(() => {
    navigate.mockReset();
    searchPatients.mockReset().mockResolvedValue([MAX]);
    fetchPatient.mockReset().mockResolvedValue(MAX);
    for (const f of [fetchPatientTreatmentBases, fetchPatientTreatmentBasesClinical]) {
      f.mockReset().mockResolvedValue([grundlage(G1, '2027-04-01')]);
    }
    fetchPatientTreatmentBasisSlots.mockReset().mockResolvedValue([kontingent(G1, 10, 2)]);
  });

  it('fragt ohne Person zuerst nach ihr und nimmt die Zeit mit', async () => {
    renderWithProviders(
      <DauerterminStartPage user={testUser(['therapist'])} />,
      '/termine/dauertermin?datum=2027-05-12&beginn=09%3A00',
    );

    expect(screen.getByText('12.05.2027, ab 09:00 Uhr')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Patient:in suchen'), 'Must');
    await userEvent.click(await screen.findByRole('option', { name: /Max Mustermann/ }));

    // Die Wahl landet in der Adresse; die Grundlagen fragt der nächste Schritt.
    expect(await screen.findByRole('heading', { name: /Grundlage/ })).toBeInTheDocument();
  });

  it('springt bei genau einer offenen Grundlage direkt in die Serie', async () => {
    rendern(MIT_PERSON);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(SERIE(G1), { replace: true }));
  });

  it('entscheidet erst mit den Zahlen - vorher gilt jede Grundlage als offen', async () => {
    fetchPatientTreatmentBasisSlots.mockReturnValue(new Promise(() => undefined));
    for (const f of [fetchPatientTreatmentBases, fetchPatientTreatmentBasesClinical]) {
      f.mockResolvedValue([grundlage(G1, '2027-04-01'), grundlage(G2, '2027-01-01')]);
    }
    rendern(MIT_PERSON);

    expect(await screen.findByText('Behandlungsgrundlagen werden geladen …')).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('nimmt die eine offene, wenn daneben ausgeschoepfte stehen', async () => {
    for (const f of [fetchPatientTreatmentBases, fetchPatientTreatmentBasesClinical]) {
      f.mockResolvedValue([grundlage(G1, '2027-04-01'), grundlage(G2, '2027-01-01')]);
    }
    fetchPatientTreatmentBasisSlots.mockResolvedValue([
      kontingent(G1, 10, 2),
      kontingent(G2, 6, 6),
    ]);
    rendern(MIT_PERSON);

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(SERIE(G1), { replace: true }));
  });

  it('laesst bei mehreren offenen waehlen und klappt die uebrigen ein', async () => {
    const G3 = '99999999-9999-4999-8999-000000000003';
    for (const f of [fetchPatientTreatmentBases, fetchPatientTreatmentBasesClinical]) {
      f.mockResolvedValue([
        grundlage(G1, '2027-04-01'),
        grundlage(G2, '2027-03-01'),
        grundlage(G3, '2026-11-01'),
      ]);
    }
    fetchPatientTreatmentBasisSlots.mockResolvedValue([
      kontingent(G1, 10, 2),
      kontingent(G2, 6, 1),
      kontingent(G3, 6, 6),
    ]);
    rendern(MIT_PERSON);

    const offen = await screen.findByRole('list', { name: 'Offene Grundlagen' });
    const links = within(offen).getAllByRole('link');
    expect(links).toHaveLength(2);
    expect(links[0]).toHaveAttribute('href', SERIE(G1));
    expect(links[0]).toHaveTextContent('noch 8 Behandlungen zu planen');
    expect(
      screen.getByText('Verplante und ausgeschöpfte (1)').closest('details'),
    ).not.toHaveAttribute('open');
    expect(navigate).not.toHaveBeenCalled();
  });

  it('bietet ohne Grundlage den Weg zum Anlegen an', async () => {
    for (const f of [fetchPatientTreatmentBases, fetchPatientTreatmentBasesClinical]) {
      f.mockResolvedValue([]);
    }
    fetchPatientTreatmentBasisSlots.mockResolvedValue([]);
    rendern(MIT_PERSON);

    expect(await screen.findByText('Keine Behandlungsgrundlage')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Grundlage anlegen' })).toHaveAttribute(
      'href',
      `/patienten/${MAX.id}/verordnungen/neu`,
    );
    expect(navigate).not.toHaveBeenCalled();
  });

  it('meldet einen Ladefehler ohne Details', async () => {
    for (const f of [fetchPatientTreatmentBases, fetchPatientTreatmentBasesClinical]) {
      f.mockRejectedValue(new Error('intern'));
    }
    rendern(MIT_PERSON);

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Die Behandlungsgrundlagen konnten nicht geladen werden.',
    );
    expect(screen.queryByText('intern')).not.toBeInTheDocument();
  });

  it('ignoriert eine verstellte Kennung und fragt nach der Person', () => {
    rendern('/termine/dauertermin?patient=kein-uuid');

    expect(screen.getByLabelText('Patient:in suchen')).toBeInTheDocument();
    expect(fetchPatient).not.toHaveBeenCalled();
  });
});
