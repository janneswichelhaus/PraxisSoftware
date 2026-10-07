import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type {
  TrainingAppointment,
  TrainingBasis,
  TrainingClient,
  TrainingClientAppointment,
  TrainingClientListItem,
  TrainingProtocol,
  TrainingUnit,
} from '@/features/training/api';
import { NewTrainingAppointmentPage } from '@/features/training/NewTrainingAppointmentPage';
import { TrainingAppointmentPage } from '@/features/training/TrainingAppointmentPage';
import { NewTrainingClientPage } from '@/features/training/NewTrainingClientPage';
import { TrainingClientPage } from '@/features/training/TrainingClientPage';
import { TrainingClientsPage } from '@/features/training/TrainingClientsPage';
import type { CurrentUser } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `training.html` (TRN-EPIC-001).
 *
 * `?seite=liste` (Standard), `?seite=neu`, `?seite=detail`, seit TRN-EPIC-002
 * `?seite=termin` (Trainingstermin) und `?seite=termin-neu`, seit
 * TRN-EPIC-004 `?seite=termin-dokumentiert` (abgeschlossenes Protokoll). Die Daten
 * liegen vorab im Cache; gesprochen wird mit keinem Server. Alles ist
 * synthetisch.
 */
const seite = new URLSearchParams(window.location.search).get('seite') ?? 'liste';

const TINA = 'eeeeeeee-eeee-4eee-8eee-000000000001';

const liste: TrainingClientListItem[] = [
  {
    id: TINA,
    person_id: '44444444-4444-4444-8444-000000000009',
    given_name: 'Tina',
    family_name: 'Trainingskundin',
    status: 'active',
    contract_started_on: '2026-09-01',
    contract_ended_on: null,
  },
  {
    id: 'eeeeeeee-eeee-4eee-8eee-000000000003',
    person_id: '44444444-4444-4444-8444-000000000011',
    given_name: 'Konstantin',
    family_name: 'Kraftausdauer-Langname',
    status: 'active',
    contract_started_on: null,
    contract_ended_on: null,
  },
  {
    id: 'eeeeeeee-eeee-4eee-8eee-000000000002',
    person_id: '44444444-4444-4444-8444-000000000006',
    given_name: 'Erika',
    family_name: 'Beispiel',
    status: 'inactive',
    contract_started_on: '2026-03-01',
    contract_ended_on: '2026-09-20',
  },
];

const tina: TrainingClient = {
  ...liste[0]!,
  date_of_birth: '1990-01-02',
  email: 'tina.trainingskundin-mit-langer-adresse@beispiel.invalid',
  phone: '+49 7071 0000109',
  street: 'Trainingsweg',
  house_number: '1',
  postal_code: '72070',
  city: 'Tübingen',
};

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(['training-clients'], liste);
client.setQueryData(['training-client', TINA], tina);
// KND-005: Voraussetzungen mit einer Übernahme aus der Behandlung.
client.setQueryData(['training-profil', TINA], {
  health_consent: true,
  profile: {
    goals: 'Wieder ohne Geländer Treppen steigen und im Frühjahr die Hüttenwanderung schaffen.',
    equipment: 'Theraband gelb und rot, Kurzhanteln 2 kg',
    time_budget: 'Zweimal 20 Minuten je Woche',
    places: 'Zu Hause, im Sommer im Park',
    limits: null,
    history: null,
    preferences: 'Geht gern draußen, mag keine Geräte',
    updated_at: '2026-10-07T10:00:00.000000+00:00',
    updated_by_name: 'Tom Trainingsbetreuung',
  },
  takeovers: [
    {
      title: 'Belastungsgrenzen',
      body: 'Kniebeuge bis 90 Grad, keine Sprünge bis Dezember.',
      offered_on: '2026-10-01',
      released_at: '2026-10-03T08:00:00Z',
      released_on: '2026-10-03',
    },
  ],
});
// KND-004: ein im Konto geschlossener Vertrag in der Widerrufsfrist.
client.setQueryData(
  ['training-contracts', TINA],
  [
    {
      id: 'abababab-abab-4bab-8bab-000000000021',
      concluded_at: '2026-10-03T08:00:00Z',
      concluded_on: '2026-10-03',
      package_label: 'Trainingspaket 3 Monate (eine Einheit je Woche, Plattform inklusive)',
      price_cents: 39000,
      currency: 'EUR',
      starts_on: '2026-10-20',
      ends_on: '2027-01-19',
      wording_version: '2026-10',
      early_start_requested: false,
      withdrawal_ends_on: '2026-10-17',
      withdrawn_on: null,
      withdrawn_access_kind: null,
      withdrawn_representative_name: null,
    },
  ],
);
// POR-002: der Abschnitt „Plattform" an der Kundin - hier mit aktivem Zugang.
client.setQueryData(['platform-access', 'training', TINA], {
  id: 'cafecafe-cafe-4afe-8afe-000000000001',
  status: 'active',
  created_at: '2026-09-28T08:00:00+00:00',
  activated_at: '2026-09-28T08:05:00+00:00',
  locked_at: null,
  revoked_at: null,
  revoked_reason: null,
  invitation_id: null,
  invitation_purpose: null,
  invitation_channel: null,
  invitation_expires_at: null,
  invitation_sent_at: null,
  relationship_email: 'tina.trainingskundin-mit-langer-adresse@beispiel.invalid',
  ended_at: null,
});

