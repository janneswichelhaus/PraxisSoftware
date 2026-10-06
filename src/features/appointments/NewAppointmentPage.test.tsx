import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient } from '@tanstack/react-query';
import type * as AppointmentsApi from './api';
import type * as PatientsApi from '@/features/patients/api';
import type * as GrundlagenApi from '@/features/treatment-bases/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const TERMIN_ID = '77777777-7777-4777-8777-000000000001';
const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const STAFF_TIM = '55555555-5555-4555-8555-000000000004';
const ORT_HAUPT = '33333333-3333-4333-8333-000000000001';
const ORT_ZWEIT = '33333333-3333-4333-8333-000000000002';

const patientMitAdresse: PatientsApi.Patient = testPatient({
  id: PATIENT_ID,
  status: 'active',
  care_started_on: '2026-01-05',
  given_name: 'Berta',
  family_name: 'Bestand',
  date_of_birth: '1970-05-06',
  email: null,
  phone: null,
  street: 'Altstrasse',
  house_number: '1',
  postal_code: '72070',
  city: 'Tuebingen',
});

const fetchPatient = vi.fn();
const fetchAssignableTherapists = vi.fn();
const fetchLocations = vi.fn();
const createAppointment = vi.fn();
const fetchPatientTreatmentBases = vi.fn();
const navigate = vi.fn();

vi.mock('@/features/patients/api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    fetchPatient: (id: string) => fetchPatient(id) as Promise<PatientsApi.Patient | null>,
  };
});

vi.mock('@/features/treatment-bases/api', async (importOriginal) => ({
  ...(await importOriginal<typeof GrundlagenApi>()),
  fetchPatientTreatmentBases: (id: string) =>
    fetchPatientTreatmentBases(id) as Promise<GrundlagenApi.TreatmentBasis[]>,
}));

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAssignableTherapists: () =>
      fetchAssignableTherapists() as Promise<AppointmentsApi.AssignableTherapist[]>,
    fetchLocations: () => fetchLocations() as Promise<AppointmentsApi.Location[]>,
    createAppointment: (
      patientId: string,
      values: unknown,
      bestaetigt?: boolean,
      verordnung?: string | null,
      vergangenheit?: boolean,
    ) =>
      createAppointment(
        patientId,
        values,
        bestaetigt,
        verordnung,
        vergangenheit,
      ) as Promise<string>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
  useParams: () => ({ patientId: PATIENT_ID }),
}));

// UBK-012: Die Prüfung selbst steht in `wegpruefung.test.tsx`; hier zählt,
// welche Frage das Formular stellt und was es dazu zeigt.
const wegfragen = vi.hoisted((): { letzte: unknown } => ({ letzte: null }));
vi.mock('./wegpruefung', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  useWegpruefung: (frage: unknown) => {
    wegfragen.letzte = frage;
    return frage === null
      ? { stand: 'aus' }
      : {
          stand: 'bereit',
          an: {
            stand: 'geprueft',
            luft: -5,
            stufe: 'nicht',
            fruehester: '2027-05-12T07:20:00Z',
            fahrtMinuten: 18,
            nachbar: 'termin',
            nachbarZeit: '2027-05-12T06:45:00Z',
          },
          weiter: { stand: 'offen' },
        };
  },
}));

const { NewAppointmentPage } = await import('./NewAppointmentPage');
const { AusserhalbArbeitszeitError, VergangenheitError } = await import('./api');

function rendern() {
  return renderWithProviders(
    <NewAppointmentPage user={testUser(['office'], 'Olivia Office')} />,
    `/patienten/${PATIENT_ID}/termine/neu`,
  );
}

async function formularAbwarten() {
  return screen.findByRole('button', { name: 'Termin anlegen' });
}

/**
 * Fuellt Datum und Beginn mit einem gueltigen zukuenftigen Termin.
 *
 * Das Datum wird zuerst geleert: seit UX-003 steht dort der heutige Tag als
 * Vorbelegung, und Tippen wuerde ihn nicht ersetzen, sondern ergaenzen. Das
 * Ende wird nicht getippt - es ergibt sich seit CAL-010a aus dem Beginn.
 */
async function zeitenSetzen(user: ReturnType<typeof userEvent.setup>) {
  await user.clear(screen.getByLabelText('Datum *'));
  await user.type(screen.getByLabelText('Datum *'), '2027-05-12');
  await user.type(screen.getByLabelText('Beginn *'), '09:00');
}

