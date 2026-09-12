import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from './api';
import type * as RouterModule from 'react-router-dom';
import { renderWithProviders, testPatient } from '@/test-utils';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';

const bestand: PatientsApi.Patient = testPatient({
  id: PATIENT_ID,
  status: 'active',
  care_started_on: '2026-01-05',
  given_name: 'Berta',
  family_name: 'Bestand',
  date_of_birth: '1970-05-06',
  email: 'berta.bestand@example.invalid',
  phone: '0221 111111',
  street: 'Altstrasse',
  house_number: '1',
  postal_code: '50667',
  city: 'Koeln',
});

const fetchPatient = vi.fn();
const updatePatient = vi.fn();
const navigate = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    fetchPatient: (id: string) => fetchPatient(id) as Promise<PatientsApi.Patient | null>,
    updatePatient: (id: string, values: unknown) => updatePatient(id, values) as Promise<void>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModule>();
  return {
    ...actual,
    useNavigate: () => navigate,
    useParams: () => ({ patientId: PATIENT_ID }),
  };
});

const { EditPatientPage } = await import('./EditPatientPage');

async function formularAbwarten() {
  return screen.findByRole('button', { name: 'Änderungen speichern' });
}

describe('EditPatientPage', () => {
  beforeEach(() => {
    fetchPatient.mockReset();
    updatePatient.mockReset();
    navigate.mockReset();
    fetchPatient.mockResolvedValue(bestand);
    updatePatient.mockResolvedValue(undefined);
  });

  it('befuellt das Formular mit den aktuellen Werten', async () => {
    renderWithProviders(<EditPatientPage />);
    await formularAbwarten();

    expect(screen.getByLabelText('Vorname *')).toHaveValue('Berta');
    expect(screen.getByLabelText('Nachname *')).toHaveValue('Bestand');
    expect(screen.getByLabelText('Geburtsdatum *')).toHaveValue('1970-05-06');
    expect(screen.getByLabelText('E-Mail')).toHaveValue('berta.bestand@example.invalid');
    expect(screen.getByLabelText('Telefon (privat)')).toHaveValue('0221 111111');
    expect(screen.getByLabelText('Straße')).toHaveValue('Altstrasse');
    expect(screen.getByLabelText('Hausnummer')).toHaveValue('1');
    expect(screen.getByLabelText('PLZ')).toHaveValue('50667');
    expect(screen.getByLabelText('Ort')).toHaveValue('Koeln');
  });

  it('zeigt fehlende Werte als leeres Feld statt als "null"', async () => {
    fetchPatient.mockResolvedValue({ ...bestand, email: null, city: null });
    renderWithProviders(<EditPatientPage />);
    await formularAbwarten();

    expect(screen.getByLabelText('E-Mail')).toHaveValue('');
    expect(screen.getByLabelText('Ort')).toHaveValue('');
  });

  it('bietet weder Status noch Organisation zur Bearbeitung an', async () => {
    renderWithProviders(<EditPatientPage />);
    await formularAbwarten();

    expect(screen.queryByLabelText(/Status/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Organisation/)).not.toBeInTheDocument();
  });

  it('speichert die geaenderten Werte und kehrt zur Akte zurueck', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditPatientPage />);
    await formularAbwarten();

    await user.clear(screen.getByLabelText('Ort'));
    await user.type(screen.getByLabelText('Ort'), 'Bonn');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(updatePatient).toHaveBeenCalledTimes(1));
    expect(updatePatient).toHaveBeenCalledWith(
      PATIENT_ID,
      expect.objectContaining({ given_name: 'Berta', city: 'Bonn' }),
    );
    // Zurueck in die Stammdaten: dort steht, was gerade geaendert wurde
    // (AKTE-005). Auf der Uebersicht der Akte kaeme der Ort gar nicht vor.
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/patienten/${PATIENT_ID}/stammdaten`, {
        replace: true,
      }),
    );
  });

  it('uebergibt ein geleertes Optionalfeld als null', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditPatientPage />);
    await formularAbwarten();

    await user.clear(screen.getByLabelText('E-Mail'));
    await user.clear(screen.getByLabelText('Telefon (privat)'));
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(updatePatient).toHaveBeenCalledTimes(1));
    expect(updatePatient.mock.calls[0]?.[1]).toMatchObject({ email: null, phone: null });
  });

  it('haelt fehlende Pflichtangaben im Formular auf', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditPatientPage />);
    await formularAbwarten();

    await user.clear(screen.getByLabelText('Nachname *'));
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    expect(await screen.findByText('Nachname ist erforderlich.')).toBeInTheDocument();
    expect(updatePatient).not.toHaveBeenCalled();
  });

  it('lehnt ein Geburtsdatum in der Zukunft ab', async () => {
    const user = userEvent.setup();
    const morgen = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    renderWithProviders(<EditPatientPage />);
    await formularAbwarten();

    await user.clear(screen.getByLabelText('Geburtsdatum *'));
    await user.type(screen.getByLabelText('Geburtsdatum *'), morgen);
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    expect(
      await screen.findByText('Das Geburtsdatum darf nicht in der Zukunft liegen.'),
    ).toBeInTheDocument();
    expect(updatePatient).not.toHaveBeenCalled();
  });

  it('loest bei doppeltem Absenden nur einen Schreibvorgang aus', async () => {
    const user = userEvent.setup();
    let aufloesen: () => void = () => undefined;
    updatePatient.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          aufloesen = resolve;
        }),
    );

    renderWithProviders(<EditPatientPage />);
    await formularAbwarten();

    const speichern = screen.getByRole('button', { name: 'Änderungen speichern' });
    await user.click(speichern);
    await screen.findByRole('button', { name: 'Wird gespeichert …' });
    await user.click(screen.getByRole('button', { name: 'Wird gespeichert …' }));

    expect(updatePatient).toHaveBeenCalledTimes(1);
    aufloesen();
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  });

  it('meldet einen fehlgeschlagenen Schreibvorgang ohne interne Details', async () => {
    const user = userEvent.setup();
    updatePatient.mockRejectedValue(new Error('Die Stammdaten konnten nicht gespeichert werden.'));
    renderWithProviders(<EditPatientPage />);
    await formularAbwarten();

    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    expect(
      await screen.findByText('Die Stammdaten konnten nicht gespeichert werden.'),
    ).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  it('zeigt einen unzugaenglichen Datensatz nicht als Formular', async () => {
    fetchPatient.mockResolvedValue(null);
    renderWithProviders(<EditPatientPage />);

    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(screen.queryByLabelText('Vorname *')).not.toBeInTheDocument();
  });
});
