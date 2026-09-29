import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from './api';
import type * as MergeApi from './zusammenfuehren';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testPatient } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const DUBLETTE_ID = '66666666-6666-4666-8666-0000000000d1';

const fetchPatient = vi.fn();
const findPossibleDuplicates = vi.fn();
const previewPatientMerge = vi.fn();
const mergePatients = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    fetchPatient: (id: string) => fetchPatient(id) as Promise<PatientsApi.Patient | null>,
    findPossibleDuplicates: (...args: unknown[]) =>
      findPossibleDuplicates(...args) as Promise<PatientsApi.PatientSearchHit[]>,
  };
});

vi.mock('./zusammenfuehren', async (importOriginal) => {
  const actual = await importOriginal<typeof MergeApi>();
  return {
    ...actual,
    previewPatientMerge: (q: string, z: string) =>
      previewPatientMerge(q, z) as Promise<MergeApi.Zusammenfuehrungsplan>,
    mergePatients: (q: string, z: string) => mergePatients(q, z) as Promise<void>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useParams: () => ({ patientId: PATIENT_ID }),
}));

const { ZusammenfuehrenPage } = await import('./ZusammenfuehrenPage');

const PFAD = `/patienten/${PATIENT_ID}/dublette`;

function plan(rest: Partial<MergeApi.Zusammenfuehrungsplan> = {}): MergeApi.Zusammenfuehrungsplan {
  return {
    source: {
      id: DUBLETTE_ID,
      given_name: 'Max',
      family_name: 'Mustermann',
      date_of_birth: null,
      status: 'active',
      care_concluded_on: null,
    },
    target: {
      id: PATIENT_ID,
      given_name: 'Max',
      family_name: 'Mustermann',
      date_of_birth: '1957-04-30',
      status: 'active',
      care_concluded_on: null,
    },
    counts: { appointments: 3, treatment_notes: 1, invoices: 1, invoices_issued: 1, tasks: 0 },
    conflicts: ['phone'],
    appended: ['special_note'],
    blockers: [],
    ...rest,
  };
}

async function waehleDublette() {
  await userEvent.click(await screen.findByRole('button', { name: /Max Mustermann/ }));
}

describe('ZusammenfuehrenPage (PRX-018)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchPatient.mockResolvedValue(testPatient());
    findPossibleDuplicates.mockResolvedValue([
      // Die Akte selbst taucht in der eigenen Dublettenliste nicht auf.
      {
        id: PATIENT_ID,
        given_name: 'Max',
        family_name: 'Mustermann',
        date_of_birth: '1957-04-30',
        status: 'active',
      },
      {
        id: DUBLETTE_ID,
        given_name: 'Max',
        family_name: 'Mustermann',
        date_of_birth: null,
        status: 'active',
      },
    ]);
    previewPatientMerge.mockResolvedValue(plan());
    mergePatients.mockResolvedValue(undefined);
  });

  it('schlägt mögliche Dubletten vor, ohne die Akte selbst', async () => {
    renderWithProviders(<ZusammenfuehrenPage />, PFAD);
    expect(await screen.findAllByRole('button', { name: /Max Mustermann/ })).toHaveLength(1);
    expect(findPossibleDuplicates).toHaveBeenCalledWith('Max', 'Mustermann', '1957-04-30');
    expect(previewPatientMerge).not.toHaveBeenCalled();
  });

  it('zeigt die Vorschau mit Bleibt, Mitwandern, Konflikten und Anhängen', async () => {
    renderWithProviders(<ZusammenfuehrenPage />, PFAD);
    await waehleDublette();

    expect(await screen.findByText('Bleibt')).toBeInTheDocument();
    expect(screen.getByText('Geht darin auf')).toBeInTheDocument();
    expect(
      screen.getByText('3 Termine, 1 Dokumentationseintrag, 1 Rechnung, 1 davon ausgestellt'),
    ).toBeInTheDocument();
    expect(screen.getByText('Telefon')).toBeInTheDocument();
    expect(screen.getByText('Besonderheit')).toBeInTheDocument();
    expect(previewPatientMerge).toHaveBeenCalledWith(DUBLETTE_ID, PATIENT_ID);
  });

  it('führt erst nach der Bestätigung zusammen', async () => {
    renderWithProviders(<ZusammenfuehrenPage />, PFAD);
    await waehleDublette();

    const knopf = await screen.findByRole('button', { name: 'Zusammenführen' });
    expect(knopf).toBeDisabled();
    expect(screen.getByText(/Nicht rückgängig zu machen/)).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText('Beide Akten betreffen dieselbe Person.'));
    await userEvent.click(knopf);

    expect(mergePatients).toHaveBeenCalledWith(DUBLETTE_ID, PATIENT_ID);
    expect(
      await screen.findByText('Die Dublette ist in dieser Akte aufgegangen.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Akte' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT_ID}`,
    );
  });

  it('nennt Sperrgründe und bietet kein Zusammenführen an (ANN-149)', async () => {
    previewPatientMerge.mockResolvedValue(plan({ blockers: ['draft_invoice_overlap'] }));
    renderWithProviders(<ZusammenfuehrenPage />, PFAD);
    await waehleDublette();

    expect(await screen.findByText(/Rechnungsentwurf für denselben Monat/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Zusammenführen' })).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Andere Akte wählen' }));
    expect(await screen.findByText('Welche Akte ist die Dublette?')).toBeInTheDocument();
  });

  it('meldet einen gescheiterten Vorgang, ohne Erfolg zu behaupten', async () => {
    mergePatients.mockRejectedValue(new Error('x'));
    renderWithProviders(<ZusammenfuehrenPage />, PFAD);
    await waehleDublette();
    await userEvent.click(await screen.findByLabelText('Beide Akten betreffen dieselbe Person.'));
    await userEvent.click(screen.getByRole('button', { name: 'Zusammenführen' }));

    expect(await screen.findByText(/konnten nicht zusammengeführt werden/)).toBeInTheDocument();
    expect(screen.queryByText(/aufgegangen/)).not.toBeInTheDocument();
  });

  it('ist barrierefrei', async () => {
    const { container } = renderWithProviders(<ZusammenfuehrenPage />, PFAD);
    await waehleDublette();
    await screen.findByRole('button', { name: 'Zusammenführen' });
    await pruefeBarrierefreiheit(container);
  });
});
