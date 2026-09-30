import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type { TrainingClient, TrainingClientListItem } from '@/features/training/api';
import { NewTrainingClientPage } from '@/features/training/NewTrainingClientPage';
import { TrainingClientPage } from '@/features/training/TrainingClientPage';
import { TrainingClientsPage } from '@/features/training/TrainingClientsPage';
import type { CurrentUser } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `training.html` (TRN-EPIC-001).
 *
 * `?seite=liste` (Standard), `?seite=neu` oder `?seite=detail`. Die Daten
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
  street: 'Trainingsweg 1',
  postal_code: '72070',
  city: 'Tübingen',
};

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(['training-clients'], liste);
client.setQueryData(['training-client', TINA], tina);

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
  seite === 'neu' ? '/training/neu' : seite === 'detail' ? `/training/${TINA}` : '/training';

const router = createMemoryRouter(
  [
    { path: '/training', element: rahmen(<TrainingClientsPage user={user} />) },
    { path: '/training/neu', element: rahmen(<NewTrainingClientPage />) },
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
