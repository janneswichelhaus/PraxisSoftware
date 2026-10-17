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
      { path: '/team/:kanalId', element: <GespraechPage user={user} /> },
      { path: '/team/:kanalId/:threadId', element: <ThreadPage user={user} /> },
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
    const titel = await screen.findByRole('heading', { name: 'Gespräche' });
    const zeilen = within(titel.closest('section')!).getAllByRole('link');
    expect(zeilen.map((z) => z.textContent)).toEqual([
      expect.stringContaining('# Flotte'),
      expect.stringContaining('# Allgemein'),
      expect.stringContaining('Tim Teamleitung'),
    ]);
    expect(within(zeilen[0]!).getByText('2 neu, für dich')).toBeInTheDocument();
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
    await screen.findByRole('heading', { name: 'Gespräche' });
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
