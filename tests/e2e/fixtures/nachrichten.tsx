import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { SessionContext } from '@/features/auth/sessionContext';
import {
  ANTWORTFRIST_KEY,
  rueckfrageKey,
  rueckfragenKey,
  type Rueckfrage,
  type Rueckfragezeile,
} from '@/features/messages/api';
import { RueckfragePage, RueckfragenPage } from '@/features/messages/RueckfragenPage';
import {
  nachrichtenSchluessel,
  plaeneSchluessel,
  termineSchluessel,
  wuenscheSchluessel,
  type Nachrichten,
  type Plattformzugang,
} from '@/features/platform/api';
import { PlattformApp } from '@/features/platform/PlattformApp';
import { kalendertag } from '@/features/platform/zeit';
import type { CurrentUser } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `nachrichten.html` (KOM-EPIC-001).
 *
 * Plattform: `?seite=liste` (Standard), `neu`, `verlauf`. Praxis:
 * `praxisliste` (Kommunikation → Rückfragen) und `praxisverlauf` (eine
 * Rückfrage mit Antwort und „In die Akte übernehmen"). Die Daten liegen
 * vorab im Cache; gesprochen wird mit keinem Server. Alles ist synthetisch.
 */
const seite = new URLSearchParams(window.location.search).get('seite') ?? 'liste';
const heute = kalendertag(new Date());

const zugang: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
};

function vorTagen(tage: number, stunde = 9): string {
  const d = new Date();
  d.setDate(d.getDate() - tage);
  d.setHours(stunde, 15, 0, 0);
  return d.toISOString();
}

function inTagen(tage: number): string {
  const d = new Date();
  d.setDate(d.getDate() + tage);
  return kalendertag(d);
}

const BESCHWERDE = 'd1d1d1d1-d1d1-4d1d-8d1d-000000000001';
const TERMIN = 'd1d1d1d1-d1d1-4d1d-8d1d-000000000002';
const LANGER_TEXT =
  'Seit dem letzten Termin zieht es im rechten Knie, wenn ich Treppen gehe – besonders morgens und abwärts. Soll ich die Kniebeugen am Treppengeländer trotzdem weiter machen oder lieber pausieren, bis wir uns sehen?';

const plattform: Nachrichten = {
  response_workdays: 2,
  can_write: true,
  health_topics: true,
  messages: [
    {
      id: BESCHWERDE,
      topic: 'exercise',
      reference_label: 'Am Treppengeländer festhalten und langsam in die Hocke gehen',
      status: 'answered',
      due_on: null,
      created_at: vorTagen(2),
      last_entry_at: vorTagen(1),
      closed_at: null,
      closed_by_side: null,
      entries: [
        {
          id: 'e1e1e1e1-0000-4000-8000-000000000001',
          side: 'person',
          body: LANGER_TEXT,
          created_at: vorTagen(2),
          author: 'you',
          author_label: null,
        },
        {
          id: 'e1e1e1e1-0000-4000-8000-000000000002',
          side: 'practice',
          body: 'Bitte nur so tief, wie es ohne Schmerz geht, und die Treppe abwärts langsam. Ich schaue mir das Knie beim nächsten Termin an.',
          created_at: vorTagen(1),
          author: 'practice',
          author_label: null,
        },
      ],
    },
    {
      id: TERMIN,
      topic: 'organisational',
      reference_label: null,
      status: 'open',
      due_on: inTagen(2),
      created_at: vorTagen(0, 8),
      last_entry_at: vorTagen(0, 8),
      closed_at: null,
      closed_by_side: null,
      entries: [
        {
          id: 'e1e1e1e1-0000-4000-8000-000000000003',
          side: 'person',
          body: 'Kann ich den Termin am Freitag auf den Nachmittag legen?',
          created_at: vorTagen(0, 8),
          author: 'you',
          author_label: null,
        },
      ],
    },
  ],
};

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(nachrichtenSchluessel(zugang.access_id), plattform);
client.setQueryData(plaeneSchluessel(zugang.access_id), { today: heute, plans: [] });
client.setQueryData(termineSchluessel(zugang.access_id), []);
client.setQueryData(wuenscheSchluessel(zugang.access_id), []);

