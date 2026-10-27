import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { Outlet, RouterProvider, createMemoryRouter } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import { abmeldenAufraeumen } from '@/lib/abmelden';
import { SperrsicherungKontext, type Sicherung } from '@/lib/sperrsicherung';
import { Testrecorder, installiereAufnahme } from '@/lib/testaufnahme';
import type { CurrentUser, RoleKey } from '@/features/session/types';
import type * as TeamchatApi from './api';
import type { Kanal, Nachricht, Zaehler } from './api';

/**
 * Teamchat (TEAM-001, TEAM-002): Liste der Gespräche, Gespräch und Thread,
 * Senden über den Ausgang, Entwürfe je Konto, die Ansichten daneben. Was der
 * Server zulässt, prüfen `supabase/tests/teamchat*.test.ts`; hier geht es um
 * Wege und Tipps (Budgets der Spec) und darum, dass nichts über andere
 * erscheint - kein „gelesen von“, kein Status (ANN-609).
 *
 * jsdom misst nichts: Die Fläche hat hier eine Spalte wie am Telefon.
 */

const api = {
  fetchKanaele: vi.fn(),
  fetchAktivitaet: vi.fn(),
  fetchThreads: vi.fn(),
  fetchNachrichten: vi.fn(),
  fetchPersonen: vi.fn(),
  fetchAvatare: vi.fn(),
  ladeProfilbild: vi.fn(),
  fetchPersonenkarte: vi.fn(),
  fetchMitglieder: vi.fn(),
  fetchZaehler: vi.fn(),
  fetchGemerkt: vi.fn(),
  fetchGeplant: vi.fn(),
  fetchAngeheftet: vi.fn(),
  fetchDateien: vi.fn(),
  ladeAnhangHoch: vi.fn(),
  verwirfAnhang: vi.fn(),
  ladeAnhang: vi.fn(),
  sucheNachrichten: vi.fn(),
  sendeNachricht: vi.fn(),
  bearbeiteNachricht: vi.fn(),
  markiereGelesen: vi.fn(),
  markiereThreadGelesen: vi.fn(),
  oeffneDirekt: vi.fn(),
  oeffneGruppe: vi.fn(),
  legeKanalAn: vi.fn(),
  loescheNachricht: vi.fn(),
  aendereGemerkt: vi.fn(),
  planeNeu: vi.fn(),
  setzeEinstellungen: vi.fn(),
  reagiere: vi.fn(),
};

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof TeamchatApi>();
  const weiter =
    (name: keyof typeof api) =>
    (...a: unknown[]): unknown =>
      api[name](...a);
  return {
    ...actual,
    ...Object.fromEntries(Object.keys(api).map((name) => [name, weiter(name as keyof typeof api)])),
  };
});

const { TeamchatRahmen } = await import('./TeamchatRahmen');
const { GespraechPage } = await import('./GespraechPage');
const { NeuPage } = await import('./NeuPage');
const { ThreadsPage } = await import('./ThreadsPage');
const { GemerktPage } = await import('./GemerktPage');
const { EntwuerfePage } = await import('./EntwuerfePage');
const { SuchePage } = await import('./SuchePage');
const { FuerDichPage } = await import('./FuerDichPage');
const { FlottenNachrichtenPage } = await import('./FlottenNachrichtenPage');
const { TeamchatFehler } = await import('./api');
const { teamchatLeeren } = await import('./speicher');
const { anhaengen: entwurfAnhaengen, anhaengeLeeren } = await import('./entwurfsanhaenge');

const ANNA = '55555555-5555-4555-8555-000000000002';
const TIM = '55555555-5555-4555-8555-000000000004';
const OLIVIA = '55555555-5555-4555-8555-000000000003';

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
    member_names: null,
    member_count: null,
    unread: 0,
    mentions: 0,
    last_message_at: '2026-10-17T07:00:00Z',
    notify: 'all',
    starred: false,
    manageable: false,
    ...overrides,
  };
}

