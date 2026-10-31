import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen, waitFor, within } from '@testing-library/react';
import { focusManager, onlineManager, useQuery } from '@tanstack/react-query';
import type * as PlattformApi from './api';
import type { Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';
import { eigenerPlan } from './testdaten';

/**
 * Die Übersicht (POR-015, DSN-001 4.1) in der Fassung von Schritt 1e
 * (Handoff 2026-10-22, 5.1): Gruß, genau eine Hauptsache, „Heute“, nächster
 * Besuch, „Neu für Sie“; Training, Begleitung und Lesefrist; Laden und
 * Fehler in einem Zustand für alle Abfragen. Synthetische Daten.
 */

const ladeTermine = vi.fn();
const ladeWuensche = vi.fn();
const ladeRechnungen = vi.fn();
const ladeBefundbogen = vi.fn();
const ladeAbo = vi.fn();
const ladeTrainingsangebot = vi.fn();
const ladeCheckins = vi.fn();
const ladeGewohnheiten = vi.fn();
const ladeNachrichten = vi.fn();
const ladePlaene = vi.fn();
const ladeMeinePakete = vi.fn();
const ladeErnaehrung = vi.fn();
const ladeBenachrichtigungen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeTermine: (...args: unknown[]) => ladeTermine(...args) as Promise<unknown[]>,
  ladeWuensche: (...args: unknown[]) => ladeWuensche(...args) as Promise<unknown[]>,
  ladeRechnungen: (...args: unknown[]) => ladeRechnungen(...args) as Promise<unknown[]>,
  ladeBefundbogen: (...args: unknown[]) => ladeBefundbogen(...args) as Promise<unknown[]>,
  ladeAbo: (...args: unknown[]) => ladeAbo(...args) as Promise<unknown>,
  ladeTrainingsangebot: (...args: unknown[]) => ladeTrainingsangebot(...args) as Promise<unknown>,
  ladeCheckins: (...args: unknown[]) => ladeCheckins(...args) as Promise<unknown>,
  ladeGewohnheiten: (...args: unknown[]) => ladeGewohnheiten(...args) as Promise<unknown>,
  ladeNachrichten: (...args: unknown[]) => ladeNachrichten(...args) as Promise<unknown>,
  ladePlaene: (...args: unknown[]) => ladePlaene(...args) as Promise<unknown>,
  ladeMeinePakete: (...args: unknown[]) => ladeMeinePakete(...args) as Promise<unknown>,
  ladeErnaehrung: (...args: unknown[]) => ladeErnaehrung(...args) as Promise<unknown>,
  ladeBenachrichtigungen: (...args: unknown[]) =>
    ladeBenachrichtigungen(...args) as Promise<unknown>,
}));

const { Uebersicht } = await import('./Uebersicht');

/** Die Wahl zu Mitteilungen: gewählt (Mail für Termine) oder noch nie (ANN-702). */
const GEWAEHLT = {
  email_kinds: ['appointment_reminder'],
  push_kinds: [],
  quiet_from: 20,
  quiet_until: 8,
  chosen_at: '2026-10-01T09:00:00Z',
  disabled_kinds: [],
  device_registered: false,
};
const NIE_GEWAEHLT = { ...GEWAEHLT, email_kinds: [], chosen_at: null };

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  writable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
  own_name: 'Erika Beispiel',
  practice_phone: null,
};

const BEGLEITUNG: Plattformzugang = {
  ...ZUGANG,
  access_id: 'cafecafe-cafe-4afe-8afe-000000000004',
  access_kind: 'companion',
  represented_name: 'Max Mustermann',
  own_name: 'Paula Mustermann',
};

function inTagen(tage: number, stunde: number): string {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  d.setHours(stunde, 30, 0, 0);
  return d.toISOString();
}

const TERMIN = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  starts_at: inTagen(3, 9),
  ends_at: inTagen(3, 10),
  appointment_type: 'home_visit',
  status: 'confirmed',
  staff_name: 'Anna Beispiel',
  location_name: null,
  visit_street: 'Testweg',
  visit_house_number: '7',
  visit_postal_code: '72072',
  visit_city: 'Tuebingen',
  late_notice: false,
  open_request_kind: null,
};

const BOGEN_FERTIG = [
  {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
    instrument_id: 'anamnese_v8',
    definition_version: '1.0.0',
    status: 'abgeschlossen',
    recorded_on: '2026-10-01',
    source: 'practice',
    answers: null,
    updated_at: '2026-10-01T08:00:00.000Z',
    completed_at: '2026-10-01T08:00:00.000Z',
  },
];

/** Ein nie gesendeter Entwurf der Person (ANN-810). */
const ENTWURF = {
  ...BOGEN_FERTIG[0]!,
  status: 'entwurf',
  source: 'platform',
  answers: { hauptbeschwerde: 'Knie rechts' },
  completed_at: null,
};

const RECHNUNG = {
  id: 'ffffffff-ffff-4fff-8fff-000000000001',
  invoice_number: 'RG-2026-0001',
  issued_on: '2026-09-25',
  due_on: '2026-10-09',
  total_cents: 14000,
  currency: 'EUR',
  paid_cents: 0,
  outstanding_cents: 14000,
  payment_state: 'unpaid',
  overdue: false,
  cancelled: false,
  cancelled_on: null,
  recipient_kind: 'self',
  recipient_name: 'Erika Beispiel',
  service_from: null,
  service_to: null,
};

function checkin(teil: Record<string, unknown> = {}) {
  return {
    today: '2026-10-12',
    schedule: { interval_days: 7, parameter_keys: ['pain_rest', 'pain_load', 'daily_impairment'] },
    due_on: '2026-10-12',
    due: true,
    can_answer: true,
    consent_needed: false,
    last_values: {},
    history: [],
    ...teil,
  };
}

