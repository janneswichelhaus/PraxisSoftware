import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import type * as PlattformApi from './api';
import type { EigenePlaene, Nachricht, Nachrichten as Daten, Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * Reiter „Nachrichten" (KOM-001, DSN-001 4.1, IDEA-KOM-001, -002).
 *
 *   * Zusage und Notfallhinweis stehen an jedem Eingabefeld, für alle gleich.
 *   * Neue Nachricht in zwei Schritten; ohne Thema und Text kein Senden.
 *   * Im Training ohne Einwilligung nur Termin, Rechnung und Sonstiges.
 *   * In der Lesefrist nur lesen.
 */

const ladeNachrichten = vi.fn<(id: string) => Promise<Daten>>();
const ladePlaene = vi.fn<(id: string) => Promise<EigenePlaene>>();
const nachrichtStellen = vi.fn();
const nachrichtNachtragen = vi.fn();
const nachrichtErledigen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeNachrichten: (id: string) => ladeNachrichten(id),
  ladePlaene: (id: string) => ladePlaene(id),
  nachrichtStellen: (...a: unknown[]) => nachrichtStellen(...a) as Promise<string>,
  nachrichtNachtragen: (...a: unknown[]) => nachrichtNachtragen(...a) as Promise<void>,
  nachrichtErledigen: (...a: unknown[]) => nachrichtErledigen(...a) as Promise<void>,
}));

const { Nachrichten, NeueNachricht, NachrichtDetail } = await import('./Nachrichten');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
};

const OFFEN: Nachricht = {
  id: 'dddddddd-dddd-4ddd-8ddd-000000000001',
  topic: 'organisational',
  reference_label: null,
  status: 'open',
  due_on: '2026-10-13',
  created_at: '2026-10-09T08:00:00Z',
  last_entry_at: '2026-10-09T08:00:00Z',
  closed_at: null,
  closed_by_side: null,
  entries: [
    {
      id: 'eeeeeeee-dddd-4ddd-8ddd-000000000001',
      side: 'person',
      body: 'Kann ich den Termin am Freitag verschieben?',
      created_at: '2026-10-09T08:00:00Z',
      author: 'you',
      author_label: null,
    },
  ],
};

const BEANTWORTET: Nachricht = {
  ...OFFEN,
  id: 'dddddddd-dddd-4ddd-8ddd-000000000002',
  topic: 'exercise',
  reference_label: 'Kniebeuge am Geländer',
  status: 'answered',
  due_on: null,
  entries: [
    { ...OFFEN.entries[0]!, body: 'Wie tief soll ich gehen?' },
    {
      id: 'eeeeeeee-dddd-4ddd-8ddd-000000000002',
      side: 'practice',
      body: 'Nur so tief, wie es ohne Schmerz geht.',
      created_at: '2026-10-09T10:00:00Z',
      author: 'practice',
      author_label: null,
    },
    {
      id: 'eeeeeeee-dddd-4ddd-8ddd-000000000003',
      side: 'person',
      body: 'Danke!',
      created_at: '2026-10-09T11:00:00Z',
      author: 'representative',
      author_label: 'Paula Mustermann',
    },
  ],
};

const ERLEDIGT: Nachricht = {
  ...OFFEN,
  id: 'dddddddd-dddd-4ddd-8ddd-000000000003',
  topic: 'other',
  status: 'closed',
  due_on: null,
  closed_at: '2026-10-09T12:00:00Z',
  closed_by_side: 'practice',
};

function daten(teil: Partial<Daten> = {}): Daten {
  return {
    response_workdays: 2,
    can_write: true,
    health_topics: true,
    messages: [OFFEN, BEANTWORTET, ERLEDIGT],
    ...teil,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  ladeNachrichten.mockResolvedValue(daten());
  ladePlaene.mockResolvedValue({
    today: '2026-10-09',
    plans: [
      {
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        service_area: 'therapy',
        title: 'Heimprogramm Knie',
        status: 'assigned',
        sessions_per_week: 3,
        assigned_on: '2026-10-01',
        runs_from: '2026-10-01',
        runs_until: '2026-11-12',
        ended_on: null,
        can_exercise: true,
        note_allowed: true,
        open_session: null,
        can_choose_days: true,
        weekdays: [],
        recent_sessions: [],
        items: [
          {
            id: 'bbbbbbbb-aaaa-4aaa-8aaa-000000000001',
            position: 1,
            variant_lay_name: 'Kniebeuge am Geländer',
            instruction: null,
            equipment: [],
            sets: 3,
            reps_min: 10,
            reps_max: 12,
            duration_seconds: null,
            load: null,
            tempo: null,
            rest_seconds: 30,
            double_progression: false,
            note: null,
          },
        ],
      },
    ],
  });
  nachrichtStellen.mockResolvedValue('dddddddd-dddd-4ddd-8ddd-000000000009');
  nachrichtNachtragen.mockResolvedValue(undefined);
  nachrichtErledigen.mockResolvedValue(undefined);
});

