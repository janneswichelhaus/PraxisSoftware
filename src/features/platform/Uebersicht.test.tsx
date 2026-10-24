import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor, within } from '@testing-library/react';
import type * as PlattformApi from './api';
import type { Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';

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
}));

const { Uebersicht } = await import('./Uebersicht');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
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
});

afterEach(() => {
  vi.useRealTimers();
});

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
      '/p/termine?bereich=treatment',
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

  it('nimmt ohne Aufgabe den nächsten Termin, ohne zweite Besuchskarte', async () => {
    ladeBefundbogen.mockResolvedValue(BOGEN_FERTIG);
    ladeTermine.mockResolvedValue([TERMIN]);
    zeige();
    const hero = await screen.findByRole('region', { name: /^Besuch (am|morgen|heute)/ });
    expect(within(hero).getByText('Anna Beispiel kommt zu Ihnen')).toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: 'Termin ansehen' })).toHaveAttribute(
      'href',
      '/p/termine?bereich=treatment',
    );
    expect(screen.queryByRole('heading', { name: /Besuch$/ })).not.toBeInTheDocument();
  });

  it('sagt ohne Aufgabe und ohne Termin, dass gerade nichts zu tun ist', async () => {
    ladeBefundbogen.mockResolvedValue(BOGEN_FERTIG);
    zeige();
    expect(await screen.findByText('Gerade ist nichts zu tun.')).toBeInTheDocument();
    expect(screen.getByText('Zurzeit ist kein Termin vereinbart.')).toBeInTheDocument();
    expect(screen.queryByRole('region')).not.toBeInTheDocument();
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
          items: [{}, {}, {}, {}],
        },
      ],
    });
    zeige();
    const hero = await screen.findByRole('region', { name: 'Ihre Übungen für heute' });
    expect(within(hero).getByText('4 Übungen aus Ihrem Plan')).toBeInTheDocument();
    expect(within(hero).getByRole('link', { name: 'Übungen beginnen' })).toHaveAttribute(
      'href',
      '/p/uebungen/einheit/aeaeaeae-aeae-4eae-8eae-000000000001?bereich=treatment',
    );
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
    const zeile = await screen.findByRole('link', { name: /^Antwort der Praxis/ });
    expect(
      within(zeile).getByText('Ihr Terminwunsch war leider nicht möglich: Diese Woche ist voll.'),
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
          items: [{}, {}, {}],
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
    expect(screen.getByRole('link', { name: /^Ihr Plan für zu Hause/ })).toHaveAttribute(
      'href',
      '/p/uebungen?bereich=training',
    );
    expect(screen.getByRole('link', { name: /^Ernährungstagebuch/ })).toHaveAttribute(
      'href',
      '/p/ernaehrung/tagebuch?bereich=training',
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
    expect(screen.getByText('Einwilligungen gibt nur Max Mustermann selbst.')).toBeInTheDocument();
    expect(ladeTrainingsangebot).not.toHaveBeenCalled();
    expect(ladeErnaehrung).not.toHaveBeenCalled();
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
    zeige({ ...ZUGANG, read_until: '2026-12-31T12:00:00+01:00' });
    const hero = await screen.findByRole('region', { name: 'Unterlagen sichern' });
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

  it('sagt nach dem Absenden, was mit den Angaben geschieht (D5)', async () => {
    zeige(ZUGANG, '/p?bereich=treatment&checkin=1');
    expect(
      await screen.findByText(
        'Danke. Ihre Therapeut:in sieht Ihre Angaben beim nächsten Termin. Bei akuten Beschwerden: 112 oder 116117.',
      ),
    ).toBeInTheDocument();
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