// TRN-EPIC-002: Vereinbarungen, Termine und ein Trainingstermin.
const TOM = '55555555-5555-4555-8555-000000000006';
const ORT = '33333333-3333-4333-8333-000000000001';
const TERMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000007';
const BASIS = 'ffffffff-ffff-4fff-8fff-000000000001';
const heute = new Date();
const um = (tage: number, stunde: number) => {
  const d = new Date(heute);
  d.setDate(d.getDate() + tage);
  d.setHours(stunde, 0, 0, 0);
  return d.toISOString();
};
const vereinbarungen: TrainingBasis[] = [
  {
    id: BASIS,
    status: 'active',
    started_on: '2026-09-01',
    agreed_quantity: 10,
    appointment_count: 7,
  },
  {
    id: 'ffffffff-ffff-4fff-8fff-000000000002',
    status: 'concluded',
    started_on: '2026-03-02',
    agreed_quantity: null,
    appointment_count: 12,
  },
];
const kundentermine: TrainingClientAppointment[] = [
  {
    id: TERMIN,
    training_basis_id: BASIS,
    staff_member_id: TOM,
    staff_given_name: 'Tom',
    staff_family_name: 'Trainingsbetreuung',
    appointment_type: 'practice',
    status: 'confirmed',
    starts_at: um(0, 10),
    ends_at: um(0, 11),
  },
  {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000008',
    training_basis_id: null,
    staff_member_id: TOM,
    staff_given_name: 'Tom',
    staff_family_name: 'Trainingsbetreuung',
    appointment_type: 'video',
    status: 'cancelled',
    starts_at: um(1, 17),
    ends_at: um(1, 18),
  },
];
const termin: TrainingAppointment = {
  id: TERMIN,
  training_relationship_id: TINA,
  training_basis_id: BASIS,
  client_given_name: 'Tina',
  client_family_name: 'Trainingskundin',
  staff_member_id: TOM,
  staff_given_name: 'Tom',
  staff_family_name: 'Trainingsbetreuung',
  location_id: ORT,
  location_name: 'Hauptstandort Tuebingen',
  appointment_type: 'practice',
  status: 'confirmed',
  starts_at: um(0, 10),
  ends_at: um(0, 11),
  updated_at: um(-1, 9),
  visit_street: null,
  visit_house_number: null,
  visit_postal_code: null,
  visit_city: null,
  cancellation_reason: null,
  cancellation_received_at: null,
  organization_time_zone: 'Europe/Berlin',
};
client.setQueryData(['training-bases', TINA], vereinbarungen);
client.setQueryData(['training-client-appointments', TINA], kundentermine);
client.setQueryData(['training-appointment', TERMIN], termin);

