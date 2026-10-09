import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { BIBLIOTHEK_SCHLUESSEL, type Bibliothek } from '@/features/exercises/api';
import {
  FAELLIG_SCHLUESSEL,
  planSchluessel,
  planlisteSchluessel,
  type Plan,
  type Position,
} from '@/features/exercise-plans/api';
import { PlanAbschnitt } from '@/features/exercise-plans/PlanAbschnitt';
import { PlanPage } from '@/features/exercise-plans/PlanPage';
import { PlanWiedervorlage } from '@/features/exercise-plans/Wiedervorlage';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `plaene.html` (UEB-EPIC-002).
 *
 * `?seite=entwurf` (Standard), `zugewiesen` (läuft aus), `fassung` (neue
 * Fassung mit Schritten), `akte` (Abschnitt in der Akte) oder `offen`
 * (Wiedervorlage). Die Daten liegen vorab im Cache; gesprochen wird mit keinem
 * Server. Alles ist synthetisch.
 */
const seite = new URLSearchParams(window.location.search).get('seite') ?? 'entwurf';
const HEUTE = '2026-10-07';

function variante(id: string, name: string, laie: string, ausruestung: string[] = []) {
  return {
    id,
    name,
    lay_name: laie,
    instruction: 'Langsam und ruhig, ohne Schwung.',
    equipment: ausruestung,
    common_faults: null,
    practice_notes: null,
    archived: false,
  };
}

const bibliothek: Bibliothek = {
  can_manage: false,
  exercises: [
    {
      id: 'u1',
      name: 'Kniebeuge',
      lay_name: 'In die Hocke gehen',
      body_region: 'knie',
      archived: false,
      variants: [
        variante('v1', 'Kniebeuge am Geländer, halbe Tiefe', 'Am Geländer halb in die Hocke', [
          'Geländer',
        ]),
        variante('v2', 'Kniebeuge freistehend, halbe Tiefe', 'Frei halb in die Hocke'),
      ],
    },
    {
      id: 'u2',
      name: 'Rudern mit Band',
      lay_name: 'Arme zum Körper ziehen',
      body_region: 'bws',
      archived: false,
      variants: [
        variante('v3', 'Rudern im Sitzen, Theraband gelb', 'Im Sitzen das gelbe Band heranziehen', [
          'Theraband gelb',
        ]),
        variante('v4', 'Rudern im Sitzen, Theraband rot', 'Im Sitzen das rote Band heranziehen', [
          'Theraband rot',
        ]),
      ],
    },
  ],
  links: [
    { id: 'l1', easier_variant_id: 'v1', harder_variant_id: 'v2', axis: 'unterstuetzung' },
    { id: 'l2', easier_variant_id: 'v3', harder_variant_id: 'v4', axis: 'last' },
  ],
};

function position(id: string, nr: number, teil: Partial<Position>): Position {
  return {
    id,
    position: nr,
    variant_id: 'v1',
    exercise_name: 'Kniebeuge',
    exercise_lay_name: 'In die Hocke gehen',
    variant_name: 'Kniebeuge am Geländer, halbe Tiefe',
    variant_lay_name: 'Am Geländer halb in die Hocke',
    body_region: 'knie',
    instruction:
      'Mit beiden Händen festhalten. Langsam halb in die Hocke, kurz halten, wieder aufrichten.',
    equipment: ['Geländer'],
    variant_archived: false,
    sets: 3,
    reps_min: 8,
    reps_max: 12,
    duration_seconds: null,
    load: 'Rucksack mit 3 kg Wasserflaschen',
    tempo: '3 s runter, 1 s hoch',
    rest_seconds: 60,
    double_progression: true,
    note: 'Wenn das Knie nach innen zieht, Spiegel benutzen und Füße etwas weiter auseinander.',
    previous_item_id: null,
    step_axis: null,
    step_direction: null,
    ...teil,
  };
}

const rudern = (id: string, teil: Partial<Position> = {}) =>
  position(id, 2, {
    variant_id: 'v3',
    exercise_name: 'Rudern mit Band',
    exercise_lay_name: 'Arme zum Körper ziehen',
    variant_name: 'Rudern im Sitzen, Theraband gelb',
    variant_lay_name: 'Im Sitzen das gelbe Band heranziehen',
    body_region: 'bws',
    equipment: ['Theraband gelb'],
    reps_min: 15,
    reps_max: 15,
    load: null,
    tempo: null,
    double_progression: false,
    note: null,
    ...teil,
  });

function plan(teil: Partial<Plan>): Plan {
  return {
    id: 'p1',
    service_area: 'therapy',
    relationship_id: 'pat1',
    given_name: 'Erika',
    family_name: 'Beispiel-Musterfrau',
    title: 'Heimprogramm Knie nach Kreuzbandplastik, Phase zwei',
    sessions_per_week: 3,
    status: 'draft',
    previous_plan_id: null,
    follow_up: null,
    assigned_at: null,
    assigned_by_name: null,
    runs_from: null,
    runs_until: null,
    original_runs_until: null,
    extended_at: null,
    ended_at: null,
    ended_on: null,
    ended_by_name: null,
    created_at: '2026-10-07T08:00:00Z',
    created_by_name: 'Anna Beispiel',
    today: HEUTE,
    can_write: true,
    review_due: false,
    relationship_open: true,
    previous: null,
    items: [position('i1', 1, {}), rudern('i2')],
    sessions: [],
    ...teil,
  };
}