function zeige(zugang = ZUGANG, pfad = '/p?bereich=treatment') {
  return renderWithProviders(<Uebersicht zugang={zugang} />, pfad);
}

/** Vier Übungen zu je 234 s: geschätzt „etwa 15 Minuten“ (ANN-704). */
const VIER_UEBUNGEN = [1, 2, 3, 4].map((nummer) => ({
  ...eigenerPlan().items[0]!,
  id: `bbbbbbbb-0000-4000-8000-00000000000${nummer}`,
  position: nummer,
}));

/** Was das Gerät über die Verbindung meldet (`navigator.onLine`, ANN-015). */
function setzeVerbindung(verbunden: boolean) {
  Object.defineProperty(navigator, 'onLine', { value: verbunden, configurable: true });
  act(() => {
    window.dispatchEvent(new Event(verbunden ? 'online' : 'offline'));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.sessionStorage.clear();
  ladeTermine.mockResolvedValue([]);
  ladeWuensche.mockResolvedValue([]);
  ladeRechnungen.mockResolvedValue([]);
  ladeBefundbogen.mockResolvedValue([]);
  ladeAbo.mockResolvedValue(null);
  ladeTrainingsangebot.mockResolvedValue(null);
  ladeCheckins.mockResolvedValue(null);
  ladeGewohnheiten.mockResolvedValue(null);
  ladeNachrichten.mockResolvedValue({ messages: [] });
  ladePlaene.mockResolvedValue({ today: '2026-10-12', plans: [] });
  ladeMeinePakete.mockResolvedValue(null);
  ladeErnaehrung.mockResolvedValue(null);
  ladeBenachrichtigungen.mockResolvedValue(GEWAEHLT);
});

afterEach(() => {
  vi.useRealTimers();
  focusManager.setFocused(undefined);
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  onlineManager.setOnline(true);
});

/** Lädt vorab unter einem Schlüssel - wie eine andere Seite derselben Sitzung. */
function Vorher({
  schluessel,
  laden,
}: {
  schluessel: readonly unknown[];
  laden: () => Promise<unknown>;
}) {
  const { status } = useQuery({ queryKey: schluessel, queryFn: laden, retry: false });
  return <p data-testid="vorher">{status}</p>;
}

describe('Gruß der Übersicht (Handoff 5.1)', () => {
  it('grüßt nach der Tageszeit mit dem eigenen Namen und nennt das Datum', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 22, 8, 15));
    zeige();
    expect(
      // Der Name steht in eigener Zeile; vorgelesen wird er nach dem Komma.
      await screen.findByRole('heading', { level: 1, name: /^Guten Morgen,\s+Erika Beispiel$/ }),
    ).toBeInTheDocument();
    expect(screen.getByText('Donnerstag, 22. Oktober')).toBeInTheDocument();
    // DR-122: kein Systemsatz mit „Mehr“.
    expect(screen.queryByText(/angemeldet/)).not.toBeInTheDocument();
  });

  it('sagt ohne Namen „Guten Abend“ ohne Komma', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 22, 19, 0));
    zeige({ ...ZUGANG, own_name: null });
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Guten Abend' }),
    ).toBeInTheDocument();
  });
});

