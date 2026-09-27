import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import type * as TreatmentBasesApi from './api';
import type * as PatientsApi from '@/features/patients/api';
import type * as SessionContextModule from '@/features/auth/sessionContext';
import { testPatient } from '@/test-utils';

/**
 * Regressionstest für den in der Abnahme dokumentierten Befund (VER-003,
 * Schritt 8): Eingaben gingen beim Abstecher zu "Verordner:in anlegen"
 * verloren - und der erste Fix dafür hatte selbst einen Fehler: der Entwurf
 * lag im TanStack-Query-Cache und konnte dort nach der Standard-`gcTime` von
 * fünf Minuten verschwinden, bevor die Person zurückkehrte.
 *
 * Anders als TreatmentBasisFormPage.test.tsx und PrescriberFormPage.test.tsx
 * mockt diese Datei weder `useNavigate` noch `useParams`: der Seitenwechsel
 * zwischen Verordnungsformular und Verordner-Anlage läuft über echte Routen,
 * damit ein Klick auf "Neue Verordner:in anlegen" und das Absenden bzw.
 * Abbrechen der Verordner-Anlage tatsächlich denselben Pfad nehmen wie in der
 * laufenden Anwendung. Der Zeitfortschritt über fünf Minuten wird über
 * `Date.now()` gesteuert (das Einzige, was der Entwurfsspeicher dafür
 * verwendet) statt über Fake-Timer für `setTimeout` - letztere würden mit den
 * echten Wartezyklen von `userEvent`/`waitFor` kollidieren.
 *
 * **Seit UXR-007 ein Data Router** (`createMemoryRouter`) wie in der
 * Anwendung: Beide Formulare schützen ungespeicherte Eingaben (VER-03), und
 * der Schutz braucht ihn. Damit prüft diese Datei auch, dass er dem Abstecher
 * nicht im Weg steht - der eigene Weg hin und zurück ist kein Verlust. Unter
 * Node 24 baut jsdom für die Navigation des Data Routers keinen `Request`
 * (BEF-011); die CI läuft mit Node 22.
 */

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const PRESCRIPTION_ID = '88888888-8888-4888-8888-000000000002';
const PROBST = '77777777-7777-4777-8777-000000000001';
const NEUER_VERORDNER = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const BENUTZER_A = '11111111-1111-4111-8111-000000000002';
const BENUTZER_B = '11111111-1111-4111-8111-000000000003';

const fetchPrescribers = vi.fn();
const fetchTreatmentBasis = vi.fn();
const createTreatmentBasis = vi.fn();
const updateTreatmentBasis = vi.fn();
const createPrescriber = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof TreatmentBasesApi>();
  return {
    ...actual,
    fetchPrescribers: () => fetchPrescribers() as Promise<TreatmentBasesApi.Prescriber[]>,
    fetchTreatmentBasis: (id: string) =>
      fetchTreatmentBasis(id) as Promise<TreatmentBasesApi.TreatmentBasisDetail | null>,
    createTreatmentBasis: (patientId: string, values: unknown, items: unknown) =>
      createTreatmentBasis(patientId, values, items) as Promise<string>,
    updateTreatmentBasis: (id: string, values: unknown, items: unknown) =>
      updateTreatmentBasis(id, values, items) as Promise<void>,
    createPrescriber: (values: unknown) => createPrescriber(values) as Promise<string>,
  };
});

// Der Name im Kopf des Formulars (UX-012) - ohne ihn sperrt das Formular das
// Speichern (VER-B02), und ohne Mock ginge die Abfrage an einen Server.
vi.mock('@/features/patients/api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    fetchPatient: () => Promise.resolve(testPatient({ id: PATIENT_ID })),
  };
});

// Steuerbare Anmeldeperson - fuer die meisten Tests konstant BENUTZER_A;
// der Kontowechsel-Test setzt sie zwischen zwei Einhaengungen auf BENUTZER_B.
let angemeldetAls = BENUTZER_A;
vi.mock('@/features/auth/sessionContext', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContextModule>();
  return {
    ...actual,
    useSession: () => ({
      session: { user: { id: angemeldetAls } },
      initialising: false,
      signOut: vi.fn(),
    }),
  };
});

const { EditTreatmentBasisPage, NewTreatmentBasisPage } = await import('./TreatmentBasisFormPage');
const { NewPrescriberPage } = await import('./PrescriberFormPage');