const zeilen: Rueckfragezeile[] = [
  {
    id: BESCHWERDE,
    relationship_kind: 'treatment',
    relationship_id: '66666666-6666-4666-8666-000000000002',
    patient_id: '66666666-6666-4666-8666-000000000002',
    training_relationship_id: null,
    given_name: 'Erika',
    family_name: 'Beispiel-Langenscheidt',
    topic: 'complaint',
    reference_label: null,
    status: 'open',
    due_on: inTagen(-2),
    overdue: true,
    created_at: vorTagen(5),
    last_entry_at: vorTagen(5),
    closed_at: null,
    closed_by_side: null,
    entry_count: 1,
    asked_by: 'self',
    representative_name: null,
    can_answer: true,
    record_assigned_at: null,
  },
  {
    id: TERMIN,
    relationship_kind: 'treatment',
    relationship_id: '66666666-6666-4666-8666-000000000001',
    patient_id: '66666666-6666-4666-8666-000000000001',
    training_relationship_id: null,
    given_name: 'Max',
    family_name: 'Mustermann',
    topic: 'other',
    reference_label: null,
    status: 'open',
    due_on: inTagen(2),
    overdue: false,
    created_at: vorTagen(0),
    last_entry_at: vorTagen(0),
    closed_at: null,
    closed_by_side: null,
    entry_count: 1,
    asked_by: 'companion',
    representative_name: 'Paula Mustermann',
    can_answer: true,
    record_assigned_at: null,
  },
];
client.setQueryData(rueckfragenKey('treatment', null, false), zeilen);
client.setQueryData(ANTWORTFRIST_KEY, 2);

const vorgang: Rueckfrage = {
  ...zeilen[0]!,
  exercise_plan_id: null,
  record_assigned_by_label: null,
  can_assign: true,
  entries: [
    {
      id: 'e1e1e1e1-0000-4000-8000-000000000001',
      side: 'person',
      body: LANGER_TEXT,
      author_kind: 'self',
      author_label: null,
      created_at: vorTagen(5),
    },
  ],
};
client.setQueryData(rueckfrageKey(BESCHWERDE), vorgang);

const praxiskonto: CurrentUser = {
  profile: {
    id: '11111111-1111-4111-8111-000000000002',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000002',
    display_name: 'Anna Beispiel',
    is_active: true,
  },
  roles: ['owner', 'therapist'],
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: 'Europe/Berlin',
  appointmentGridMinutes: 5,
  staffMemberId: null,
  revenueShare: false,
};

const sitzung = { session: null, initialising: false, signOut: () => Promise.resolve() };

const pfade: Record<string, string> = {
  liste: '/p/nachrichten',
  neu: '/p/nachrichten/neu',
  verlauf: `/p/nachrichten/${BESCHWERDE}`,
  praxisliste: '/rueckfragen',
  praxisverlauf: `/rueckfragen/${BESCHWERDE}`,
};

const praxis = seite.startsWith('praxis');
const routen = praxis
  ? [
      {
        path: '/rueckfragen',
        element: (
          <div className="mx-auto max-w-5xl px-5 py-6">
            <RueckfragenPage user={praxiskonto} />
          </div>
        ),
      },
      {
        path: '/rueckfragen/:messageId',
        element: (
          <div className="mx-auto max-w-5xl px-5 py-6">
            <RueckfragePage user={praxiskonto} />
          </div>
        ),
      },
    ]
  : [
      {
        path: '*',
        element: (
          <PlattformApp
            zugaenge={[zugang]}
            email="erika.plattform@patient.invalid"
            onAbmelden={() => undefined}
          />
        ),
      },
    ];
const router = createMemoryRouter(routen, {
  initialEntries: [pfade[seite] ?? pfade['liste']!],
});

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <SessionContext.Provider value={sitzung}>
      <RouterProvider router={router} />
    </SessionContext.Provider>
  </QueryClientProvider>,
);