describe('NewAppointmentPage', () => {
  beforeEach(() => {
    fetchPatient.mockReset();
    fetchAssignableTherapists.mockReset();
    fetchLocations.mockReset();
    createAppointment.mockReset();
    fetchPatientTreatmentBases.mockReset();
    navigate.mockReset();

    fetchPatient.mockResolvedValue(patientMitAdresse);
    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: STAFF_ANNA, display_name: 'Anna Beispiel' },
      { staff_member_id: STAFF_TIM, display_name: 'Tim Teamleitung' },
    ]);
    fetchLocations.mockResolvedValue([{ id: ORT_HAUPT, name: 'Hauptstandort Tuebingen' }]);
    createAppointment.mockResolvedValue(TERMIN_ID);
    fetchPatientTreatmentBases.mockResolvedValue([]);
  });

  it('nennt die vorausgewaehlte Patient:in einmal, in der Beschreibung (TER-21)', async () => {
    rendern();
    await formularAbwarten();
    expect(screen.getByText(/^Für Berta Bestand\./)).toBeInTheDocument();
    // Kein zweiter Kasten mit demselben Namen direkt darunter.
    expect(screen.getAllByText(/Berta Bestand/)).toHaveLength(1);
    expect(screen.queryByText('Patient:in')).not.toBeInTheDocument();
  });

  it('bietet kein Feld zum Wechseln des Patienten an', async () => {
    rendern();
    await formularAbwarten();
    expect(screen.queryByLabelText(/Patient.*\*/)).not.toBeInTheDocument();
  });

  it('bietet ausschliesslich die vom Server gelieferten behandelnden Personen an', async () => {
    rendern();
    await formularAbwarten();

    const auswahl = screen.getByLabelText('Behandelnde Person *');
    const namen = Array.from(auswahl.querySelectorAll('option')).map((o) => o.textContent);
    expect(namen).toEqual(['Bitte wählen …', 'Anna Beispiel', 'Tim Teamleitung']);
  });

  it('bietet genau die drei Terminarten an', async () => {
    rendern();
    await formularAbwarten();

    const auswahl = screen.getByLabelText('Terminart *');
    const arten = Array.from(auswahl.querySelectorAll('option')).map((o) =>
      o.getAttribute('value'),
    );
    expect(arten).toEqual(['home_visit', 'practice', 'video']);
  });

  it('meldet fehlende Pflichtangaben am Feld und oben in einer Zusammenfassung (UIK-02)', async () => {
    const user = userEvent.setup();
    rendern();
    await user.click(await formularAbwarten());

    // Olivia Office ist keine zuordenbare behandelnde Person; die Vorbelegung
    // "ich" greift fuer sie nicht (UX-003). Der Knopf steht unten, die Felder
    // oben: Die Zusammenfassung nimmt den Fokus, damit der Grund nicht
    // ausserhalb des Bildes bleibt.
    const kasten = (await screen.findByText('Bitte prüfen Sie diese Angaben')).closest(
      '[role="alert"]',
    ) as HTMLElement;
    expect(kasten).toHaveFocus();
    expect(
      within(kasten).getByRole('link', { name: 'Behandelnde Person ist erforderlich.' }),
    ).toBeInTheDocument();
    expect(
      within(kasten).getByRole('link', { name: 'Beginn ist erforderlich.' }),
    ).toBeInTheDocument();

    // Am Feld steht die Meldung ebenso, verbunden fuer Vorlesesoftware.
    const person = screen.getByLabelText('Behandelnde Person *');
    const beschreibung = document.getElementById(person.getAttribute('aria-describedby') ?? '');
    expect(beschreibung).toHaveTextContent('Behandelnde Person ist erforderlich.');
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it('fuehrt aus der Zusammenfassung in das Feld', async () => {
    const user = userEvent.setup();
    rendern();
    await user.click(await formularAbwarten());

    await user.click(await screen.findByRole('link', { name: 'Beginn ist erforderlich.' }));
    expect(screen.getByLabelText('Beginn *')).toHaveFocus();
  });

  /**
   * TER-06: Das Ende ist eine Ableitung. Fehlt der Beginn, meldete bisher
   * zusaetzlich die richtig gewaehlte Dauer „Ende ist erforderlich." - und
   * lenkte auf das falsche Feld.
   */
  it('meldet ohne Beginn nicht zusaetzlich das Ende an der Dauer (TER-06)', async () => {
    const user = userEvent.setup();
    rendern();
    await user.click(await formularAbwarten());

    expect(await screen.findAllByText('Beginn ist erforderlich.')).not.toHaveLength(0);
    expect(screen.queryByText('Ende ist erforderlich.')).not.toBeInTheDocument();
    // Ohne Beginn gibt es kein Ende, also auch keinen Hinweis darauf.
    expect(screen.queryByText(/Dokumentation eingeschlossen/)).not.toBeInTheDocument();
  });

  it('meldet einen Termin ueber Mitternacht am Beginn (TER-06)', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
    await user.clear(screen.getByLabelText('Datum *'));
    await user.type(screen.getByLabelText('Datum *'), '2027-05-12');
    await user.type(screen.getByLabelText('Beginn *'), '23:30');
    await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));

    const beginn = screen.getByLabelText('Beginn *');
    await waitFor(() =>
      expect(
        document.getElementById(beginn.getAttribute('aria-describedby')?.split(' ').at(-1) ?? ''),
      ).toHaveTextContent('Beginn und Dauer reichen über Mitternacht.'),
    );
    expect(screen.queryByText('Ende ist erforderlich.')).not.toBeInTheDocument();
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it('leitet das Ende aus dem Beginn ab (CAL-010a)', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.type(screen.getByLabelText('Beginn *'), '10:15');

    // 8.1: 60 Minuten sind die Vorbelegung, und der Beginn darf auf jedem
    // Rasterpunkt liegen.
    expect(screen.getByLabelText('Dauer')).toHaveValue('60');
    expect(screen.getByText('Ende: 11:15 Uhr')).toBeInTheDocument();
  });

  /**
   * CAL-015b, CAL-020: 60 und 45 Minuten sind die Regellaengen und bleiben
   * der kurze Weg. Seit 8.1 in der Fassung 0.11 kommt "Andere Laenge" dazu -
   * der Server nimmt jede Laenge im Praxisraster an.
   */
  it('bietet 60 und 45 Minuten an und zieht das Ende mit (CAL-015b)', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.type(screen.getByLabelText('Beginn *'), '10:15');
    expect(
      Array.from(screen.getByLabelText('Dauer').querySelectorAll('option')).map((o) => o.value),
    ).toEqual(['60', '45', 'frei']);

    await user.selectOptions(screen.getByLabelText('Dauer'), '45');
    expect(screen.getByText('Ende: 11:00 Uhr')).toBeInTheDocument();
  });

  it('nimmt ueber "Andere Laenge" eine freie Laenge im Raster an (CAL-020)', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.type(screen.getByLabelText('Beginn *'), '10:15');
    // Ohne ausdrueckliche Wahl gibt es kein Minutenfeld: 60 bleibt der kurze Weg.
    expect(screen.queryByLabelText('Länge in Minuten')).not.toBeInTheDocument();

    await user.selectOptions(screen.getByLabelText('Dauer'), 'frei');
    const feld = screen.getByLabelText('Länge in Minuten');
    expect(feld).toHaveValue(60);

    await user.clear(feld);
    await user.type(feld, '30');
    expect(screen.getByText('Ende: 10:45 Uhr')).toBeInTheDocument();
    expect(screen.getByText(/Weicht von 45 und 60 Minuten ab/)).toBeInTheDocument();

    // Ausserhalb des Rasters (testUser: 5 Minuten): ein Hinweis am Feld. Die
    // verbindliche Pruefung bleibt beim Server.
    await user.clear(feld);
    await user.type(feld, '32');
    expect(screen.getByText(/Vielfaches von 5 Minuten/)).toBeInTheDocument();
  });

  it('speichert mit leerem Minutenfeld nicht die zuletzt gueltige Laenge weiter', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.type(screen.getByLabelText('Beginn *'), '10:15');
    await user.selectOptions(screen.getByLabelText('Dauer'), 'frei');
    await user.clear(screen.getByLabelText('Länge in Minuten'));

    expect(screen.getByText(/Bitte eine Länge in ganzen Minuten/)).toBeInTheDocument();
    expect(screen.queryByText(/Ende: 11:15 Uhr/)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it('begrenzt das Datumsfeld nicht mehr auf den laufenden Praxistag (FIX-019)', async () => {
    rendern();
    await formularAbwarten();
    expect(screen.getByLabelText('Datum *')).not.toHaveAttribute('min');
  });

  it('fragt bei einem Tag in der Vergangenheit VOR dem Server nach und traegt bestaetigt nach', async () => {
    createAppointment.mockResolvedValue(TERMIN_ID);
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
    await user.clear(screen.getByLabelText('Datum *'));
    await user.type(screen.getByLabelText('Datum *'), '2020-01-06');
    await user.type(screen.getByLabelText('Beginn *'), '09:00');
    await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));

    const fenster = await screen.findByRole('dialog', { name: 'Termin in der Vergangenheit' });
    expect(fenster).toHaveTextContent(/nachgetragen/);
    expect(createAppointment).not.toHaveBeenCalled();

    await user.click(within(fenster).getByRole('button', { name: 'Termin trotzdem anlegen' }));
    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    expect(createAppointment).toHaveBeenLastCalledWith(
      PATIENT_ID,
      expect.objectContaining({ date: '2020-01-06' }),
      false,
      null,
      true,
    );
  });

  it('fragt nach, wenn erst der Server die Vergangenheit erkennt', async () => {
    createAppointment.mockRejectedValueOnce(new VergangenheitError());
    createAppointment.mockResolvedValue(TERMIN_ID);
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
    await zeitenSetzen(user);
    await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));

    const fenster = await screen.findByRole('dialog', { name: 'Termin in der Vergangenheit' });
    await user.click(within(fenster).getByRole('button', { name: 'Termin trotzdem anlegen' }));
    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(2));
    expect(createAppointment).toHaveBeenLastCalledWith(
      PATIENT_ID,
      expect.anything(),
      false,
      null,
      true,
    );
  });

  it('legt einen Praxistermin mit Standort an und wechselt zur Detailansicht', async () => {
    const user = userEvent.setup();
    const neuLaden = vi.spyOn(QueryClient.prototype, 'invalidateQueries');
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
    await user.selectOptions(screen.getByLabelText('Terminart *'), 'practice');
    await zeitenSetzen(user);
    await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    expect(createAppointment).toHaveBeenCalledWith(
      PATIENT_ID,
      {
        staff_member_id: STAFF_ANNA,
        appointment_type: 'practice',
        date: '2027-05-12',
        start_time: '09:00',
        end_time: '10:00',
        location_id: ORT_HAUPT,
      },
      // Der erste Versuch geht ausdruecklich OHNE Arbeitszeitbestaetigung
      // hinaus (CAL-005) - und ohne Vergangenheitsbestaetigung (FIX-019).
      false,
      null,
      false,
    );
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/kalender?termin=${TERMIN_ID}`, { replace: true }),
    );
    // UBK-011: Tour, Übersicht und Fahrwege stimmen ohne Neuladen.
    for (const queryKey of [['appointments'], ['day-plan'], ['day-route'], ['travel-buffers']]) {
      expect(neuLaden).toHaveBeenCalledWith({ queryKey });
    }
    neuLaden.mockRestore();
  });

  it('sagt „Passt es?“, sobald Person, Zeit und Ort feststehen - ohne zu sperren (UBK-012)', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();
    expect(screen.queryByText('Passt es?')).toBeNull();

    await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
    await user.selectOptions(screen.getByLabelText('Terminart *'), 'practice');
    await zeitenSetzen(user);

    expect(await screen.findByText('Passt es?')).toBeInTheDocument();
    expect(
      screen.getByText('Anfahrt: zu knapp um 5 Min., frühester Beginn 09:20 Uhr'),
    ).toBeInTheDocument();
    expect(wegfragen.letzte).toMatchObject({
      person: STAFF_ANNA,
      datum: '2027-05-12',
      beginnMinute: 9 * 60,
      endeMinute: 10 * 60,
      ort: { art: 'practice', standortId: ORT_HAUPT },
    });

    // Nur Auskunft: Anlegen geht trotzdem.
    await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));
    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
  });

  it('kehrt nach dem Anlegen dorthin zurueck, wo es begann - mit dem neuen Termin (FIX-016)', async () => {
    // Aus dem Kalender getippt: der Rueckweg ist der Kalenderstand. Zurueck
    // geht es dorthin, der neue Termin wird hervorgehoben (BEF-016).
    createAppointment.mockResolvedValue(TERMIN_ID);
    const user = userEvent.setup();
    const kalender = '/kalender?ansicht=tag&datum=2027-05-12';
    renderWithProviders(
      <NewAppointmentPage user={testUser(['office'], 'Olivia Office')} />,
      `/patienten/${PATIENT_ID}/termine/neu?zurueck=${encodeURIComponent(kalender)}`,
    );
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
    await zeitenSetzen(user);
    await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));

    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`${kalender}&neu=${TERMIN_ID}`, { replace: true }),
    );
  });

  it('bricht zum Rueckweg hin ab, nicht zur Akte - oben wie unten (TER-03)', async () => {
    const kalender = '/kalender?ansicht=tag&datum=2027-05-12';
    renderWithProviders(
      <NewAppointmentPage user={testUser(['office'], 'Olivia Office')} />,
      `/patienten/${PATIENT_ID}/termine/neu?zurueck=${encodeURIComponent(kalender)}`,
    );
    await formularAbwarten();

    // Ein Seitenwechsel ist ein Link, keine Schaltflaeche (UIK-13).
    expect(screen.getByRole('link', { name: 'Abbrechen' })).toHaveAttribute('href', kalender);
    expect(screen.getByRole('link', { name: '← Zurück zum Kalender' })).toHaveAttribute(
      'href',
      kalender,
    );
  });

  it('kehrt nach einem Folgetermin zum Ausgangstermin zurueck und nennt den neuen (TER-04)', async () => {
    const ausgang = `/termine/77777777-7777-4777-8777-00000000000a?zurueck=${encodeURIComponent('/kalender?ansicht=tag')}`;
    const user = userEvent.setup();
    renderWithProviders(
      <NewAppointmentPage user={testUser(['office'], 'Olivia Office')} />,
      `/patienten/${PATIENT_ID}/termine/neu?zurueck=${encodeURIComponent(ausgang)}`,
    );
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
    await zeitenSetzen(user);
    await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));

    // Der Rückweg des Ausgangstermins bleibt erhalten; dazu kommt die
    // Kennung des neuen Termins - der Termin bestaetigt damit das Anlegen.
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`${ausgang}&neu=${TERMIN_ID}`, { replace: true }),
    );
  });

  it('waehlt einen einzelnen Standort vor', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Terminart *'), 'practice');
    expect(await screen.findByLabelText('Standort *')).toHaveValue(ORT_HAUPT);
  });

  it('waehlt bei mehreren Standorten nicht vor und verlangt eine Auswahl', async () => {
    fetchLocations.mockResolvedValue([
      { id: ORT_HAUPT, name: 'Hauptstandort Tuebingen' },
      { id: ORT_ZWEIT, name: 'Zweitstandort Reutlingen' },
    ]);
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
    await user.selectOptions(screen.getByLabelText('Terminart *'), 'practice');
    expect(await screen.findByLabelText('Standort *')).toHaveValue('');

    await zeitenSetzen(user);
    await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));

    // Am Feld und in der Zusammenfassung darüber.
    expect(
      await screen.findAllByText('Für einen Praxistermin ist ein Standort erforderlich.'),
    ).toHaveLength(2);
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it('zeigt beim Hausbesuch die uebernommene Adresse und kein Standortfeld', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Terminart *'), 'home_visit');

    expect(await screen.findByText('Adresse des Hausbesuchs')).toBeInTheDocument();
    expect(screen.getByText('Altstrasse 1, 72070 Tuebingen')).toBeInTheDocument();
    expect(screen.queryByLabelText('Standort *')).not.toBeInTheDocument();
  });

  it('bietet die uebernommene Adresse nicht zur Bearbeitung an', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Terminart *'), 'home_visit');
    await screen.findByText('Adresse des Hausbesuchs');

    for (const feld of [/straße/i, /hausnummer/i, /plz/i, /ort/i]) {
      expect(screen.queryByLabelText(feld)).not.toBeInTheDocument();
    }
  });

  it('weist auf eine unvollstaendige Adresse hin, statt sie stillschweigend zu senden', async () => {
    fetchPatient.mockResolvedValue({ ...patientMitAdresse, house_number: null });
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Terminart *'), 'home_visit');
    expect(await screen.findByText(/fehlt eine vollständige Adresse/)).toBeInTheDocument();
  });

  it('sendet beim Hausbesuch keinen Standort mit', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
    await user.selectOptions(screen.getByLabelText('Terminart *'), 'home_visit');
    await zeitenSetzen(user);
    await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));

    await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
    expect(createAppointment.mock.calls[0]?.[1]).toMatchObject({ appointment_type: 'home_visit' });
  });

  it('weist beim Videotermin darauf hin, dass noch kein Link entsteht', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Terminart *'), 'video');
    expect(
      await screen.findByText(/noch kein Videolink erzeugt/, { selector: 'p' }),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Standort *')).not.toBeInTheDocument();
  });

  it('loest bei doppeltem Klick nur einen Schreibvorgang aus', async () => {
    let aufloesen: ((id: string) => void) | undefined;
    createAppointment.mockImplementation(
      () =>
        new Promise<string>((resolve) => {
          aufloesen = resolve;
        }),
    );

    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
    await zeitenSetzen(user);

    const knopf = screen.getByRole('button', { name: 'Termin anlegen' });
    await user.click(knopf);
    await user.click(knopf);

    expect(createAppointment).toHaveBeenCalledTimes(1);
    aufloesen?.(TERMIN_ID);
  });

  it('zeigt eine Ueberschneidung verstaendlich an, ohne fremde Daten zu nennen', async () => {
    createAppointment.mockRejectedValue(
      new Error(
        'In diesem Zeitraum hat die behandelnde Person bereits einen Termin. Bitte eine andere Zeit wählen.',
      ),
    );
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
    await zeitenSetzen(user);
    await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));

    expect(
      await screen.findByText(/hat die behandelnde Person bereits einen Termin/),
    ).toBeInTheDocument();
    expect(navigate).not.toHaveBeenCalled();
  });

  describe('CAL-005: Raster und Arbeitszeit', () => {
    it('setzt die Schrittweite des Beginns auf das Praxisraster', async () => {
      rendern();
      await formularAbwarten();
      // Der Wert kommt aus der Sitzung (testUser: 5 Minuten). Verbindlich
      // prueft der Server. Ein stehender Hinweis „Praxisraster: 5 Minuten"
      // erklaerte nur das System und ist seit UX-005g fort.
      expect(screen.getByLabelText('Beginn *')).toHaveAttribute('step', '300');
      expect(screen.queryByText(/Praxisraster: \d+ Minuten/)).not.toBeInTheDocument();
    });

    it('bietet das Ende gar nicht erst als Eingabefeld an', async () => {
      // Das Raster bindet den Beginn; die Laenge kommt aus dem Terminfenster
      // (CAL-010a). Ein beschreibbares Ende waere eine Falle - der Server
      // wiese es ab.
      rendern();
      await formularAbwarten();
      expect(screen.queryByLabelText('Ende *')).not.toBeInTheDocument();
    });

    it('meldet einen Beginn ausserhalb des Rasters verstaendlich', async () => {
      createAppointment.mockRejectedValue(
        new Error(
          'Der Beginn passt nicht zum Praxisraster. Bitte eine Uhrzeit im Raster der Praxis wählen.',
        ),
      );
      const user = userEvent.setup();
      rendern();
      await formularAbwarten();

      await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
      await zeitenSetzen(user);
      await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));

      expect(await screen.findByText(/passt nicht zum Praxisraster/)).toBeInTheDocument();
    });

    it('sendet den ersten Versuch ohne Bestaetigung', async () => {
      const user = userEvent.setup();
      rendern();
      await formularAbwarten();

      await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
      await zeitenSetzen(user);
      await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));

      await waitFor(() =>
        expect(createAppointment).toHaveBeenCalledWith(
          PATIENT_ID,
          expect.objectContaining({ start_time: '09:00' }),
          false,
          null,
          false,
        ),
      );
    });

    it('fragt bei einem Termin ausserhalb der Arbeitszeit nach und legt nichts an', async () => {
      createAppointment.mockRejectedValue(new AusserhalbArbeitszeitError());
      const user = userEvent.setup();
      rendern();
      await formularAbwarten();

      await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
      await zeitenSetzen(user);
      await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));

      const rueckfrage = await screen.findByRole('dialog', { name: 'Außerhalb der Arbeitszeit' });
      expect(rueckfrage).toHaveTextContent(/noch nicht gespeichert/);
      expect(navigate).not.toHaveBeenCalled();
    });

    it('legt den Termin nach ausdruecklicher Bestaetigung mit Kennzeichen an', async () => {
      createAppointment.mockRejectedValueOnce(new AusserhalbArbeitszeitError());
      createAppointment.mockResolvedValue(TERMIN_ID);
      const user = userEvent.setup();
      rendern();
      await formularAbwarten();

      await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
      await zeitenSetzen(user);
      await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));
      await screen.findByRole('dialog', { name: 'Außerhalb der Arbeitszeit' });

      await user.click(screen.getByRole('button', { name: 'Termin trotzdem anlegen' }));

      await waitFor(() =>
        expect(createAppointment).toHaveBeenLastCalledWith(
          PATIENT_ID,
          expect.objectContaining({ start_time: '09:00' }),
          true,
          null,
          false,
        ),
      );
      await waitFor(() =>
        expect(navigate).toHaveBeenCalledWith(`/kalender?termin=${TERMIN_ID}`, expect.anything()),
      );
    });

    it('nimmt die Rueckfrage zurueck, sobald die Zeit geaendert wird', async () => {
      createAppointment.mockRejectedValue(new AusserhalbArbeitszeitError());
      const user = userEvent.setup();
      rendern();
      await formularAbwarten();

      await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
      await zeitenSetzen(user);
      await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));
      const fenster = await screen.findByRole('dialog', { name: 'Außerhalb der Arbeitszeit' });
      // FIX-016: ein Fenster ueber dem Formular, der Fokus liegt darin.
      expect(
        within(fenster).getByRole('button', { name: 'Termin trotzdem anlegen' }),
      ).toHaveFocus();

      // „Zurueck zum Formular" schliesst, ohne etwas zu schreiben; die
      // Eingaben bleiben stehen.
      await user.click(within(fenster).getByRole('button', { name: 'Zurück zum Formular' }));
      await waitFor(() =>
        expect(
          screen.queryByRole('dialog', { name: 'Außerhalb der Arbeitszeit' }),
        ).not.toBeInTheDocument(),
      );
      expect(createAppointment).toHaveBeenCalledTimes(1);
      expect(screen.getByLabelText('Beginn *')).toHaveValue('09:00');
      expect(screen.getByRole('button', { name: 'Termin anlegen' })).toHaveFocus();
    });

    it('zeigt einen Fehler nach dem Absenden als Fenster (FIX-016)', async () => {
      createAppointment.mockRejectedValue(
        new Error('In diesem Zeitraum hat die behandelnde Person bereits einen Termin.'),
      );
      const user = userEvent.setup();
      rendern();
      await formularAbwarten();

      await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
      await zeitenSetzen(user);
      await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));

      const fenster = await screen.findByRole('dialog', {
        name: 'Der Termin konnte nicht angelegt werden.',
      });
      expect(fenster).toHaveTextContent(/bereits einen Termin/);
      await user.keyboard('{Escape}');
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });
  });

  it('bricht ohne Schreibvorgang zurueck zur Akte ab', async () => {
    rendern();
    await formularAbwarten();

    expect(screen.getByRole('link', { name: 'Abbrechen' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT_ID}`,
    );
    expect(screen.getByRole('link', { name: '← Zurück zur Akte' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT_ID}`,
    );
    expect(createAppointment).not.toHaveBeenCalled();
  });

  it('meldet einen nicht freigegebenen Patienten, ohne ein Formular anzubieten', async () => {
    fetchPatient.mockResolvedValue(null);
    rendern();

    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(
      screen.getByText('Diese Akte gibt es nicht oder sie ist für Ihren Zugang nicht freigegeben.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Termin anlegen' })).not.toBeInTheDocument();
    // Der Weg zurück bleibt auch hier (ZST-08).
    expect(screen.getByRole('link', { name: '← Zurück zur Akte' })).toBeInTheDocument();
  });

  it('meldet einen Ladefehler als Ladefehler, mit erneutem Versuch und Rückweg (TER-11)', async () => {
    fetchPatient.mockRejectedValueOnce(new Error('Netz weg'));
    fetchPatient.mockResolvedValue(patientMitAdresse);
    const user = userEvent.setup();
    rendern();

    expect(
      await screen.findByText('Die Patientendaten konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Nicht gefunden')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Zurück zur Akte' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(await formularAbwarten()).toBeInTheDocument();
  });

  describe('ZST-07: Auswahllisten, die nicht laden', () => {
    it('sagt am Feld, dass die Personen fehlen, und bietet einen neuen Versuch an', async () => {
      fetchAssignableTherapists.mockRejectedValueOnce(new Error('Netz weg'));
      const user = userEvent.setup();
      rendern();
      await formularAbwarten();

      expect(
        await screen.findByText('Die Personen konnten nicht geladen werden.'),
      ).toBeInTheDocument();

      // Solange die Pflichtliste fehlt, wird nichts gesendet.
      await zeitenSetzen(user);
      await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));
      expect(createAppointment).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
      await waitFor(() =>
        expect(
          screen.queryByText('Die Personen konnten nicht geladen werden.'),
        ).not.toBeInTheDocument(),
      );
      expect(
        Array.from(screen.getByLabelText('Behandelnde Person *').querySelectorAll('option')).map(
          (o) => o.textContent,
        ),
      ).toEqual(['Bitte wählen …', 'Anna Beispiel', 'Tim Teamleitung']);
    });
  });

  describe('TER-05: Schutz ungespeicherter Eingaben', () => {
    /** Meldet der Schutz ungespeicherte Eingaben an den Browser (Neuladen, Schließen)? */
    function verlassenWirdAngehalten(): boolean {
      const ereignis = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(ereignis);
      return ereignis.defaultPrevented;
    }

    it('laesst ein unveraendertes Formular ohne Rueckfrage gehen', async () => {
      rendern();
      await formularAbwarten();
      // Vorbelegung und der einzige Standort sind keine Eingabe.
      await waitFor(() => expect(screen.getByLabelText('Terminart *')).toHaveValue('home_visit'));
      expect(verlassenWirdAngehalten()).toBe(false);
    });

    it('haelt nach einer Eingabe an und bietet nur Verwerfen und Bleiben an', async () => {
      const user = userEvent.setup();
      rendern();
      await formularAbwarten();

      await user.type(screen.getByLabelText('Beginn *'), '09:00');
      expect(verlassenWirdAngehalten()).toBe(true);

      await user.click(screen.getByRole('link', { name: 'Abbrechen' }));

      const rueckfrage = await screen.findByRole('group', { name: 'Ungespeicherter Termin' });
      expect(rueckfrage).toHaveTextContent('Die Eingaben sind noch nicht gespeichert.');
      expect(
        within(rueckfrage).getByRole('button', { name: 'Verwerfen und weitergehen' }),
      ).toBeInTheDocument();
      // Ohne Entwurfszustand gibt es kein „Speichern und weitergehen" (ANN-046).
      expect(
        within(rueckfrage).queryByRole('button', { name: 'Speichern und weitergehen' }),
      ).not.toBeInTheDocument();

      await user.click(within(rueckfrage).getByRole('button', { name: 'Hier bleiben' }));
      expect(screen.getByLabelText('Beginn *')).toHaveValue('09:00');
      expect(
        screen.queryByRole('group', { name: 'Ungespeicherter Termin' }),
      ).not.toBeInTheDocument();
    });

    it('fuehrt den Abstecher in die Stammdaten mit allen Eingaben zurueck', async () => {
      fetchPatient.mockResolvedValue({ ...patientMitAdresse, house_number: null });
      const verordnung = '88888888-8888-4888-8888-000000000002';
      const kalender = '/kalender?ansicht=tag';
      const user = userEvent.setup();
      renderWithProviders(
        <NewAppointmentPage user={testUser(['office'], 'Olivia Office')} />,
        `/patienten/${PATIENT_ID}/termine/neu?datum=2027-05-19&beginn=09:00&person=${STAFF_TIM}&verordnung=${verordnung}&zurueck=${encodeURIComponent(kalender)}`,
      );
      await formularAbwarten();
      await user.selectOptions(screen.getByLabelText('Dauer'), '45');

      const abstecher = await screen.findByRole('link', {
        name: 'Jetzt in den Stammdaten ergänzen',
      });
      const ziel = new URL(abstecher.getAttribute('href') ?? '', 'http://test.invalid');
      expect(ziel.pathname).toBe(`/patienten/${PATIENT_ID}/bearbeiten`);
      const zurueck = new URL(ziel.searchParams.get('zurueck') ?? '', 'http://test.invalid');
      expect(zurueck.pathname).toBe(`/patienten/${PATIENT_ID}/termine/neu`);
      expect(Object.fromEntries(zurueck.searchParams)).toEqual({
        datum: '2027-05-19',
        beginn: '09:00',
        art: 'home_visit',
        person: STAFF_TIM,
        dauer: '45',
        verordnung,
        zurueck: kalender,
      });
    });

    it('beginnt nach dem Abstecher mit der mitgebrachten Dauer', async () => {
      renderWithProviders(
        <NewAppointmentPage user={testUser(['office'], 'Olivia Office')} />,
        `/patienten/${PATIENT_ID}/termine/neu?datum=2027-05-19&beginn=09:00&dauer=45`,
      );
      await formularAbwarten();

      expect(screen.getByLabelText('Dauer')).toHaveValue('45');
      expect(screen.getByText('Ende: 09:45 Uhr')).toBeInTheDocument();
    });
  });

  describe('TER-21: Termin aus einer Verordnung', () => {
    const verordnung = '88888888-8888-4888-8888-000000000002';

    it('nennt die Grundlage, der der Termin zugeordnet wird', async () => {
      fetchPatientTreatmentBases.mockResolvedValue([
        {
          id: verordnung,
          prescriber_id: null,
          prescriber_name: null,
          prescriber_practice_name: null,
          treatment_basis_kind: 'follow_up',
          issued_on: '2026-06-18',
          frequency_note: null,
          note: null,
          items: [],
          updated_at: '2026-06-18T10:00:00+00',
        },
      ]);
      renderWithProviders(
        <NewAppointmentPage user={testUser(['office'], 'Olivia Office')} />,
        `/patienten/${PATIENT_ID}/termine/neu?verordnung=${verordnung}`,
      );
      await formularAbwarten();

      expect(
        await screen.findByText(
          'Der Termin wird dieser Behandlungsgrundlage zugeordnet: Folgeverordnung vom 18.06.2026.',
        ),
      ).toBeInTheDocument();
    });

    it('fragt ohne Verordnung keine Grundlagen ab', async () => {
      rendern();
      await formularAbwarten();
      expect(fetchPatientTreatmentBases).not.toHaveBeenCalled();
      expect(screen.queryByText(/Behandlungsgrundlage zugeordnet/)).not.toBeInTheDocument();
    });
  });

  it('wiederholt im Fehlerfenster nicht den Titel, sondern sagt, was zu tun ist (ZST-12)', async () => {
    createAppointment.mockRejectedValue(new Error('Der Termin konnte nicht angelegt werden.'));
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Behandelnde Person *'), STAFF_ANNA);
    await zeitenSetzen(user);
    await user.click(screen.getByRole('button', { name: 'Termin anlegen' }));

    const fenster = await screen.findByRole('dialog', {
      name: 'Der Termin konnte nicht angelegt werden.',
    });
    expect(fenster).toHaveTextContent('Die Eingaben stehen noch im Formular.');
    expect(within(fenster).getAllByText(/konnte nicht angelegt werden/)).toHaveLength(1);
  });

  describe('UX-003: Vorbelegung', () => {
    it('belegt Hausbesuch und den heutigen Tag vor', async () => {
      rendern();
      await formularAbwarten();

      expect(screen.getByLabelText('Terminart *')).toHaveValue('home_visit');
      const heute = new Intl.DateTimeFormat('en-CA', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        timeZone: 'Europe/Berlin',
      }).format(new Date());
      expect(screen.getByLabelText('Datum *')).toHaveValue(heute);
    });

    it('belegt die angemeldete Person vor, wenn sie zuordenbar ist', async () => {
      renderWithProviders(
        <NewAppointmentPage user={testUser(['therapist'], 'Anna Beispiel')} />,
        `/patienten/${PATIENT_ID}/termine/neu`,
      );
      await formularAbwarten();

      await waitFor(() =>
        expect(screen.getByLabelText('Behandelnde Person *')).toHaveValue(STAFF_ANNA),
      );
    });

    it('belegt niemanden vor, wenn die angemeldete Person nicht zuordenbar ist', async () => {
      rendern(); // Olivia Office
      await formularAbwarten();
      expect(screen.getByLabelText('Behandelnde Person *')).toHaveValue('');
    });

    it('uebernimmt Datum, Uhrzeiten, Art und Person aus der Adresszeile', async () => {
      renderWithProviders(
        <NewAppointmentPage user={testUser(['office'], 'Olivia Office')} />,
        `/patienten/${PATIENT_ID}/termine/neu?datum=2027-05-19&beginn=09:00&ende=10:00&art=practice&person=${STAFF_TIM}`,
      );
      await formularAbwarten();

      expect(screen.getByLabelText('Datum *')).toHaveValue('2027-05-19');
      expect(screen.getByLabelText('Beginn *')).toHaveValue('09:00');
      // Das Ende kommt aus dem Terminfenster, nicht aus der Adresszeile.
      expect(screen.getByText('Ende: 10:00 Uhr')).toBeInTheDocument();
      expect(screen.getByLabelText('Terminart *')).toHaveValue('practice');
      await waitFor(() =>
        expect(screen.getByLabelText('Behandelnde Person *')).toHaveValue(STAFF_TIM),
      );
    });

    it('leert eine Person aus der Adresszeile, die gar nicht zuordenbar ist', async () => {
      const fremd = '55555555-5555-4555-8555-000000000009';
      renderWithProviders(
        <NewAppointmentPage user={testUser(['office'], 'Olivia Office')} />,
        `/patienten/${PATIENT_ID}/termine/neu?person=${fremd}`,
      );
      await formularAbwarten();

      await waitFor(() => expect(screen.getByLabelText('Behandelnde Person *')).toHaveValue(''));
    });

    it('legt den vorbelegten Termin unveraendert an', async () => {
      const user = userEvent.setup();
      renderWithProviders(
        <NewAppointmentPage user={testUser(['therapist'], 'Anna Beispiel')} />,
        `/patienten/${PATIENT_ID}/termine/neu?datum=2027-05-19&beginn=09:00&ende=10:00&art=home_visit&person=${STAFF_ANNA}`,
      );
      await user.click(await formularAbwarten());

      await waitFor(() => expect(createAppointment).toHaveBeenCalledTimes(1));
      expect(createAppointment).toHaveBeenCalledWith(
        PATIENT_ID,
        expect.objectContaining({
          staff_member_id: STAFF_ANNA,
          appointment_type: 'home_visit',
          date: '2027-05-19',
          start_time: '09:00',
          end_time: '10:00',
        }),
        false,
        null,
        false,
      );
    });
  });
});
