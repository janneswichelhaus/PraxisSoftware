import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import type { RoleKey } from '@/features/session/types';
import type * as TeamchatApi from './api';
import type { Kanal, Nachricht } from './api';

/**
 * Teamchat (TEAM-001): Liste, Gespräch, Thread, Direktnachricht. Was der
 * Server zulässt, prüft `supabase/tests/teamchat.test.ts`; hier geht es um
 * Wege und Tipps (Budgets der Spec) und darum, dass nichts über andere
 * erscheint - kein „gelesen von“, kein Status (ANN-609).
 */

const fetchKanaele = vi.fn();
const fetchAktivitaet = vi.fn();
const fetchThreads = vi.fn();
const fetchNachrichten = vi.fn();
const fetchPersonen = vi.fn();
const sucheNachrichten = vi.fn();
const sendeNachricht = vi.fn();
const markiereGelesen = vi.fn();
const oeffneDirekt = vi.fn();
const loescheNachricht = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof TeamchatApi>();
  return {
    ...actual,
    fetchKanaele: () => fetchKanaele() as unknown,
    fetchAktivitaet: () => fetchAktivitaet() as unknown,
    fetchThreads: () => fetchThreads() as unknown,
    fetchNachrichten: (...a: unknown[]) => fetchNachrichten(...a) as unknown,
    fetchPersonen: () => fetchPersonen() as unknown,
    sucheNachrichten: (...a: unknown[]) => sucheNachrichten(...a) as unknown,
    sendeNachricht: (...a: unknown[]) => sendeNachricht(...a) as unknown,
    markiereGelesen: (...a: unknown[]) => markiereGelesen(...a) as unknown,
    oeffneDirekt: (...a: unknown[]) => oeffneDirekt(...a) as unknown,
    loescheNachricht: (...a: unknown[]) => loescheNachricht(...a) as unknown,
  };
});

const { TeamChatPage } = await import('./TeamChatPage');
const { GespraechPage } = await import('./GespraechPage');
const { ThreadPage } = await import('./ThreadPage');
const { NeuPage } = await import('./NeuPage');
const { FlottenNachrichtenPage } = await import('./FlottenNachrichtenPage');
const { FuerDichPage } = await import('./FuerDichPage');
const { ThreadsPage } = await import('./ThreadsPage');

const ANNA = '55555555-5555-4555-8555-000000000002';
const TIM = '55555555-5555-4555-8555-000000000004';

function kanal(overrides: Partial<Kanal>): Kanal {
  return {
    id: 'k-allgemein',
    kind: 'channel',
    name: 'Allgemein',
    description: 'Organisatorisches für das ganze Team.',
    archived: false,
    partner_staff_member_id: null,
    partner_name: null,
    partner_active: null,
    unread: 0,
    mentions: 0,
    last_message_at: '2026-10-17T07:00:00Z',
    ...overrides,
  };
}

const KANAELE: Kanal[] = [
  kanal({}),
  kanal({
    id: 'k-flotte',
    name: 'Flotte',
    description: 'Räder, Schlüssel, Pannen und Wartung.',
    unread: 2,
    mentions: 1,
  }),
  kanal({
    id: 'k-direkt',
    kind: 'direct',
    name: null,
    description: null,
    partner_staff_member_id: TIM,
    partner_name: 'Tim Teamleitung',
    partner_active: true,
  }),
  kanal({ id: 'k-alt', name: 'Sommerfest', archived: true }),
  kanal({ id: 'k-rad', kind: 'fleet', name: null, description: null, unread: 4 }),
];

function nachricht(overrides: Partial<Nachricht>): Nachricht {
  return {
    id: 'n1',
    parent_id: null,
    author_staff_member_id: TIM,
    author_name: 'Tim Teamleitung',
    body: 'Rad 3 steht im Depot Süd.',
    created_at: '2026-10-17T07:00:00Z',
    edited: false,
    removed_kind: null,
    reply_count: 0,
    last_reply_at: null,
    mentions: [],
    own: false,
    new_replies: 0,
    unread: false,
    mentioned_in_new_replies: false,
    ...overrides,
  };
}

