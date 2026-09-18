import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TreatmentBasesApi from './api';
import type * as RouterModul from 'react-router-dom';
import type * as SessionContextModule from '@/features/auth/sessionContext';
import type * as PatientsApi from '@/features/patients/api';
import { renderWithProviders, testPatient } from '@/test-utils';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const PRESCRIPTION_ID = '88888888-8888-4888-8888-000000000002';
const PROBST = '77777777-7777-4777-8777-000000000001';
const BENUTZER_ID = '11111111-1111-4111-8111-000000000002';

const fetchPrescribers = vi.fn();
const fetchTreatmentBasis = vi.fn();
const createTreatmentBasis = vi.fn();
const updateTreatmentBasis = vi.fn();
const deleteTreatmentBasis = vi.fn();
const navigate = vi.fn();
const fetchPatient = vi.fn();

// Der Patientenkontext im Kopf des Formulars (UX-012): dieselbe Abfrage wie in
// der Akte, damit sie aus dem Zwischenspeicher kommt.
vi.mock('@/features/patients/api', async (importOriginal) => {
  const actual = await importOriginal<typeof PatientsApi>();
  return {
    ...actual,
    fetchPatient: (id: string) => fetchPatient(id) as Promise<PatientsApi.Patient | null>,
  };
});

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
    deleteTreatmentBasis: (id: string) => deleteTreatmentBasis(id) as Promise<void>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
  useParams: () => ({ patientId: PATIENT_ID, grundlageId: PRESCRIPTION_ID }),
}));

// Der Entwurfsspeicher bindet an die Benutzer-ID aus der Sitzung (ANN-019) -
// ohne diesen Mock würde useSession() außerhalb eines SessionProvider werfen.
// Der echte Zusammenspiel-Test mit tatsächlicher Anmeldeperson lebt in
// TreatmentBasisFormPage.entwurf.test.tsx.
vi.mock('@/features/auth/sessionContext', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContextModule>();
  return {
    ...actual,
    useSession: () => ({
      session: { user: { id: BENUTZER_ID } },
      initialising: false,
      signOut: vi.fn(),
    }),
  };
});

const { EditTreatmentBasisPage, NewTreatmentBasisPage } = await import('./TreatmentBasisFormPage');

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

async function formularAusfuellen(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByLabelText('Verordner:in *'), PROBST);
  await user.type(screen.getByLabelText('Ausstellungsdatum *'), '2026-03-01');
  await user.type(screen.getByLabelText('Heilmittel *'), 'Krankengymnastik');
  await user.type(screen.getByLabelText('Verordnet *'), '10');
}