const verordner: TreatmentBasesApi.Prescriber = {
  id: PROBST,
  title: 'Dr. med.',
  given_name: 'Petra',
  family_name: 'Probst',
  practice_name: 'Praxis Fiktiv',
  speciality: null,
  street: null,
  house_number: null,
  postal_code: null,
  city: null,
  phone: null,
  fax: null,
  email: null,
};

const bestand: TreatmentBasesApi.TreatmentBasisDetail = {
  id: PRESCRIPTION_ID,
  patient_id: PATIENT_ID,
  prescriber_id: PROBST,
  prescriber_name: 'Dr. med. Petra Probst',
  prescriber_practice_name: 'Praxis Fiktiv',
  treatment_basis_kind: 'follow_up',
  issued_on: '2026-06-18',
  appointment_count: 10,
  frequency_note: '2x pro Woche',
  note: null,
  items: [
    {
      id: 'i1',
      sort_order: 1,
      remedy: 'Krankengymnastik',
      prescribed_quantity: 10,
      used_quantity: 7,
      remaining_quantity: 3,
    },
  ],
  updated_at: '2026-06-18T10:00:00.000Z',
  diagnosis: 'Synthetisch: Schulter rechts.',
  therapy_goal: null,
  prescriber_note: null,
  follow_up_recommendation: null,
};

/** Echte Routen statt Mocks: bildet genau den Ausschnitt von AuthenticatedRoutes.tsx nach, den dieser Ablauf durchläuft. */
function testApp(queryClient: QueryClient, initialPath: string): ReactElement {
  const router = createMemoryRouter(
    [
      { path: '/patienten/:patientId/verordnungen/neu', element: <NewTreatmentBasisPage /> },
      {
        path: '/patienten/:patientId/verordnungen/:grundlageId/bearbeiten',
        element: <EditTreatmentBasisPage />,
      },
      { path: '/verordner/neu', element: <NewPrescriberPage /> },
      { path: '/patienten/:patientId', element: <p>Zurück in der Akte.</p> },
      { path: '/termine/dauertermin', element: <p>Zurück beim Dauertermin.</p> },
    ],
    { initialEntries: [initialPath] },
  );
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}

let jetzt = new Date('2026-03-01T09:00:00.000Z').getTime();