const zugewiesen = plan({
  status: 'assigned',
  // UEB-010: was die Person auf der Plattform abgehakt hat.
  sessions: [
    {
      id: 's1',
      performed_on: '2026-10-06',
      started_at: '2026-10-06T07:00:00Z',
      finished_at: '2026-10-06T07:20:00Z',
      sets_done: 5,
      sets_total: 6,
      difficulty_note: 'Beim Aufstehen aus der Hocke zieht es im rechten Knie.',
      recorded_by_kind: 'self',
      finished_by_kind: 'self',
    },
  ],
  assigned_at: '2026-08-31T08:00:00Z',
  assigned_by_name: 'Anna Beispiel',
  runs_from: '2026-08-31',
  runs_until: '2026-10-12',
  original_runs_until: '2026-10-12',
  review_due: true,
});

const fassung = plan({
  id: 'p2',
  previous_plan_id: 'p1',
  previous: {
    id: 'p1',
    title: zugewiesen.title,
    sessions_per_week: 3,
    runs_from: '2026-08-31',
    runs_until: '2026-10-12',
    items: [position('a1', 1, {}), rudern('a2')],
  },
  items: [
    position('i1', 1, {
      previous_item_id: 'a1',
      load: 'Rucksack 5 kg',
      step_axis: 'last',
      step_direction: 'harder',
    }),
    rudern('i2', {
      previous_item_id: 'a2',
      variant_id: 'v4',
      variant_name: 'Rudern im Sitzen, Theraband rot',
      variant_lay_name: 'Im Sitzen das rote Band heranziehen',
      equipment: ['Theraband rot'],
      step_axis: 'last',
      step_direction: 'harder',
    }),
  ],
});

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(BIBLIOTHEK_SCHLUESSEL, bibliothek);
client.setQueryData(planSchluessel('p1'), seite === 'entwurf' ? plan({}) : zugewiesen);
client.setQueryData(planSchluessel('p2'), fassung);
client.setQueryData(planlisteSchluessel('therapy', 'pat1'), {
  can_write: true,
  today: HEUTE,
  plans: [
    {
      id: 'p2',
      title: zugewiesen.title,
      status: 'draft',
      sessions_per_week: 3,
      previous_plan_id: 'p1',
      assigned_at: null,
      runs_from: null,
      runs_until: null,
      ended_at: null,
      created_at: '2026-10-07T08:00:00Z',
      item_count: 2,
      review_due: false,
    },
    {
      id: 'p1',
      title: zugewiesen.title,
      status: 'assigned',
      sessions_per_week: 3,
      previous_plan_id: null,
      assigned_at: '2026-08-31T08:00:00Z',
      runs_from: '2026-08-31',
      runs_until: '2026-10-12',
      ended_at: null,
      created_at: '2026-08-30T08:00:00Z',
      item_count: 2,
      review_due: true,
    },
    {
      id: 'p0',
      title: 'Erste Woche nach der Operation',
      status: 'superseded',
      sessions_per_week: 5,
      previous_plan_id: null,
      assigned_at: '2026-08-10T08:00:00Z',
      runs_from: '2026-08-10',
      runs_until: '2026-08-31',
      ended_at: '2026-08-31T08:00:00Z',
      created_at: '2026-08-10T08:00:00Z',
      item_count: 4,
      review_due: false,
    },
  ],
});
client.setQueryData(FAELLIG_SCHLUESSEL, {
  today: HEUTE,
  plans: [
    {
      id: 'p1',
      service_area: 'therapy',
      relationship_id: 'pat1',
      given_name: 'Erika',
      family_name: 'Beispiel-Musterfrau',
      title: zugewiesen.title,
      runs_until: '2026-10-12',
      follow_up_draft: true,
    },
    {
      id: 'p9',
      service_area: 'training',
      relationship_id: 't1',
      given_name: 'Tina',
      family_name: 'Training',
      title: 'Kraft Grundlagen',
      runs_until: '2026-10-01',
      follow_up_draft: false,
    },
  ],
});

const rahmen = (kind: ReactNode) => <main className="mx-auto max-w-5xl px-4 py-6">{kind}</main>;

const start: Record<string, string> = {
  entwurf: '/patienten/pat1/plaene/p1',
  zugewiesen: '/patienten/pat1/plaene/p1',
  fassung: '/patienten/pat1/plaene/p2',
  akte: '/akte',
  offen: '/offen',
};

const router = createMemoryRouter(
  [
    { path: '/patienten/:patientId/plaene/:planId', element: rahmen(<PlanPage />) },
    {
      path: '/akte',
      element: rahmen(<PlanAbschnitt bereich="therapy" verhaeltnisId="pat1" rueckweg="/akte" />),
    },
    {
      path: '/offen',
      element: rahmen(<PlanWiedervorlage bereiche={['therapy', 'training']} rueckweg="/offen" />),
    },
    { path: '*', element: rahmen(<p>Ende der Prüfseite.</p>) },
  ],
  { initialEntries: [start[seite] ?? start['entwurf']!] },
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
