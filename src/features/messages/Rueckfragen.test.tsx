import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type * as MessagesApi from './api';
import type { Rueckfrage, Rueckfragezeile } from './api';
import { renderWithProviders, testUser } from '@/test-utils';

/**
 * Rückfragen in der Praxis (KOM-002, DSN-001 Abschnitt 6, ANN-309, ANN-310).
 *
 *   * Die Liste nennt Person, Thema und Frist, überfällig mit Wort - keinen Text.
 *   * Öffnen zeigt den Verlauf; antworten und erledigen, wer darf.
 *   * Das Büro antwortet nicht auf Übung und Beschwerden; die Seite sagt es.
 *   * Die Antwortfrist ändert nur owner.
 */

const fetchRueckfragen = vi.fn<() => Promise<Rueckfragezeile[]>>();
const fetchRueckfrage = vi.fn<() => Promise<Rueckfrage | null>>();
const answerRueckfrage = vi.fn();
const closeRueckfrage = vi.fn();
const fetchAntwortfrist = vi.fn<() => Promise<number | null>>();
const saveAntwortfrist = vi.fn();
const assignRueckfrage = vi.fn();
const fetchAktenNachrichten = vi.fn<() => Promise<MessagesApi.Aktenvorgang[]>>();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof MessagesApi>()),
  fetchRueckfragen: () => fetchRueckfragen(),
  fetchRueckfrage: () => fetchRueckfrage(),
  answerRueckfrage: (...a: unknown[]) => answerRueckfrage(...a) as Promise<void>,
  closeRueckfrage: (...a: unknown[]) => closeRueckfrage(...a) as Promise<void>,
  fetchAntwortfrist: () => fetchAntwortfrist(),
  saveAntwortfrist: (...a: unknown[]) => saveAntwortfrist(...a) as Promise<void>,
  assignRueckfrage: (...a: unknown[]) => assignRueckfrage(...a) as Promise<void>,
  fetchAktenNachrichten: () => fetchAktenNachrichten(),
}));

const { RueckfragenPage, RueckfragePage } = await import('./RueckfragenPage');
const { OffeneRueckfragen } = await import('./RueckfragenAbschnitt');

const ZEILE: Rueckfragezeile = {
  id: 'dddddddd-dddd-4ddd-8ddd-000000000001',
  relationship_kind: 'treatment',
  relationship_id: '66666666-6666-4666-8666-000000000002',
  patient_id: '66666666-6666-4666-8666-000000000002',
  training_relationship_id: null,
  given_name: 'Erika',
  family_name: 'Beispiel',
  topic: 'complaint',
  reference_label: null,
  status: 'open',
  due_on: '2026-10-07',
  overdue: true,
  created_at: '2026-10-05T08:00:00Z',
  last_entry_at: '2026-10-05T08:00:00Z',
  closed_at: null,
  closed_by_side: null,
  entry_count: 1,
  asked_by: 'self',
  representative_name: null,
  can_answer: true,
  record_assigned_at: null,
};

const VORGANG: Rueckfrage = {
  ...ZEILE,
  exercise_plan_id: null,
  record_assigned_by_label: null,
  can_assign: false,
  entries: [
    {
      id: 'eeeeeeee-dddd-4ddd-8ddd-000000000001',
      side: 'person',
      body: 'Knie schmerzt seit gestern.',
      author_kind: 'self',
      author_label: null,
      created_at: '2026-10-05T08:00:00Z',
    },
  ],
};

beforeEach(() => {
  vi.clearAllMocks();
  fetchRueckfragen.mockResolvedValue([
    ZEILE,
    {
      ...ZEILE,
      id: 'dddddddd-dddd-4ddd-8ddd-000000000002',
      given_name: 'Max',
      family_name: 'Mustermann',
      topic: 'organisational',
      overdue: false,
      due_on: '2026-10-13',
      asked_by: 'companion',
      representative_name: 'Paula Mustermann',
    },
  ]);
  fetchRueckfrage.mockResolvedValue(VORGANG);
  answerRueckfrage.mockResolvedValue(undefined);
  closeRueckfrage.mockResolvedValue(undefined);
  fetchAntwortfrist.mockResolvedValue(2);
  saveAntwortfrist.mockResolvedValue(undefined);
});

