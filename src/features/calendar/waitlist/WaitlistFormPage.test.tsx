import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as WaitlistApi from './api';
import type * as PatientsApi from '@/features/patients/api';
import type * as BasesApi from '@/features/patients/treatment-bases/api';
import { renderWithProviders, testPatient } from '@/test-utils';
import type * as StaffApi from '@/features/workforce/staff/api';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

const createWaitlistEntry = vi.fn();
const fetchPatient = vi.fn();
const fetchPatientTreatmentBases = vi.fn();
const fetchAssignableTherapists = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof WaitlistApi>()),
  createWaitlistEntry: (id: string, values: WaitlistApi.EntryValues) =>
    createWaitlistEntry(id, values) as Promise<string>,
}));
vi.mock('@/features/patients/api', async (importOriginal) => ({
  ...(await importOriginal<typeof PatientsApi>()),
  fetchPatient: (id: string) => fetchPatient(id) as Promise<PatientsApi.Patient | null>,
}));
vi.mock('@/features/patients/treatment-bases/api', async (importOriginal) => ({
  ...(await importOriginal<typeof BasesApi>()),
  fetchPatientTreatmentBases: (id: string) =>
    fetchPatientTreatmentBases(id) as Promise<BasesApi.TreatmentBasis[]>,
}));
vi.mock('@/features/workforce/staff/api', async (importOriginal) => ({
  ...(await importOriginal<typeof StaffApi>()),
  fetchAssignableTherapists: () =>
    fetchAssignableTherapists() as Promise<StaffApi.AssignableTherapist[]>,
}));

const { NewWaitlistEntryPage } = await import('./WaitlistFormPage');
const { validate } = await import('./form');

const BASE = {
  treatmentBasisId: '',
  staffMemberId: '',
  type: 'home_visit' as const,
  duration: '60',
  windows: [],
  earliestOn: '',
  neededBy: '',
  reason: 'patient_wish' as const,
  note: '',
};

describe('Warteliste: Formular (PRX-001)', () => {
  beforeEach(() => {
    createWaitlistEntry.mockReset();
    fetchPatient.mockResolvedValue(
      testPatient({ id: PATIENT_ID, given_name: 'Berta', family_name: 'Bestand' }),
    );
    fetchPatientTreatmentBases.mockResolvedValue([]);
    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: 's1', display_name: 'Anna Beispiel' },
    ]);
  });

  it('prüft Dauer, Wunschzeiten, Daten und Notiz vor dem Absenden', () => {
    const result = validate({
      ...BASE,
      duration: '3',
      windows: [{ weekday: 1, from: '12:00', to: '08:00' }],
      earliestOn: '2026-10-10',
      neededBy: '2026-10-01',
      note: 'x'.repeat(501),
    });
    if (!('errors' in result)) throw new Error('Fehler erwartet');
    expect(result.errors.duration).toMatch(/zwischen 5 und 240/);
    expect(result.errors.windows).toMatch(/vor ihrem Beginn/);
    expect(result.errors.dates).toMatch(/Bis spätestens/);
    expect(result.errors.note).toMatch(/500/);
  });

  it('gibt leere Felder als null an den Server', () => {
    expect(validate({ ...BASE, note: '  ' })).toEqual({
      values: {
        treatmentBasisId: null,
        staffMemberId: null,
        type: 'home_visit',
        duration: 60,
        windows: [],
        earliestOn: null,
        neededBy: null,
        reason: 'patient_wish',
        note: null,
      },
    });
  });

  it('fragt ohne Person zuerst nach der Patient:in', async () => {
    renderWithProviders(<NewWaitlistEntryPage />, '/warteliste/neu');
    expect(await screen.findByText('Zuerst die Patient:in wählen.')).toBeInTheDocument();
    expect(screen.getByLabelText('Patient:in suchen')).toBeInTheDocument();
  });

  it('legt einen Eintrag mit Wunschzeit und Grund an', async () => {
    createWaitlistEntry.mockResolvedValue('neu');
    const user = userEvent.setup();
    renderWithProviders(<NewWaitlistEntryPage />, `/warteliste/neu?patient=${PATIENT_ID}`);

    expect(await screen.findByText('Berta Bestand')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Wunschzeit hinzufügen' }));
    await user.selectOptions(screen.getByLabelText('Grund'), 'Verordnung endet');
    await user.selectOptions(await screen.findByLabelText('Therapeut:in'), 'Anna Beispiel');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    expect(createWaitlistEntry).toHaveBeenCalledWith(PATIENT_ID, {
      treatmentBasisId: null,
      staffMemberId: 's1',
      type: 'home_visit',
      duration: 60,
      windows: [{ weekday: 1, from: '08:00', to: '12:00' }],
      earliestOn: null,
      neededBy: null,
      reason: 'prescription_ending',
      note: null,
    });
  });

  // DESIGN.md, Formular: Was zu korrigieren ist, steht über den Feldern, und
  // jeder Eintrag führt zum Feld.
  it('fasst Fehler über dem Formular zusammen und führt zum Feld', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewWaitlistEntryPage />, `/warteliste/neu?patient=${PATIENT_ID}`);

    const dauer = await screen.findByLabelText('Dauer in Minuten');
    await user.clear(dauer);
    await user.type(dauer, '3');
    await user.click(screen.getByRole('button', { name: 'Speichern' }));

    const zusammenfassung = await screen.findByRole('alert');
    expect(zusammenfassung).toHaveTextContent('Bitte prüfen Sie diese Angabe');
    await user.click(screen.getByRole('link', { name: /Dauer/ }));
    expect(dauer).toHaveFocus();
    expect(createWaitlistEntry).not.toHaveBeenCalled();
  });

  it('zeigt den Fehler des Servers, etwa bei einer Dublette', async () => {
    const { AlreadyOnWaitlistError } = await import('./api');
    createWaitlistEntry.mockRejectedValue(new AlreadyOnWaitlistError());
    const user = userEvent.setup();
    renderWithProviders(<NewWaitlistEntryPage />, `/warteliste/neu?patient=${PATIENT_ID}`);

    await user.click(await screen.findByRole('button', { name: 'Speichern' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/schon auf der Warteliste/);
  });
});