describe('Hauptsache (ANN-698)', () => {
  it('macht die ganze Hero-Karte zum Ziel; der Knopf bleibt sichtbar (ANN-817)', async () => {
    ladeTermine.mockResolvedValue([TERMIN]);
    ladeBefundbogen.mockResolvedValue(BOGEN_FERTIG);
    zeige();
    const hero = await screen.findByRole('region', { name: /^Besuch / });
    const ziel = within(hero).getByRole('link', { name: 'Ansehen, ändern, absagen' });
    // Das Ziel des Knopfs reicht über die ganze Karte; sie zeigt Fokus und Druck.
    expect(ziel.className).toContain('hero-ziel');
    expect(ziel.className).toContain('after:inset-0');
    expect(ziel.className).not.toMatch(/(^| )relative( |$)/);
    expect(hero.className).toContain('has-[.hero-ziel:focus-visible]:outline-3');
    expect(within(hero).getAllByRole('link')).toHaveLength(1);
  });

  it('nimmt den offenen Fragebogen, zeigt den Termin als ersten Besuch und die Rechnung unter „Neu für Sie“', async () => {
    ladeTermine.mockResolvedValue([TERMIN]);
    ladeRechnungen.mockResolvedValue([RECHNUNG]);
    zeige();
    const hero = await screen.findByRole('region', { name: 'Fragebogen vor Ihrem ersten Termin' });
    expect(
      within(hero).getByText(
        'Etwa 10 Minuten. Anna Beispiel sieht Ihre Angaben beim ersten Termin.',
      ),
    ).toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: 'Fragebogen beginnen' })).toHaveAttribute(
      'href',
      '/p/befundbogen?bereich=treatment',
    );
    // Der Termin ist nicht die Hauptsache: als Besuchskarte, vor dem ersten Termin so genannt.
    expect(
      screen.getByRole('heading', { level: 2, name: 'Ihr erster Besuch' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Anna Beispiel kommt zu Ihnen/ })).toHaveAttribute(
      'href',
      `/p/termine/${TERMIN.id}?bereich=treatment&zurueck=${encodeURIComponent('/p?bereich=treatment')}`,
    );
    // Geld wird nie Hauptsache (Handoff, Abschnitt 0).
    const neu = screen.getByRole('list', { name: 'Neu für Sie' });
    const rechnung = within(neu).getByRole('link', { name: /^Rechnung RG-2026-0001/ });
    expect(rechnung).toHaveAttribute(
      'href',
      '/p/rechnungen/ffffffff-ffff-4fff-8fff-000000000001?bereich=treatment',
    );
    expect(within(rechnung).getByText('Fällig am 09.10.2026')).toBeInTheDocument();
    expect(within(rechnung).getByText(/140,00\s€/)).toBeInTheDocument();
    // Entfällt: „Jetzt dran“ und der Notfallsatz auf der Startseite (Entscheidung 4).
    expect(screen.queryByText('Jetzt dran')).not.toBeInTheDocument();
    expect(screen.queryByText(/Fragen an die Praxis|116117/)).not.toBeInTheDocument();
  });

  it('sagt „nächsten“ statt „ersten“ Termin, wenn schon einer stattfand', async () => {
    ladeTermine.mockResolvedValue([
      TERMIN,
      {
        ...TERMIN,
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000009',
        starts_at: inTagen(-7, 9),
        ends_at: inTagen(-7, 10),
        status: 'completed',
      },
    ]);
    zeige();
    const hero = await screen.findByRole('region', {
      name: 'Fragebogen vor Ihrem nächsten Termin',
    });
    expect(within(hero).getByText(/sieht Ihre Angaben beim nächsten Termin\./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Nächster Besuch' })).toBeInTheDocument();
  });

  it('zeigt eine Rechnung vor der Fälligkeit ohne Warnzeichen, überfällig mit (ANN-701)', async () => {
    ladeRechnungen.mockResolvedValue([RECHNUNG]);
    const erstes = zeige();
    const offen = await screen.findByRole('link', { name: /^Rechnung RG-2026-0001/ });
    expect(within(offen).getByText('offen').closest('[class*="rounded-pill"]')?.textContent).toBe(
      'offen',
    );
    erstes.unmount();

    ladeRechnungen.mockResolvedValue([{ ...RECHNUNG, overdue: true }]);
    zeige();
    const ueberfaellig = await screen.findByRole('link', { name: /^Rechnung RG-2026-0001/ });
    expect(
      within(ueberfaellig).getByText('überfällig').closest('[class*="rounded-pill"]')?.textContent,
    ).not.toBe('überfällig');
  });

  it('nimmt ohne Aufgabe den nächsten Termin, ohne zweite Besuchskarte', async () => {
    ladeBefundbogen.mockResolvedValue(BOGEN_FERTIG);
    ladeTermine.mockResolvedValue([TERMIN]);
    zeige();
    const hero = await screen.findByRole('region', { name: /^Besuch (am|morgen|heute)/ });
    expect(within(hero).getByText('Anna Beispiel kommt zu Ihnen')).toBeInTheDocument();
    // Zur Seite des Termins; der Rückweg reist mit und heißt dann „Übersicht“ (ANN-779).
    // Der Weg nennt, was die Seite des Termins anbietet (ANN-811).
    expect(within(hero).getByRole('link', { name: 'Ansehen, ändern, absagen' })).toHaveAttribute(
      'href',
      `/p/termine/${TERMIN.id}?bereich=treatment&zurueck=${encodeURIComponent('/p?bereich=treatment')}`,
    );
    expect(screen.queryByRole('heading', { name: /Besuch$/ })).not.toBeInTheDocument();
    expect(hero).not.toHaveTextContent('angefragt');
  });

  it('zeigt einen offenen Absagewunsch an der Karte wie in der Liste (ANN-772)', async () => {
    ladeBefundbogen.mockResolvedValue(BOGEN_FERTIG);
    ladeTermine.mockResolvedValue([{ ...TERMIN, open_request_kind: 'cancel' }]);
    zeige();
    const hero = await screen.findByRole('region', { name: /^Besuch (am|morgen|heute)/ });
    expect(within(hero).getByText('Absage angefragt')).toBeInTheDocument();
  });

  it('sagt ohne Aufgabe und ohne Termin, dass gerade nichts zu tun ist', async () => {
    ladeBefundbogen.mockResolvedValue(BOGEN_FERTIG);
    zeige();
    const leer = await screen.findByText('Gerade ist nichts zu tun.');
    expect(screen.getByText('Zurzeit ist kein Termin vereinbart.')).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
    // An der Stelle der Hero-Karte, mit Karten darunter: in der Karte (DESIGN.md Regel 8).
    expect(leer.parentElement!.className).toContain('rounded-card');
  });

  it('nimmt den fälligen Check-in nach dem Fragebogen, sonst steht er unter „Heute“', async () => {
    ladeBefundbogen.mockResolvedValue(BOGEN_FERTIG);
    ladeCheckins.mockResolvedValue(checkin());
    const erstes = zeige();
    const hero = await screen.findByRole('region', { name: 'Ihr Check-in für heute' });
    expect(
      within(hero).getByText('3 kurze Fragen, freiwillig, etwa 1 Minute.'),
    ).toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: 'Check-in beantworten' })).toHaveAttribute(
      'href',
      '/p/checkin?bereich=treatment',
    );
    erstes.unmount();

    ladeBefundbogen.mockResolvedValue([]);
    zeige();
    await screen.findByRole('region', { name: 'Fragebogen vor Ihrem ersten Termin' });
    expect(screen.getByRole('heading', { level: 2, name: 'Heute' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Check-in beantworten/ })).toHaveAttribute(
      'href',
      '/p/checkin?bereich=treatment',
    );
  });

  it('zeigt keinen Check-in, wenn er nicht fällig ist, und mahnt nicht (IDEA-TRK-004)', async () => {
    ladeCheckins.mockResolvedValue(
      checkin({ due: false, can_answer: false, due_on: '2026-10-19' }),
    );
    zeige();
    await screen.findByRole('region', { name: 'Fragebogen vor Ihrem ersten Termin' });
    await waitFor(() => expect(ladeCheckins).toHaveBeenCalled());
    expect(screen.queryByText(/Check-in/)).not.toBeInTheDocument();
    expect(screen.queryByText(/verpasst|überfällig|vergessen/i)).not.toBeInTheDocument();
  });

  it('nimmt die Übungen für heute und sagt ohne Netz, dass es trotzdem geht', async () => {
    ladeBefundbogen.mockResolvedValue(BOGEN_FERTIG);
    ladePlaene.mockResolvedValue({
      today: '2026-10-12',
      plans: [
        {
          id: 'aeaeaeae-aeae-4eae-8eae-000000000001',
          service_area: 'therapy',
          title: 'Heimübungen Knie',
          status: 'assigned',
          sessions_per_week: 3,
          assigned_on: '2026-10-01',
          runs_from: '2026-10-01',
          runs_until: null,
          ended_on: null,
          can_exercise: true,
          note_allowed: true,
          open_session: null,
          can_choose_days: true,
          weekdays: [1, 2, 3, 4, 5, 6, 7],
          recent_sessions: [],
          items: VIER_UEBUNGEN,
        },
      ],
    });
    zeige();
    const hero = await screen.findByRole('region', { name: 'Ihre Übungen für heute' });
    // Umfang und geschätzte Dauer wie die Vorschau im Reiter (ANN-704).
    expect(within(hero).getByText('4 Übungen · etwa 15 Minuten')).toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: 'Übungen beginnen' })).toHaveAttribute(
      'href',
      '/p/uebungen/einheit/aeaeaeae-aeae-4eae-8eae-000000000001?bereich=treatment',
    );
    // Ohne Netz geht es mit dem Plan vom Gerät trotzdem, und die Karte sagt es.
    setzeVerbindung(false);
    expect(
      within(hero).getByText('4 Übungen · etwa 15 Minuten. Geht auch ohne Netz.'),
    ).toBeInTheDocument();
    setzeVerbindung(true);
  });
});

