import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { SessionContext } from '@/features/auth/sessionContext';
import { planSchluessel, type Plan } from '@/features/exercise-plans/api';
import { PlanblattSeite } from '@/features/exercise-plans/PlanblattSeite';
import {
  plaeneSchluessel,
  termineSchluessel,
  wuenscheSchluessel,
  type EigenerPlan,
  type Plattformzugang,
  type Termin,
} from '@/features/platform/api';
import { PlattformApp } from '@/features/platform/PlattformApp';
import { kalendertag } from '@/features/platform/zeit';
import { isoWochentag } from '@/features/platform/uebungstage';
import type { CurrentUser } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `plattform-uebungen.html` (UEB-EPIC-003).
 *
 * `?seite=uebungen` (Standard, Reiter mit Plan und Übungstagen), `training`
 * (Reiter „Training" ohne Plan), `einheit` (Durchführungsansicht), `blatt`
 * (Plan als Blatt auf der Plattform), `woche` (Termine mit Übungstagen) und
 * `praxisblatt` (das Blatt aus der Akte). Die Daten liegen vorab im Cache;
 * gesprochen wird mit keinem Server. Alles ist synthetisch.
 */
const seite = new URLSearchParams(window.location.search).get('seite') ?? 'uebungen';
const heute = kalendertag(new Date());

const zugaenge: Plattformzugang[] = [
  {
    access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
    organization_name: 'Test Praxis Tuebingen',
    relationship_kind: 'treatment',
    status: 'active',
    readable: true,
    read_until: null,
    access_kind: 'self',
    represented_name: null,
  },
  {
    access_id: 'cafecafe-cafe-4afe-8afe-000000000003',
    organization_name: 'Test Praxis Tuebingen',
    relationship_kind: 'training',
    status: 'active',
    readable: true,
    read_until: null,
    access_kind: 'self',
    represented_name: null,
  },
];

const PLAN_ID = 'aaaaaaaa-0000-4000-8000-000000000001';

function position(
  nummer: number,
  name: string,
  teil: Partial<EigenerPlan['items'][number]> = {},
): EigenerPlan['items'][number] {
  return {
    id: `bbbbbbbb-0000-4000-8000-00000000000${nummer}`,
    position: nummer,
    variant_lay_name: name,
    instruction: 'Langsam und ruhig, ohne Schwung. Die Knie bleiben über den Füßen.',
    equipment: [],
    sets: 3,
    reps_min: 8,
    reps_max: 12,
    duration_seconds: null,
    load: null,
    tempo: null,
    rest_seconds: 45,
    double_progression: false,
    note: null,
    ...teil,
  };
}

const plan: EigenerPlan = {
  id: PLAN_ID,
  service_area: 'therapy',
  title: 'Heimprogramm nach Knie-Totalendoprothese, Phase zwei mit Treppensteigen',
  status: 'assigned',
  sessions_per_week: 3,
  assigned_on: '2026-10-01',
  runs_from: '2026-10-01',
  runs_until: '2099-11-12',
  ended_on: null,
  can_exercise: true,
  note_allowed: true,
  open_session: {
    id: 'cccccccc-0000-4000-8000-000000000001',
    sets: [{ item_id: 'bbbbbbbb-0000-4000-8000-000000000001', set_number: 1 }],
  },
  weekdays: [1, 3, isoWochentag(heute)].filter((t, i, a) => a.indexOf(t) === i),
  recent_sessions: [{ performed_on: heute, finished: false }],
  items: [
    position(1, 'Am Treppengeländer festhalten und langsam in die Hocke gehen', {
      equipment: ['Geländer oder stabile Stuhllehne'],
      note: 'Nur so tief, wie es ohne Schmerz geht.',
    }),
    position(2, 'Gelbes Band zum Körper heranziehen', {
      equipment: ['Theraband gelb'],
      load: 'Theraband gelb',
      rest_seconds: 30,
    }),
    position(3, 'Auf einem Bein stehen', {
      reps_min: null,
      reps_max: null,
      duration_seconds: 30,
      sets: 2,
      rest_seconds: null,
    }),
  ],
};

function inTagen(tage: number, stunde: number): string {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  d.setHours(stunde, 30, 0, 0);
  return d.toISOString();
}

const termine: Termin[] = [
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
    starts_at: inTagen(1, 9),
    ends_at: inTagen(1, 10),
    appointment_type: 'home_visit',
    status: 'confirmed',
    staff_name: 'Anna Beispiel',
    location_name: null,
    visit_street: 'Am langen Hinterhofweg',
    visit_house_number: '17a',
    visit_postal_code: '72072',
    visit_city: 'Tübingen',
    late_notice: false,
    open_request_kind: null,
  },
];

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(plaeneSchluessel(zugaenge[0]!.access_id), { today: heute, plans: [plan] });
client.setQueryData(plaeneSchluessel(zugaenge[1]!.access_id), { today: heute, plans: [] });
for (const z of zugaenge) {
  client.setQueryData(termineSchluessel(z.access_id), z === zugaenge[0] ? termine : []);
  client.setQueryData(wuenscheSchluessel(z.access_id), []);
}

