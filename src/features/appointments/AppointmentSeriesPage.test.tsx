import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import type * as PatientsApi from '@/features/patients/api';
import type * as RouterModule from 'react-router-dom';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const VERORDNUNG = '88888888-8888-4888-8888-000000000002';
const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const ORT = '33333333-3333-4333-8333-000000000001';

const patient: PatientsApi.Patient = testPatient({
  id: PATIENT_ID,
  status: 'active',
  given_name: 'Max',
  family_name: 'Mustermann',
  street: 'Beispielstrasse',
  house_number: '12',
  postal_code: '72070',
  city: 'Tuebingen',
});

const fetchPatient = vi.fn();
const fetchPrescriptionSlots = vi.fn();
const fetchAssignableTherapists = vi.fn();
const fetchLocations = vi.fn();
const checkAppointmentSlots = vi.fn();
const createAppointmentSeries = vi.fn();
const navigate = vi.fn();

vi.mock('@/features/patients/api', async (importOriginal) => ({
  ...(await importOriginal<typeof PatientsApi>()),
  fetchPatient: (id: string) => fetchPatient(id) as Promise<PatientsApi.Patient | null>,
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchPrescriptionSlots: (id: string) =>
      fetchPrescriptionSlots(id) as Promise<AppointmentsApi.PrescriptionSlots>,
    fetchAssignableTherapists: () =>
      fetchAssignableTherapists() as Promise<AppointmentsApi.AssignableTherapist[]>,
    fetchLocations: () => fetchLocations() as Promise<AppointmentsApi.Location[]>,
    checkAppointmentSlots: (staff: string, slots: unknown) =>
      checkAppointmentSlots(staff, slots) as Promise<(AppointmentsApi.SlotConflict | null)[]>,
    createAppointmentSeries: (...args: unknown[]) =>
      createAppointmentSeries(...args) as Promise<number>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModule>()),
  useNavigate: () => navigate,
  useParams: () => ({ patientId: PATIENT_ID, prescriptionId: VERORDNUNG }),
}));

const { AppointmentSeriesPage } = await import('./AppointmentSeriesPage');

function rendern() {
  return renderWithProviders(
    <AppointmentSeriesPage user={testUser(['office'], 'Olivia Office')} />,
    `/patienten/${PATIENT_ID}/verordnungen/${VERORDNUNG}/serie`,
  );
}

function formularAbwarten() {
  return screen.findByRole('button', { name: 'Termine vorschlagen' });
}

/** Füllt Person, Startdatum und Beginn und erzeugt den Vorschlag. */
async function vorschlagen(user: ReturnType<typeof userEvent.setup>, anzahl?: number) {
  await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
  await user.clear(screen.getByLabelText('Erster Termin am *'));
  await user.type(screen.getByLabelText('Erster Termin am *'), '2027-05-12');
  await user.type(screen.getByLabelText('Beginn *'), '09:00');
  if (anzahl !== undefined) {
    await user.clear(screen.getByLabelText('Anzahl Termine *'));
    await user.type(screen.getByLabelText('Anzahl Termine *'), String(anzahl));
  }
  await user.click(screen.getByRole('button', { name: 'Termine vorschlagen' }));
}