function hinweisPruefen(container: HTMLElement) {
  const hinweis = within(container).getByRole('note', {
    name: 'Hinweis zu Antwortzeit und Notfällen',
  });
  expect(hinweis).toHaveTextContent('Antwort in der Regel innerhalb von zwei Werktagen.');
  expect(hinweis).toHaveTextContent('Nicht für akute Beschwerden.');
  expect(hinweis).toHaveTextContent('112');
  expect(hinweis).toHaveTextContent('116117');
}

describe('Nachrichten (KOM-001)', () => {
  it('zeigt Zusage und Notfallhinweis, laufende und erledigte Nachrichten', async () => {
    renderWithProviders(<Nachrichten zugang={ZUGANG} />, '/p/nachrichten');
    expect(await screen.findByRole('heading', { name: 'Nachrichten' })).toBeInTheDocument();
    hinweisPruefen(document.body);
    expect(screen.getByRole('link', { name: 'Neue Nachricht' })).toHaveAttribute(
      'href',
      '/p/nachrichten/neu',
    );
    expect(screen.getByText('bei der Praxis · Antwort bis 13.10.2026')).toBeInTheDocument();
    expect(screen.getByText('Übung · Kniebeuge am Geländer')).toBeInTheDocument();
    expect(screen.getByText('beantwortet')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Erledigt' })).toBeInTheDocument();
  });

  it('die Frist kommt aus den Praxisstammdaten (ANN-309)', async () => {
    ladeNachrichten.mockResolvedValue(daten({ response_workdays: 1 }));
    renderWithProviders(<Nachrichten zugang={ZUGANG} />, '/p/nachrichten');
    expect(
      await screen.findByText('Antwort in der Regel innerhalb eines Werktags.'),
    ).toBeInTheDocument();
  });

  it('in der Lesefrist: lesen, kein neuer Knopf (ANN-313)', async () => {
    ladeNachrichten.mockResolvedValue(daten({ can_write: false }));
    renderWithProviders(<Nachrichten zugang={ZUGANG} />, '/p/nachrichten');
    expect(await screen.findByText(/hier noch lesen/)).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Neue Nachricht' })).not.toBeInTheDocument();
  });
});

describe('Neue Nachricht (KOM-001)', () => {
  it('verlangt Thema und Text; der Hinweis steht über dem Feld', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<NeueNachricht zugang={ZUGANG} />, '/p/nachrichten/neu');
    await screen.findByRole('heading', { name: 'Neue Nachricht' });
    hinweisPruefen(document.body);
    for (const name of ['Übung', 'Beschwerden', 'Termin oder Rechnung', 'Sonstiges']) {
      expect(screen.getByRole('radio', { name })).toBeInTheDocument();
    }
    await nutzer.click(screen.getByRole('button', { name: 'Nachricht senden' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Bitte wählen Sie, worum es geht.');
    await nutzer.click(screen.getByRole('radio', { name: 'Sonstiges' }));
    await nutzer.click(screen.getByRole('button', { name: 'Nachricht senden' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Bitte schreiben Sie Ihre Frage.');
    expect(nachrichtStellen).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Abbrechen' })).toBeInTheDocument();
  });

  it('sendet Thema, Text und den Bezug auf eine Übung', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(
      <Routes>
        <Route path="/p/nachrichten/neu" element={<NeueNachricht zugang={ZUGANG} />} />
        <Route path="/p/nachrichten" element={<p>Liste</p>} />
      </Routes>,
      '/p/nachrichten/neu',
    );
    await nutzer.click(await screen.findByRole('radio', { name: 'Übung' }));
    await nutzer.selectOptions(
      screen.getByLabelText('Zu welchem Plan? (freiwillig)'),
      'Heimprogramm Knie',
    );
    await nutzer.selectOptions(
      screen.getByLabelText('Zu welcher Übung? (freiwillig)'),
      'Kniebeuge am Geländer',
    );
    await nutzer.type(screen.getByLabelText('Text'), 'Wie tief soll ich gehen?');
    await nutzer.click(screen.getByRole('button', { name: 'Nachricht senden' }));
    await waitFor(() =>
      expect(nachrichtStellen).toHaveBeenCalledWith({
        zugangId: ZUGANG.access_id,
        thema: 'exercise',
        text: 'Wie tief soll ich gehen?',
        planId: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        positionId: 'bbbbbbbb-aaaa-4aaa-8aaa-000000000001',
      }),
    );
    expect(await screen.findByText('Liste')).toBeInTheDocument();
  });

  it('ohne Bezug bei anderen Themen', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<NeueNachricht zugang={ZUGANG} />, '/p/nachrichten/neu');
    await nutzer.click(await screen.findByRole('radio', { name: 'Termin oder Rechnung' }));
    expect(screen.queryByLabelText('Zu welchem Plan? (freiwillig)')).not.toBeInTheDocument();
    await nutzer.type(screen.getByLabelText('Text'), 'Rechnung doppelt?');
    await nutzer.click(screen.getByRole('button', { name: 'Nachricht senden' }));
    await waitFor(() =>
      expect(nachrichtStellen).toHaveBeenCalledWith(
        expect.objectContaining({ thema: 'organisational', planId: null, positionId: null }),
      ),
    );
  });

  it('im Training ohne Einwilligung nur zwei Themen, mit Grund (ANN-311)', async () => {
    ladeNachrichten.mockResolvedValue(daten({ health_topics: false }));
    renderWithProviders(
      <NeueNachricht zugang={{ ...ZUGANG, relationship_kind: 'training' }} />,
      '/p/nachrichten/neu',
    );
    expect(await screen.findByRole('radio', { name: 'Sonstiges' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Termin oder Rechnung' })).toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Übung' })).not.toBeInTheDocument();
    expect(screen.queryByRole('radio', { name: 'Beschwerden' })).not.toBeInTheDocument();
    expect(screen.getByText(/Angaben zu Ihrer Gesundheit/)).toBeInTheDocument();
  });

  it('zeigt die Meldung des Servers verständlich', async () => {
    const nutzer = userEvent.setup();
    nachrichtStellen.mockRejectedValue(new Error('Ihr Zugang erlaubt das gerade nicht.'));
    renderWithProviders(<NeueNachricht zugang={ZUGANG} />, '/p/nachrichten/neu');
    await nutzer.click(await screen.findByRole('radio', { name: 'Sonstiges' }));
    await nutzer.type(screen.getByLabelText('Text'), 'Frage');
    await nutzer.click(screen.getByRole('button', { name: 'Nachricht senden' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ihr Zugang erlaubt das gerade nicht.',
    );
  });
});

describe('Eine Nachricht (KOM-001)', () => {
  function zeige(id: string, zugang: Plattformzugang = ZUGANG) {
    renderWithProviders(
      <Routes>
        <Route path="/p/nachrichten/:nachrichtId" element={<NachrichtDetail zugang={zugang} />} />
      </Routes>,
      `/p/nachrichten/${id}`,
    );
  }

  it('zeigt den Verlauf mit Verfasser; die Praxis ohne Namen', async () => {
    zeige(BEANTWORTET.id);
    const verlauf = await screen.findByRole('list', { name: 'Verlauf' });
    const eintraege = within(verlauf).getAllByRole('listitem');
    expect(eintraege[0]).toHaveTextContent('Sie');
    expect(eintraege[1]).toHaveTextContent('Praxis');
    expect(eintraege[1]).toHaveTextContent('Nur so tief, wie es ohne Schmerz geht.');
    expect(eintraege[2]).toHaveTextContent('Paula Mustermann für Sie');
    expect(screen.getByText('Zu: Kniebeuge am Geländer')).toBeInTheDocument();
  });

  it('nachtragen und erledigen', async () => {
    const nutzer = userEvent.setup();
    zeige(OFFEN.id);
    await screen.findByLabelText('Noch etwas ergänzen');
    hinweisPruefen(document.body);
    await nutzer.type(screen.getByLabelText('Noch etwas ergänzen'), 'Oder Montag?');
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    await waitFor(() =>
      expect(nachrichtNachtragen).toHaveBeenCalledWith(ZUGANG.access_id, OFFEN.id, 'Oder Montag?'),
    );
    await nutzer.click(screen.getByRole('button', { name: 'Hat sich erledigt' }));
    await waitFor(() =>
      expect(nachrichtErledigen).toHaveBeenCalledWith(ZUGANG.access_id, OFFEN.id),
    );
  });

  it('erledigt: kein Eingabefeld, wer erledigt hat', async () => {
    zeige(ERLEDIGT.id);
    expect(
      await screen.findByText(/Die Praxis hat diese Nachricht als erledigt markiert/),
    ).toBeInTheDocument();
    expect(screen.queryByLabelText('Noch etwas ergänzen')).not.toBeInTheDocument();
  });

  it('eine Vertretung sieht den Namen der vertretenen Person', async () => {
    zeige(BEANTWORTET.id, {
      ...ZUGANG,
      access_kind: 'companion',
      represented_name: 'Max Mustermann',
    });
    const verlauf = await screen.findByRole('list', { name: 'Verlauf' });
    expect(within(verlauf).getAllByRole('listitem')[2]).toHaveTextContent('Paula Mustermann');
  });
});
