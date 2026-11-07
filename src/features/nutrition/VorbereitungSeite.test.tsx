import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type * as ErnaehrungApi from './api';
import type { Ernaehrungssicht } from './api';
import type * as Uebungen from '@/features/exercise';
import type { Ernaehrungsverlauf } from './verlauf';
import { VorbereitungSeite } from './VorbereitungSeite';

const fetchErnaehrung = vi.fn<() => Promise<Ernaehrungssicht | null>>();
const fetchVerlauf = vi.fn<() => Promise<Ernaehrungsverlauf | null>>();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof ErnaehrungApi>()),
  fetchErnaehrung: () => fetchErnaehrung(),
  fetchVerlauf: () => fetchVerlauf(),
}));
const fetchCheckins = vi.fn();
vi.mock('@/features/exercise', async (importOriginal) => ({
  ...(await importOriginal<typeof Uebungen>()),
  fetchCheckins: () => fetchCheckins() as unknown,
}));

const PATIENT = '66666666-6666-4666-8666-000000000002';

function sicht(): Ernaehrungssicht {
  return {
    today: '2026-11-07',
    relationship_open: true,
    birth_date_known: true,
    running_elsewhere: null,
    earlier_count: 0,
    profile: {
      id: 'profil-1',
      ended_on: null,
      notes: 'Frühstück fällt oft aus.',
      plans: [
        { id: 'p1', title: 'Zwei Tage zum Ausprobieren', starts_on: '2026-11-06', ended_on: null },
      ],
    },
  } as unknown as Ernaehrungssicht;
}

const SPANNE = {
  from: '2026-10-31',
  to: '2026-11-07',
  days: 8,
  food_days: 2,
  water_days: 2,
  energy_kcal: 820,
  protein_g: 25,
  fat_g: 12,
  carbohydrate_g: 140,
  water_ml: 1000,
};

function verlauf(zusatz: Partial<Ernaehrungsverlauf> = {}): Ernaehrungsverlauf {
  return {
    today: '2026-11-07',
    started_on: '2026-10-17',
    ended_on: null,
    last_session_on: '2026-10-30',
    next_session_on: '2026-11-10',
    target_weight_kg: 68,
    targets: { energy_kcal: 1900, protein_g: 80, fat_g: 65, carbohydrate_g: 230, water_ml: 2400 },
    period: SPANNE,
    weeks: [
      { week_start: '2026-11-02', ...SPANNE, from: '2026-11-02' },
      {
        ...SPANNE,
        week_start: '2026-10-26',
        from: '2026-10-26',
        to: '2026-11-01',
        days: 7,
        food_days: 0,
        water_days: 0,
        energy_kcal: null,
        protein_g: null,
        fat_g: null,
        carbohydrate_g: null,
        water_ml: null,
      },
    ],
    weights: [
      { measured_on: '2026-10-17', weight_kg: 74.6 },
      { measured_on: '2026-10-31', weight_kg: 73.5 },
    ],
    sessions: ['2026-10-30'],
    plan_events: [
      { occurred_on: '2026-11-06', kind: 'plan_assigned', title: 'Zwei Tage zum Ausprobieren' },
    ],
    ...zusatz,
  };
}

function checkins() {
  return {
    today: '2026-11-07',
    can_write: true,
    relationship_open: true,
    schedule: null,
    checkins: [
      {
        answered_on: '2026-11-03',
        recorded_at: '2026-11-03T08:00:00Z',
        recorded_by_kind: 'self',
        values: { pain_nrs: 3 },
      },
    ],
    time_zone: 'Europe/Berlin',
    sessions: [],
    events: [],
    plan_events: [],
    appointment_days: ['2026-10-20', '2026-11-04'],
    events_writable: false,
    health_consent: null,
    habits: [],
    habits_max: 3,
    habits_writable: false,
  };
}

function zeige() {
  const router = createMemoryRouter(
    [
      {
        path: '/patienten/:patientId/ernaehrung/vorbereiten',
        element: <VorbereitungSeite art="treatment" />,
      },
    ],
    { initialEntries: [`/patienten/${PATIENT}/ernaehrung/vorbereiten`] },
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchErnaehrung.mockReset().mockResolvedValue(sicht());
  fetchVerlauf.mockReset().mockResolvedValue(verlauf());
  fetchCheckins.mockReset().mockResolvedValue(checkins());
});

describe('Sitzung vorbereiten (ERN-023)', () => {
  it('eine Ansicht: Zeitraum, Wochenmittel neben Zielwerten, Gewicht, Check-ins, Plan, Notizen', async () => {
    zeige();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sitzung vorbereiten' }),
    ).toBeVisible();
    expect(
      screen.getByText('Seit der Beratung am 30.10.2026 · nächste am 10.11.2026'),
    ).toBeVisible();
    expect(screen.getByText(/^Ziel 1900\skcal$/)).toBeVisible();

    const wochen = screen.getByRole('heading', { name: 'Wochenmittel' }).closest('section')!;
    expect(within(wochen).getByText('Woche ab 02.11.2026')).toBeVisible();
    expect(within(wochen).getByText(/^820 von 1900\skcal$/)).toBeVisible();
    expect(within(wochen).getByText(/^Nichts eingetragen/)).toBeVisible();

    expect(
      (await screen.findAllByText(/Plan begonnen · Zwei Tage zum Ausprobieren/))[0],
    ).toBeVisible();
    expect(screen.getByText('Striche an der Zeitachse: Beratungen.')).toBeVisible();
    // Check-ins seit der letzten Beratung: einer; Termine danach: einer.
    expect(
      await screen.findByText('1 Check-in, 0 Einheiten und 1 Termin seit der letzten Beratung'),
    ).toBeVisible();
    expect(screen.getByText('Frühstück fällt oft aus.')).toBeVisible();
    expect(screen.getByRole('link', { name: 'Plan ansehen' })).toHaveAttribute(
      'href',
      `/patienten/${PATIENT}/ernaehrung/plan`,
    );
  });

  it('ohne Gewicht und ohne Recht auf die Check-ins: nichts erfunden', async () => {
    fetchVerlauf.mockResolvedValue(verlauf({ weights: [], last_session_on: null }));
    fetchCheckins.mockResolvedValue(null);
    zeige();
    expect(await screen.findByText('Noch kein Gewicht eingetragen.')).toBeVisible();
    expect(screen.getByText(/^Seit Beginn am 17.10.2026/)).toBeVisible();
    expect(await screen.findByText('Nicht freigegeben')).toBeVisible();
  });

  it('ohne Recht: nicht freigegeben', async () => {
    fetchVerlauf.mockResolvedValue(null);
    zeige();
    expect(await screen.findByText('Nicht freigegeben')).toBeVisible();
  });
});
