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

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof MessagesApi>()),
  fetchRueckfragen: () => fetchRueckfragen(),
  fetchRueckfrage: () => fetchRueckfrage(),
  answerRueckfrage: (...a: unknown[]) => answerRueckfrage(...a) as Promise<void>,
  closeRueckfrage: (...a: unknown[]) => closeRueckfrage(...a) as Promise<void>,
  fetchAntwortfrist: () => fetchAntwortfrist(),
  saveAntwortfrist: (...a: unknown[]) => saveAntwortfrist(...a) as Promise<void>,
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
    expect(screen.getByText('überfällig seit 07.10.2026')).toBeInTheDocument();
    expect(screen.getByText('offen · Antwort bis 13.10.2026')).toBeInTheDocument();
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