describe('Rückfragen (KOM-002)', () => {
  it('listet Person, Thema und Frist, überfällig mit Wort, ohne Text', async () => {
    renderWithProviders(
      <RueckfragenPage user={testUser(['office'], 'Olivia Office')} />,
      '/rueckfragen',
    );
    expect(await screen.findByText('Erika Beispiel')).toBeInTheDocument();
    expect(screen.getByText('überfällig')).toBeInTheDocument();
    expect(screen.getByText(/fällig war 07\.10\.2026/)).toBeInTheDocument();
    expect(screen.getByText('offen')).toBeInTheDocument();
    expect(screen.getByText(/Antwort bis 13\.10\.2026/)).toBeInTheDocument();
    expect(screen.getByText(/über Begleitung Paula Mustermann/)).toBeInTheDocument();
    expect(screen.queryByText(/Knie schmerzt/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Erika Beispiel/ })).toHaveAttribute(
      'href',
      `/rueckfragen/${ZEILE.id}`,
    );
    expect(screen.getByText(/innerhalb von 2 Werktagen/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ändern' })).not.toBeInTheDocument();
  });

  it('owner ändert die Antwortfrist (ANN-309)', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(
      <RueckfragenPage user={testUser(['owner'], 'Jannes Test')} />,
      '/rueckfragen',
    );
    await nutzer.click(await screen.findByRole('button', { name: 'Ändern' }));
    await nutzer.selectOptions(screen.getByLabelText('Antwortfrist'), '3');
    await nutzer.click(screen.getByRole('button', { name: 'Speichern' }));
    await waitFor(() => expect(saveAntwortfrist).toHaveBeenCalledWith(3));
  });

  it('öffnet den Verlauf, antwortet und erledigt', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route
          path="/rueckfragen/:messageId"
          element={<RueckfragePage user={testUser(['therapist'])} />}
        />
      </Routes>,
      `/rueckfragen/${ZEILE.id}`,
    );
    const verlauf = await screen.findByRole('list', { name: 'Verlauf' });
    expect(within(verlauf).getByText('Knie schmerzt seit gestern.')).toBeInTheDocument();
    expect(within(verlauf).getByText('Erika Beispiel')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Erika Beispiel' })).toHaveAttribute(
      'href',
      '/patienten/66666666-6666-4666-8666-000000000002',
    );
    await nutzer.click(screen.getByRole('button', { name: 'Antwort senden' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Bitte eine Antwort schreiben.');
    await nutzer.type(screen.getByLabelText('Antwort an die Person'), 'Bitte kühlen, ich rufe an.');
    await nutzer.click(screen.getByRole('button', { name: 'Antwort senden' }));
    await waitFor(() =>
      expect(answerRueckfrage).toHaveBeenCalledWith(ZEILE.id, 'Bitte kühlen, ich rufe an.'),
    );
    await nutzer.click(screen.getByRole('button', { name: 'Als erledigt markieren' }));
    await waitFor(() => expect(closeRueckfrage).toHaveBeenCalledWith(ZEILE.id));
  });

  it('das Büro antwortet nicht auf Beschwerden - die Seite sagt, wer es tut (ANN-310)', async () => {
    fetchRueckfrage.mockResolvedValue({ ...VORGANG, can_answer: false });
    renderWithProviders(
      <Routes>
        <Route
          path="/rueckfragen/:messageId"
          element={<RueckfragePage user={testUser(['office'], 'Olivia Office')} />}
        />
      </Routes>,
      `/rueckfragen/${ZEILE.id}`,
    );
    expect(await screen.findByText(/antworten Therapeut:innen/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Antwort an die Person')).not.toBeInTheDocument();
  });

  it('unbekannt oder nicht lesbar: ein Satz statt einer leeren Seite', async () => {
    fetchRueckfrage.mockResolvedValue(null);
    renderWithProviders(
      <Routes>
        <Route
          path="/rueckfragen/:messageId"
          element={<RueckfragePage user={testUser(['office'])} />}
        />
      </Routes>,
      `/rueckfragen/${ZEILE.id}`,
    );
    expect(await screen.findByText(/gibt es nicht/)).toBeInTheDocument();
  });

  it('Offene Punkte: offen und überfällig je Bereich', async () => {
    renderWithProviders(<OffeneRueckfragen bereiche={['treatment']} />, '/offen');
    expect(await screen.findByText(/2 offen, davon 1 überfällig\./)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zu den Rückfragen' })).toHaveAttribute(
      'href',
      '/rueckfragen',
    );
  });
});

describe('Rückfragen im Training (KOM-003, DSN-001 D1 b)', () => {
  it('führen in den Bereich Training und zurück zu den Trainingskund:innen', async () => {
    const training: Rueckfragezeile = {
      ...ZEILE,
      relationship_kind: 'training',
      patient_id: null,
      training_relationship_id: 'eeeeeeee-eeee-4eee-8eee-000000000001',
      relationship_id: 'eeeeeeee-eeee-4eee-8eee-000000000001',
      given_name: 'Tina',
      family_name: 'Training',
      topic: 'organisational',
    };
    fetchRueckfragen.mockResolvedValue([training]);
    const { TrainingRueckfragen } = await import('./RueckfragenAbschnitt');
    renderWithProviders(<TrainingRueckfragen />, '/training');
    expect(await screen.findByText('Rückfragen von der Plattform (1)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Tina Training/ })).toHaveAttribute(
      'href',
      `/training/rueckfragen/${ZEILE.id}`,
    );

    fetchRueckfrage.mockResolvedValue({ ...VORGANG, ...training });
    renderWithProviders(
      <Routes>
        <Route
          path="/training/rueckfragen/:messageId"
          element={<RueckfragePage user={testUser(['trainer'], 'Tom Training')} />}
        />
      </Routes>,
      `/training/rueckfragen/${ZEILE.id}`,
    );
    expect(await screen.findByRole('link', { name: '← Zu den Rückfragen' })).toHaveAttribute(
      'href',
      '/training',
    );
  });

  it('ohne Rückfrage steht bei den Trainingskund:innen nichts', async () => {
    fetchRueckfragen.mockResolvedValue([]);
    const { TrainingRueckfragen } = await import('./RueckfragenAbschnitt');
    const { container } = renderWithProviders(<TrainingRueckfragen />, '/training');
    await waitFor(() => expect(fetchRueckfragen).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});

describe('In die Akte (KOM-004, ANN-312)', () => {
  function zeige(vorgang: Rueckfrage) {
    fetchRueckfrage.mockResolvedValue(vorgang);
    renderWithProviders(
      <Routes>
        <Route
          path="/rueckfragen/:messageId"
          element={<RueckfragePage user={testUser(['therapist'])} />}
        />
      </Routes>,
      `/rueckfragen/${vorgang.id}`,
    );
  }

  it('fragt nach und ordnet zu, wenn der Server es erlaubt', async () => {
    const nutzer = userEvent.setup();
    assignRueckfrage.mockResolvedValue(undefined);
    zeige({ ...VORGANG, can_assign: true });
    await nutzer.click(await screen.findByRole('button', { name: 'In die Akte übernehmen' }));
    expect(screen.getByText(/lässt sich nicht rückgängig machen/)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Ja, in die Akte' }));
    await waitFor(() => expect(assignRueckfrage).toHaveBeenCalledWith(VORGANG.id));
  });

  it('ohne Recht kein Knopf; zugeordnet steht wann und von wem', async () => {
    zeige({
      ...VORGANG,
      can_assign: false,
      record_assigned_at: '2026-10-06T10:00:00Z',
      record_assigned_by_label: 'Anna Beispiel',
    });
    expect(
      await screen.findByText(/In der Akte seit 06.10.2026, übernommen von Anna Beispiel/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'In die Akte übernehmen' }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zur Doku' })).toHaveAttribute(
      'href',
      `/patienten/${VORGANG.patient_id}/doku`,
    );
  });

  it('zeigt die zugeordneten Nachrichten in der Doku mit Herkunft', async () => {
    fetchAktenNachrichten.mockResolvedValue([
      {
        id: VORGANG.id,
        topic: 'complaint',
        reference_label: null,
        status: 'answered',
        created_at: '2026-10-05T08:00:00Z',
        record_assigned_at: '2026-10-06T10:00:00Z',
        record_assigned_by_label: 'Anna Beispiel',
        entries: VORGANG.entries,
      },
    ]);
    const { NachrichtenInDerAkte } = await import('./InDieAkte');
    renderWithProviders(
      <NachrichtenInDerAkte patientId={VORGANG.patient_id!} zeitzone="Europe/Berlin" />,
      '/patienten/x/doku',
    );
    expect(await screen.findByText('Knie schmerzt seit gestern.')).toBeInTheDocument();
    expect(screen.getByText(/übernommen am 06.10.2026 von Anna Beispiel/)).toBeInTheDocument();
  });
});