beforeEach(() => {
  angemeldetAls = BENUTZER_A;
  jetzt = new Date('2026-03-01T09:00:00.000Z').getTime();
  vi.spyOn(Date, 'now').mockImplementation(() => jetzt);

  fetchPrescribers.mockReset();
  fetchPrescribers.mockResolvedValue([verordner]);
  fetchTreatmentBasis.mockReset();
  fetchTreatmentBasis.mockResolvedValue(bestand);
  createTreatmentBasis.mockReset();
  updateTreatmentBasis.mockReset();
  createPrescriber.mockReset();
  createPrescriber.mockResolvedValue(NEUER_VERORDNER);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Entwurf ueber den Abstecher zur Verordner-Anlage (echte Routen)', () => {
  it('erhaelt Eingaben und Positionen ueber mehr als fuenf Minuten und waehlt die neue Verordner:in danach aus', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();

    render(testApp(queryClient, `/patienten/${PATIENT_ID}/verordnungen/neu`));
    await screen.findByRole('option', { name: /Probst/ });

    await user.type(screen.getByLabelText('Ausstellungsdatum *'), '2026-03-01');
    await user.type(screen.getByLabelText('Frequenz'), '2x pro Woche');
    await user.click(screen.getByRole('checkbox', { name: 'Manuelle Therapie (MT)' }));
    await user.type(screen.getByLabelText('Anzahl möglicher Termine *'), '6');
    await user.type(
      screen.getByLabelText('Diagnose oder Leitsymptomatik'),
      'Synthetisch: Testdiagnose.',
    );

    // Echter Linkklick: navigiert tatsaechlich auf /verordner/neu und
    // haengt das Verordnungsformular dabei aus. Der Schutz vor
    // Eingabeverlust fragt hier nicht - der Entwurf sichert alles (VER-03).
    await user.click(screen.getByRole('link', { name: 'Neue Verordner:in anlegen' }));
    await screen.findByRole('heading', { name: 'Neue:r Verordner:in' });
    expect(createTreatmentBasis).not.toHaveBeenCalled();

    // Der eigentliche Streitpunkt: die Standard-gcTime waere hier laengst
    // abgelaufen. Die Verordner-Anlage braucht in der Praxis durchaus
    // mehrere Minuten (Adresse und Kontaktdaten nachschlagen).
    jetzt += 6 * 60 * 1000;

    fetchPrescribers.mockResolvedValue([
      verordner,
      { ...verordner, id: NEUER_VERORDNER, family_name: 'Neuarzt', practice_name: null },
    ]);

    // Der Rückweg sagt, wohin es geht (VER-11).
    expect(screen.getByRole('link', { name: /Zurück zur Grundlage/ })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nachname *'), 'Neuarzt');
    await user.click(screen.getByRole('button', { name: 'Verordner:in anlegen' }));

    // Echte Navigation zurueck - dasselbe Verordnungsformular haengt sich
    // dabei neu ein. Gespeichert ist gespeichert: kein Halt am Schutz.
    await screen.findByRole('heading', { name: 'Grundlage erfassen' });
    await screen.findByRole('option', { name: /Neuarzt/ });

    expect(screen.getByLabelText('Ausstellungsdatum *')).toHaveValue('2026-03-01');
    expect(screen.getByLabelText('Frequenz')).toHaveValue('2x pro Woche');
    expect(screen.getByRole('checkbox', { name: 'Manuelle Therapie (MT)' })).toBeChecked();
    expect(screen.getByLabelText('Anzahl möglicher Termine *')).toHaveValue('6');
    expect(screen.getByLabelText('Diagnose oder Leitsymptomatik')).toHaveValue(
      'Synthetisch: Testdiagnose.',
    );
    expect(screen.getByLabelText('Verordner:in *')).toHaveValue(NEUER_VERORDNER);

    // Die Verordnung selbst wurde durch all das nicht geschrieben - erst das
    // ausdrueckliche Absenden schreibt.
    expect(createTreatmentBasis).not.toHaveBeenCalled();
  });

  it('erhaelt Eingaben auch beim Abbrechen der Verordner-Anlage', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();

    render(testApp(queryClient, `/patienten/${PATIENT_ID}/verordnungen/neu`));
    await screen.findByRole('option', { name: /Probst/ });

    await user.type(screen.getByLabelText('Ausstellungsdatum *'), '2026-03-01');
    await user.click(screen.getByRole('checkbox', { name: 'Manuelle Therapie (MT)' }));
    await user.type(screen.getByLabelText('Anzahl möglicher Termine *'), '6');

    await user.click(screen.getByRole('link', { name: 'Neue Verordner:in anlegen' }));
    await screen.findByRole('heading', { name: 'Neue:r Verordner:in' });

    jetzt += 6 * 60 * 1000;

    // „Abbrechen" ist ein Link (UIK-13); ohne Eingabe fragt der Schutz nicht.
    await user.click(screen.getByRole('link', { name: 'Abbrechen' }));
    await screen.findByRole('heading', { name: 'Grundlage erfassen' });
    await screen.findByRole('option', { name: /Probst/ });

    expect(screen.getByLabelText('Ausstellungsdatum *')).toHaveValue('2026-03-01');
    expect(screen.getByRole('checkbox', { name: 'Manuelle Therapie (MT)' })).toBeChecked();
    expect(screen.getByLabelText('Anzahl möglicher Termine *')).toHaveValue('6');
    // Keine Verordner:in wurde angelegt - die Auswahl bleibt leer.
    expect(screen.getByLabelText('Verordner:in *')).toHaveValue('');
    expect(createPrescriber).not.toHaveBeenCalled();
    expect(createTreatmentBasis).not.toHaveBeenCalled();
  });

  it('erhaelt Eingaben beim Bearbeiten einer bestehenden Verordnung und waehlt die neue Verordner:in aus', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();

    render(
      testApp(queryClient, `/patienten/${PATIENT_ID}/verordnungen/${PRESCRIPTION_ID}/bearbeiten`),
    );
    await screen.findByRole('option', { name: /Probst/ });

    await user.clear(screen.getByLabelText('Anzahl möglicher Termine *'));
    await user.type(screen.getByLabelText('Anzahl möglicher Termine *'), '8');

    await user.click(screen.getByRole('link', { name: 'Neue Verordner:in anlegen' }));
    await screen.findByRole('heading', { name: 'Neue:r Verordner:in' });

    jetzt += 6 * 60 * 1000;

    fetchPrescribers.mockResolvedValue([
      verordner,
      { ...verordner, id: NEUER_VERORDNER, family_name: 'Neuarzt', practice_name: null },
    ]);

    await user.type(screen.getByLabelText('Nachname *'), 'Neuarzt');
    await user.click(screen.getByRole('button', { name: 'Verordner:in anlegen' }));

    await screen.findByRole('heading', { name: 'Grundlage bearbeiten' });
    await screen.findByRole('option', { name: /Neuarzt/ });

    expect(screen.getByLabelText('Anzahl möglicher Termine *')).toHaveValue('8');
    expect(screen.getByLabelText('Verordner:in *')).toHaveValue(NEUER_VERORDNER);
    expect(updateTreatmentBasis).not.toHaveBeenCalled();
  });

  // VER-05: Wer das Formular aus der Terminplanung öffnet, kommt nach dem
  // Speichern dorthin zurück - auch über den Abstecher zur Verordner-Anlage.
  it('nimmt den Rueckweg des Formulars durch den Abstecher mit und kehrt nach dem Speichern dorthin zurueck', async () => {
    const dauertermin = `/termine/dauertermin?patient=${PATIENT_ID}&datum=2026-03-02&beginn=08:00`;
    createTreatmentBasis.mockResolvedValue('neue-id');
    const user = userEvent.setup();

    render(
      testApp(
        new QueryClient(),
        `/patienten/${PATIENT_ID}/verordnungen/neu?zurueck=${encodeURIComponent(dauertermin)}`,
      ),
    );
    await screen.findByRole('option', { name: /Probst/ });

    await user.type(screen.getByLabelText('Ausstellungsdatum *'), '2026-03-01');
    await user.click(screen.getByRole('checkbox', { name: 'Krankengymnastik (KG)' }));
    await user.type(screen.getByLabelText('Anzahl möglicher Termine *'), '6');
    await user.click(screen.getByRole('link', { name: 'Neue Verordner:in anlegen' }));
    await screen.findByRole('heading', { name: 'Neue:r Verordner:in' });

    fetchPrescribers.mockResolvedValue([
      verordner,
      { ...verordner, id: NEUER_VERORDNER, family_name: 'Neuarzt', practice_name: null },
    ]);
    await user.type(screen.getByLabelText('Nachname *'), 'Neuarzt');
    await user.click(screen.getByRole('button', { name: 'Verordner:in anlegen' }));

    await screen.findByRole('option', { name: /Neuarzt/ });
    expect(screen.getByRole('link', { name: 'Abbrechen' })).toHaveAttribute('href', dauertermin);

    await user.click(screen.getByRole('button', { name: 'Grundlage speichern' }));
    expect(await screen.findByText('Zurück beim Dauertermin.')).toBeInTheDocument();
    expect(createTreatmentBasis).toHaveBeenCalledTimes(1);
  });

  // VER-03: Der zurückgeholte Entwurf liegt nur im Arbeitsspeicher - wer das
  // Formular danach anders verlässt, wird gefragt.
  it('schuetzt die zurueckgeholten Eingaben weiter vor dem Verlassen', async () => {
    const user = userEvent.setup();

    render(testApp(new QueryClient(), `/patienten/${PATIENT_ID}/verordnungen/neu`));
    await screen.findByRole('option', { name: /Probst/ });
    await user.type(screen.getByLabelText('Anzahl möglicher Termine *'), '6');

    await user.click(screen.getByRole('link', { name: 'Neue Verordner:in anlegen' }));
    await screen.findByRole('heading', { name: 'Neue:r Verordner:in' });
    await user.click(screen.getByRole('link', { name: 'Abbrechen' }));
    await screen.findByRole('heading', { name: 'Grundlage erfassen' });
    expect(screen.getByLabelText('Anzahl möglicher Termine *')).toHaveValue('6');

    await user.click(screen.getByRole('link', { name: /Zurück zu den Behandlungsgrundlagen/ }));
    expect(
      await screen.findByRole('group', { name: 'Ungespeicherte Behandlungsgrundlage' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Anzahl möglicher Termine *')).toHaveValue('6');
  });

  it('uebernimmt nie den Entwurf einer anderen Person - Kontowechsel im selben Tab', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();
    const rueckpfad = `/patienten/${PATIENT_ID}/verordnungen/neu`;

    const erste = render(testApp(queryClient, rueckpfad));
    await screen.findByRole('option', { name: /Probst/ });

    await user.click(screen.getByRole('checkbox', { name: 'Manuelle Therapie (MT)' }));
    await user.click(screen.getByRole('link', { name: 'Neue Verordner:in anlegen' }));
    await screen.findByRole('heading', { name: 'Neue:r Verordner:in' });

    // Simuliert Abmeldung und Anmeldung als andere Person im selben Tab,
    // ohne Neuladen der Seite - der Entwurf bleibt technisch im Speicher,
    // gehoert aber weiterhin BENUTZER_A.
    erste.unmount();
    angemeldetAls = BENUTZER_B;

    render(testApp(new QueryClient(), rueckpfad));
    await screen.findByRole('option', { name: /Probst/ });

    expect(screen.getByRole('checkbox', { name: 'Manuelle Therapie (MT)' })).not.toBeChecked();
  });

  it('taucht bei einem unabhaengigen neuen Versuch nicht wieder auf (UX-009, Restpunkt aus ANN-019)', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();

    const { unmount } = render(testApp(queryClient, `/patienten/${PATIENT_ID}/verordnungen/neu`));
    await screen.findByRole('option', { name: /Probst/ });

    await user.type(screen.getByLabelText('Ausstellungsdatum *'), '2026-03-01');
    await user.click(screen.getByRole('checkbox', { name: 'Manuelle Therapie (MT)' }));
    await user.type(screen.getByLabelText('Anzahl möglicher Termine *'), '6');

    await user.click(screen.getByRole('link', { name: 'Neue Verordner:in anlegen' }));
    await screen.findByRole('heading', { name: 'Neue:r Verordner:in' });

    // Die Verordner-Anlage wird ueber die Hauptnavigation verlassen: weder
    // "Abbrechen" noch Speichern - genau der Fall aus dem Restpunkt. Der
    // Entwurf liegt danach noch im Speicher.
    unmount();

    // Ein unabhaengiger neuer Versuch auf demselben Pfad, innerhalb der
    // 30-Minuten-Frist: Frueher wurde hier der aufgegebene Entwurf
    // eingesetzt, weil der Pfad der Schluessel war.
    jetzt += 2 * 60 * 1000;
    render(testApp(new QueryClient(), `/patienten/${PATIENT_ID}/verordnungen/neu`));
    await screen.findByRole('option', { name: /Probst/ });

    expect(screen.getByRole('checkbox', { name: 'Manuelle Therapie (MT)' })).not.toBeChecked();
    expect(screen.getByLabelText('Ausstellungsdatum *')).toHaveValue('');
  });

  it('haelt zwei Abstecher auseinander - der zweite bringt nicht den ersten Entwurf zurueck', async () => {
    const user = userEvent.setup();

    const erster = render(testApp(new QueryClient(), `/patienten/${PATIENT_ID}/verordnungen/neu`));
    await screen.findByRole('option', { name: /Probst/ });
    await user.type(screen.getByLabelText('Frequenz'), 'Erster Versuch');
    await user.click(screen.getByRole('link', { name: 'Neue Verordner:in anlegen' }));
    await screen.findByRole('heading', { name: 'Neue:r Verordner:in' });
    erster.unmount();

    // Zweiter Anlauf, diesmal bis zum Ende: der zurueckkehrende Entwurf ist
    // der des ZWEITEN Abstechers.
    render(testApp(new QueryClient(), `/patienten/${PATIENT_ID}/verordnungen/neu`));
    await screen.findByRole('option', { name: /Probst/ });
    await user.type(screen.getByLabelText('Frequenz'), 'Zweiter Versuch');
    await user.click(screen.getByRole('link', { name: 'Neue Verordner:in anlegen' }));
    await screen.findByRole('heading', { name: 'Neue:r Verordner:in' });
    await user.click(screen.getByRole('link', { name: 'Abbrechen' }));

    await screen.findByRole('heading', { name: 'Grundlage erfassen' });
    expect(screen.getByLabelText('Frequenz')).toHaveValue('Zweiter Versuch');
  });
});
