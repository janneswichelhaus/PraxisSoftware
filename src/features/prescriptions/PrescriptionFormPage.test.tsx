import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';
import type * as PrescriptionsApi from './api';
import type * as RouterModule from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';

const PATIENT_ID = '66666666-6666-4666-8666-000000000001';
const PRESCRIPTION_ID = '88888888-8888-4888-8888-000000000002';
const PROBST = '77777777-7777-4777-8777-000000000001';

const fetchPrescribers = vi.fn();
const fetchPrescription = vi.fn();
const createPrescription = vi.fn();
const updatePrescription = vi.fn();
const deletePrescription = vi.fn();
const navigate = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof PrescriptionsApi>();
  return {
    ...actual,
    fetchPrescribers: () => fetchPrescribers() as Promise<PrescriptionsApi.Prescriber[]>,
    fetchPrescription: (id: string) =>
      fetchPrescription(id) as Promise<PrescriptionsApi.PrescriptionDetail | null>,
    createPrescription: (patientId: string, values: unknown, items: unknown) =>
      createPrescription(patientId, values, items) as Promise<string>,
    updatePrescription: (id: string, values: unknown, items: unknown) =>
      updatePrescription(id, values, items) as Promise<void>,
    deletePrescription: (id: string) => deletePrescription(id) as Promise<void>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModule>();
  return {
    ...actual,
    useNavigate: () => navigate,
    useParams: () => ({ patientId: PATIENT_ID, prescriptionId: PRESCRIPTION_ID }),
  };
});

const { EditPrescriptionPage, NewPrescriptionPage } = await import('./PrescriptionFormPage');
const { prescriptionDraftKey } = await import('./api');