const KANAELE: Kanal[] = [
  kanal({}),
  kanal({ id: 'k-planung', name: 'Planung', description: null, unread: 2, mentions: 1 }),
  kanal({
    id: 'k-leitung',
    kind: 'private',
    name: 'Leitung',
    description: null,
    member_count: 2,
  }),
  kanal({
    id: 'k-direkt',
    kind: 'direct',
    name: null,
    description: null,
    partner_staff_member_id: TIM,
    partner_name: 'Tim Teamleitung',
    partner_active: true,
    unread: 3,
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
    created_at: '2026-10-17T07:00:00.123456+00:00',
    edited: false,
    removed_kind: null,
    also_in_channel: false,
    reply_count: 0,
    last_reply_at: null,
    mentions: [],
    own: false,
    new_replies: 0,
    mentioned_in_new_replies: false,
    unread: false,
    following: false,
    reactions: [],
    pinned: false,
    saved: false,
    root_author_name: null,
    root_body: null,
    attachments: [],
    ...overrides,
  };
}

const ZAEHLER: Zaehler = {
  badge: 0,
  unread_conversations: 0,
  threads_new: 1,
  activity_unread: 0,
  saved_open: 0,
  reminders_due: 0,
  scheduled: 0,
};

function konto(roles: RoleKey[] = ['therapist'], id = 'profil-anna'): CurrentUser {
  const basis = testUser(roles);
  return { ...basis, staffMemberId: ANNA, profile: { ...basis.profile, id } };
}

function zeige(pfad: string, user: CurrentUser = konto(), sicherungen?: Set<Sicherung>) {
  const router = createMemoryRouter(
    [
      {
        path: '/team',
        element: <TeamchatRahmen user={user} />,
        children: [
          { index: true, element: <GespraechPage /> },
          { path: 'neu', element: <NeuPage /> },
          { path: 'threads', element: <ThreadsPage /> },
          { path: 'gemerkt', element: <GemerktPage /> },
          { path: 'entwuerfe', element: <EntwuerfePage /> },
          { path: 'suche', element: <SuchePage /> },
          { path: ':kanalId', element: <GespraechPage /> },
          { path: ':kanalId/:threadId', element: <GespraechPage /> },
        ],
      },
      { path: '/fuer-dich', element: <FuerDichPage user={user} /> },
      { path: '/betrieb/flotte/nachrichten', element: <FlottenNachrichtenPage user={user} /> },
      {
        path: '/betrieb/flotte/nachrichten/:threadId',
        element: <FlottenNachrichtenPage user={user} />,
      },
    ],
    { initialEntries: [pfad] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const seiten = (
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
  // Mit `sicherungen` steht eine Sitzungssperre darüber (ADR-025 Punkt 4).
  const ansicht = render(
    sicherungen ? (
      <SperrsicherungKontext.Provider
        value={{
          meldeAn: (sicherung) => {
            sicherungen.add(sicherung);
            return () => sicherungen.delete(sicherung);
          },
        }}
      >
        {seiten}
      </SperrsicherungKontext.Provider>
    ) : (
      seiten
    ),
  );
  return { router, ansicht, client };
}

beforeEach(() => {
  teamchatLeeren();
  for (const fn of Object.values(api)) fn.mockReset();
  api.fetchKanaele.mockResolvedValue(KANAELE);
  api.fetchAktivitaet.mockResolvedValue([]);
  api.fetchThreads.mockResolvedValue([]);
  api.fetchNachrichten.mockResolvedValue([]);
  api.fetchPersonen.mockResolvedValue([
    { staff_member_id: TIM, name: 'Tim Teamleitung' },
    { staff_member_id: OLIVIA, name: 'Olivia Office' },
  ]);
  api.fetchMitglieder.mockResolvedValue([
    { staff_member_id: ANNA, name: 'Anna Beispiel', active: true },
    { staff_member_id: TIM, name: 'Tim Teamleitung', active: true },
  ]);
  api.fetchAvatare.mockResolvedValue([
    { staff_member_id: ANNA, color: 'ozean', picture_id: null, own: true },
    { staff_member_id: TIM, color: 'moos', picture_id: null },
    { staff_member_id: OLIVIA, color: 'pflaume', picture_id: null },
  ]);
  api.fetchZaehler.mockResolvedValue(ZAEHLER);
  api.fetchPersonenkarte.mockImplementation((id: string) =>
    Promise.resolve({
      staff_member_id: id,
      name: id === TIM ? 'Tim Teamleitung' : 'Anna Beispiel',
      roles: id === TIM ? ['team_lead', 'therapist'] : ['therapist'],
      active: true,
      own: id === ANNA,
    }),
  );
  api.fetchGemerkt.mockResolvedValue([]);
  api.fetchGeplant.mockResolvedValue([]);
  api.fetchAngeheftet.mockResolvedValue([]);
  api.fetchDateien.mockResolvedValue([]);
  api.verwirfAnhang.mockResolvedValue(undefined);
  api.sucheNachrichten.mockResolvedValue([]);
  api.sendeNachricht.mockImplementation((auftrag: { id: string }) => Promise.resolve(auftrag.id));
  api.bearbeiteNachricht.mockResolvedValue(undefined);
  api.markiereGelesen.mockResolvedValue(undefined);
  api.markiereThreadGelesen.mockResolvedValue(undefined);
  api.oeffneDirekt.mockResolvedValue('k-direkt');
  api.oeffneGruppe.mockResolvedValue('k-gruppe');
  api.legeKanalAn.mockResolvedValue('k-neu');
  api.loescheNachricht.mockResolvedValue(undefined);
  api.aendereGemerkt.mockResolvedValue(undefined);
  api.planeNeu.mockResolvedValue(undefined);
  api.setzeEinstellungen.mockResolvedValue(undefined);
  api.reagiere.mockResolvedValue(true);
});

describe('Teamchat: Gespräche (ANN-647)', () => {
  it('ordnet Kanäle und Direktnachrichten, Fettes zuerst, privat mit Schloss, Archiv eingeklappt', async () => {
    zeige('/team');
    const kanaele = (await screen.findByRole('heading', { name: 'Kanäle' })).closest('section')!;
    const zeilen = within(kanaele).getAllByRole('link');
    expect(zeilen.map((z) => z.textContent)).toEqual([
      expect.stringContaining('# Planung'),
      expect.stringContaining('# Allgemein'),
      expect.stringContaining('# Leitung'),
    ]);
    expect(within(zeilen[0]!).getByText('1 für dich')).toBeInTheDocument();
    expect(within(zeilen[2]!).getByText(/Leitung/)).toBeInTheDocument();
    const direkt = screen.getByRole('heading', { name: 'Direktnachrichten' }).closest('section')!;
    expect(within(direkt).getByRole('link', { name: /Tim Teamleitung/ })).toHaveAttribute(
      'href',
      '/team/k-direkt',
    );
    expect(within(direkt).getByText('3 neu')).toBeInTheDocument();
    expect(screen.getByText('Archiv')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Alle gelesen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Threads/ })).toHaveAttribute('href', '/team/threads');
    expect(await screen.findByText('1 neu')).toBeInTheDocument();
    // Das Gespräch der Radflotte steht in der Radflotte (ANN-613).
    expect(screen.queryByText('Nachrichten der Radflotte')).toBeNull();
  });

  it('zeigt Neues mit Zeichen und Wort, nicht nur fett - Stummes ohne Zahl (DESIGN.md Regel 5)', async () => {
    api.fetchKanaele.mockResolvedValue([
      kanal({ id: 'k-vertretung', name: 'Vertretungen', unread: 3 }),
      kanal({ id: 'k-sport', name: 'Sportgruppe', unread: 5, notify: 'none' }),
      kanal({ id: 'k-ruhig', name: 'Ruhig', unread: 2, notify: 'mentions' }),
    ]);
    zeige('/team');
    const vertretung = await screen.findByRole('link', { name: /# Vertretungen/ });
    expect(within(vertretung).getByText('3 neu')).toBeInTheDocument();
    const sport = screen.getByRole('link', { name: /# Sportgruppe/ });
    expect(within(sport).queryByText(/neu/)).toBeNull();
    expect(within(sport).getByText('Stumm')).toBeInTheDocument();
    // „Nur Erwähnungen“ zählt im Kanal nur Erwähnungen.
    expect(within(screen.getByRole('link', { name: /# Ruhig/ })).queryByText(/neu/)).toBeNull();
  });

  it('sucht aus der Liste: Wort, Enter, Treffer an seiner Stelle - ohne Wort in der Adresse', async () => {
    api.sucheNachrichten.mockResolvedValue([
      {
        id: 'antwort',
        channel_id: 'k-planung',
        channel_kind: 'channel',
        parent_id: 'wurzel',
        author_name: 'Tim Teamleitung',
        body: 'Schlüssel liegt im Büro.',
        created_at: '2026-10-17T07:00:00Z',
      },
    ]);
    const nutzer = userEvent.setup();
    const { router } = zeige('/team');
    await screen.findByRole('heading', { name: 'Kanäle' });
    await nutzer.type(
      screen.getByRole('searchbox', { name: 'In Nachrichten suchen' }),
      'Schlü{Enter}',
    );
    const treffer = await screen.findByRole('link', { name: /Schlüssel liegt im Büro/ });
    expect(treffer).toHaveAttribute(
      'href',
      '/team/k-planung/wurzel?nachricht=antwort&zurueck=%2Fteam%2Fsuche',
    );
    expect(router.state.location.pathname).toBe('/team/suche');
    expect(router.state.location.search).toBe('');
    expect(api.sucheNachrichten).toHaveBeenCalledWith({
      text: 'Schlü',
      kanalId: null,
      personId: null,
      ab: null,
    });

    // Vom Treffer führt der Pfeil zurück in die Treffer, nicht zur Liste der
    // Gespräche - der nächste Treffer ist einen Tipp entfernt (Praxis-Sichtung).
    await nutzer.click(treffer);
    const zurueck = await screen.findByRole('link', { name: 'Zurück zur Suche' });
    expect(zurueck).toHaveAttribute('href', '/team/suche');
    await nutzer.click(zurueck);
    expect(
      await screen.findByRole('link', { name: /Schlüssel liegt im Büro/ }),
    ).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'In Nachrichten suchen' })).toHaveValue('Schlü');
  });

  it('lässt nach einer Person nur mit Suchwort suchen (ANN-651)', async () => {
    const nutzer = userEvent.setup();
    zeige('/team/suche');
    const von = await screen.findByRole('combobox', { name: 'Von' });
    await within(von).findByRole('option', { name: 'Tim Teamleitung' });
    await nutzer.selectOptions(von, TIM);
    expect(screen.getByText('Nach einer Person nur mit Suchwort.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Suchen' })).toBeDisabled();
  });
});

describe('Teamchat: Bild und Farbe je Person (TEAM-006)', () => {
  it('setzt vor eine Nachricht die Initialen auf der Farbe der Person, angehängte ohne Bild', async () => {
    api.fetchNachrichten.mockResolvedValue([
      nachricht({}),
      nachricht({ id: 'n2', body: 'Und Rad 4 auch.', created_at: '2026-10-17T07:01:00Z' }),
      nachricht({
        id: 'n3',
        author_staff_member_id: OLIVIA,
        author_name: 'Olivia Office',
        body: 'Danke!',
        created_at: '2026-10-17T07:02:00Z',
      }),
    ]);
    zeige('/team/k-planung');
    await screen.findByText('Und Rad 4 auch.');
    await vi.waitFor(() =>
      expect(document.querySelector('.bg-person-pflaume')).toHaveTextContent('OO'),
    );
    const bilder = [...document.querySelectorAll('[data-nachricht] [data-personenbild]')];
    expect(bilder.map((b) => b.textContent)).toEqual(['TT', 'OO']);
    expect(bilder[0]).toHaveClass('bg-person-moos');
    // Vorlesesoftware hört den Namen einmal, nicht zweimal.
    for (const bild of bilder) expect(bild).toHaveAttribute('aria-hidden', 'true');
  });

  it('zeigt in der Liste das Bild der anderen Person und bei Gruppen die Zahl', async () => {
    api.fetchKanaele.mockResolvedValue([
      ...KANAELE,
      kanal({
        id: 'k-gruppe',
        kind: 'group',
        name: null,
        description: null,
        member_names: ['Olivia Office', 'Tim Teamleitung'],
        member_count: 3,
      }),
    ]);
    zeige('/team');
    const direkt = (await screen.findByRole('heading', { name: 'Direktnachrichten' })).closest(
      'section',
    )!;
    const tim = within(direkt).getByRole('link', { name: /^Tim Teamleitung/ });
    await vi.waitFor(() =>
      expect(tim.querySelector('[data-personenbild]')).toHaveClass('bg-person-moos'),
    );
    expect(tim.querySelector('[data-personenbild]')).toHaveTextContent('TT');
    const gruppe = within(direkt).getByRole('link', { name: /^Olivia Office, Tim Teamleitung/ });
    expect(gruppe.querySelector('[data-personenbild="gruppe"]')).toHaveTextContent('3');
  });

  it('führt über das eigene Bild zu Bild und Farbe in „Mein Konto“', async () => {
    zeige('/team');
    const ich = await screen.findByRole('link', { name: 'Eigenes Bild und eigene Farbe ändern' });
    expect(ich).toHaveAttribute('href', '/mein-konto');
    await vi.waitFor(() =>
      expect(ich.querySelector('[data-personenbild]')).toHaveClass('bg-person-ozean'),
    );
  });

  it('zeigt ein Profilbild statt der Initialen, umrahmt von der Farbe der Person', async () => {
    api.fetchAvatare.mockResolvedValue([
      { staff_member_id: TIM, color: 'moos', picture_id: 'bild-tim' },
    ]);
    api.ladeProfilbild.mockResolvedValue('blob:tim');
    api.fetchNachrichten.mockResolvedValue([nachricht({})]);
    zeige('/team/k-planung');
    await vi.waitFor(() =>
      expect(document.querySelector('[data-nachricht] [data-personenbild]')).toHaveAttribute(
        'src',
        'blob:tim',
      ),
    );
    const bild = document.querySelector('[data-nachricht] [data-personenbild]')!;
    expect(bild).toHaveClass('outline-person-moos');
    expect(bild).toHaveAttribute('alt', '');
    expect(api.ladeProfilbild).toHaveBeenCalledWith('bild-tim');
  });

  it('bleibt ohne Farben lesbar: Initialen auf Schiefer', async () => {
    api.fetchAvatare.mockRejectedValue(new TeamchatFehler('Kein Netz', true));
    api.fetchNachrichten.mockResolvedValue([nachricht({})]);
    zeige('/team/k-planung');
    expect(await screen.findByText('Rad 3 steht im Depot Süd.')).toBeInTheDocument();
    expect(document.querySelector('[data-nachricht] [data-personenbild]')).toHaveClass(
      'bg-person-schiefer',
    );
  });
});

describe('Teamchat: Bilder in den Listen (TEAM-008)', () => {
  /** Das Bild in der Zeile, die den Text trägt. */
  function bildIn(zeile: HTMLElement) {
    return zeile.querySelector('[data-personenbild]');
  }

  it('setzt in „Für dich“ vor Erinnerung und Erwähnung das Bild der Person, die schrieb', async () => {
    api.fetchGemerkt.mockResolvedValue([
      {
        id: 'g1',
        channel_id: 'k-planung',
        channel_kind: 'channel',
        parent_id: null,
        author_staff_member_id: TIM,
        author_name: 'Tim Teamleitung',
        body: 'Belege bis Freitag',
        created_at: '2026-10-17T07:00:00Z',
        remind_at: '2026-10-18T06:00:00Z',
        done: false,
        due: true,
      },
    ]);
    api.fetchAktivitaet.mockResolvedValue([
      {
        id: 'antwort',
        channel_id: 'k-planung',
        channel_kind: 'channel',
        parent_id: 'wurzel',
        author_staff_member_id: OLIVIA,
        author_name: 'Olivia Office',
        body: 'Rad 2 ist frei.',
        created_at: '2026-10-17T07:00:00Z',
        reason: 'mention',
        unread: true,
      },
    ]);
    zeige('/fuer-dich');
    const erwaehnung = await screen.findByRole('link', { name: /Rad 2 ist frei/ });
    await vi.waitFor(() => expect(bildIn(erwaehnung)).toHaveClass('bg-person-pflaume'));
    expect(bildIn(erwaehnung)).toHaveTextContent('OO');
    expect(bildIn(erwaehnung)).toHaveAttribute('aria-hidden', 'true');
    const erinnerung = screen.getByRole('link', { name: /Belege bis Freitag/ });
    expect(bildIn(erinnerung)).toHaveClass('bg-person-moos');
  });

  it('zeigt an Threads Bild und Namen der Person, die fragte - an entfernten niemanden', async () => {
    api.fetchThreads.mockResolvedValue([
      {
        id: 'wurzel',
        channel_id: 'k-planung',
        channel_kind: 'channel',
        author_staff_member_id: TIM,
        author_name: 'Tim Teamleitung',
        body: 'Kette Rad 3',
        removed_kind: null,
        reply_count: 3,
        last_reply_at: '2026-10-17T07:00:00Z',
        new_replies: 2,
      },
      {
        id: 'weg',
        channel_id: 'k-planung',
        channel_kind: 'channel',
        author_staff_member_id: null,
        author_name: null,
        body: null,
        removed_kind: 'owner',
        reply_count: 1,
        last_reply_at: '2026-10-16T07:00:00Z',
        new_replies: 0,
      },
    ]);
    zeige('/team/threads');
    const zeile = await screen.findByRole('link', { name: /Kette Rad 3/ });
    expect(
      within(zeile).getByText(/^# Planung · Tim Teamleitung · 3 Antworten/),
    ).toBeInTheDocument();
    await vi.waitFor(() => expect(bildIn(zeile)).toHaveTextContent('TT'));
    const entfernt = screen.getByRole('link', { name: /entfernt/i });
    expect(bildIn(entfernt)).toBeNull();
    expect(within(entfernt).queryByText(/Ehemaliges Teammitglied/)).toBeNull();
  });

  it('zeigt Treffer der Suche und Gemerktes mit dem Bild der Person', async () => {
    api.sucheNachrichten.mockResolvedValue([
      {
        id: 'treffer',
        channel_id: 'k-planung',
        channel_kind: 'channel',
        parent_id: null,
        author_staff_member_id: OLIVIA,
        author_name: 'Olivia Office',
        body: 'Schlüssel liegt im Büro.',
        created_at: '2026-10-17T07:00:00Z',
      },
    ]);
    const nutzer = userEvent.setup();
    zeige('/team');
    await screen.findByRole('heading', { name: 'Kanäle' });
    await nutzer.type(
      screen.getByRole('searchbox', { name: 'In Nachrichten suchen' }),
      'Schlü{Enter}',
    );
    const treffer = await screen.findByRole('link', { name: /Schlüssel liegt im Büro/ });
    await vi.waitFor(() => expect(bildIn(treffer)).toHaveClass('bg-person-pflaume'));
  });

  it('setzt vor Angeheftetes in den Details das kleine Bild', async () => {
    api.fetchAngeheftet.mockResolvedValue([
      {
        id: 'n1',
        parent_id: null,
        author_staff_member_id: TIM,
        author_name: 'Tim Teamleitung',
        body: 'Schlüssel für Rad 3 im Büro',
        created_at: '2026-10-17T07:00:00Z',
      },
    ]);
    const nutzer = userEvent.setup();
    zeige('/team/k-planung');
    await nutzer.click(await screen.findByRole('button', { name: 'Details' }));
    const zeile = await screen.findByRole('button', { name: /Schlüssel für Rad 3 im Büro/ });
    await vi.waitFor(() => expect(bildIn(zeile)).toHaveClass('bg-person-moos', 'size-6'));
  });
});

describe('Teamchat: Personenkarte (TEAM-009, ANN-668)', () => {
  it('öffnet mit einem Tipp auf das Bild die Karte und von dort die Direktnachricht', async () => {
    api.fetchNachrichten.mockResolvedValue([nachricht({})]);
    const nutzer = userEvent.setup();
    const { router } = zeige('/team/k-planung');
    await nutzer.click(await screen.findByRole('button', { name: 'Karte von Tim Teamleitung' }));
    const karte = await screen.findByRole('dialog', { name: 'Tim Teamleitung' });
    expect(await within(karte).findByText('Teamleitung · Therapeut:in')).toBeInTheDocument();
    expect(karte.querySelector('[data-personenbild]')).toHaveClass('size-24', 'bg-person-moos');
    // Nichts über das Verhalten der Person (§20).
    expect(within(karte).queryByText(/aktiv|online|zuletzt|abwesend/i)).toBeNull();
    await nutzer.click(within(karte).getByRole('button', { name: 'Direktnachricht' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/team/k-direkt'));
    expect(api.oeffneDirekt).toHaveBeenCalledWith(TIM);
    expect(screen.queryByRole('dialog', { name: 'Tim Teamleitung' })).toBeNull();
  });

  it('führt von der eigenen Karte zu Bild und Farbe, nicht in eine Direktnachricht', async () => {
    api.fetchNachrichten.mockResolvedValue([
      nachricht({ author_staff_member_id: ANNA, author_name: 'Anna Beispiel', own: true }),
    ]);
    const nutzer = userEvent.setup();
    zeige('/team/k-planung');
    await nutzer.click(await screen.findByRole('button', { name: 'Karte von Anna Beispiel' }));
    const karte = await screen.findByRole('dialog', { name: 'Anna Beispiel' });
    expect(
      await within(karte).findByRole('link', { name: 'Bild und Farbe ändern' }),
    ).toHaveAttribute('href', '/mein-konto');
    expect(within(karte).queryByRole('button', { name: 'Direktnachricht' })).toBeNull();
  });

  it('sagt bei Ausgeschiedenen nur, dass sie nicht mehr teilnehmen', async () => {
    // Wer nicht teilnimmt, kommt vom Server ohne Namen: Die Karte trägt den
    // Namen, der an der Nachricht stand.
    api.fetchPersonenkarte.mockResolvedValue({
      staff_member_id: TIM,
      name: null,
      roles: [],
      active: false,
      own: false,
    });
    api.fetchNachrichten.mockResolvedValue([nachricht({})]);
    const nutzer = userEvent.setup();
    zeige('/team/k-planung');
    await nutzer.click(await screen.findByRole('button', { name: 'Karte von Tim Teamleitung' }));
    const karte = await screen.findByRole('dialog', { name: 'Tim Teamleitung' });
    expect(await within(karte).findByText('Nimmt nicht am Teamchat teil.')).toBeInTheDocument();
    expect(within(karte).queryByRole('button', { name: 'Direktnachricht' })).toBeNull();
    await nutzer.click(within(karte).getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByRole('dialog', { name: 'Tim Teamleitung' })).toBeNull();
  });

  it('öffnet die Karte auch aus den Mitgliedern in den Details', async () => {
    const nutzer = userEvent.setup();
    const { router } = zeige('/team/k-planung');
    await nutzer.click(await screen.findByRole('button', { name: 'Details' }));
    await nutzer.click(await screen.findByRole('button', { name: /^Tim Teamleitung/ }));
    const karte = await screen.findByRole('dialog', { name: 'Tim Teamleitung' });
    await nutzer.click(await within(karte).findByRole('button', { name: 'Direktnachricht' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/team/k-direkt'));
    // Mit der Direktnachricht schließen auch die Details.
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  });
});

describe('Teamchat: Gespräch (ANN-640, ANN-641)', () => {
  it('markiert nur bis zur gezeigten Nachricht gelesen und zeigt kein „gelesen von“', async () => {
    api.fetchNachrichten.mockResolvedValue([
      nachricht({ mentions: [ANNA], reply_count: 1, last_reply_at: '2026-10-17T07:10:00Z' }),
    ]);
    zeige('/team/k-planung');
    expect(await screen.findByText('Rad 3 steht im Depot Süd.')).toBeInTheDocument();
    expect(screen.getByText('Für dich')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^1 Antwort/ })).toHaveAttribute(
      'href',
      '/team/k-planung/n1',
    );
    // Die Zeit bleibt Text mit Mikrosekunden - gelesen genau bis dahin.
    await vi.waitFor(() =>
      expect(api.markiereGelesen).toHaveBeenCalledWith(
        'k-planung',
        '2026-10-17T07:00:00.123456+00:00',
      ),
    );
    expect(api.markiereThreadGelesen).not.toHaveBeenCalled();
    expect(screen.queryByText(/gelesen von|gesehen|online/i)).toBeNull();
  });

  it('öffnet einen Thread und markiert nur den Thread, nie das Gespräch', async () => {
    api.fetchNachrichten.mockImplementation((_kanal: string, thread: string | null) =>
      Promise.resolve(
        thread
          ? [
              nachricht({ id: 'wurzel', reply_count: 1 }),
              nachricht({
                id: 'antwort',
                parent_id: 'wurzel',
                body: 'Erledigt.',
                created_at: '2026-10-17T07:05:00.5+00:00',
                unread: true,
              }),
            ]
          : [nachricht({ id: 'wurzel', reply_count: 1, new_replies: 1 })],
      ),
    );
    zeige('/team/k-planung/wurzel');
    expect(await screen.findByRole('heading', { name: 'Thread' })).toBeInTheDocument();
    expect(await screen.findByText('Erledigt.')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(api.markiereThreadGelesen).toHaveBeenCalledWith(
        'wurzel',
        '2026-10-17T07:05:00.5+00:00',
      ),
    );
    expect(api.markiereGelesen).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Zurück zu # Planung' })).toHaveAttribute(
      'href',
      '/team/k-planung',
    );
  });

  it('sendet mit Erwähnung in drei Tipps: @, Person, Senden - mit einer Kennung des Geräts', async () => {
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    const feld = await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' });
    await nutzer.type(feld, 'Kannst du übernehmen?');
    await nutzer.click(screen.getByRole('button', { name: 'Jemanden erwähnen' }));
    // Sich selbst erwähnt man nicht.
    expect(screen.queryByRole('button', { name: 'Anna Beispiel' })).toBeNull();
    await nutzer.click(await screen.findByRole('button', { name: 'Tim Teamleitung' }));
    expect(feld).toHaveValue('Kannst du übernehmen? @Tim Teamleitung ');
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    await vi.waitFor(() =>
      expect(api.sendeNachricht).toHaveBeenCalledWith(
        expect.objectContaining({
          id: expect.stringMatching(/^[0-9a-f-]{36}$/) as unknown,
          kanalId: 'k-allgemein',
          threadId: null,
          text: 'Kannst du übernehmen? @Tim Teamleitung',
          erwaehnt: [TIM],
          alle: false,
          um: null,
        }),
      ),
    );
    expect(feld).toHaveValue('');
  });

  it('öffnet die Namen auch bei getipptem „@“ und setzt den ganzen Namen ein (Praxis-Sichtung)', async () => {
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    const feld = await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' });
    await screen.findByRole('button', { name: 'Jemanden erwähnen' });
    await nutzer.type(feld, 'Hallo @te');
    // „te“ passt zum zweiten Wort von „Tim Teamleitung“; @alle nicht.
    const namen = await screen.findByRole('list', { name: 'Erwähnen' });
    expect(within(namen).queryByRole('button', { name: /@alle/ })).toBeNull();
    await nutzer.click(within(namen).getByRole('button', { name: 'Tim Teamleitung' }));
    expect(feld).toHaveValue('Hallo @Tim Teamleitung ');
    expect(screen.queryByRole('list', { name: 'Erwähnen' })).toBeNull();
    await nutzer.type(feld, 'kommst du?');
    // Ein „@“ ohne passenden Namen öffnet nichts.
    await nutzer.type(feld, ' @xy');
    expect(screen.queryByRole('list', { name: 'Erwähnen' })).toBeNull();
    await nutzer.clear(feld);
    await nutzer.type(feld, '@ti{Tab}');
    expect(feld).toHaveValue('@Tim Teamleitung ');
    await nutzer.type(feld, 'kommst du?');
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    await vi.waitFor(() =>
      expect(api.sendeNachricht).toHaveBeenCalledWith(
        expect.objectContaining({ text: '@Tim Teamleitung kommst du?', erwaehnt: [TIM] }),
      ),
    );
  });

  it('setzt die Schreibmarke gleich hinter den Namen - auch wenn das nächste Bild spät kommt', async () => {
    // Unter Last kam das nächste Bild erst nach dem ersten Buchstaben; der
    // landete dann hinter dem Rest („…ommst du?k“).
    const wartend: FrameRequestCallback[] = [];
    const bild = vi.spyOn(window, 'requestAnimationFrame').mockImplementation((rueckruf) => {
      wartend.push(rueckruf);
      return wartend.length;
    });
    try {
      const nutzer = userEvent.setup();
      zeige('/team/k-allgemein');
      const feld = await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' });
      await screen.findByRole('button', { name: 'Jemanden erwähnen' });
      await nutzer.type(feld, 'Hallo @ti{Tab}');
      await nutzer.type(feld, 'k', { skipClick: true });
      for (const rueckruf of wartend.splice(0)) rueckruf(0);
      await nutzer.type(feld, 'ommst du?', { skipClick: true });
      expect(feld).toHaveValue('Hallo @Tim Teamleitung kommst du?');
    } finally {
      bild.mockRestore();
    }
  });

  it('macht ein eindeutiges „@Vorname“ beim Senden zur Erwähnung (Praxis-Sichtung, Runde 2)', async () => {
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    const feld = await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' });
    await screen.findByRole('button', { name: 'Jemanden erwähnen' });
    // Die Namensliste schließt beim Weiterschreiben; gesendet wird trotzdem mit Erwähnung.
    await nutzer.type(feld, '@Tim bitte Schlüssel holen');
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    await vi.waitFor(() =>
      expect(api.sendeNachricht).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '@Tim Teamleitung bitte Schlüssel holen',
          erwaehnt: [TIM],
        }),
      ),
    );
  });

  it('hält eine Nachricht ohne Netz im Ausgang und sendet sie mit derselben Kennung erneut', async () => {
    api.sendeNachricht
      .mockRejectedValueOnce(new TeamchatFehler('Kein Netz', true))
      .mockImplementation((auftrag: { id: string }) => Promise.resolve(auftrag.id));
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    const feld = await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' });
    await nutzer.type(feld, 'Bin gleich da');
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    expect(await screen.findByText(/Kein Netz – wird gesendet/)).toBeInTheDocument();
    expect(screen.getByText('Bin gleich da')).toBeInTheDocument();
    expect(feld).toHaveValue('');
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await Promise.resolve();
    });
    await vi.waitFor(() => expect(api.sendeNachricht).toHaveBeenCalledTimes(2));
    const [erst] = api.sendeNachricht.mock.calls[0] as [{ id: string }];
    const [zweit] = api.sendeNachricht.mock.calls[1] as [{ id: string }];
    expect(zweit.id).toBe(erst.id);
  });

  it('lässt eine abgelehnte Nachricht mit Grund stehen, bis sie zurück ins Feld geht', async () => {
    api.sendeNachricht.mockRejectedValue(
      new TeamchatFehler('Das Gespräch ist archiviert und nimmt nichts mehr an.', false),
    );
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    const feld = await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' });
    await nutzer.type(feld, 'Wichtig');
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    expect(
      await screen.findByText(/Nicht gesendet: Das Gespräch ist archiviert/),
    ).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    expect(feld).toHaveValue('Wichtig');
    expect(screen.queryByText(/Nicht gesendet/)).toBeNull();

    // Verwerfen fragt nach (DESIGN.md 9.16) - der Text ist danach fort.
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Verwerfen' }));
    expect(screen.getByText(/Nicht gesendet/)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Ja, verwerfen' }));
    expect(screen.queryByText(/Nicht gesendet/)).toBeNull();
    expect(screen.queryByText('Wichtig')).toBeNull();
  });

  it('plant eine Nachricht; eine Ablehnung steht mit dem Weg zurück ins Feld da (ANN-643)', async () => {
    api.sendeNachricht.mockRejectedValue(
      new TeamchatFehler('Planen geht eine Minute bis 30 Tage im Voraus.', false),
    );
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    const feld = await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' });
    await nutzer.type(feld, 'Morgen früh');
    await nutzer.click(screen.getByRole('button', { name: 'Später senden' }));
    const vorschlag = within(await screen.findByRole('list', { name: 'Vorschläge' })).getAllByRole(
      'button',
    )[0]!;
    await nutzer.click(vorschlag);
    await vi.waitFor(() =>
      expect(api.sendeNachricht).toHaveBeenCalledWith(
        expect.objectContaining({ text: 'Morgen früh', um: expect.any(String) as unknown }),
      ),
    );
    // Geplantes steht nicht im Gespräch - die Ablehnung steht an der Eingabe.
    expect(
      await screen.findByText(/Nicht geplant: Planen geht eine Minute bis 30 Tage/),
    ).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Zurück ins Feld' }));
    expect(feld).toHaveValue('Morgen früh');
  });

  it('lässt nicht in die Vergangenheit planen', async () => {
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    const feld = await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' });
    await nutzer.type(feld, 'Zu spät');
    await nutzer.click(screen.getByRole('button', { name: 'Später senden' }));
    fireEvent.change(await screen.findByLabelText('Tag'), { target: { value: '2020-01-01' } });
    await nutzer.click(screen.getByRole('button', { name: 'Planen' }));
    expect(
      await screen.findByText('Planen geht eine Minute bis 30 Tage im Voraus.'),
    ).toBeInTheDocument();
    expect(api.sendeNachricht).not.toHaveBeenCalled();
    expect(feld).toHaveValue('Zu spät');
  });

  it('hält Entwürfe je Gespräch und Konto - beim Wechsel wandert nichts mit', async () => {
    const nutzer = userEvent.setup();
    const { router, ansicht } = zeige('/team/k-allgemein');
    await nutzer.type(
      await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' }),
      'Halb fertig',
    );
    await act(() => router.navigate('/team/k-planung'));
    expect(await screen.findByRole('textbox', { name: 'Nachricht an # Planung' })).toHaveValue('');
    await act(() => router.navigate('/team/k-allgemein'));
    expect(await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' })).toHaveValue(
      'Halb fertig',
    );
    ansicht.unmount();

    // Ein anderes Konto im selben Tab sieht den Entwurf nicht.
    zeige('/team/k-allgemein', konto(['office'], 'profil-olivia'));
    expect(await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' })).toHaveValue(
      '',
    );
  });

  it('räumt Entwürfe beim Abmelden ab', async () => {
    const nutzer = userEvent.setup();
    const { ansicht } = zeige('/team/k-allgemein');
    await nutzer.type(
      await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' }),
      'Vertraulich',
    );
    ansicht.unmount();
    teamchatLeeren();
    zeige('/team/k-allgemein');
    expect(await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' })).toHaveValue(
      '',
    );
  });

  it('nimmt im Archiv nichts mehr an', async () => {
    zeige('/team/k-alt');
    expect(await screen.findByText('Archiviert – nur noch lesbar.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Senden' })).toBeNull();
  });

  it('bietet an der eigenen Nachricht Löschen an, fremde entfernt nur owner', async () => {
    api.fetchNachrichten.mockResolvedValue([
      nachricht({
        id: 'eigen',
        own: true,
        author_staff_member_id: ANNA,
        author_name: 'Anna Beispiel',
        body: 'Meins',
      }),
      nachricht({ id: 'fremd', body: 'Fremd', created_at: '2026-10-17T08:00:00Z' }),
    ]);
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    await screen.findByText('Meins');
    await nutzer.click(
      screen.getByRole('button', { name: 'Handlungen zur Nachricht von Tim Teamleitung' }),
    );
    expect(screen.queryByRole('button', { name: 'Löschen' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Entfernen' })).toBeNull();
    await nutzer.keyboard('{Escape}');
    await nutzer.click(
      screen.getByRole('button', { name: 'Handlungen zur Nachricht von Anna Beispiel' }),
    );
    await nutzer.click(screen.getByRole('button', { name: 'Löschen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Ja, löschen' }));
    await vi.waitFor(() => expect(api.loescheNachricht).toHaveBeenCalledWith('eigen'));
  });

  it('reagiert in einem Tipp an der Reaktion - mit Namen, ohne Zeitpunkt', async () => {
    api.fetchNachrichten.mockResolvedValue([
      nachricht({
        reactions: [
          { reaction: 'daumen', count: 2, own: false, names: ['Olivia Office', 'Tim Teamleitung'] },
        ],
      }),
    ]);
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    const gruppe = await screen.findByRole('group', { name: 'Reaktionen' });
    const daumen = within(gruppe).getByRole('button', {
      name: /Daumen hoch: Olivia Office, Tim Teamleitung/,
    });
    await nutzer.click(daumen);
    await vi.waitFor(() => expect(api.reagiere).toHaveBeenCalledWith('n1', 'daumen'));

    // Ohne Netz scheitert der Tipp nicht still (Praxis-Sichtung, Runde 2).
    api.reagiere.mockRejectedValueOnce(
      new TeamchatFehler('Kein Netz – nicht angekommen. Bitte gleich noch einmal.', true),
    );
    await nutzer.click(daumen);
    expect(
      await screen.findByText('Kein Netz – nicht angekommen. Bitte gleich noch einmal.'),
    ).toBeInTheDocument();
  });

  it('stellt die Stufe der Benachrichtigung in den Details ein', async () => {
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    await nutzer.click(await screen.findByRole('button', { name: 'Details' }));
    await nutzer.click(await screen.findByRole('button', { name: 'Stumm' }));
    await vi.waitFor(() =>
      expect(api.setzeEinstellungen).toHaveBeenCalledWith('k-allgemein', { stufe: 'none' }),
    );
  });

  it('ist barrierefrei', async () => {
    api.fetchNachrichten.mockResolvedValue([
      nachricht({ reply_count: 2, new_replies: 1, mentioned_in_new_replies: true, pinned: true }),
    ]);
    zeige('/team/k-planung');
    await screen.findByText('Rad 3 steht im Depot Süd.');
    await act(() => pruefeBarrierefreiheit(document.body));
  });
});

describe('Teamchat: Ansichten neben den Gesprächen', () => {
  it('sammelt Threads, denen man folgt - die der Radflotte führen in die Radflotte', async () => {
    api.fetchThreads.mockResolvedValue([
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
    expect(zeile).toHaveAttribute(
      'href',
      '/betrieb/flotte/nachrichten/wurzel?zurueck=%2Fteam%2Fthreads',
    );
    expect(within(zeile).getByText('2 neu')).toBeInTheDocument();
  });

  it('zeigt Für später mit fälliger Erinnerung und hakt in einem Tipp ab', async () => {
    api.fetchGemerkt.mockResolvedValue([
      {
        id: 'g1',
        channel_id: 'k-planung',
        channel_kind: 'channel',
        parent_id: null,
        author_name: 'Tim Teamleitung',
        body: 'Belege bis Freitag',
        created_at: '2026-10-17T07:00:00Z',
        remind_at: '2026-10-18T06:00:00Z',
        done: false,
        due: true,
      },
      {
        id: 'g2',
        channel_id: 'k-allgemein',
        channel_kind: 'channel',
        parent_id: null,
        author_name: 'Olivia Office',
        body: 'Die Belegliste',
        created_at: '2026-10-16T10:07:00Z',
        remind_at: '2099-10-19T13:07:00Z',
        done: false,
        due: false,
      },
    ]);
    const nutzer = userEvent.setup();
    zeige('/team/gemerkt');
    const zeile = await screen.findByRole('link', { name: /Belege bis Freitag/ });
    expect(zeile).toHaveAttribute('href', '/team/k-planung?nachricht=g1&zurueck=%2Fteam%2Fgemerkt');
    // Fälliges steht als eigener Abschnitt oben, ohne Abzeichen in der Zeile.
    const faellig = screen.getByRole('heading', { name: 'Fällig (1)' }).closest('section')!;
    expect(within(faellig).getByRole('link', { name: /Belege bis Freitag/ })).toBe(zeile);
    // Eine kommende Erinnerung steht in der Nebenzeile, nicht rechts neben
    // dem Text - sonst bleibt bei 375 px vom Text nur „Die Bel…“.
    const spaeter = screen.getByRole('link', { name: /Die Belegliste/ });
    expect(
      within(spaeter).getByText(/^Erinnerung .* · # Allgemein · Olivia Office · /),
    ).toBeInTheDocument();
    expect(within(spaeter).queryByText('Fällig')).toBeNull();
    await nutzer.click(within(zeile.closest('li')!).getByRole('button', { name: 'Erledigt' }));
    await vi.waitFor(() =>
      expect(api.aendereGemerkt).toHaveBeenCalledWith('g1', { erledigt: true }),
    );
  });

  it('zeigt Entwürfe dieser Sitzung und Geplantes zum Sofortsenden', async () => {
    api.fetchGeplant.mockResolvedValue([
      {
        id: 'p1',
        channel_id: 'k-allgemein',
        channel_kind: 'channel',
        body: 'Teamtreffen 8 Uhr',
        created_at: '2026-10-19T05:30:00Z',
      },
    ]);
    const nutzer = userEvent.setup();
    const { router } = zeige('/team/k-planung');
    await nutzer.type(
      await screen.findByRole('textbox', { name: 'Nachricht an # Planung' }),
      'Noch offen',
    );
    await act(() => router.navigate('/team/entwuerfe'));
    expect(await screen.findByRole('link', { name: /Noch offen/ })).toHaveAttribute(
      'href',
      '/team/k-planung',
    );
    await nutzer.click(await screen.findByRole('button', { name: /Teamtreffen 8 Uhr/ }));
    await nutzer.click(screen.getByRole('button', { name: 'Jetzt senden' }));
    await vi.waitFor(() => expect(api.planeNeu).toHaveBeenCalledWith('p1', null));

    // Verwerfen fragt nach - ungesendeter Text ist danach fort (DESIGN.md 9.16).
    await nutzer.click(screen.getByRole('button', { name: 'Verwerfen Entwurf in # Planung' }));
    expect(screen.getByRole('link', { name: /Noch offen/ })).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Ja, verwerfen' }));
    await vi.waitFor(() => expect(screen.queryByRole('link', { name: /Noch offen/ })).toBeNull());
  });

  it('öffnet eine Direktnachricht in einem Tipp; Kanäle legt nur die Leitung an', async () => {
    const nutzer = userEvent.setup();
    const { router } = zeige('/team/neu');
    await nutzer.click(await screen.findByRole('button', { name: 'Tim Teamleitung' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/team/k-direkt'));
    expect(api.oeffneDirekt).toHaveBeenCalledWith(TIM);
    expect(screen.queryByRole('button', { name: 'Kanal' })).toBeNull();
  });

  it('öffnet eine Gruppe mit zwei weiteren Personen', async () => {
    const nutzer = userEvent.setup();
    const { router } = zeige('/team/neu');
    await nutzer.click(await screen.findByRole('button', { name: 'Gruppe' }));
    await nutzer.click(screen.getByRole('checkbox', { name: 'Tim Teamleitung' }));
    await nutzer.click(screen.getByRole('checkbox', { name: 'Olivia Office' }));
    await nutzer.click(screen.getByRole('button', { name: 'Gruppe öffnen (3)' }));
    await vi.waitFor(() => expect(router.state.location.pathname).toBe('/team/k-gruppe'));
    expect(api.oeffneGruppe).toHaveBeenCalledWith([TIM, OLIVIA]);
  });

  it('legt als Teamleitung einen privaten Kanal mit Mitgliedern an und ist barrierefrei', async () => {
    const nutzer = userEvent.setup();
    zeige('/team/neu', konto(['team_lead']));
    await nutzer.click(await screen.findByRole('button', { name: 'Kanal' }));
    await nutzer.type(screen.getByRole('textbox', { name: 'Name' }), 'Leitung');
    await nutzer.click(screen.getByRole('checkbox', { name: 'Privat – nur Mitglieder lesen' }));
    await nutzer.click(screen.getByRole('checkbox', { name: 'Olivia Office' }));
    await act(() => pruefeBarrierefreiheit(document.body));
    await nutzer.click(screen.getByRole('button', { name: 'Kanal anlegen' }));
    await vi.waitFor(() =>
      expect(api.legeKanalAn).toHaveBeenCalledWith({
        name: 'Leitung',
        beschreibung: '',
        privat: true,
        mitglieder: [OLIVIA],
      }),
    );
  });
});

describe('Für dich (ANN-614, ANN-646)', () => {
  it('zeigt fällige Erinnerungen, Erwähnungen und Antworten und führt an die Stelle', async () => {
    api.fetchGemerkt.mockResolvedValue([
      {
        id: 'g1',
        channel_id: 'k-planung',
        channel_kind: 'channel',
        parent_id: null,
        author_name: 'Tim Teamleitung',
        body: 'Belege bis Freitag',
        created_at: '2026-10-17T07:00:00Z',
        remind_at: '2026-10-18T06:00:00Z',
        done: false,
        due: true,
      },
    ]);
    api.fetchAktivitaet.mockResolvedValue([
      {
        id: 'antwort',
        channel_id: 'k-planung',
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
    expect(await screen.findByRole('heading', { name: /Erinnerungen/ })).toBeInTheDocument();
    const zeile = await screen.findByRole('link', { name: /Rad 2 ist frei/ });
    expect(zeile).toHaveAttribute(
      'href',
      '/team/k-planung/wurzel?nachricht=antwort&zurueck=%2Ffuer-dich',
    );
    expect(within(zeile).getByText(/^Erwähnung · # Planung · Tim Teamleitung/)).toBeInTheDocument();
    expect(within(zeile).getByText('Neu')).toBeInTheDocument();
  });
});

describe('Für dich ohne Netz (DESIGN.md Regel 8)', () => {
  it('sagt, wenn die Erinnerungen nicht laden - nie „Nichts für dich“', async () => {
    api.fetchGemerkt.mockRejectedValue(new Error('aus'));
    zeige('/fuer-dich');
    expect(
      await screen.findByText('Die Erinnerungen konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Nichts für dich')).toBeNull();
  });
});

describe('Gespräch und Thread unter zwei Routen (ANN-648)', () => {
  it('baut die Seite beim Öffnen und Schließen eines Threads nicht neu auf', async () => {
    // Am Rechner steht das Gespräch neben dem Thread; zwei Routen mit
    // derselben Komponente an derselben Stelle behalten sie (React Router).
    let aufgebaut = 0;
    function Probe() {
      useEffect(() => {
        aufgebaut += 1;
      }, []);
      return null;
    }
    const router = createMemoryRouter(
      [
        {
          path: '/team',
          element: <Outlet />,
          children: [
            { path: ':kanalId', element: <Probe /> },
            { path: ':kanalId/:threadId', element: <Probe /> },
          ],
        },
      ],
      { initialEntries: ['/team/k-planung'] },
    );
    render(<RouterProvider router={router} />);
    await act(() => router.navigate('/team/k-planung/wurzel'));
    await act(() => router.navigate('/team/k-planung'));
    expect(aufgebaut).toBe(1);
  });
});

describe('Nachrichten der Radflotte (ANN-613)', () => {
  it('stehen in der Radflotte, mit Threads dort und eigener Eingabe', async () => {
    api.fetchNachrichten.mockResolvedValue([nachricht({ id: 'panne', reply_count: 1 })]);
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
});

describe('Anhänge im Teamchat (TEAM-003, ADR-017 Abschnitt M)', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:vorschau');
    URL.revokeObjectURL = vi.fn();
  });

  const pdf = () => new File(['%PDF-1.7'], 'Dienstplan.pdf', { type: 'application/pdf' });
  const foto = (name = 'Speiche.png') => new File(['png'], name, { type: 'image/png' });

  it('hängt eine Datei in zwei Tipps an und sendet sie ohne Text mit - planen geht dann nicht', async () => {
    const nutzer = userEvent.setup();
    api.ladeAnhangHoch.mockResolvedValue({
      id: 'a1',
      name: 'Dienstplan.pdf',
      mime_type: 'application/pdf',
      byte_size: 2048,
      verified: false,
    });
    zeige('/team/k-allgemein');
    await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' });
    expect(screen.getByRole('button', { name: 'Senden' })).toBeDisabled();

    await nutzer.upload(screen.getByLabelText('Foto oder PDF anhängen'), pdf());
    expect(await screen.findByText('PDF · 2 KB')).toBeInTheDocument();
    expect(api.ladeAnhangHoch).toHaveBeenCalledWith(
      'k-allgemein',
      expect.any(File),
      'Dienstplan.pdf',
      undefined,
      expect.any(AbortSignal),
    );
    expect(screen.getByRole('button', { name: 'Später senden' })).toBeDisabled();

    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    await vi.waitFor(() =>
      expect(api.sendeNachricht).toHaveBeenCalledWith(
        expect.objectContaining({
          text: '',
          um: null,
          anhaenge: [expect.objectContaining({ id: 'a1', name: 'Dienstplan.pdf' })],
        }),
      ),
    );
    expect(screen.queryByText('PDF · 2 KB')).toBeNull();
  });

  it('zeigt „Lädt“, ohne Netz „Noch einmal“ und entfernt auch am Server', async () => {
    const nutzer = userEvent.setup();
    let fertig: (wert: unknown) => void = () => undefined;
    api.ladeAnhangHoch
      .mockReturnValueOnce(new Promise((aufloesen) => (fertig = aufloesen)))
      .mockRejectedValueOnce(
        new TeamchatFehler('Nicht hochgeladen – kein Netz? Bitte noch einmal.', true),
      )
      .mockResolvedValueOnce({
        id: 'a3',
        name: 'Reifen.png',
        mime_type: 'image/png',
        byte_size: 4096,
        verified: false,
      });
    zeige('/team/k-allgemein');
    const feld = await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' });
    await nutzer.type(feld, 'Schaden am Rad');
    await nutzer.upload(screen.getByLabelText('Foto oder PDF anhängen'), foto());
    expect(await screen.findByText('Lädt')).toBeInTheDocument();
    // „Senden“ wartet nicht auf das Hochladen (TEAM-005, ANN-654).
    expect(screen.getByRole('button', { name: 'Senden' })).toBeEnabled();
    fertig({
      id: 'a2',
      name: 'Speiche.png',
      mime_type: 'image/png',
      byte_size: 3072,
      verified: false,
    });
    expect(await screen.findByText('Foto · 3 KB')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Speiche.png' })).toHaveAttribute(
      'src',
      'blob:vorschau',
    );
    expect(screen.getByRole('button', { name: 'Senden' })).toBeEnabled();

    await nutzer.upload(screen.getByLabelText('Foto oder PDF anhängen'), foto('Reifen.png'));
    // Der Grund steht in voller Länge unter der Zeile, nicht gekürzt daneben.
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Nicht hochgeladen – kein Netz? Bitte noch einmal.',
    );
    // Am Netz gescheitert: Die Nachricht könnte im Ausgang darauf warten.
    expect(screen.getByRole('button', { name: 'Senden' })).toBeEnabled();
    await nutzer.click(screen.getByRole('button', { name: 'Noch einmal' }));
    expect(await screen.findByText('Foto · 4 KB')).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Anhang entfernen: Speiche.png' }));
    await vi.waitFor(() => expect(api.verwirfAnhang).toHaveBeenCalledWith('a2'));
    expect(screen.queryByText('Foto · 3 KB')).toBeNull();
  });

  it('nimmt höchstens fünf Anhänge je Nachricht', async () => {
    const nutzer = userEvent.setup();
    api.ladeAnhangHoch.mockImplementation((_kanal: string, datei: File, name: string) =>
      Promise.resolve({ id: name, name, mime_type: datei.type, byte_size: 1024, verified: false }),
    );
    zeige('/team/k-allgemein');
    await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' });
    await nutzer.upload(
      screen.getByLabelText('Foto oder PDF anhängen'),
      [1, 2, 3, 4, 5, 6].map((n) => foto(`Bild ${n}.png`)),
    );
    expect(await screen.findByText('Höchstens 5 Anhänge je Nachricht.')).toBeInTheDocument();
    expect(api.ladeAnhangHoch).toHaveBeenCalledTimes(5);
    expect(screen.getByRole('button', { name: 'Anhängen' })).toBeDisabled();
  });

  it('zeigt Anhänge einer Nachricht ohne Vorschaubild und öffnet erst auf Tipp im Fenster, ohne Herunterladen', async () => {
    const nutzer = userEvent.setup();
    api.fetchNachrichten.mockResolvedValue([
      nachricht({
        body: '',
        attachments: [
          {
            id: 'x1',
            name: 'Speiche.jpg',
            mime_type: 'image/jpeg',
            byte_size: 3072,
            verified: false,
            duration_seconds: null,
          },
          {
            id: 'x2',
            name: 'Plan.pdf',
            mime_type: 'application/pdf',
            byte_size: 1024,
            verified: true,
            duration_seconds: null,
          },
        ],
      }),
    ]);
    api.ladeAnhang.mockImplementation((id: string) =>
      Promise.resolve(
        id === 'x2'
          ? new Blob(['%PDF-1.4'], { type: 'application/pdf' })
          : new Blob(['jpg'], { type: 'image/jpeg' }),
      ),
    );
    zeige('/team/k-planung');
    const anhaenge = await screen.findByRole('list', { name: 'Anhänge' });
    const zeile = within(anhaenge).getByRole('button', { name: /Speiche\.jpg/ });
    // ADR-017 Punkt 51: ob am Server geprüft, steht an der Datei.
    expect(zeile).toHaveTextContent('Foto · 3 KB · nicht serverseitig geprüft');
    expect(within(anhaenge).getByRole('button', { name: /Plan\.pdf/ })).toHaveTextContent(
      /PDF · 1 KB$/,
    );
    expect(screen.queryByRole('img', { name: 'Speiche.jpg' })).toBeNull();
    expect(api.ladeAnhang).not.toHaveBeenCalled();

    await nutzer.click(zeile);
    const fenster = await screen.findByRole('dialog', { name: 'Speiche.jpg' });
    expect(await within(fenster).findByRole('img', { name: 'Speiche.jpg' })).toBeInTheDocument();
    expect(api.ladeAnhang).toHaveBeenCalledWith('x1');
    expect(
      within(fenster).getByText('Foto · 3 KB · nicht serverseitig geprüft'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/herunterladen/i)).toBeNull();
    const schliessen = within(fenster).getAllByRole('button', { name: 'Schließen' });
    await nutzer.click(schliessen[schliessen.length - 1]!);
    expect(screen.queryByRole('dialog', { name: 'Speiche.jpg' })).toBeNull();

    // Ein PDF im Rahmen ohne die Leiste des Betrachters (Herunterladen, Drucken).
    await nutzer.click(within(anhaenge).getByRole('button', { name: /Plan\.pdf/ }));
    expect(await screen.findByTitle('Plan.pdf')).toHaveAttribute(
      'src',
      expect.stringMatching(/#toolbar=0$/),
    );
  });

  it('sagt es, wenn das Gerät kein PDF in der Seite zeigt - statt eines leeren Rahmens', async () => {
    const nutzer = userEvent.setup();
    // jsdom kennt die Eigenschaft nicht; Chrome unter Android meldet false.
    Object.defineProperty(navigator, 'pdfViewerEnabled', { configurable: true, get: () => false });
    try {
      api.fetchNachrichten.mockResolvedValue([
        nachricht({
          attachments: [
            {
              id: 'x2',
              name: 'Plan.pdf',
              mime_type: 'application/pdf',
              byte_size: 1024,
              verified: false,
              duration_seconds: null,
            },
          ],
        }),
      ]);
      zeige('/team/k-planung');
      await nutzer.click(await screen.findByRole('button', { name: /Plan\.pdf/ }));
      expect(
        await screen.findByText('Dieses Gerät zeigt PDF nicht in der App an.'),
      ).toBeInTheDocument();
      expect(api.ladeAnhang).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(navigator, 'pdfViewerEnabled');
    }
  });

  it('listet die Dateien des Gesprächs in den Details', async () => {
    const nutzer = userEvent.setup();
    api.fetchDateien.mockResolvedValue([
      {
        id: 'd1',
        message_id: 'n1',
        parent_id: null,
        display_name: 'Dienstplan.pdf',
        mime_type: 'application/pdf',
        byte_size: 245760,
        created_at: '2026-10-17T07:00:00+00:00',
        author_name: 'Tim Teamleitung',
        verified: false,
      },
    ]);
    zeige('/team/k-allgemein');
    await nutzer.click(await screen.findByRole('button', { name: 'Details' }));
    expect(await screen.findByRole('heading', { name: /^Dateien/ })).toBeInTheDocument();
    expect(await screen.findByText('Dienstplan.pdf')).toBeInTheDocument();
    expect(
      screen.getByText(/^PDF · 240 KB · nicht serverseitig geprüft · Tim Teamleitung · /),
    ).toBeInTheDocument();
    expect(api.fetchDateien).toHaveBeenCalledWith('k-allgemein');
  });

  it('zeigt in den Details zuerst zehn Dateien und den Rest auf Wunsch', async () => {
    const nutzer = userEvent.setup();
    api.fetchDateien.mockResolvedValue(
      Array.from({ length: 12 }, (_, i) => ({
        id: `d${i}`,
        message_id: `n${i}`,
        parent_id: null,
        display_name: `Plan ${i + 1}.pdf`,
        mime_type: 'application/pdf',
        byte_size: 1024,
        created_at: '2026-10-17T07:00:00+00:00',
        author_name: 'Tim Teamleitung',
        verified: true,
      })),
    );
    zeige('/team/k-allgemein');
    await nutzer.click(await screen.findByRole('button', { name: 'Details' }));
    expect(await screen.findByRole('heading', { name: 'Dateien (12)' })).toBeInTheDocument();
    expect(screen.getByText('Plan 10.pdf')).toBeInTheDocument();
    expect(screen.queryByText('Plan 11.pdf')).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Alle 12 zeigen' }));
    expect(screen.getByText('Plan 12.pdf')).toBeInTheDocument();
  });
});

describe('Sprachnachrichten im Teamchat (TEAM-004, ADR-017 Abschnitt N)', () => {
  let aufnahme: ReturnType<typeof installiereAufnahme>;
  let jetzt = Date.parse('2026-10-18T17:34:20Z');

  beforeEach(() => {
    aufnahme = installiereAufnahme();
    jetzt = Date.parse('2026-10-18T17:34:20Z');
    // Die Dauer misst das Gerät (ANN-655) - hier die nachgestellte Uhr.
    vi.spyOn(Date, 'now').mockImplementation(() => jetzt);
    URL.createObjectURL = vi.fn(() => 'blob:ton');
    URL.revokeObjectURL = vi.fn();
    api.ladeAnhangHoch.mockImplementation(
      (_kanal: string, datei: Blob, name: string, dauerS?: number) =>
        Promise.resolve({
          id: 's1',
          name,
          mime_type: datei.type,
          byte_size: 2048,
          verified: true,
          duration_seconds: dauerS === undefined ? null : Math.round(dauerS),
        }),
    );
  });

  afterEach(() => {
    aufnahme.entfernen();
    vi.restoreAllMocks();
  });

  const SPRACHE = { name: 'Sprachnachricht aufnehmen' } as const;

  /**
   * Die Sitzungssperre ruft ihre Sicherungen und wartet - wie in der App
   * außerhalb von `act`, damit die Seite dabei weiterzeichnen kann. Liefert
   * die Antworten und ob die Aufnahme bei der Freigabe schon am Entwurf hing.
   */
  async function sperren(sicherungen: Set<Sicherung>) {
    const stand: { antworten: unknown; angehaengt: boolean } = {
      antworten: 'wartet noch',
      angehaengt: false,
    };
    // Nur der Aufruf in `act`; gewartet wird danach, damit die Seite zeichnet.
    act(() => {
      void Promise.all([...sicherungen].map((sicherung) => sicherung())).then((antworten) => {
        stand.antworten = antworten;
        stand.angehaengt = api.ladeAnhangHoch.mock.calls.length > 0;
      });
    });
    await act(() => new Promise((fertig) => setTimeout(fertig, 200)));
    return stand;
  }

  it('nimmt in vier Tipps auf und sendet: Gespräch, Mikrofon, Fertig, Senden', async () => {
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' });

    await nutzer.click(screen.getByRole('button', SPRACHE));
    // Sichtbar mit ihrer Zeit, mit dem Hinweis aus Punkt 85 - und ohne
    // „Senden“, solange aufgenommen wird.
    expect(await screen.findByRole('status')).toHaveTextContent('Aufnahme 0:00');
    expect(
      screen.getByText(
        'Höchstens zwei Minuten. Keine Gespräche mit Patient:innen und keine Befunde – die gehören in die Akte.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Senden' })).toBeNull();
    expect(aufnahme.mikrofon.anfragen).toEqual([{ audio: true }]);
    expect(Testrecorder.alle[0]?.mimeType).toBe('audio/webm;codecs=opus');
    // Schreiben geht nebenher, Senden erst nach der Aufnahme - auch mit Strg+Enter.
    await nutzer.type(
      screen.getByRole('textbox', { name: 'Nachricht an # Allgemein' }),
      'Bin gleich da{Control>}{Enter}{/Control}',
    );
    expect(api.sendeNachricht).not.toHaveBeenCalled();

    jetzt += 42_000;
    await nutzer.click(screen.getByRole('button', { name: 'Fertig' }));
    expect(await screen.findByText('0:42 · 2 KB')).toBeInTheDocument();
    expect(api.ladeAnhangHoch).toHaveBeenCalledWith(
      'k-allgemein',
      expect.any(Blob),
      expect.stringMatching(/^Sprachnachricht \d{2}\.\d{2}\., \d{2}:\d{2}$/),
      42,
      expect.any(AbortSignal),
    );
    expect(aufnahme.mikrofon.spuren.every((spur) => spur.beendet)).toBe(true);

    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    await vi.waitFor(() =>
      expect(api.sendeNachricht).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Bin gleich da',
          anhaenge: [expect.objectContaining({ id: 's1', duration_seconds: 42 })],
        }),
      ),
    );
  });

  it('läuft am Rechner weiter, wenn man das offene Gespräch in der Liste antippt', async () => {
    // Am Rechner zeigt `/team` gleich ein Gespräch; der Tipp darauf in der
    // Liste wechselt nur die Adresse. Baute React die Fläche dabei neu auf,
    // ging die Aufnahme verloren - in der CI ein wackeliger Ablauftest.
    const breite = window.innerWidth;
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1280 });
    const laeuft = () =>
      screen.queryAllByRole('status').some((s) => /^Aufnahme \d/.test(s.textContent ?? ''));
    try {
      const nutzer = userEvent.setup();
      zeige('/team');
      await screen.findByRole('textbox', { name: 'Nachricht an # Planung' });
      await nutzer.click(screen.getByRole('button', SPRACHE));
      await vi.waitFor(() => expect(laeuft()).toBe(true));

      await nutzer.click(
        within(screen.getByRole('navigation', { name: 'Gespräche' })).getByRole('link', {
          name: /# Planung/,
        }),
      );
      expect(screen.getByRole('textbox', { name: 'Nachricht an # Planung' })).toBeInTheDocument();
      expect(laeuft()).toBe(true);
      expect(aufnahme.mikrofon.spuren.some((spur) => spur.beendet)).toBe(false);
    } finally {
      Object.defineProperty(window, 'innerWidth', { configurable: true, value: breite });
    }
  });

  it('endet nach zwei Minuten von selbst und hängt an, was da ist (Punkt 83)', async () => {
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    await nutzer.click(await screen.findByRole('button', SPRACHE));
    expect(await screen.findByRole('status')).toHaveTextContent('Aufnahme 0:00');
    jetzt += 125_000;
    // Die Uhr der Aufnahme schaut alle 250 ms auf die Zeit.
    await act(() => new Promise((fertig) => setTimeout(fertig, 300)));
    expect(api.ladeAnhangHoch).toHaveBeenCalledWith(
      'k-allgemein',
      expect.any(Blob),
      expect.stringMatching(/^Sprachnachricht /),
      120,
      expect.any(AbortSignal),
    );
    expect(aufnahme.mikrofon.spuren.every((spur) => spur.beendet)).toBe(true);
  });

  it('verwirft erst nach Rückfrage und hängt dann nichts an', async () => {
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    await nutzer.click(await screen.findByRole('button', SPRACHE));
    await nutzer.click(await screen.findByRole('button', { name: 'Verwerfen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Ja, verwerfen' }));
    expect(await screen.findByRole('button', { name: 'Senden' })).toBeDisabled();
    expect(api.ladeAnhangHoch).not.toHaveBeenCalled();
    expect(aufnahme.mikrofon.spuren.every((spur) => spur.beendet)).toBe(true);
  });

  it('sagt, was zu tun ist, wenn das Mikrofon nicht freigegeben wird', async () => {
    const nutzer = userEvent.setup();
    aufnahme.mikrofon.verweigere();
    zeige('/team/k-allgemein');
    await nutzer.click(await screen.findByRole('button', SPRACHE));
    expect(
      await screen.findByText(
        'Kein Zugriff auf das Mikrofon. Bitte im Browser erlauben – oder schreiben.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Senden' })).toBeInTheDocument();
  });

  it('bietet das Mikrofon nur an, wo der Server das Format nimmt', async () => {
    // Nur OGG: Das nimmt der Server nicht (Punkt 84) - kein Knopf ins Leere.
    Testrecorder.unterstuetzt = (typ) => typ.startsWith('audio/ogg');
    zeige('/team/k-allgemein');
    await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' });
    expect(screen.queryByRole('button', SPRACHE)).toBeNull();
  });

  it('übergibt eine laufende Aufnahme vor der Sitzungssperre an den Entwurf', async () => {
    const nutzer = userEvent.setup();
    const sicherungen = new Set<Sicherung>();
    // Wie im Browser kommen die letzten Daten erst nach dem Stopp - die Sperre
    // muss auf sie warten, sonst gibt sie die Seite frei, bevor sie am Entwurf
    // hängen.
    vi.spyOn(Testrecorder.prototype, 'stop').mockImplementationOnce(function (this: Testrecorder) {
      // Der zweite Aufruf geht an den echten Stopp.
      setTimeout(() => this.stop(), 10);
    });
    zeige('/team/k-allgemein', konto(), sicherungen);
    await nutzer.click(await screen.findByRole('button', SPRACHE));
    expect(await screen.findByRole('status')).toHaveTextContent('Aufnahme');
    jetzt += 12_000;
    const gesperrt = await sperren(sicherungen);
    expect(gesperrt.antworten).toEqual([true]);
    expect(gesperrt.angehaengt).toBe(true);
    expect(aufnahme.mikrofon.spuren.every((spur) => spur.beendet)).toBe(true);
    expect(api.ladeAnhangHoch).toHaveBeenCalledWith(
      'k-allgemein',
      expect.any(Blob),
      expect.stringMatching(/^Sprachnachricht /),
      12,
      expect.any(AbortSignal),
    );
  });

  it('beendet die Aufnahme, sobald ein Fenster darüber aufgeht - nichts läuft verdeckt weiter', async () => {
    // Zweitreview TEAM-004b, B1: Am Telefon deckt ein Fenster die Anzeige ab.
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    await nutzer.click(await screen.findByRole('button', SPRACHE));
    expect(await screen.findByRole('status')).toHaveTextContent('Aufnahme');
    jetzt += 9_000;
    await nutzer.click(screen.getByRole('button', { name: 'Details' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    await vi.waitFor(() =>
      expect(aufnahme.mikrofon.spuren.every((spur) => spur.beendet)).toBe(true),
    );
    // Was aufgenommen war, hängt am Entwurf wie nach „Fertig“.
    expect(api.ladeAnhangHoch).toHaveBeenCalledWith(
      'k-allgemein',
      expect.any(Blob),
      expect.stringMatching(/^Sprachnachricht /),
      9,
      expect.any(AbortSignal),
    );
  });

  it('hängt die Aufnahme auch an, wenn der Entwurf inzwischen voll ist (Zweitreview TEAM-005)', async () => {
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    await nutzer.click(await screen.findByRole('button', SPRACHE));
    expect(await screen.findByRole('status')).toHaveTextContent('Aufnahme');
    // Etwa „Bearbeiten“ an einer wartenden Nachricht füllt den Entwurf.
    act(() => {
      entwurfAnhaengen(
        'profil-anna',
        'k-allgemein',
        null,
        [1, 2, 3, 4, 5].map((n) => ({
          datei: new Blob(['x'], { type: 'application/pdf' }),
          name: `${n}.pdf`,
        })),
      );
    });
    jetzt += 5_000;
    await nutzer.click(screen.getByRole('button', { name: 'Fertig' }));
    await vi.waitFor(() =>
      expect(api.ladeAnhangHoch).toHaveBeenCalledWith(
        'k-allgemein',
        expect.any(Blob),
        expect.stringMatching(/^Sprachnachricht /),
        5,
        expect.any(AbortSignal),
      ),
    );
    expect(
      screen.getByText('Höchstens 5 Anhänge je Nachricht – bitte entfernen, was zu viel ist.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Senden' })).toBeDisabled();
  });

  it('nimmt nicht auf, solange ein Fenster offen ist', async () => {
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    await nutzer.click(await screen.findByRole('button', { name: 'Details' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    // jsdom kennt `inert` nicht - der Tipp käme im Browser gar nicht an.
    await nutzer.click(screen.getByRole('button', SPRACHE));
    await vi.waitFor(() => {
      expect(aufnahme.mikrofon.spuren).toHaveLength(1);
      expect(aufnahme.mikrofon.spuren[0]!.beendet).toBe(true);
    });
    expect(screen.queryByText(/^Aufnahme \d/)).toBeNull();
    expect(api.ladeAnhangHoch).not.toHaveBeenCalled();
  });

  it('lässt die Sperre nicht warten, wenn „Verwerfen“ schon unterwegs ist', async () => {
    // Zweitreview TEAM-004b, B2: Der letzte Stopp kommt erst nach der Sperre.
    const nutzer = userEvent.setup();
    const sicherungen = new Set<Sicherung>();
    vi.spyOn(Testrecorder.prototype, 'stop').mockImplementationOnce(function (this: Testrecorder) {
      setTimeout(() => this.stop(), 20);
    });
    zeige('/team/k-allgemein', konto(), sicherungen);
    await nutzer.click(await screen.findByRole('button', SPRACHE));
    await nutzer.click(await screen.findByRole('button', { name: 'Verwerfen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Ja, verwerfen' }));
    expect((await sperren(sicherungen)).antworten).toEqual([true]);
    expect(aufnahme.mikrofon.spuren.every((spur) => spur.beendet)).toBe(true);
    expect(api.ladeAnhangHoch).not.toHaveBeenCalled();
  });

  it('bricht ab, wenn die Sperre kommt, während das Mikrofon noch öffnet', async () => {
    const nutzer = userEvent.setup();
    const sicherungen = new Set<Sicherung>();
    aufnahme.mikrofon.halteAn();
    zeige('/team/k-allgemein', konto(), sicherungen);
    await nutzer.click(await screen.findByRole('button', SPRACHE));
    expect(await screen.findByText('Mikrofon wird geöffnet …')).toBeInTheDocument();
    expect((await sperren(sicherungen)).antworten).toEqual([true]);
    await act(async () => {
      aufnahme.mikrofon.gibFrei();
      await Promise.resolve();
    });
    expect(aufnahme.mikrofon.spuren.every((spur) => spur.beendet)).toBe(true);
    expect(api.ladeAnhangHoch).not.toHaveBeenCalled();
  });

  it('schickt nichts ab, wenn im Menü der Büroklammer getippt wird', async () => {
    // Die Knöpfe stehen im Formular der Eingabe: ohne `type="button"` sendeten
    // sie den Text (gefunden beim Bau von TEAM-004).
    const nutzer = userEvent.setup();
    zeige('/team/k-allgemein');
    const feld = await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' });
    await nutzer.type(feld, 'Schaden am Rad');
    await nutzer.click(screen.getByRole('button', { name: 'Anhängen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Foto oder PDF wählen' }));
    expect(api.sendeNachricht).not.toHaveBeenCalled();
    expect(feld).toHaveValue('Schaden am Rad');
  });

  const sprachnachricht = {
    id: 'v1',
    name: 'Sprachnachricht 17.10., 09:00',
    mime_type: 'audio/webm',
    byte_size: 98304,
    verified: true,
    duration_seconds: 42,
  };

  it('spielt eine Sprachnachricht erst auf Tipp, ohne Herunterladen und ohne Abspielen anderswo', async () => {
    const nutzer = userEvent.setup();
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
    api.fetchNachrichten.mockResolvedValue([
      nachricht({ body: '', attachments: [sprachnachricht] }),
    ]);
    api.ladeAnhang.mockResolvedValue(new Blob(['ton'], { type: 'audio/webm' }));
    zeige('/team/k-planung');
    const zeile = await screen.findByRole('button', { name: /Sprachnachricht 17\.10\., 09:00/ });
    expect(zeile).toHaveTextContent('0:42 · 96 KB');
    expect(api.ladeAnhang).not.toHaveBeenCalled();

    await nutzer.click(zeile);
    const fenster = await screen.findByRole('dialog', { name: 'Sprachnachricht 17.10., 09:00' });
    await vi.waitFor(() => expect(fenster.querySelector('audio')).not.toBeNull());
    const ton = fenster.querySelector('audio')!;
    expect(api.ladeAnhang).toHaveBeenCalledWith('v1');
    expect(ton).toHaveAttribute('controls');
    expect(ton).toHaveAttribute('controlslist', 'nodownload noremoteplayback');
    expect(ton).not.toHaveAttribute('autoplay');
    expect(ton).toHaveAttribute('src', 'blob:ton');
    // Kein Kontextmenü mit „Audio speichern“ (false: abgewiesen).
    expect(fireEvent.contextMenu(ton)).toBe(false);
    expect(within(fenster).getByText('0:42 · 96 KB')).toBeInTheDocument();

    // Abspielen und Anhalten über einen eigenen Knopf in voller Breite - das
    // Dreieck des Browsers ist mit Handschuh zu klein (Praxis-Review TEAM-004).
    const spielen = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined);
    const anhalten = vi.spyOn(HTMLMediaElement.prototype, 'pause').mockReturnValue(undefined);
    const knopf = within(fenster).getByRole('button', { name: 'Abspielen' });
    expect(knopf).toHaveClass('w-full', 'h-12');
    await nutzer.click(knopf);
    expect(spielen).toHaveBeenCalledTimes(1);
    fireEvent.play(ton);
    vi.spyOn(HTMLMediaElement.prototype, 'paused', 'get').mockReturnValue(false);
    await nutzer.click(within(fenster).getByRole('button', { name: 'Anhalten' }));
    expect(anhalten).toHaveBeenCalledTimes(1);
    fireEvent.pause(ton);
    expect(within(fenster).getByRole('button', { name: 'Abspielen' })).toBeInTheDocument();

    // Spielt das Gerät das Format doch nicht, steht der Satz statt des Elements.
    fireEvent.error(ton);
    const satz = await within(fenster).findByText(
      'Dieses Gerät spielt die Sprachnachricht nicht ab – bitte am Rechner anhören.',
    );
    // Als Warnung mit Zeichen, nicht als graue Angabe (DESIGN.md Regel 5).
    expect(satz).toHaveTextContent(/^!/);
    expect(fenster.querySelector('audio')).toBeNull();
  });

  it('bietet im Fenster „Erneut versuchen“, wenn das Laden am Netz scheitert', async () => {
    const nutzer = userEvent.setup();
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
    api.fetchNachrichten.mockResolvedValue([
      nachricht({ body: '', attachments: [sprachnachricht] }),
    ]);
    api.ladeAnhang
      .mockRejectedValueOnce(new TeamchatFehler('Kein Netz.', true))
      .mockResolvedValueOnce(new Blob(['ton'], { type: 'audio/webm' }));
    zeige('/team/k-planung');
    await nutzer.click(
      await screen.findByRole('button', { name: /Sprachnachricht 17\.10\., 09:00/ }),
    );
    const fenster = await screen.findByRole('dialog', { name: 'Sprachnachricht 17.10., 09:00' });
    expect(
      await within(fenster).findByText('Der Anhang konnte nicht geöffnet werden.'),
    ).toBeInTheDocument();
    // Ein neuer Versuch holt eine neue Freigabe (ADR-017 Punkt 15).
    await nutzer.click(within(fenster).getByRole('button', { name: 'Erneut versuchen' }));
    await vi.waitFor(() => expect(fenster.querySelector('audio')).not.toBeNull());
    expect(api.ladeAnhang).toHaveBeenCalledTimes(2);
  });

  it('versucht es ohne Netz gleich und holt die Freigabe später nicht nach', async () => {
    // Angehalten holte TanStack die Freigabe beim nächsten Netz nach, auch
    // wenn das Fenster längst zu ist (Zweitreview TEAM-005, Runde 4).
    const nutzer = userEvent.setup();
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
    api.fetchNachrichten.mockResolvedValue([
      nachricht({ body: '', attachments: [sprachnachricht] }),
    ]);
    api.ladeAnhang.mockRejectedValue(new TeamchatFehler('Kein Netz.', true));
    zeige('/team/k-planung');
    const zeile = await screen.findByRole('button', { name: /Sprachnachricht 17\.10\., 09:00/ });
    act(() => onlineManager.setOnline(false));
    try {
      await nutzer.click(zeile);
      const fenster = await screen.findByRole('dialog', {
        name: 'Sprachnachricht 17.10., 09:00',
      });
      expect(
        await within(fenster).findByText('Der Anhang konnte nicht geöffnet werden.'),
      ).toBeInTheDocument();
      await nutzer.click(within(fenster).getAllByRole('button', { name: 'Schließen' })[0]!);
    } finally {
      act(() => onlineManager.setOnline(true));
    }
    await act(() => new Promise((weiter) => setTimeout(weiter, 50)));
    expect(api.ladeAnhang).toHaveBeenCalledTimes(1);
  });

  it('lädt im offenen Fenster nicht neu, wenn alle Abfragen neu laden', async () => {
    // Die Sitzungssperre ruft nach dem Entsperren `invalidateQueries()`: Ein
    // zweites Laden holte eine zweite Freigabe (ADR-017 Punkt 15).
    const nutzer = userEvent.setup();
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
    api.fetchNachrichten.mockResolvedValue([
      nachricht({ body: '', attachments: [sprachnachricht] }),
    ]);
    api.ladeAnhang.mockResolvedValue(new Blob(['ton'], { type: 'audio/webm' }));
    const { client } = zeige('/team/k-planung');
    await nutzer.click(
      await screen.findByRole('button', { name: /Sprachnachricht 17\.10\., 09:00/ }),
    );
    const fenster = await screen.findByRole('dialog', { name: 'Sprachnachricht 17.10., 09:00' });
    await vi.waitFor(() => expect(fenster.querySelector('audio')).not.toBeNull());
    await act(() => client.invalidateQueries());
    expect(api.ladeAnhang).toHaveBeenCalledTimes(1);
  });

  it('sagt ein Nein des Servers im Fenster ohne „Erneut versuchen“', async () => {
    const nutzer = userEvent.setup();
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('maybe');
    api.fetchNachrichten.mockResolvedValue([
      nachricht({ body: '', attachments: [sprachnachricht] }),
    ]);
    api.ladeAnhang.mockRejectedValueOnce(
      new TeamchatFehler('Der Anhang fehlt in der Ablage.', false),
    );
    zeige('/team/k-planung');
    await nutzer.click(
      await screen.findByRole('button', { name: /Sprachnachricht 17\.10\., 09:00/ }),
    );
    const fenster = await screen.findByRole('dialog', { name: 'Sprachnachricht 17.10., 09:00' });
    expect(await within(fenster).findByText('Der Anhang fehlt in der Ablage.')).toBeInTheDocument();
    expect(within(fenster).queryByRole('button', { name: 'Erneut versuchen' })).toBeNull();
  });

  it('holt keine Freigabe, wenn das Gerät das Format sicher nicht abspielt', async () => {
    const nutzer = userEvent.setup();
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockReturnValue('');
    api.fetchNachrichten.mockResolvedValue([
      nachricht({ body: '', attachments: [sprachnachricht] }),
    ]);
    zeige('/team/k-planung');
    await nutzer.click(
      await screen.findByRole('button', { name: /Sprachnachricht 17\.10\., 09:00/ }),
    );
    expect(
      await screen.findByText(
        'Dieses Gerät spielt die Sprachnachricht nicht ab – bitte am Rechner anhören.',
      ),
    ).toBeInTheDocument();
    expect(api.ladeAnhang).not.toHaveBeenCalled();
  });

  it('zeigt die Dauer auch in den Dateien des Gesprächs', async () => {
    const nutzer = userEvent.setup();
    api.fetchDateien.mockResolvedValue([
      {
        id: 'v1',
        message_id: 'n1',
        parent_id: null,
        display_name: 'Sprachnachricht 17.10., 09:00',
        mime_type: 'audio/mp4',
        byte_size: 98304,
        created_at: '2026-10-17T07:00:00+00:00',
        author_name: 'Tim Teamleitung',
        verified: true,
        duration_seconds: 75,
      },
    ]);
    zeige('/team/k-allgemein');
    await nutzer.click(await screen.findByRole('button', { name: 'Details' }));
    expect(await screen.findByText(/^1:15 · 96 KB · Tim Teamleitung · /)).toBeInTheDocument();
  });
});

describe('Senden während des Hochladens (TEAM-005, ANN-654)', () => {
  beforeEach(() => {
    URL.createObjectURL = vi.fn(() => 'blob:vorschau');
    URL.revokeObjectURL = vi.fn();
  });

  const foto = (name = 'Speiche.png') => new File(['png'], name, { type: 'image/png' });
  const oben = (id: string, name: string) => ({
    id,
    name,
    mime_type: 'image/png',
    byte_size: 3072,
    verified: false,
    duration_seconds: null,
  });

  async function mitAnhangSenden(nutzer: ReturnType<typeof userEvent.setup>, text: string) {
    const feld = await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' });
    await nutzer.type(feld, text);
    await nutzer.upload(screen.getByLabelText('Foto oder PDF anhängen'), foto());
    expect(await screen.findByText('Lädt')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    return feld;
  }

  it('sendet, während der Anhang lädt - die Nachricht wartet sichtbar und geht danach mit ihm', async () => {
    const nutzer = userEvent.setup();
    let fertig: (wert: unknown) => void = () => undefined;
    api.ladeAnhangHoch.mockReturnValueOnce(new Promise((aufloesen) => (fertig = aufloesen)));
    zeige('/team/k-allgemein');
    const feld = await mitAnhangSenden(nutzer, 'Speiche gebrochen');

    // Das Feld ist frei, die Nachricht steht mit ihrem Anhang und wartet.
    expect(feld).toHaveValue('');
    expect(screen.queryByRole('list', { name: 'Anhänge' })).not.toBeNull();
    expect(await screen.findByText('Lädt Anhänge hoch …')).toBeInTheDocument();
    expect(screen.getByText('Speiche gebrochen')).toBeInTheDocument();
    // Noch nicht am Server - also auch kein „nicht serverseitig geprüft“ (Design-Review H8).
    expect(screen.queryByText(/nicht serverseitig geprüft/)).toBeNull();
    expect(api.sendeNachricht).not.toHaveBeenCalled();

    // Hochladen, Senden und Neuzeichnen laufen hier ganz durch.
    await act(async () => {
      fertig(oben('a1', 'Speiche.png'));
      await new Promise((weiter) => setTimeout(weiter, 50));
    });
    await vi.waitFor(() =>
      expect(api.sendeNachricht).toHaveBeenCalledWith(
        expect.objectContaining({
          text: 'Speiche gebrochen',
          anhaenge: [expect.objectContaining({ id: 'a1' })],
        }),
      ),
    );
    expect(api.sendeNachricht).toHaveBeenCalledTimes(1);
  });

  it('wartet ohne Netz auf den Anhang - „Jetzt versuchen“ lädt ihn und sendet', async () => {
    const nutzer = userEvent.setup();
    let scheitern: (grund: unknown) => void = () => undefined;
    api.ladeAnhangHoch
      .mockReturnValueOnce(new Promise((_, ablehnen) => (scheitern = ablehnen)))
      .mockResolvedValueOnce(oben('a2', 'Speiche.png'));
    zeige('/team/k-allgemein');
    await mitAnhangSenden(nutzer, 'Kette ab');
    scheitern(new TeamchatFehler('Nicht hochgeladen – kein Netz? Bitte noch einmal.', true));
    // Kein Versprechen, dass es von selbst geht (Zweitreview TEAM-005).
    expect(await screen.findByText('Anhang nicht hochgeladen – kein Netz?')).toBeInTheDocument();
    expect(api.sendeNachricht).not.toHaveBeenCalled();

    await nutzer.click(screen.getByRole('button', { name: 'Jetzt versuchen' }));
    await vi.waitFor(() =>
      expect(api.sendeNachricht).toHaveBeenCalledWith(
        expect.objectContaining({ anhaenge: [expect.objectContaining({ id: 'a2' })] }),
      ),
    );
  });

  it('bleibt mit dem Grund stehen, wenn ein Anhang endgültig scheitert - „Bearbeiten“ holt beides zurück', async () => {
    const nutzer = userEvent.setup();
    let scheitern: (grund: unknown) => void = () => undefined;
    api.ladeAnhangHoch.mockReturnValueOnce(new Promise((_, ablehnen) => (scheitern = ablehnen)));
    zeige('/team/k-allgemein');
    const feld = await mitAnhangSenden(nutzer, 'Rad 3 ist frei');
    scheitern(
      new TeamchatFehler(
        'Diese Datei lässt sich nicht senden. Bitte entfernen und eine andere wählen.',
        false,
      ),
    );
    // Der Grund steht schon in der Zeile, nicht erst nach „Bearbeiten“ (ANN-654).
    expect(
      await screen.findByText(
        'Nicht gesendet: „Speiche.png“ ließ sich nicht hochladen. Diese Datei lässt sich nicht senden. Bitte entfernen und eine andere wählen.',
      ),
    ).toBeInTheDocument();
    expect(api.sendeNachricht).not.toHaveBeenCalled();

    await nutzer.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    expect(feld).toHaveValue('Rad 3 ist frei');
    // Der Anhang steht wieder im Entwurf, mit seinem Grund; so geht „Senden“ nicht.
    const entwurf = within(feld.closest('form')!);
    expect(entwurf.getByRole('alert')).toHaveTextContent('Diese Datei lässt sich nicht senden.');
    expect(entwurf.getByRole('button', { name: 'Senden' })).toBeDisabled();
    await nutzer.click(entwurf.getByRole('button', { name: 'Anhang entfernen: Speiche.png' }));
    expect(entwurf.getByRole('button', { name: 'Senden' })).toBeEnabled();
  });

  it('holt eine wartende Nachricht mit „Bearbeiten“ zurück - der Anhang lädt im Entwurf weiter', async () => {
    const nutzer = userEvent.setup();
    let fertig: (wert: unknown) => void = () => undefined;
    api.ladeAnhangHoch.mockReturnValueOnce(new Promise((aufloesen) => (fertig = aufloesen)));
    zeige('/team/k-allgemein');
    const feld = await mitAnhangSenden(nutzer, 'Doch noch etwas');
    expect(await screen.findByText('Lädt Anhänge hoch …')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Bearbeiten' }));
    expect(feld).toHaveValue('Doch noch etwas');
    expect(screen.queryByText('Lädt Anhänge hoch …')).toBeNull();
    await act(async () => {
      fertig(oben('a6', 'Speiche.png'));
      await new Promise((weiter) => setTimeout(weiter, 50));
    });
    expect(screen.getByText('Foto · 3 KB')).toBeInTheDocument();
    expect(api.sendeNachricht).not.toHaveBeenCalled();
  });

  it('sendet nach dem Abmelden nichts - auch keine wartende Nachricht, und bricht das Hochladen ab', async () => {
    // Zweitreview TEAM-005, Befund 1: kein Versuch unter der nächsten Sitzung.
    const nutzer = userEvent.setup();
    let fertig: (wert: unknown) => void = () => undefined;
    api.ladeAnhangHoch.mockReturnValueOnce(new Promise((aufloesen) => (fertig = aufloesen)));
    zeige('/team/k-allgemein');
    await mitAnhangSenden(nutzer, 'Gleich da');
    expect(await screen.findByText('Lädt Anhänge hoch …')).toBeInTheDocument();
    act(() => abmeldenAufraeumen());
    const [, , , , signal] = api.ladeAnhangHoch.mock.calls[0] as [
      string,
      Blob,
      string,
      number | undefined,
      AbortSignal,
    ];
    expect(signal.aborted).toBe(true);
    await act(async () => {
      fertig(oben('a7', 'Speiche.png'));
      await new Promise((weiter) => setTimeout(weiter, 50));
    });
    expect(api.sendeNachricht).not.toHaveBeenCalled();
    // Was doch noch oben ankam, verwirft der Server nach 24 Stunden: Ein
    // Verwerfen jetzt ginge unter der nächsten Sitzung hinaus (Runde 3, B1).
    expect(api.verwirfAnhang).not.toHaveBeenCalled();
  });

  it('lässt eine Nachricht nicht ohne ihre Anhänge hinaus, wenn nur die Anhänge fallen', async () => {
    // Der Wächter in `anhaengeBereit` allein, ohne die Reihenfolge in
    // `teamchatLeeren` (Zweitreview TEAM-005, Runde 3, B3).
    const nutzer = userEvent.setup();
    api.ladeAnhangHoch.mockReturnValueOnce(new Promise(() => undefined));
    zeige('/team/k-allgemein');
    await mitAnhangSenden(nutzer, 'Gleich da');
    expect(await screen.findByText('Lädt Anhänge hoch …')).toBeInTheDocument();
    act(() => anhaengeLeeren());
    expect(
      await screen.findByText('Nicht gesendet: Die Anhänge sind nicht mehr da.'),
    ).toBeInTheDocument();
    expect(api.sendeNachricht).not.toHaveBeenCalled();
  });

  it('verwirft nach einer Ablehnung des Servers Nachricht und Anhang - den auch am Server', async () => {
    const nutzer = userEvent.setup();
    api.ladeAnhangHoch.mockResolvedValueOnce(oben('a4', 'Speiche.png'));
    api.sendeNachricht.mockRejectedValueOnce(
      new TeamchatFehler('Dieses Gespräch ist archiviert.', false),
    );
    zeige('/team/k-allgemein');
    const feld = await screen.findByRole('textbox', { name: 'Nachricht an # Allgemein' });
    await nutzer.upload(screen.getByLabelText('Foto oder PDF anhängen'), foto());
    expect(await screen.findByText('Foto · 3 KB')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Senden' }));
    expect(
      await screen.findByText('Nicht gesendet: Dieses Gespräch ist archiviert.'),
    ).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(screen.getByText('Text und Anhänge sind danach fort.')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Ja, verwerfen' }));
    await vi.waitFor(() => expect(api.verwirfAnhang).toHaveBeenCalledWith('a4'));
    expect(screen.queryByText(/Nicht gesendet/)).toBeNull();
    expect(feld).toHaveValue('');
  });
});

describe('Bearbeiten einer Nachricht', () => {
  it('speichert bei „Abbrechen“ nichts - der Knopf steht im Formular (TEAM-005)', async () => {
    const nutzer = userEvent.setup();
    api.fetchNachrichten.mockResolvedValue([
      nachricht({ author_staff_member_id: ANNA, author_name: 'Anna Beispiel', own: true }),
    ]);
    zeige('/team/k-planung');
    await nutzer.click(
      await screen.findByRole('button', { name: 'Handlungen zur Nachricht von Anna Beispiel' }),
    );
    await nutzer.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
    const feld = await screen.findByRole('textbox', { name: 'Nachricht ändern' });
    await nutzer.clear(feld);
    await nutzer.type(feld, 'Doch nicht');
    await nutzer.click(screen.getByRole('button', { name: 'Abbrechen' }));
    expect(screen.queryByRole('textbox', { name: 'Nachricht ändern' })).toBeNull();
    expect(api.bearbeiteNachricht).not.toHaveBeenCalled();
  });
});