describe('NewTreatmentBasisPage', () => {
  // UX-012: Eine Verordnung traegt Diagnose und Therapieziel - sie in der
  // falschen Akte zu erfassen ist der teuerste Irrtum dieses Formulars.
  it('nennt die Patient:in, fuer die geschrieben wird', async () => {
    renderWithProviders(<NewTreatmentBasisPage />);

    expect(await screen.findByText(/Für Max Mustermann/)).toBeInTheDocument();
  });
  beforeEach(() => {
    fetchPrescribers.mockReset();
    fetchPrescribers.mockResolvedValue([verordner]);
    createTreatmentBasis.mockReset();
    createTreatmentBasis.mockResolvedValue('neue-id');
    navigate.mockReset();
    fetchPatient.mockReset();
    fetchPatient.mockResolvedValue(
      testPatient({ id: PATIENT_ID, given_name: 'Max', family_name: 'Mustermann' }),
    );
  });

  it('haelt fehlende Pflichtangaben im Formular auf', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewTreatmentBasisPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await user.click(screen.getByRole('button', { name: 'Grundlage speichern' }));

    expect(await screen.findByText('Verordner:in ist erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Das Datum ist erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Heilmittel ist erforderlich.')).toBeInTheDocument();
    expect(createTreatmentBasis).not.toHaveBeenCalled();
  });

  it('fuehrt aus der Fehlerzusammenfassung ins Kopffeld', async () => {
    // Das Verordnungsformular ist lang: Kopf, Positionen, klinische Angaben.
    // Ein Fehler im Kopf steht beim Absenden weit ausserhalb des Bildes
    // (UX-012). Die Positionen tragen ihre Meldung direkt an der Zeile.
    const user = userEvent.setup();
    renderWithProviders(<NewTreatmentBasisPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await user.click(screen.getByRole('button', { name: 'Grundlage speichern' }));

    const kasten = await screen.findByRole('alert');
    expect(kasten).toHaveTextContent('Verordner:in: Verordner:in ist erforderlich.');
    expect(kasten).toHaveTextContent('Datum: Das Datum ist erforderlich.');

    await user.click(screen.getByRole('link', { name: 'Datum: Das Datum ist erforderlich.' }));
    expect(screen.getByLabelText('Ausstellungsdatum *')).toHaveFocus();
  });

  it('speichert Kopf und Positionen und kehrt zur Akte zurueck', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewTreatmentBasisPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await formularAusfuellen(user);
    await user.click(screen.getByRole('button', { name: 'Grundlage speichern' }));

    await waitFor(() => expect(createTreatmentBasis).toHaveBeenCalledTimes(1));
    expect(createTreatmentBasis.mock.calls[0]?.[0]).toBe(PATIENT_ID);
    expect(createTreatmentBasis.mock.calls[0]?.[1]).toMatchObject({
      prescriber_id: PROBST,
      treatment_basis_kind: 'first',
      issued_on: '2026-03-01',
    });
    expect(createTreatmentBasis.mock.calls[0]?.[2]).toEqual([
      { id: null, remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 0 },
    ]);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/patienten/${PATIENT_ID}/verordnungen`, {
        replace: true,
      }),
    );
  });

  // ---------------------------------------------------------------------------
  // GRD-001 / ADR-020 Punkt 3 und 4: Die Bauart entscheidet, was das Formular
  // ueberhaupt fragt. Ein Selbstzahler hat keine Verordner:in und keine
  // klinischen Felder - beides wird nicht angeboten und nicht mitgeschickt.
  // ---------------------------------------------------------------------------
  describe('Die zweite Bauart: Selbstzahler', () => {
    async function alsSelbstzahler(user: ReturnType<typeof userEvent.setup>) {
      await user.selectOptions(screen.getByLabelText('Art *'), 'self_pay');
    }

    it('laesst Verordner:in und die klinischen Felder verschwinden', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NewTreatmentBasisPage />);
      await screen.findByRole('option', { name: /Probst/ });

      expect(screen.getByLabelText('Verordner:in *')).toBeInTheDocument();
      await alsSelbstzahler(user);

      expect(screen.queryByLabelText('Verordner:in *')).not.toBeInTheDocument();
      expect(screen.queryByLabelText('Diagnose oder Leitsymptomatik')).not.toBeInTheDocument();
      expect(screen.queryByRole('heading', { name: 'Klinische Angaben' })).not.toBeInTheDocument();
      // Die Bemerkung ist organisatorisch und bleibt fuer beide Bauarten.
      expect(screen.getByLabelText('Bemerkung')).toBeInTheDocument();
    });

    it('nennt das Datum "Vereinbart am" statt "Ausstellungsdatum"', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NewTreatmentBasisPage />);
      await screen.findByRole('option', { name: /Probst/ });

      await alsSelbstzahler(user);

      expect(screen.getByLabelText('Vereinbart am *')).toBeInTheDocument();
      expect(screen.queryByLabelText('Ausstellungsdatum *')).not.toBeInTheDocument();
      expect(screen.getByLabelText('Vereinbart *')).toBeInTheDocument();
    });

    it('speichert ohne Verordner:in und ohne klinische Felder', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NewTreatmentBasisPage />);
      await screen.findByRole('option', { name: /Probst/ });

      // Erst eine Verordnung ausfuellen, dann die Bauart wechseln: Was nicht
      // mehr zur Bauart passt, darf nicht heimlich mitfahren.
      await formularAusfuellen(user);
      await user.type(
        screen.getByLabelText('Diagnose oder Leitsymptomatik'),
        'Synthetisch: Schulter.',
      );
      await alsSelbstzahler(user);
      await user.click(screen.getByRole('button', { name: 'Grundlage speichern' }));

      await waitFor(() => expect(createTreatmentBasis).toHaveBeenCalledTimes(1));
      expect(createTreatmentBasis.mock.calls[0]?.[1]).toMatchObject({
        prescriber_id: null,
        treatment_basis_kind: 'self_pay',
        diagnosis: null,
        issued_on: '2026-03-01',
      });
    });

    it('verlangt die Verordner:in weiterhin fuer eine Verordnung', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NewTreatmentBasisPage />);
      await screen.findByRole('option', { name: /Probst/ });

      await user.type(screen.getByLabelText('Ausstellungsdatum *'), '2026-03-01');
      await user.type(screen.getByLabelText('Heilmittel *'), 'Krankengymnastik');
      await user.type(screen.getByLabelText('Verordnet *'), '10');
      await user.click(screen.getByRole('button', { name: 'Grundlage speichern' }));

      expect(await screen.findByText('Verordner:in ist erforderlich.')).toBeInTheDocument();
      expect(createTreatmentBasis).not.toHaveBeenCalled();
    });

    it('leert die Verordner:in sichtbar beim Wechsel und laesst sie leer zurueck', async () => {
      const user = userEvent.setup();
      renderWithProviders(<NewTreatmentBasisPage />);
      await screen.findByRole('option', { name: /Probst/ });

      await user.selectOptions(screen.getByLabelText('Verordner:in *'), PROBST);
      await alsSelbstzahler(user);
      await user.selectOptions(screen.getByLabelText('Art *'), 'first');

      expect(screen.getByLabelText('Verordner:in *')).toHaveValue('');
    });
  });

  it('nimmt weitere Positionen auf und entfernt sie wieder', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewTreatmentBasisPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await user.click(screen.getByRole('button', { name: 'Position hinzufügen' }));
    expect(screen.getAllByLabelText('Heilmittel *')).toHaveLength(2);

    await user.click(screen.getByRole('button', { name: 'Position 2 entfernen' }));
    expect(screen.getAllByLabelText('Heilmittel *')).toHaveLength(1);
    // Bei nur einer Position gibt es nichts zu entfernen.
    expect(screen.queryByRole('button', { name: /entfernen/ })).not.toBeInTheDocument();
  });

  it('haelt eine genutzte Menge ueber der verordneten auf', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewTreatmentBasisPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await formularAusfuellen(user);
    await user.clear(screen.getByLabelText('Genutzt'));
    await user.type(screen.getByLabelText('Genutzt'), '11');
    await user.click(screen.getByRole('button', { name: 'Grundlage speichern' }));

    expect(
      await screen.findByText('Genutzt kann nicht größer sein als verordnet.'),
    ).toBeInTheDocument();
    expect(createTreatmentBasis).not.toHaveBeenCalled();
  });

  it('lehnt ein Ausstellungsdatum in der Zukunft ab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewTreatmentBasisPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await user.selectOptions(screen.getByLabelText('Verordner:in *'), PROBST);
    await user.type(screen.getByLabelText('Ausstellungsdatum *'), '2099-01-01');
    await user.type(screen.getByLabelText('Heilmittel *'), 'Krankengymnastik');
    await user.type(screen.getByLabelText('Verordnet *'), '10');
    await user.click(screen.getByRole('button', { name: 'Grundlage speichern' }));

    expect(
      await screen.findByText('Das Datum darf nicht in der Zukunft liegen.'),
    ).toBeInTheDocument();
    expect(createTreatmentBasis).not.toHaveBeenCalled();
  });

  it('speichert bei doppeltem Absenden nur einmal', async () => {
    let aufloesen: (id: string) => void = () => {};
    createTreatmentBasis.mockReturnValue(
      new Promise<string>((resolve) => {
        aufloesen = resolve;
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<NewTreatmentBasisPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await formularAusfuellen(user);
    const knopf = screen.getByRole('button', { name: 'Grundlage speichern' });
    await user.click(knopf);
    await user.click(knopf);

    expect(createTreatmentBasis).toHaveBeenCalledTimes(1);
    aufloesen('neue-id');
  });

  it('bietet keinen Loeschweg fuer eine Verordnung, die es noch nicht gibt', async () => {
    renderWithProviders(<NewTreatmentBasisPage />);
    await screen.findByRole('option', { name: /Probst/ });

    expect(screen.queryByRole('button', { name: 'Grundlage löschen' })).not.toBeInTheDocument();
  });

  it('fuehrt zum Anlegen einer Verordner:in und wieder zurueck', async () => {
    renderWithProviders(<NewTreatmentBasisPage />);
    await screen.findByRole('option', { name: /Probst/ });

    const ziel = new URL(
      screen.getByRole('link', { name: 'Verordner:in anlegen' }).getAttribute('href')!,
      'http://test',
    );
    expect(ziel.pathname).toBe('/verordner/neu');

    // Der Ruecksprungpfad traegt seit UX-009 eine Vorgangskennung: Sie
    // unterscheidet diesen Abstecher von einem spaeteren, unabhaengigen
    // Besuch derselben Seite (Restpunkt aus ANN-019).
    const rueckweg = new URL(ziel.searchParams.get('zurueck')!, 'http://test');
    expect(rueckweg.pathname).toBe(`/patienten/${PATIENT_ID}/verordnungen/neu`);
    expect(rueckweg.searchParams.get('vorgang')).toMatch(/.+/);
  });

  // Der Regressionstest zum Eingabenerhalt über den Abstecher zur
  // Verordner-Anlage (VER-003) - einschließlich Zeitfortschritt über fünf
  // Minuten mit echter Routennavigation - lebt in
  // TreatmentBasisFormPage.entwurf.test.tsx: er braucht die echte
  // react-router-dom-Navigation, die diese Datei oben durch einen Mock
  // ersetzt.
});

describe('EditTreatmentBasisPage', () => {
  beforeEach(() => {
    fetchPrescribers.mockReset();
    fetchPrescribers.mockResolvedValue([verordner]);
    fetchTreatmentBasis.mockReset();
    fetchTreatmentBasis.mockResolvedValue(bestand);
    updateTreatmentBasis.mockReset();
    updateTreatmentBasis.mockResolvedValue(undefined);
    deleteTreatmentBasis.mockReset();
    deleteTreatmentBasis.mockResolvedValue(undefined);
    navigate.mockReset();
  });

  it('befuellt Kopf und Positionen aus dem Bestand', async () => {
    renderWithProviders(<EditTreatmentBasisPage />);

    await screen.findByRole('option', { name: /Probst/ });
    expect(screen.getByLabelText('Ausstellungsdatum *')).toHaveValue('2026-06-18');
    expect(screen.getByLabelText('Verordner:in *')).toHaveValue(PROBST);
    expect(screen.getByLabelText('Art *')).toHaveValue('follow_up');
    expect(screen.getByLabelText('Heilmittel *')).toHaveValue('Krankengymnastik');
    expect(screen.getByLabelText('Genutzt')).toHaveValue('7');
    expect(screen.getByLabelText('Diagnose oder Leitsymptomatik')).toHaveValue(
      'Synthetisch: Schulter rechts.',
    );
  });

  it('sendet die vorhandene Positions-ID mit, damit die Zeile erhalten bleibt', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditTreatmentBasisPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await user.clear(screen.getByLabelText('Genutzt'));
    await user.type(screen.getByLabelText('Genutzt'), '8');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(updateTreatmentBasis).toHaveBeenCalledTimes(1));
    expect(updateTreatmentBasis.mock.calls[0]?.[0]).toBe(PRESCRIPTION_ID);
    expect(updateTreatmentBasis.mock.calls[0]?.[2]).toEqual([
      { id: 'i1', remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 8 },
    ]);
  });

  it('loescht erst nach der Rueckfrage', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditTreatmentBasisPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await user.click(screen.getByRole('button', { name: 'Grundlage löschen' }));
    expect(deleteTreatmentBasis).not.toHaveBeenCalled();
    expect(screen.getByText(/endgültig entfernt/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ja, Grundlage löschen' }));
    await waitFor(() => expect(deleteTreatmentBasis).toHaveBeenCalledWith(PRESCRIPTION_ID));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/patienten/${PATIENT_ID}/verordnungen`, {
        replace: true,
      }),
    );
  });

  it('verwirft die Loeschrueckfrage bei Abbrechen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditTreatmentBasisPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await user.click(screen.getByRole('button', { name: 'Grundlage löschen' }));
    await user.click(screen.getByRole('button', { name: 'Nicht löschen' }));

    expect(deleteTreatmentBasis).not.toHaveBeenCalled();
  });

  it('zeigt einen unzugaenglichen Datensatz nicht als Formular', async () => {
    fetchTreatmentBasis.mockResolvedValue(null);
    renderWithProviders(<EditTreatmentBasisPage />);

    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(screen.queryByLabelText('Heilmittel *')).not.toBeInTheDocument();
  });

  it('meldet einen fehlgeschlagenen Schreibvorgang ohne interne Details', async () => {
    updateTreatmentBasis.mockRejectedValue(new Error('constraint xyz verletzt'));
    const user = userEvent.setup();
    renderWithProviders(<EditTreatmentBasisPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    expect(
      await screen.findByText('Die Behandlungsgrundlage konnte nicht gespeichert werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/constraint xyz/)).not.toBeInTheDocument();
  });
});