const verordner: PrescriptionsApi.Prescriber = {
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

const bestand: PrescriptionsApi.PrescriptionDetail = {
  id: PRESCRIPTION_ID,
  patient_id: PATIENT_ID,
  prescriber_id: PROBST,
  prescriber_name: 'Dr. med. Petra Probst',
  prescriber_practice_name: 'Praxis Fiktiv',
  prescription_kind: 'follow_up',
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

describe('NewPrescriptionPage', () => {
  beforeEach(() => {
    fetchPrescribers.mockReset();
    fetchPrescribers.mockResolvedValue([verordner]);
    createPrescription.mockReset();
    createPrescription.mockResolvedValue('neue-id');
    navigate.mockReset();
  });

  it('haelt fehlende Pflichtangaben im Formular auf', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriptionPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await user.click(screen.getByRole('button', { name: 'Verordnung speichern' }));

    expect(await screen.findByText('Verordner:in ist erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Ausstellungsdatum ist erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Heilmittel ist erforderlich.')).toBeInTheDocument();
    expect(createPrescription).not.toHaveBeenCalled();
  });

  it('speichert Kopf und Positionen und kehrt zur Akte zurueck', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriptionPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await formularAusfuellen(user);
    await user.click(screen.getByRole('button', { name: 'Verordnung speichern' }));

    await waitFor(() => expect(createPrescription).toHaveBeenCalledTimes(1));
    expect(createPrescription.mock.calls[0]?.[0]).toBe(PATIENT_ID);
    expect(createPrescription.mock.calls[0]?.[1]).toMatchObject({
      prescriber_id: PROBST,
      prescription_kind: 'first',
      issued_on: '2026-03-01',
    });
    expect(createPrescription.mock.calls[0]?.[2]).toEqual([
      { id: null, remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 0 },
    ]);
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/patienten/${PATIENT_ID}`, { replace: true }),
    );
  });

  it('nimmt weitere Positionen auf und entfernt sie wieder', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriptionPage />);
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
    renderWithProviders(<NewPrescriptionPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await formularAusfuellen(user);
    await user.clear(screen.getByLabelText('Genutzt'));
    await user.type(screen.getByLabelText('Genutzt'), '11');
    await user.click(screen.getByRole('button', { name: 'Verordnung speichern' }));

    expect(
      await screen.findByText('Genutzt kann nicht größer sein als verordnet.'),
    ).toBeInTheDocument();
    expect(createPrescription).not.toHaveBeenCalled();
  });

  it('lehnt ein Ausstellungsdatum in der Zukunft ab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriptionPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await user.selectOptions(screen.getByLabelText('Verordner:in *'), PROBST);
    await user.type(screen.getByLabelText('Ausstellungsdatum *'), '2099-01-01');
    await user.type(screen.getByLabelText('Heilmittel *'), 'Krankengymnastik');
    await user.type(screen.getByLabelText('Verordnet *'), '10');
    await user.click(screen.getByRole('button', { name: 'Verordnung speichern' }));

    expect(
      await screen.findByText('Das Ausstellungsdatum darf nicht in der Zukunft liegen.'),
    ).toBeInTheDocument();
    expect(createPrescription).not.toHaveBeenCalled();
  });

  it('speichert bei doppeltem Absenden nur einmal', async () => {
    let aufloesen: (id: string) => void = () => {};
    createPrescription.mockReturnValue(
      new Promise<string>((resolve) => {
        aufloesen = resolve;
      }),
    );
    const user = userEvent.setup();
    renderWithProviders(<NewPrescriptionPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await formularAusfuellen(user);
    const knopf = screen.getByRole('button', { name: 'Verordnung speichern' });
    await user.click(knopf);
    await user.click(knopf);

    expect(createPrescription).toHaveBeenCalledTimes(1);
    aufloesen('neue-id');
  });

  it('bietet keinen Loeschweg fuer eine Verordnung, die es noch nicht gibt', async () => {
    renderWithProviders(<NewPrescriptionPage />);
    await screen.findByRole('option', { name: /Probst/ });

    expect(screen.queryByRole('button', { name: 'Verordnung löschen' })).not.toBeInTheDocument();
  });

  it('fuehrt zum Anlegen einer Verordner:in und wieder zurueck', async () => {
    renderWithProviders(<NewPrescriptionPage />);
    await screen.findByRole('option', { name: /Probst/ });

    expect(screen.getByRole('link', { name: 'Verordner:in anlegen' })).toHaveAttribute(
      'href',
      `/verordner/neu?zurueck=${encodeURIComponent(`/patienten/${PATIENT_ID}/verordnungen/neu`)}`,
    );
  });

  /**
   * Regressionstest für den in der Abnahme dokumentierten Befund (VER-003,
   * Schritt 8): Eingaben gingen beim Abstecher zu "Verordner:in anlegen"
   * verloren. `renderWithProviders` legt für jeden Aufruf einen eigenen
   * `QueryClient` an - hier wird bewusst ein eigener, über zwei Einhängungen
   * hinweg gemeinsam genutzter Client gebraucht, weil genau dieser Cache der
   * Übergabeweg ist (siehe api.ts, `prescriptionDraftKey`).
   */
  it('erhaelt Eingaben und Positionen ueber den Abstecher zum Anlegen einer Verordner:in und waehlt sie danach aus', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const NEUER_VERORDNER = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
    const rueckpfad = `/patienten/${PATIENT_ID}/verordnungen/neu`;

    function mitClient(ui: ReactElement) {
      return (
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/']}>{ui}</MemoryRouter>
        </QueryClientProvider>
      );
    }

    const erste = render(mitClient(<NewPrescriptionPage />));
    await screen.findByRole('option', { name: /Probst/ });

    await user.type(screen.getByLabelText('Ausstellungsdatum *'), '2026-03-01');
    await user.type(screen.getByLabelText('Frequenz'), '2x pro Woche');
    await user.type(screen.getByLabelText('Heilmittel *'), 'Manuelle Therapie');
    await user.type(screen.getByLabelText('Verordnet *'), '6');
    await user.type(
      screen.getByLabelText('Diagnose oder Leitsymptomatik'),
      'Synthetisch: Testdiagnose.',
    );

    // Der Klick merkt den Formularzustand; ohne Route auf "/verordner/neu"
    // bleibt die Seite in diesem Testaufbau stehen - das reale Verlassen der
    // Seite wird deshalb ausdrücklich nachgebildet.
    await user.click(screen.getByRole('link', { name: 'Verordner:in anlegen' }));
    erste.unmount();

    expect(createPrescription).not.toHaveBeenCalled();

    // Was PrescriberFormPage nach erfolgreichem Anlegen im selben Cache
    // hinterlässt (eigenständig geprüft in PrescriberFormPage.test.tsx).
    queryClient.setQueryData(
      prescriptionDraftKey(rueckpfad),
      (bisher: { werte: Record<string, string>; positionen: unknown[] } | undefined) =>
        bisher ? { ...bisher, neuerVerordnerId: NEUER_VERORDNER } : bisher,
    );
    fetchPrescribers.mockResolvedValue([
      verordner,
      { ...verordner, id: NEUER_VERORDNER, family_name: 'Neuarzt', practice_name: null },
    ]);

    // Zweite Einhängung mit demselben Client - das bildet den echten
    // Seitenwechsel zurück auf dieselbe Route nach.
    render(mitClient(<NewPrescriptionPage />));
    await screen.findByRole('option', { name: /Neuarzt/ });

    expect(screen.getByLabelText('Ausstellungsdatum *')).toHaveValue('2026-03-01');
    expect(screen.getByLabelText('Frequenz')).toHaveValue('2x pro Woche');
    expect(screen.getByLabelText('Heilmittel *')).toHaveValue('Manuelle Therapie');
    expect(screen.getByLabelText('Verordnet *')).toHaveValue('6');
    expect(screen.getByLabelText('Diagnose oder Leitsymptomatik')).toHaveValue(
      'Synthetisch: Testdiagnose.',
    );
    expect(screen.getByLabelText('Verordner:in *')).toHaveValue(NEUER_VERORDNER);

    // Die Verordnung selbst wurde durch all das nicht geschrieben - erst das
    // ausdrückliche Absenden schreibt.
    expect(createPrescription).not.toHaveBeenCalled();

    // Der Entwurf ist verbraucht: ein späterer, unabhängiger Besuch derselben
    // Seite findet keine fremden Reste mehr vor.
    expect(queryClient.getQueryData(prescriptionDraftKey(rueckpfad))).toBeUndefined();
  });
});

describe('EditPrescriptionPage', () => {
  beforeEach(() => {
    fetchPrescribers.mockReset();
    fetchPrescribers.mockResolvedValue([verordner]);
    fetchPrescription.mockReset();
    fetchPrescription.mockResolvedValue(bestand);
    updatePrescription.mockReset();
    updatePrescription.mockResolvedValue(undefined);
    deletePrescription.mockReset();
    deletePrescription.mockResolvedValue(undefined);
    navigate.mockReset();
  });

  it('befuellt Kopf und Positionen aus dem Bestand', async () => {
    renderWithProviders(<EditPrescriptionPage />);

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
    renderWithProviders(<EditPrescriptionPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await user.clear(screen.getByLabelText('Genutzt'));
    await user.type(screen.getByLabelText('Genutzt'), '8');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(updatePrescription).toHaveBeenCalledTimes(1));
    expect(updatePrescription.mock.calls[0]?.[0]).toBe(PRESCRIPTION_ID);
    expect(updatePrescription.mock.calls[0]?.[2]).toEqual([
      { id: 'i1', remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 8 },
    ]);
  });

  it('loescht erst nach der Rueckfrage', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditPrescriptionPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    expect(deletePrescription).not.toHaveBeenCalled();
    expect(screen.getByText(/endgültig entfernt/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ja, Verordnung löschen' }));
    await waitFor(() => expect(deletePrescription).toHaveBeenCalledWith(PRESCRIPTION_ID));
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/patienten/${PATIENT_ID}`, { replace: true }),
    );
  });

  it('verwirft die Loeschrueckfrage bei Abbrechen', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditPrescriptionPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    await user.click(screen.getByRole('button', { name: 'Nicht löschen' }));

    expect(deletePrescription).not.toHaveBeenCalled();
  });

  it('zeigt einen unzugaenglichen Datensatz nicht als Formular', async () => {
    fetchPrescription.mockResolvedValue(null);
    renderWithProviders(<EditPrescriptionPage />);

    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(screen.queryByLabelText('Heilmittel *')).not.toBeInTheDocument();
  });

  it('meldet einen fehlgeschlagenen Schreibvorgang ohne interne Details', async () => {
    updatePrescription.mockRejectedValue(new Error('constraint xyz verletzt'));
    const user = userEvent.setup();
    renderWithProviders(<EditPrescriptionPage />);
    await screen.findByRole('option', { name: /Probst/ });

    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    expect(
      await screen.findByText('Die Verordnung konnte nicht gespeichert werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/constraint xyz/)).not.toBeInTheDocument();
  });
});