function zeige(
  pfad: string,
  roles: RoleKey[] = ['therapist'],
): { router: ReturnType<typeof createMemoryRouter> } {
  const user = { ...testUser(roles), staffMemberId: ANNA };
  const router = createMemoryRouter(
    [
      { path: '/team', element: <TeamChatPage user={user} /> },
      { path: '/team/neu', element: <NeuPage user={user} /> },
      { path: '/team/threads', element: <ThreadsPage user={user} /> },
      { path: '/fuer-dich', element: <FuerDichPage user={user} /> },
      { path: '/team/:kanalId', element: <GespraechPage user={user} /> },
      { path: '/team/:kanalId/:threadId', element: <ThreadPage user={user} /> },
      { path: '/betrieb/flotte/nachrichten', element: <FlottenNachrichtenPage user={user} /> },
      {
        path: '/betrieb/flotte/nachrichten/:threadId',
        element: <FlottenNachrichtenPage user={user} />,
      },
    ],
    { initialEntries: [pfad] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return { router };
}

beforeEach(() => {
  fetchKanaele.mockReset().mockResolvedValue(KANAELE);
  fetchAktivitaet.mockReset().mockResolvedValue([]);
  fetchThreads.mockReset().mockResolvedValue([]);
  fetchNachrichten.mockReset().mockResolvedValue([]);
  fetchPersonen.mockReset().mockResolvedValue([
    { staff_member_id: TIM, name: 'Tim Teamleitung' },
    { staff_member_id: '55555555-5555-4555-8555-000000000003', name: 'Olivia Office' },
  ]);
  sucheNachrichten.mockReset().mockResolvedValue([]);
  sendeNachricht.mockReset().mockResolvedValue('neu');
  markiereGelesen.mockReset().mockResolvedValue(undefined);
  oeffneDirekt.mockReset().mockResolvedValue('k-direkt');
  loescheNachricht.mockReset().mockResolvedValue(undefined);
});

describe('Teamchat: Gesprächsliste', () => {
  it('stellt Ungelesenes nach oben, zählt Erwähnungen und klappt das Archiv ein', async () => {
    zeige('/team');
    const titel = await screen.findByRole('heading', { name: 'Kanäle' });
    const zeilen = within(titel.closest('section')!).getAllByRole('link');
    expect(zeilen.map((z) => z.textContent)).toEqual([
      expect.stringContaining('# Flotte'),
      expect.stringContaining('# Allgemein'),
    ]);
    const direkt = screen.getByRole('heading', { name: 'Direktnachrichten' }).closest('section')!;
    expect(within(direkt).getByRole('link', { name: /Tim Teamleitung/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Threads' })).toHaveAttribute('href', '/team/threads');
    expect(within(zeilen[0]!).getByText('1 für dich')).toBeInTheDocument();
    expect(zeilen[0]).toHaveAttribute('href', '/team/k-flotte');
    expect(screen.getByText('Archiv')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alle gelesen' })).toBeInTheDocument();
  });

  it('sucht ab zwei Zeichen und führt einen Treffer in seinen Thread', async () => {
    sucheNachrichten.mockResolvedValue([
      {
        id: 'antwort',
        channel_id: 'k-flotte',
        parent_id: 'wurzel',
        author_name: 'Tim Teamleitung',
        body: 'Schlüssel liegt im Büro.',
        created_at: '2026-10-17T07:00:00Z',
      },
    ]);
    const nutzer = userEvent.setup();
    zeige('/team');
    await screen.findByRole('heading', { name: 'Kanäle' });
    await nutzer.type(screen.getByRole('searchbox', { name: 'In Nachrichten suchen' }), 'Schlü');
    const treffer = await screen.findByRole('link', { name: /Schlüssel liegt im Büro/ });
    expect(treffer).toHaveAttribute('href', '/team/k-flotte/wurzel?nachricht=antwort');
    expect(sucheNachrichten).toHaveBeenCalledWith('Schlü');
  });
});

describe('Teamchat: Gespräch und Thread', () => {
  it('markiert beim Öffnen gelesen und zeigt kein „gelesen von“', async () => {
    fetchNachrichten.mockResolvedValue([
      nachricht({ mentions: [ANNA], reply_count: 1, last_reply_at: '2026-10-17T07:10:00Z' }),
    ]);
    zeige('/team/k-flotte');
    expect(await screen.findByText('Rad 3 steht im Depot Süd.')).toBeInTheDocument();
    expect(screen.getByText('Für dich')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^1 Antwort/ })).toHaveAttribute(
      'href',
      '/team/k-flotte/n1',
    );
    await vi.waitFor(() => expect(markiereGelesen).toHaveBeenCalledWith('k-flotte'));
    expect(screen.queryByText(/gelesen von|gesehen|online/i)).toBeNull();
  });

  it('markiert einen Thread mit neuer Erwähnung, auch nachdem der Kanal gelesen ist', async () => {
    fetchNachrichten
      .mockResolvedValueOnce([
        nachricht({ reply_count: 2, new_replies: 1, mentioned_in_new_replies: true }),
      ])
      .mockResolvedValue([nachricht({ reply_count: 2 })]);
    zeige('/team/k-flotte');
    expect(await screen.findByText('Für dich')).toBeInTheDocument();
  });

  it('sendet mit einer Erwähnung: @, Person, Senden', async () => {
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    await screen.findByRole('heading', { name: '# Allgemein' });
    const feld = screen.getByRole('textbox', { name: 'Nachricht an # Allgemein' });
    await nutzer.type(feld, 'Kannst du übernehmen?');
    await nutzer.click(screen.getByRole('button', { name: 'Jemanden erwähnen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Tim Teamleitung' }));
    expect(feld).toHaveValue('Kannst du übernehmen? @Tim Teamleitung ');
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    await vi.waitFor(() =>
      expect(sendeNachricht).toHaveBeenCalledWith({
        kanalId: 'k-allgemein',
        threadId: null,
        text: 'Kannst du übernehmen? @Tim Teamleitung ',
        erwaehnt: [TIM],
      }),
    );
    await vi.waitFor(() => expect(feld).toHaveValue(''));
  });

  it('antwortet im Thread in zwei Tipps und zeigt Gelöschtes ohne Namen', async () => {
    fetchNachrichten.mockResolvedValue([
      nachricht({
        id: 'wurzel',
        body: null,
        author_name: null,
        author_staff_member_id: null,
        removed_kind: 'owner',
        reply_count: 1,
      }),
      nachricht({ id: 'antwort', parent_id: 'wurzel', body: 'Erledigt.' }),
    ]);
    const nutzer = userEvent.setup();
    zeige('/team/k-flotte/wurzel');
    expect(await screen.findByText('Von der Praxisleitung entfernt.')).toBeInTheDocument();
    expect(screen.getByText('Ehemaliges Teammitglied')).toBeInTheDocument();
    await nutzer.type(screen.getByRole('textbox', { name: 'Antwort' }), 'Danke');
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    await vi.waitFor(() =>
      expect(sendeNachricht).toHaveBeenCalledWith(
        expect.objectContaining({ kanalId: 'k-flotte', threadId: 'wurzel', text: 'Danke' }),
      ),
    );
  });

  it('nimmt im Archiv nichts mehr an', async () => {
    zeige('/team/k-alt');
    expect(await screen.findByText('Archiviert – nur noch lesbar.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Senden' })).toBeNull();
  });

  it('bietet eigene Nachrichten zum Löschen an, fremde nur owner', async () => {
    fetchNachrichten.mockResolvedValue([
      nachricht({ id: 'eigen', own: true, author_staff_member_id: ANNA, body: 'Meins' }),
      nachricht({ id: 'fremd', body: 'Fremd' }),
    ]);
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    await screen.findByText('Meins');
    const knoepfe = screen.getAllByRole('button', { name: 'Weitere Aktionen zur Nachricht' });
    expect(knoepfe).toHaveLength(1);
    await nutzer.click(knoepfe[0]!);
    await nutzer.click(screen.getByRole('button', { name: 'Löschen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Ja, löschen' }));
    await vi.waitFor(() => expect(loescheNachricht).toHaveBeenCalledWith('eigen'));
  });

  it('lässt owner fremde Nachrichten im Kanal entfernen', async () => {
    fetchNachrichten.mockResolvedValue([nachricht({ id: 'fremd', body: 'Fremd' })]);
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein', ['owner']);
    await screen.findByText('Fremd');
    await nutzer.click(screen.getByRole('button', { name: 'Weitere Aktionen zur Nachricht' }));
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Entfernen' })).toBeInTheDocument();
  });
});

describe('Für dich und Threads wie bei Slack (ANN-614)', () => {
  it('zeigt Erwähnungen und Antworten mit Neuem und führt in den Thread', async () => {
    fetchAktivitaet.mockResolvedValue([
      {
        id: 'antwort',
        channel_id: 'k-flotte',
        channel_kind: 'channel',
        parent_id: 'wurzel',
        author_name: 'Tim Teamleitung',
        body: 'Rad 2 ist frei.',
        created_at: '2026-10-17T07:00:00Z',
        reason: 'mention',
        unread: true,
      },
    ]);
    zeige('/fuer-dich');
    const zeile = await screen.findByRole('link', { name: /Rad 2 ist frei/ });
    expect(zeile).toHaveAttribute('href', '/team/k-flotte/wurzel?nachricht=antwort');
    expect(within(zeile).getByText(/^Erwähnung · # Flotte · Tim Teamleitung/)).toBeInTheDocument();
    expect(within(zeile).getByText('Neu')).toBeInTheDocument();
  });

  it('sammelt Threads, denen man folgt, mit neuen Antworten', async () => {
    fetchThreads.mockResolvedValue([
      {
        id: 'wurzel',
        channel_id: 'k-rad',
        channel_kind: 'fleet',
        author_name: 'Anna Beispiel',
        body: 'Kette Rad 3',
        removed_kind: null,
        reply_count: 3,
        last_reply_at: '2026-10-17T07:00:00Z',
        new_replies: 2,
      },
    ]);
    zeige('/team/threads');
    const zeile = await screen.findByRole('link', { name: /Kette Rad 3/ });
    expect(zeile).toHaveAttribute('href', '/betrieb/flotte/nachrichten/wurzel');
    expect(within(zeile).getByText('2 neu')).toBeInTheDocument();
  });

  it('zieht im Gespräch Tagestrenner und die Linie „Neu“', async () => {
    fetchNachrichten.mockResolvedValue([
      nachricht({ id: 'alt', created_at: '2026-10-13T07:00:00Z', body: 'Alt' }),
      nachricht({ id: 'neu', created_at: new Date().toISOString(), body: 'Frisch', unread: true }),
    ]);
    zeige('/team/k-allgemein');
    await screen.findByText('Frisch');
    expect(screen.getByText('Heute')).toBeInTheDocument();
    expect(screen.getByText('Neu')).toBeInTheDocument();
  });
});

describe('Nachrichten der Radflotte (ANN-613)', () => {
  it('stehen nicht im Teamchat, sondern in der Radflotte, mit Threads dort', async () => {
    fetchNachrichten.mockResolvedValue([nachricht({ id: 'panne', reply_count: 1 })]);
    zeige('/betrieb/flotte/nachrichten');
    expect(
      await screen.findByRole('heading', { name: 'Nachrichten der Radflotte' }),
    ).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: /^1 Antwort/ })).toHaveAttribute(
      'href',
      '/betrieb/flotte/nachrichten/panne',
    );
    expect(
      screen.getByRole('textbox', { name: 'Nachricht an Nachrichten der Radflotte' }),
    ).toBeInTheDocument();
  });

  it('fehlen in der Gesprächsliste des Teamchats', async () => {
    zeige('/team');
    await screen.findByRole('heading', { name: 'Kanäle' });
    expect(screen.queryByText('Nachrichten der Radflotte')).toBeNull();
  });
});

describe('Teamchat: Direktnachricht', () => {
  it('öffnet in einem Tipp das Gespräch mit der Person', async () => {
    const nutzer = userEvent.setup();
    const { router } = zeige('/team/neu');
    await nutzer.click(await screen.findByRole('button', { name: 'Tim Teamleitung' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/team/k-direkt'));
    expect(oeffneDirekt).toHaveBeenCalledWith(TIM);
    // Kanäle legen nur owner und Teamleitung an (ANN-611).
    expect(screen.queryByText('Kanal anlegen')).toBeNull();
  });

  it('ist barrierefrei', async () => {
    zeige('/team/neu', ['team_lead']);
    await screen.findByRole('button', { name: 'Tim Teamleitung' });
    expect(screen.getAllByText('Kanal anlegen').length).toBeGreaterThan(0);
    await act(() => pruefeBarrierefreiheit(document.body));
  });
});
