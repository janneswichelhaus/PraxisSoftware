import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PatientsApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as RouterModul from 'react-router-dom';
import { morgenOrtszeit, renderWithProviders, testPatient } from '@/test-utils';

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
  postal_code: '72070',
  city: 'Tuebingen',
});

const fetchPatient = vi.fn();
const updatePatient = vi.fn();
const navigate = vi.fn();
const fetchAssignableTherapists = vi.fn();

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAssignableTherapists: () =>
      fetchAssignableTherapists() as Promise<AppointmentsApi.AssignableTherapist[]>,
  };
});

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    fetchPatient: (id: string) => fetchPatient(id) as Promise<PatientsApi.Patient | null>,
    updatePatient: (id: string, values: unknown) => updatePatient(id, values) as Promise<void>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
  useParams: () => ({ patientId: PATIENT_ID }),
}));

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
    fetchAssignableTherapists.mockReset();
    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: '55555555-5555-4555-8555-000000000002', display_name: 'Anna Beispiel' },
    ]);
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
    expect(screen.getByLabelText('PLZ')).toHaveValue('72070');
    expect(screen.getByLabelText('Ort')).toHaveValue('Tuebingen');
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

    expect(await screen.findAllByText('Nachname ist erforderlich.')).toHaveLength(2);
    expect(updatePatient).not.toHaveBeenCalled();
  });

  it('lehnt ein Geburtsdatum in der Zukunft ab', async () => {
    const user = userEvent.setup();
    const morgen = morgenOrtszeit();
    renderWithProviders(<EditPatientPage />);
    await formularAbwarten();

    await user.clear(screen.getByLabelText('Geburtsdatum *'));
    await user.type(screen.getByLabelText('Geburtsdatum *'), morgen);
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    expect(
      await screen.findAllByText('Das Geburtsdatum darf nicht in der Zukunft liegen.'),
    ).toHaveLength(2);
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

  // PAT-03: Der Fehler erscheint als Fenster im Bild statt oben im Formular,
  // danach steht der Fokus wieder auf „Änderungen speichern".
  it('meldet einen fehlgeschlagenen Schreibvorgang ohne interne Details', async () => {
    const user = userEvent.setup();
    updatePatient.mockRejectedValue(new Error('update_patient: permission denied'));
    renderWithProviders(<EditPatientPage />);
    await formularAbwarten();

    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    const fenster = await screen.findByRole('dialog', {
      name: 'Die Stammdaten konnten nicht gespeichert werden.',
    });
    expect(within(fenster).getByRole('alert')).toHaveTextContent(
      'Die Eingaben stehen noch im Formular. Bitte die Verbindung prüfen und erneut speichern.',
    );
    expect(fenster.textContent).not.toMatch(/permission|angemeldet/i);
    expect(navigate).not.toHaveBeenCalled();

    await user.click(within(fenster).getByRole('button', { name: 'Zurück zum Formular' }));
    expect(screen.getByRole('button', { name: 'Änderungen speichern' })).toHaveFocus();
  });

  // PAT-08: Aus der Akte kommt der Rückweg samt dem der Akte selbst mit - wer
  // aus dem Kalender kam, findet nach dem Speichern dorthin zurück.
  it('kehrt nach dem Speichern samt dem Rückweg der Akte zurück', async () => {
    const user = userEvent.setup();
    const akte = `/patienten/${PATIENT_ID}/stammdaten?zurueck=${encodeURIComponent('/kalender?ansicht=tag')}`;
    renderWithProviders(
      <EditPatientPage />,
      `/patienten/${PATIENT_ID}/bearbeiten?zurueck=${encodeURIComponent(akte)}`,
    );
    await formularAbwarten();

    expect(screen.getByRole('link', { name: 'Abbrechen' })).toHaveAttribute('href', akte);
    await user.clear(screen.getByLabelText('Ort'));
    await user.type(screen.getByLabelText('Ort'), 'Bonn');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(navigate).toHaveBeenCalledWith(akte, { replace: true }));
  });

  // PAT-02: Geänderte Stammdaten gehen nicht still verloren.
  it('fragt vor dem Weggehen nur, wenn etwas geändert ist', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditPatientPage />, `/patienten/${PATIENT_ID}/bearbeiten`);
    await formularAbwarten();

    const unveraendert = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(unveraendert);
    expect(unveraendert.defaultPrevented).toBe(false);

    await user.type(screen.getByLabelText('Ort'), 'x');
    await user.click(screen.getByRole('link', { name: 'Abbrechen' }));

    const rueckfrage = await screen.findByRole('group', { name: 'Ungespeicherte Eingaben' });
    expect(
      within(rueckfrage).getByRole('button', { name: 'Verwerfen und weitergehen' }),
    ).toBeInTheDocument();
    await user.click(within(rueckfrage).getByRole('button', { name: 'Hier bleiben' }));
    expect(screen.getByLabelText('Ort')).toHaveValue('Tuebingenx');
  });

  // PAT-20: Scheitert die Liste der Therapeut:innen, bleibt die gespeicherte
  // Zuordnung sichtbar, statt als „Keine feste Zuordnung" zu erscheinen.
  it('zeigt die bisherige Therapeut:in, wenn die Liste nicht lädt', async () => {
    fetchAssignableTherapists.mockRejectedValue(new Error('offline'));
    fetchPatient.mockResolvedValue({
      ...bestand,
      primary_therapist_staff_member_id: '55555555-5555-4555-8555-000000000004',
      primary_therapist_name: 'Tim Teamleitung',
    });
    renderWithProviders(<EditPatientPage />);
    await formularAbwarten();

    expect(await screen.findByText(/die bisherige Zuordnung bleibt erhalten/)).toBeInTheDocument();
    expect(screen.getByLabelText('Feste Therapeut:in')).toHaveDisplayValue('Tim Teamleitung');
  });

  it('zeigt einen unzugaenglichen Datensatz nicht als Formular', async () => {
    fetchPatient.mockResolvedValue(null);
    renderWithProviders(<EditPatientPage />);

    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(
      screen.getByText('Diese Akte gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben.'),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Vorname *')).not.toBeInTheDocument();
    // Auch im Fehlerfall gibt es Überschrift und Rückweg (PAT-22).
    expect(
      screen.getByRole('heading', { level: 1, name: 'Stammdaten bearbeiten' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Zurück zu den Stammdaten/ })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT_ID}/stammdaten`,
    );
  });

  it('bietet nach einem Ladefehler einen neuen Versuch an', async () => {
    const user = userEvent.setup();
    fetchPatient.mockRejectedValueOnce(new Error('offline'));
    renderWithProviders(<EditPatientPage />);

    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent('Bitte die Verbindung prüfen und später erneut versuchen.');
    await user.click(within(meldung).getByRole('button', { name: 'Erneut versuchen' }));

    expect(await formularAbwarten()).toBeInTheDocument();
  });
});