describe('Heute und Neu für Sie', () => {
  it('zeigt laufende Gewohnheiten als Aufgabenkarte, pausierte nicht, ohne Zählwerk (ALT-003)', async () => {
    const gewohnheit = {
      id: 'g1',
      action: 'zwei Minuten Mobilität',
      cue: 'Nach dem Zähneputzen',
      place: null,
      starts_on: '2026-10-01',
      paused: false,
      ended_at: null,
      marks: [],
    };
    ladeGewohnheiten.mockResolvedValue({
      today: '2026-10-12',
      mark_days: 7,
      can_mark: true,
      consent_needed: false,
      habits: [gewohnheit, { ...gewohnheit, id: 'g2', action: 'Treppe', paused: true }],
    });
    zeige();
    const karte = await screen.findByRole('link', { name: /^Eine kleine Gewohnheit/ });
    expect(karte).toHaveAttribute('href', '/p/gewohnheiten?bereich=treatment');
    expect(within(karte).getByText('zwei Minuten Mobilität')).toBeInTheDocument();
    expect(screen.queryByText(/Treppe/)).not.toBeInTheDocument();
  });

  it('zeigt „Mitteilungen einschalten“ zuletzt, bis die Person gewählt hat (ANN-702)', async () => {
    ladeBenachrichtigungen.mockResolvedValue(NIE_GEWAEHLT);
    ladeGewohnheiten.mockResolvedValue({
      today: '2026-10-12',
      mark_days: 7,
      can_mark: true,
      consent_needed: false,
      habits: [
        {
          id: 'g1',
          action: 'zwei Minuten Mobilität',
          cue: null,
          place: null,
          starts_on: '2026-10-01',
          paused: false,
          ended_at: null,
          marks: [],
        },
      ],
    });
    zeige();
    const karte = await screen.findByRole('link', { name: /^Mitteilungen einschalten/ });
    expect(karte).toHaveAttribute('href', '/p/einstellungen?bereich=treatment#benachrichtigungen');
    expect(ladeBenachrichtigungen).toHaveBeenCalledWith(ZUGANG.access_id, null);
    const heute = screen.getByRole('heading', { level: 2, name: 'Heute' }).closest('section')!;
    expect(
      within(heute)
        .getAllByRole('link')
        .map((l) => l.textContent),
    ).toEqual([
      expect.stringMatching(/^Eine kleine Gewohnheit/),
      expect.stringMatching(/^Mitteilungen einschalten/),
    ]);
  });

  it('zeigt „Mitteilungen einschalten“ nicht nach einer Wahl und in der Lesefrist', async () => {
    const { unmount } = zeige();
    expect(await screen.findByText('Fragebogen vor Ihrem ersten Termin')).toBeInTheDocument();
    expect(screen.queryByText('Mitteilungen einschalten')).not.toBeInTheDocument();
    unmount();

    ladeBenachrichtigungen.mockResolvedValue(NIE_GEWAEHLT);
    const lesefrist = zeige({
      ...ZUGANG,
      writable: false,
      read_until: '2026-12-31T12:00:00+01:00',
    });
    expect(await screen.findByRole('region', { name: 'Unterlagen sichern' })).toBeInTheDocument();
    expect(screen.queryByText('Mitteilungen einschalten')).not.toBeInTheDocument();
    lesefrist.unmount();
  });

  it('zeigt das Trainingsangebot der Praxis unter „Neu für Sie“ (KND-003)', async () => {
    ladeTrainingsangebot.mockResolvedValue({
      label: 'Trainingspaket 3 Monate',
      valid_until: '2026-10-21',
    });
    zeige();
    const zeile = await screen.findByRole('link', { name: /^Training nach der Behandlung/ });
    expect(zeile).toHaveAttribute('href', '/p/angebot?bereich=treatment');
    expect(within(zeile).getByText(/gilt bis 21.10.2026/)).toBeInTheDocument();
  });

  it('nennt die Antwort der Praxis auf einen Wunsch und fragt im Training keinen Befundbogen an', async () => {
    ladeWuensche.mockResolvedValue([
      {
        id: 'dddddddd-dddd-4ddd-8ddd-000000000001',
        kind: 'new',
        appointment_id: null,
        preferred_days: ['2026-10-20'],
        preferred_times: [],
        note: null,
        status: 'declined',
        created_at: new Date().toISOString(),
        resolved_at: new Date().toISOString(),
        answer: 'Diese Woche ist voll.',
      },
    ]);
    zeige({ ...ZUGANG, relationship_kind: 'training' }, '/p?bereich=training');
    const zeile = await screen.findByRole('link', { name: /^Antwort auf Ihren Terminwunsch/ });
    expect(
      within(zeile).getByText('Leider nicht möglich: Diese Woche ist voll.'),
    ).toBeInTheDocument();
    expect(ladeBefundbogen).not.toHaveBeenCalled();
  });

  it('führt im Training ohne Einwilligung zu den Einwilligungen, nicht zum Check-in', async () => {
    ladeCheckins.mockResolvedValue(checkin({ can_answer: false, consent_needed: true }));
    zeige({ ...ZUGANG, relationship_kind: 'training' }, '/p?bereich=training');
    expect(
      await screen.findByRole('link', { name: /^Ihre Praxis bittet um einen Check-in/ }),
    ).toHaveAttribute('href', '/p/einwilligungen?bereich=training');
    expect(screen.queryByRole('link', { name: /Check-in beantworten/ })).not.toBeInTheDocument();
  });
});