const praxisplan: Plan = {
  id: PLAN_ID,
  service_area: 'therapy',
  relationship_id: '66666666-6666-4666-8666-000000000002',
  given_name: 'Erika',
  family_name: 'Beispiel-Langenscheidt',
  title: plan.title,
  sessions_per_week: 3,
  status: 'assigned',
  previous_plan_id: null,
  follow_up: null,
  assigned_at: '2026-10-01T08:00:00Z',
  assigned_by_name: 'Anna Beispiel',
  runs_from: '2026-10-01',
  runs_until: '2026-11-12',
  original_runs_until: '2026-11-12',
  extended_at: null,
  ended_at: null,
  ended_on: null,
  ended_by_name: null,
  created_at: '2026-10-01T07:00:00Z',
  created_by_name: 'Anna Beispiel',
  today: heute,
  can_write: true,
  review_due: false,
  relationship_open: true,
  previous: null,
  sessions: [],
  items: plan.items.map((p) => ({
    ...p,
    variant_id: p.id,
    exercise_name: 'Fachname',
    exercise_lay_name: p.variant_lay_name,
    variant_name: 'Fachname der Variante',
    body_region: 'knie',
    variant_archived: false,
    previous_item_id: null,
    step_axis: null,
    step_direction: null,
  })),
};
client.setQueryData(planSchluessel(PLAN_ID), praxisplan);

const praxiskonto: CurrentUser = {
  profile: {
    id: '11111111-1111-4111-8111-000000000002',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000002',
    display_name: 'Anna Beispiel',
    is_active: true,
  },
  roles: ['therapist'],
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: 'Europe/Berlin',
  appointmentGridMinutes: 5,
  staffMemberId: null,
  revenueShare: false,
};

const sitzung = { session: null, initialising: false, signOut: () => Promise.resolve() };

const pfade: Record<string, string> = {
  uebungen: '/p/uebungen?bereich=treatment',
  training: '/p/uebungen?bereich=training',
  einheit: `/p/uebungen/einheit/${PLAN_ID}?bereich=treatment`,
  blatt: `/p/uebungen/blatt/${PLAN_ID}?bereich=treatment`,
  woche: '/p/termine?bereich=treatment',
  praxisblatt: `/patienten/x/plaene/${PLAN_ID}/blatt`,
};

const element =
  seite === 'praxisblatt' ? (
    <div className="mx-auto max-w-4xl px-5 py-6">
      <PlanblattSeite user={praxiskonto} />
    </div>
  ) : (
    <PlattformApp
      zugaenge={zugaenge}
      email="erika.plattform@patient.invalid"
      onAbmelden={() => undefined}
    />
  );

// Die Seite der Praxis liest die Kennung des Plans aus dem Pfad.
const routen =
  seite === 'praxisblatt'
    ? [{ path: '/patienten/:patientId/plaene/:planId/blatt', element }]
    : [{ path: '*', element }];
const router = createMemoryRouter(routen, {
  initialEntries: [pfade[seite] ?? pfade['uebungen']!],
});

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <SessionContext.Provider value={sitzung}>
      <RouterProvider router={router} />
    </SessionContext.Provider>
  </QueryClientProvider>,
);