// TRN-EPIC-004: ein Entwurf am heutigen Termin, ein abgeschlossenes Protokoll
// an einer Einheit von vorgestern, und die Liste der Einheiten.
const VORGESTERN = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000009';
const entwurf: TrainingProtocol = {
  id: '99999999-9999-4999-8999-000000000001',
  appointment_id: TERMIN,
  status: 'draft',
  content: 'Aufwärmen 10 min Rad, Kniebeugen 3 × 10 mit 20 kg',
  created_at: um(0, 10),
  updated_at: um(0, 10),
  finalized_at: null,
  author_name: 'Tom Trainingsbetreuung',
  finalized_by_name: null,
  addenda: [],
};
const abgeschlossen: TrainingProtocol = {
  id: '99999999-9999-4999-8999-000000000002',
  appointment_id: VORGESTERN,
  status: 'final',
  content:
    'Rudern am Kabelzug 4 × 8, Plank 3 × 30 s, Ausfallschritte 3 × 12 je Seite.\nAbsprache: nächste Woche Kreuzheben einführen.',
  created_at: um(-2, 11),
  updated_at: um(-2, 11),
  finalized_at: um(-2, 11),
  author_name: 'Tom Trainingsbetreuung',
  finalized_by_name: 'Tom Trainingsbetreuung',
  // ABN-022 (BEF-113): ein Nachtrag mit Grund; der Text darüber bleibt.
  addenda: [
    {
      id: '99999999-9999-4999-8999-0000000000a1',
      content: 'Rudern mit 25 kg, nicht 30 kg.',
      reason: 'Gewicht vertippt',
      created_at: um(-1, 9),
      author_name: 'Tom Trainingsbetreuung',
    },
  ],
};
client.setQueryData(['training-protocol', TERMIN], entwurf);
client.setQueryData(['training-appointment', VORGESTERN], {
  ...termin,
  id: VORGESTERN,
  status: 'documented',
  starts_at: um(-2, 10),
  ends_at: um(-2, 11),
});
client.setQueryData(['training-protocol', VORGESTERN], abgeschlossen);
const einheiten: TrainingUnit[] = [entwurf, abgeschlossen].map((p, i) => ({
  id: p.id,
  appointment_id: p.appointment_id,
  starts_at: i === 0 ? um(0, 10) : um(-2, 10),
  ends_at: i === 0 ? um(0, 11) : um(-2, 11),
  appointment_type: 'practice',
  staff_given_name: 'Tom',
  staff_family_name: 'Trainingsbetreuung',
  status: p.status,
  content: p.content,
  finalized_at: p.finalized_at,
  author_name: p.author_name,
  organization_time_zone: 'Europe/Berlin',
}));
client.setQueryData(['training-protocols', TINA], einheiten);
client.setQueryData(
  ['assignable-trainers'],
  [{ staff_member_id: TOM, display_name: 'Tom Trainingsbetreuung' }],
);
client.setQueryData(['locations'], [{ id: ORT, name: 'Hauptstandort Tuebingen' }]);

const user: CurrentUser = {
  profile: {
    id: '11111111-1111-4111-8111-000000000007',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000010',
    display_name: 'Tom Trainingsbetreuung',
    is_active: true,
  },
  roles: ['trainer'],
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: 'Europe/Berlin',
  appointmentGridMinutes: 5,
  staffMemberId: '55555555-5555-4555-8555-000000000006',
  revenueShare: false,
};
const rahmen = (kind: ReactNode) => <main className="mx-auto max-w-5xl px-4 py-6">{kind}</main>;

const start =
  seite === 'neu'
    ? '/training/neu'
    : seite === 'detail'
      ? `/training/${TINA}`
      : seite === 'termin'
        ? `/training/termine/${TERMIN}`
        : seite === 'termin-neu'
          ? `/training/termine/neu?kunde=${TINA}&beginn=10:00`
          : seite === 'termin-dokumentiert'
            ? `/training/termine/${VORGESTERN}`
            : '/training';

const router = createMemoryRouter(
  [
    { path: '/training', element: rahmen(<TrainingClientsPage user={user} />) },
    { path: '/training/neu', element: rahmen(<NewTrainingClientPage />) },
    {
      path: '/training/termine/neu',
      element: rahmen(<NewTrainingAppointmentPage user={user} />),
    },
    {
      path: '/training/termine/:appointmentId',
      element: rahmen(<TrainingAppointmentPage user={user} />),
    },
    { path: '/training/:relationshipId', element: rahmen(<TrainingClientPage user={user} />) },
    { path: '*', element: rahmen(<p>Ende der Prüfseite.</p>) },
  ],
  { initialEntries: [start] },
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