describe('Training, Begleitung, Lesefrist', () => {
  it('zeigt im Training die nächste Einheit, den Plan, das Tagebuch und das Paket', async () => {
    ladeTermine.mockResolvedValue([
      {
        ...TERMIN,
        appointment_type: 'practice',
        staff_name: 'Tom Beispiel',
        location_name: 'Halle',
      },
    ]);
    ladePlaene.mockResolvedValue({
      today: '2026-10-12',
      plans: [
        {
          id: 'aeaeaeae-aeae-4eae-8eae-000000000002',
          service_area: 'training',
          title: 'Kraft zu Hause',
          status: 'assigned',
          sessions_per_week: 2,
          assigned_on: '2026-10-01',
          runs_from: '2026-10-01',
          runs_until: null,
          ended_on: null,
          can_exercise: true,
          note_allowed: true,
          open_session: null,
          can_choose_days: true,
          weekdays: [],
          recent_sessions: [],
          items: VIER_UEBUNGEN.slice(0, 3),
        },
      ],
    });
    ladeErnaehrung.mockResolvedValue({
      can_write: true,
      profile: { ended_on: null, diary_enabled: true },
    });
    ladeMeinePakete.mockResolvedValue([
      {
        label: 'Trainingspaket 6 Monate',
        package_months: 6,
        price_cents: 60000,
        currency: 'EUR',
        starts_on: '2026-09-01',
        ends_on: '2027-02-28',
        state: 'running',
      },
    ]);
    zeige({ ...ZUGANG, relationship_kind: 'training' }, '/p?bereich=training');
    const hero = await screen.findByRole('region', { name: /^Training (am|morgen|heute)/ });
    expect(within(hero).getByText('In der Praxis bei Tom Beispiel')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Zwischen den Einheiten' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', {
        name: 'Ihr Plan für zu Hause 3\u00a0Übungen · etwa 10\u00a0Minuten',
      }),
    ).toHaveAttribute('href', '/p/uebungen?bereich=training');
    // Mit weicher Trennstelle, damit das Wort bei „Sehr groß“ nur dort bricht.
    // Der Rückweg reist mit: Im Tagebuch heißt er dann „Übersicht“.
    expect(screen.getByRole('link', { name: /^Ernährungs\u00ADtagebuch/ })).toHaveAttribute(
      'href',
      `/p/ernaehrung/tagebuch?bereich=training&zurueck=${encodeURIComponent('/p?bereich=training')}`,
    );
    expect(screen.getByRole('link', { name: /^Trainingspaket 6 Monate/ })).toHaveAttribute(
      'href',
      '/p/paket?bereich=training',
    );
    expect(ladeBefundbogen).not.toHaveBeenCalled();
  });

  it('grüßt eine Begleitung selbst, zeigt die Hauptsache für die Person und fragt kein Angebot an', async () => {
    ladeTermine.mockResolvedValue([TERMIN]);
    ladeRechnungen.mockResolvedValue([RECHNUNG]);
    zeige(BEGLEITUNG, `/p?zugang=${BEGLEITUNG.access_id}`);
    expect(
      await screen.findByRole('heading', { level: 1, name: /Paula Mustermann$/ }),
    ).toBeInTheDocument();
    const hero = screen.getByRole('region', { name: 'Besuch bei Max Mustermann' });
    expect(within(hero).getByText('Anna Beispiel kommt')).toBeInTheDocument();
    // Eine Begleitung füllt den Bogen nicht aus (ANN-248).
    expect(screen.queryByText(/Fragebogen/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('heading', { level: 2, name: 'Für Max Mustermann' }),
    ).toBeInTheDocument();
    // Was die Begleitung darf, steht als Kleingedrucktes am Ende (ADR-023 Punkt 13).
    expect(
      screen.getByText(
        /^Als Begleitung lesen Sie mit .* Einwilligungen gibt nur Max Mustermann selbst\.$/,
      ),
    ).toBeInTheDocument();
    expect(ladeTrainingsangebot).not.toHaveBeenCalled();
    expect(ladeErnaehrung).not.toHaveBeenCalled();
  });

  it('übernimmt keinen Fehler einer Abfrage, die sie selbst nicht stellt (Begleitung, „Ich“)', async () => {
    const schluessel = ['platform-nutrition', BEGLEITUNG.access_id] as const;
    const { rerender } = renderWithProviders(
      <Vorher schluessel={schluessel} laden={() => Promise.reject(new Error('gesperrt'))} />,
      `/p?zugang=${BEGLEITUNG.access_id}`,
    );
    await waitFor(() => expect(screen.getByTestId('vorher')).toHaveTextContent('error'));
    rerender(
      <>
        <Vorher schluessel={schluessel} laden={() => Promise.reject(new Error('gesperrt'))} />
        <Uebersicht zugang={BEGLEITUNG} />
      </>,
    );
    expect(await screen.findByText('Gerade ist nichts zu tun.')).toBeInTheDocument();
    expect(
      screen.queryByText('Die Übersicht lässt sich gerade nicht laden.'),
    ).not.toBeInTheDocument();
  });

  it('zeigt ohne Netz den Stand, sobald die Termine da sind (ANN-699)', async () => {
    ladeTermine.mockResolvedValue([TERMIN]);
    const { rerender } = renderWithProviders(
      <Vorher
        schluessel={['platform-appointments', ZUGANG.access_id]}
        laden={() => ladeTermine() as Promise<unknown>}
      />,
      '/p?bereich=treatment',
    );
    await waitFor(() => expect(screen.getByTestId('vorher')).toHaveTextContent('success'));
    onlineManager.setOnline(false);
    rerender(<Uebersicht zugang={ZUGANG} />);
    // Die übrigen Abfragen pausieren ohne Stand - die Seite steht trotzdem;
    // was unbekannt ist (der Fragebogen), zählt nicht: Hauptsache ist der Termin.
    expect(await screen.findByRole('region', { name: /^Besuch / })).toBeInTheDocument();
    expect(screen.queryByText('Übersicht wird geladen')).not.toBeInTheDocument();
  });

  it('spricht bei einer rechtlichen Vertretung von der Aufgabe der Person', async () => {
    ladeTermine.mockResolvedValue([TERMIN]);
    zeige({ ...BEGLEITUNG, access_kind: 'legal_representative' });
    const hero = await screen.findByRole('region', { name: 'Fragebogen für Max Mustermann' });
    expect(
      within(hero).getByText(
        'Etwa 10 Minuten. Anna Beispiel sieht die Angaben beim ersten Termin.',
      ),
    ).toBeInTheDocument();
  });

  it('sagt einer rechtlichen Vertretung am Ende, was sie darf', async () => {
    zeige({ ...BEGLEITUNG, access_kind: 'legal_representative' });
    expect(
      await screen.findByText(
        'Als rechtliche Vertretung handeln Sie in allem, was Max Mustermann hier tun kann.',
      ),
    ).toBeInTheDocument();
  });

  it('bietet in der Lesefrist „Unterlagen sichern“ an und nennt die Behandlung', async () => {
    ladeTermine.mockResolvedValue([
      {
        ...TERMIN,
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
        starts_at: '2026-08-12T07:30:00Z',
        ends_at: '2026-08-12T08:30:00Z',
        status: 'completed',
      },
      {
        ...TERMIN,
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
        starts_at: '2026-10-15T07:30:00Z',
        ends_at: '2026-10-15T08:30:00Z',
        status: 'completed',
      },
    ]);
    zeige({ ...ZUGANG, writable: false, read_until: '2026-12-31T12:00:00+01:00' });
    const hero = await screen.findByRole('region', { name: 'Unterlagen sichern' });
    expect(within(hero).getByText(/^Rechnungen und Dokumente können Sie bis/)).toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: 'Unterlagen ansehen' })).toHaveAttribute(
      'href',
      '/p/ich',
    );
    expect(screen.getByText(/Sie können hier noch bis 31\.12\.2026 lesen\./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Ihre Behandlung' })).toBeInTheDocument();
    expect(screen.getByText('Mit Anna Beispiel')).toBeInTheDocument();
    expect(screen.getByText('12. August bis 15. Oktober 2026')).toBeInTheDocument();
    // In der Lesefrist ist nichts mehr zu tun - auch kein offener Fragebogen.
    expect(screen.queryByText(/Fragebogen/)).not.toBeInTheDocument();
  });

  it('führt in der Lesefrist mit eigenem Entwurf unter „Ihre Behandlung“ zum Fragebogen (ANN-818)', async () => {
    const vergangen = {
      ...TERMIN,
      starts_at: '2026-10-15T07:30:00Z',
      ends_at: '2026-10-15T08:30:00Z',
      status: 'completed',
    };
    ladeTermine.mockResolvedValue([vergangen]);
    ladeBefundbogen.mockResolvedValue([ENTWURF]);
    const lesefrist = { writable: false, read_until: '2026-12-31T12:00:00+01:00' };
    const eigen = zeige({ ...ZUGANG, ...lesefrist });
    const abschnitt = (
      await screen.findByRole('heading', { level: 2, name: 'Ihre Behandlung' })
    ).closest('section')!;
    expect(within(abschnitt).getByText('Mit Anna Beispiel')).toBeInTheDocument();
    const zeile = within(abschnitt).getByRole('link', { name: /^Angefangener Fragebogen/ });
    expect(zeile).toHaveAttribute('href', '/p/befundbogen?bereich=treatment');
    expect(zeile).toHaveTextContent('Nicht gesendet');
    eigen.unmount();

    // Ohne vergangenen Termin steht die Zeile allein unter dem Titel.
    ladeTermine.mockResolvedValue([]);
    const allein = zeige({ ...ZUGANG, ...lesefrist });
    expect(await screen.findByRole('link', { name: /^Angefangener Fragebogen/ })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'Ihre Behandlung' })).toBeInTheDocument();
    allein.unmount();

    // Eine Begleitung füllt den Bogen nicht aus und verwirft ihn nicht.
    ladeTermine.mockResolvedValue([vergangen]);
    zeige({ ...BEGLEITUNG, ...lesefrist });
    await screen.findByRole('heading', { level: 2, name: 'Die Behandlung' });
    expect(screen.queryByRole('link', { name: /Angefangener Fragebogen/ })).toBeNull();
  });

  it('nennt den Entwurf vor der Lesefrist in der Hauptsache, nicht als Zeile', async () => {
    ladeBefundbogen.mockResolvedValue([ENTWURF]);
    zeige();
    const hero = await screen.findByRole('region', { name: /^Fragebogen vor Ihrem/ });
    expect(
      within(hero).getByRole('link', { name: 'Fragebogen weiter ausfüllen' }),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /Angefangener Fragebogen/ })).toBeNull();
  });

  it('zeigt die Lesefrist auch einer Begleitung, mit dem Namen der Person (ANN-809)', async () => {
    ladeTermine.mockResolvedValue([
      {
        ...TERMIN,
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
        starts_at: '2026-10-15T07:30:00Z',
        ends_at: '2026-10-15T08:30:00Z',
        status: 'completed',
      },
    ]);
    zeige({ ...BEGLEITUNG, writable: false, read_until: '2026-12-31T12:00:00+01:00' });
    const hero = await screen.findByRole('region', { name: 'Unterlagen sichern' });
    // Rechnungen sieht eine Begleitung nur mit Vermögenssorge: Die Karte verspricht sie nicht.
    expect(
      within(hero).getByText(
        /^Die Unterlagen können Sie bis 31\. Dezember( 2026)? herunterladen\.$/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Die Behandlung von Max Mustermann ist beendet. Sie können hier noch bis 31.12.2026 lesen.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Ihr Zugang für/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Die Behandlung' })).toBeInTheDocument();
    // In der Lesefrist schreibt auch die Begleitung nichts mehr.
    expect(
      screen.getByText(
        'Als Begleitung lesen Sie mit. Einwilligungen gibt nur Max Mustermann selbst.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Terminwünsche und Nachrichten/)).not.toBeInTheDocument();
  });

  it('stellt einer Vertretung am Telefon die Hauptsache vor den Gruß, nach dem Satz der Lesefrist (ANN-820)', async () => {
    zeige({ ...BEGLEITUNG, writable: false, read_until: '2026-12-31T12:00:00+01:00' });
    const hero = await screen.findByRole('region', { name: 'Unterlagen sichern' });
    const gruss = screen.getByRole('heading', { level: 1, name: /Paula Mustermann$/ });
    const satz = screen.getByText(/^Die Behandlung von Max Mustermann ist beendet\./);
    const folgt = (a: Node, b: Node) =>
      Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(folgt(satz, hero)).toBe(true);
    expect(folgt(hero, gruss)).toBe(true);
  });

  it('lässt einer Vertretung ohne Hauptsache den Gruß vor dem Leerzustand (ANN-820)', async () => {
    zeige(BEGLEITUNG, `/p?zugang=${BEGLEITUNG.access_id}`);
    const gruss = await screen.findByRole('heading', { level: 1, name: /Paula Mustermann$/ });
    const leer = screen.getByText(/nichts zu tun/);
    expect(gruss.compareDocumentPosition(leer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('lässt der eigenen Übersicht den Gruß vor der Hauptsache (ANN-820)', async () => {
    ladeTermine.mockResolvedValue([TERMIN]);
    zeige();
    const gruss = await screen.findByRole('heading', { level: 1 });
    const hero = screen.getByRole('region', { name: 'Fragebogen vor Ihrem ersten Termin' });
    expect(gruss.compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('nennt einer Vertretung vor der Lesefrist das Ende ihres eigenen Zugangs', async () => {
    // Sorgerecht bis zur Volljährigkeit: Die Behandlung läuft, der Server lässt schreiben.
    zeige({
      ...BEGLEITUNG,
      access_kind: 'legal_representative',
      // Mitternacht in der Zeitzone des Laufs, wie der Server sie in der der Praxis liefert.
      read_until: new Date(2031, 3, 30).toISOString(),
    });
    expect(
      await screen.findByText('Ihr Zugang für Max Mustermann endet am 30.04.2031.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('region', { name: 'Unterlagen sichern' })).not.toBeInTheDocument();
  });

  it('kennt während eines gekündigten, noch laufenden Abos keine Lesefrist (ANN-274)', async () => {
    ladeTermine.mockResolvedValue([TERMIN]);
    ladeBefundbogen.mockResolvedValue(BOGEN_FERTIG);
    ladeAbo.mockResolvedValue({
      id: 'abababab-abab-4bab-8bab-000000000001',
      starts_on: '2026-09-05',
      ends_on: inTagen(27, 0).slice(0, 10),
      state: 'ending',
      next_month_start: null,
      next_month_price_cents: null,
      cancel_effective_on: null,
      cancelled_at: '2026-10-07T09:30:00Z',
      cancelled_via: 'platform',
      can_cancel: false,
    });
    zeige({ ...ZUGANG, read_until: inTagen(58, 12) });
    // Der Termin ist die Hauptsache, nicht „Unterlagen sichern“.
    expect(await screen.findByRole('region', { name: /^Besuch / })).toBeInTheDocument();
    expect(screen.queryByText('Unterlagen sichern')).not.toBeInTheDocument();
    expect(screen.getByText(/Ihr Nachsorge-Abo endet am/)).toBeInTheDocument();
  });

  it('nennt als letzten Tag der Lesefrist den vor `read_until` (Mitternacht danach)', async () => {
    // Mitternacht in der Zeitzone des Laufs, wie der Server sie in der der Praxis liefert.
    zeige({ ...ZUGANG, writable: false, read_until: new Date(2026, 10, 13).toISOString() });
    const hero = await screen.findByRole('region', { name: 'Unterlagen sichern' });
    expect(within(hero).getByText(/bis 12\. November( 2026)? herunterladen/)).toBeInTheDocument();
    expect(screen.getByText(/Sie können hier noch bis 12\.11\.2026 lesen\./)).toBeInTheDocument();
  });

  it('nennt keinen Beginn, wenn der erste Termin am Rand der zwölf Monate liegt', async () => {
    ladeTermine.mockResolvedValue([
      {
        ...TERMIN,
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000a1',
        starts_at: inTagen(-360, 9),
        ends_at: inTagen(-360, 10),
        status: 'completed',
      },
      {
        ...TERMIN,
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000a2',
        starts_at: '2026-10-15T07:30:00Z',
        ends_at: '2026-10-15T08:30:00Z',
        status: 'completed',
      },
    ]);
    zeige({ ...ZUGANG, writable: false, read_until: '2026-12-31T12:00:00+01:00' });
    expect(await screen.findByText('bis 15. Oktober 2026')).toBeInTheDocument();
  });

  it('nennt nach einem gekündigten Nachsorge-Abo dessen Ende und die Lesezeit (ANG-004)', async () => {
    ladeAbo.mockResolvedValue({
      id: 'abababab-abab-4bab-8bab-000000000001',
      starts_on: '2026-09-05',
      ends_on: '2026-11-04',
      state: 'ending',
      next_month_start: null,
      next_month_price_cents: null,
      cancel_effective_on: null,
      cancelled_at: '2026-10-07T09:30:00Z',
      cancelled_via: 'platform',
      can_cancel: false,
    });
    zeige({ ...ZUGANG, read_until: '2026-12-05T00:00:00+01:00' });
    expect(
      await screen.findByText(/Ihr Nachsorge-Abo endet am 04\.11\.2026\. Sie können hier noch bis/),
    ).toBeInTheDocument();
  });
});

describe('Zustände', () => {
  it('zeigt das Skelett, solange eine Abfrage lädt', async () => {
    ladeGewohnheiten.mockReturnValue(new Promise(() => undefined));
    const { container } = zeige();
    expect(await screen.findByText('Übersicht wird geladen')).toBeInTheDocument();
    expect(container.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(screen.queryByRole('heading', { level: 1 })).not.toBeInTheDocument();
  });

  it('meldet einen Fehler jeder Abfrage, mit dem Gruß ohne Namen', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 22, 13, 0));
    ladeNachrichten.mockRejectedValue(new Error('Netz weg'));
    zeige();
    expect(
      await screen.findByText('Die Übersicht lässt sich gerade nicht laden.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: 'Guten Tag' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
    expect(screen.queryByText(/Gerade ist nichts zu tun/)).not.toBeInTheDocument();
  });

  it('behält den Stand, wenn ein Nachladen scheitert, und sagt, dass er veraltet ist', async () => {
    ladeRechnungen.mockResolvedValue([RECHNUNG]);
    zeige();
    await screen.findByRole('link', { name: /^Rechnung RG-2026-0001/ });
    ladeRechnungen.mockRejectedValue(new Error('Netz weg'));
    act(() => focusManager.setFocused(true));
    expect(
      await screen.findByText(/Der angezeigte Stand konnte nicht aktualisiert werden/),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /^Rechnung RG-2026-0001/ })).toBeInTheDocument();
    expect(
      screen.queryByText('Die Übersicht lässt sich gerade nicht laden.'),
    ).not.toBeInTheDocument();
  });

  it('stellt den Hinweis „veraltet“ auch über die vorgezogene Hauptsache einer Vertretung (ANN-820)', async () => {
    ladeTermine.mockResolvedValue([TERMIN]);
    zeige(BEGLEITUNG, `/p?zugang=${BEGLEITUNG.access_id}`);
    const hero = await screen.findByRole('region', { name: 'Besuch bei Max Mustermann' });
    ladeTermine.mockRejectedValue(new Error('Netz weg'));
    act(() => focusManager.setFocused(true));
    const hinweis = await screen.findByText(
      /Der angezeigte Stand konnte nicht aktualisiert werden/,
    );
    expect(hinweis.compareDocumentPosition(hero) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('sagt nach dem Absenden, was mit den Angaben geschieht (D5), mit den Nummern zum Antippen', async () => {
    zeige(ZUGANG, '/p?bereich=treatment&checkin=1');
    const danke = await screen.findByText(/^Danke\. Ihre Therapeut:in sieht Ihre Angaben/);
    expect(danke).toHaveTextContent(
      'Danke. Ihre Therapeut:in sieht Ihre Angaben beim nächsten Termin. Bei akuten Beschwerden: 112 oder 116117.',
    );
    // Handoff 5.1: 112 und 116117 als `Notrufnummer`, wie im Notfallsatz.
    expect(within(danke).getByRole('link', { name: '112 anrufen' })).toHaveAttribute(
      'href',
      'tel:112',
    );
    expect(within(danke).getByRole('link', { name: '116117 anrufen' })).toHaveAttribute(
      'href',
      'tel:116117',
    );
  });

  it('bestätigt den abgeschickten Befundbogen', async () => {
    zeige(ZUGANG, '/p?bereich=treatment&bogen=1');
    expect(await screen.findByText(/Ihr Fragebogen ist bei der Praxis/)).toBeInTheDocument();
  });
});

describe('Markenmoment B auf der Übersicht (ANN-680)', () => {
  it('staffelt Gruß und Abschnitte beim ersten Erscheinen je Tab, beim Zurückkehren nicht', async () => {
    ladeTermine.mockResolvedValue([TERMIN]);
    const erstes = zeige();
    const gruss = await screen.findByRole('heading', { level: 1 });
    const moment = erstes.container.querySelector('.markenmoment');
    expect(moment).not.toBeNull();
    // Der Gruß kommt zuerst, die Abschnitte danach je eine Stufe später (`index.css`).
    expect(moment?.querySelector('.markenmoment-gruss')).toContainElement(gruss);
    const folgen = [...(moment?.querySelectorAll<HTMLElement>('.markenmoment-folge') ?? [])].map(
      (el) => el.style.getPropertyValue('--folge'),
    );
    expect(folgen).toEqual(['1']);
    erstes.unmount();

    const zweites = zeige();
    await screen.findByRole('heading', { level: 1 });
    expect(zweites.container.querySelector('.markenmoment')).toBeNull();
  });
});