describe('AppointmentSeriesPage', () => {
  beforeEach(() => {
    fetchPatient.mockReset();
    fetchPrescriptionSlots.mockReset();
    fetchAssignableTherapists.mockReset();
    fetchLocations.mockReset();
    checkAppointmentSlots.mockReset();
    createAppointmentSeries.mockReset();
    navigate.mockReset();

    fetchPatient.mockResolvedValue(patient);
    fetchPrescriptionSlots.mockResolvedValue({
      patient_id: PATIENT_ID,
      frequency_note: '2x pro Woche',
      prescribed: 10,
      used: 7,
      planned: 0,
      remaining: 3,
    });
    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: STAFF_ANNA, display_name: 'Anna Beispiel' },
    ]);
    fetchLocations.mockResolvedValue([{ id: ORT, name: 'Hauptstandort Tuebingen' }]);
    checkAppointmentSlots.mockResolvedValue([null, null, null]);
    createAppointmentSeries.mockResolvedValue(3);
  });

  it('zeigt das Kontingent der Verordnung', async () => {
    rendern();
    await formularAbwarten();

    expect(screen.getByText('Verordnet')).toBeInTheDocument();
    expect(screen.getByText('10 Behandlungen')).toBeInTheDocument();
    expect(screen.getByText('2x pro Woche')).toBeInTheDocument();
  });

  it('schlägt das offene Kontingent als Anzahl vor', async () => {
    rendern();
    await formularAbwarten();

    await waitFor(() => expect(screen.getByLabelText('Anzahl Termine *')).toHaveValue(3));
  });

  it('erzeugt die Liste aus Rhythmus und Anzahl und prüft sie serverseitig', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();
    await vorschlagen(user);

    expect(await screen.findByText('Vorgeschlagene Termine (3)')).toBeInTheDocument();
    expect(screen.getByLabelText('Datum 1')).toHaveValue('2027-05-12');
    expect(screen.getByLabelText('Datum 2')).toHaveValue('2027-05-19');
    expect(screen.getByLabelText('Datum 3')).toHaveValue('2027-05-26');

    await waitFor(() =>
      expect(checkAppointmentSlots).toHaveBeenCalledWith(STAFF_ANNA, [
        { datum: '2027-05-12', beginn: '09:00' },
        { datum: '2027-05-19', beginn: '09:00' },
        { datum: '2027-05-26', beginn: '09:00' },
      ]),
    );
    expect(await screen.findByText('Alle 3 Termine sind planbar.')).toBeInTheDocument();
  });

  /**
   * UX-012: Ein Befund gilt fuer den Vorschlag, zu dem er gehoert.
   *
   * Die Pruefung laeuft ueber den Server. Wer in dieser Zeit ein Datum aendert,
   * bekam vorher die Antwort auf die ALTE Liste zurueck - und weil nur die
   * Laenge verglichen wurde, galt sie als gueltiger Befund fuer die neue.
   */
  it('verwirft einen Befund, der zu einem ueberholten Vorschlag gehoert', async () => {
    const user = userEvent.setup();
    let antworten: (werte: (string | null)[]) => void = () => undefined;
    checkAppointmentSlots.mockImplementation(
      () =>
        new Promise((resolve) => {
          antworten = resolve;
        }),
    );

    rendern();
    await formularAbwarten();
    await vorschlagen(user);

    // Waehrend die Pruefung laeuft, wandert der zweite Termin.
    await user.clear(screen.getByLabelText('Datum 2'));
    await user.type(screen.getByLabelText('Datum 2'), '2027-05-20');

    // Jetzt erst antwortet der Server - auf den alten Vorschlag.
    antworten([null, null, null]);

    await waitFor(() =>
      expect(
        screen.getByText('Die Liste wurde geändert und ist noch nicht geprüft.'),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByText('Alle 3 Termine sind planbar.')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3 Termine anlegen' })).toBeDisabled();
  });

  it('legt die Serie an und kehrt in die Akte zurück', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();
    await vorschlagen(user);
    await screen.findByText('Alle 3 Termine sind planbar.');

    await user.click(screen.getByRole('button', { name: '3 Termine anlegen' }));

    await waitFor(() => expect(createAppointmentSeries).toHaveBeenCalledTimes(1));
    expect(createAppointmentSeries).toHaveBeenCalledWith(
      PATIENT_ID,
      VERORDNUNG,
      expect.objectContaining({ staff_member_id: STAFF_ANNA, appointment_type: 'home_visit' }),
      [
        { datum: '2027-05-12', beginn: '09:00' },
        { datum: '2027-05-19', beginn: '09:00' },
        { datum: '2027-05-26', beginn: '09:00' },
      ],
      false,
    );
    // In den Terminbereich der Akte, nicht auf die Übersicht: Dort stehen die
    // eben angelegten Termine (AKTE-003).
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/patienten/${PATIENT_ID}/termine`, { replace: true }),
    );
  });

  it('benennt einen hinderlichen Befund und legt nichts an', async () => {
    checkAppointmentSlots.mockResolvedValue([null, 'overlap', null]);
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();
    await vorschlagen(user);

    expect(await screen.findByText('Zeitraum ist bereits belegt')).toBeInTheDocument();
    expect(screen.getByText(/1 von 3 Terminen ist so nicht planbar/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3 Termine anlegen' })).toBeDisabled();
  });

  it('lässt eine Einzelabweichung zu und verlangt danach eine neue Prüfung', async () => {
    checkAppointmentSlots.mockResolvedValue([null, 'overlap', null]);
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();
    await vorschlagen(user);
    await screen.findByText('Zeitraum ist bereits belegt');

    await user.clear(screen.getByLabelText('Datum 2'));
    await user.type(screen.getByLabelText('Datum 2'), '2027-05-20');

    expect(
      await screen.findByText('Die Liste wurde geändert und ist noch nicht geprüft.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '3 Termine anlegen' })).toBeDisabled();

    checkAppointmentSlots.mockResolvedValue([null, null, null]);
    await user.click(screen.getByRole('button', { name: 'Erneut prüfen' }));

    expect(await screen.findByText('Alle 3 Termine sind planbar.')).toBeInTheDocument();
    await waitFor(() =>
      expect(checkAppointmentSlots).toHaveBeenLastCalledWith(STAFF_ANNA, [
        { datum: '2027-05-12', beginn: '09:00' },
        { datum: '2027-05-20', beginn: '09:00' },
        { datum: '2027-05-26', beginn: '09:00' },
      ]),
    );
  });

  it('entfernt einen einzelnen Termin aus der Serie', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();
    await vorschlagen(user);
    await screen.findByText('Alle 3 Termine sind planbar.');

    const zweite = screen.getByLabelText('Datum 2').closest('li');
    await user.click(within(zweite!).getByRole('button', { name: 'Entfernen' }));

    expect(await screen.findByText('Vorgeschlagene Termine (2)')).toBeInTheDocument();
    expect(screen.getByLabelText('Datum 2')).toHaveValue('2027-05-26');
  });

  it('fragt bei Randzeiten nach, statt still anzulegen (CAL-005)', async () => {
    const { AusserhalbArbeitszeitError } = await import('./api');
    checkAppointmentSlots.mockResolvedValue([null, 'outside_working_hours', null]);
    createAppointmentSeries.mockRejectedValueOnce(new AusserhalbArbeitszeitError());

    const user = userEvent.setup();
    rendern();
    await formularAbwarten();
    await vorschlagen(user);
    await screen.findByText('Außerhalb der Arbeitszeit');

    // Eine Randzeit ist kein Hindernis - der Knopf bleibt bedienbar.
    const anlegenKnopf = screen.getByRole('button', { name: '3 Termine anlegen' });
    expect(anlegenKnopf).toBeEnabled();
    await user.click(anlegenKnopf);

    expect(
      await screen.findByRole('button', { name: 'Serie trotzdem anlegen' }),
    ).toBeInTheDocument();
    expect(createAppointmentSeries).toHaveBeenCalledTimes(1);

    createAppointmentSeries.mockResolvedValue(3);
    await user.click(screen.getByRole('button', { name: 'Serie trotzdem anlegen' }));

    await waitFor(() => expect(createAppointmentSeries).toHaveBeenCalledTimes(2));
    expect(createAppointmentSeries).toHaveBeenLastCalledWith(
      PATIENT_ID,
      VERORDNUNG,
      expect.anything(),
      expect.anything(),
      true,
    );
  });

  it('sagt „1 Termin" statt „1 Termine"', async () => {
    checkAppointmentSlots.mockResolvedValue([null]);
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();
    await vorschlagen(user, 1);

    expect(await screen.findByText('Der Termin ist planbar.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '1 Termin anlegen' })).toBeInTheDocument();
  });

  it('weist auf eine Serie über dem offenen Kontingent hin, ohne sie zu verhindern', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();
    await user.clear(screen.getByLabelText('Anzahl Termine *'));
    await user.type(screen.getByLabelText('Anzahl Termine *'), '5');

    expect(await screen.findByText(/Geplant sind 5 Termine, offen sind 3/)).toBeInTheDocument();
  });

  it('verlangt eine behandelnde Person, bevor geprüft wird', async () => {
    fetchAssignableTherapists.mockResolvedValue([]);
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.click(screen.getByRole('button', { name: 'Termine vorschlagen' }));

    expect(await screen.findByText('Bitte eine behandelnde Person wählen.')).toBeInTheDocument();
    expect(checkAppointmentSlots).not.toHaveBeenCalled();
  });

  it('zeigt die übernommene Adresse beim Hausbesuch', async () => {
    rendern();
    await formularAbwarten();
    expect(screen.getByText('Beispielstrasse 12, 72070 Tuebingen')).toBeInTheDocument();
  });

  it('meldet eine nicht lesbare Verordnung, ohne etwas anzubieten', async () => {
    fetchPrescriptionSlots.mockRejectedValue(new Error('nope'));
    rendern();
    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
  });
});
