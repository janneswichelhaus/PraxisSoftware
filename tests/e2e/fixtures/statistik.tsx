import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import {
  JE_PERSON_KEY,
  KENNZAHLEN_KEY,
  LEISTUNGEN_KEY,
  MONATE_KEY,
  ZIELE_KEY,
} from '@/features/statistics/api';
import { StatisticsPage } from '@/features/statistics/StatisticsPage';
import {
  beispielJePerson,
  beispielKennzahlen,
  beispielLeistungen,
  beispielMonate,
} from '@/features/statistics/testdaten';
import type { CurrentUser } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `statistik.html` (STA-EPIC-001).
 *
 * Die Kennzahlen und Zielwerte liegen vorab im Cache; gesprochen wird mit
 * keinem Server. Alles ist synthetisch und besteht nur aus Summen.
 */
const jannes: CurrentUser = {
  profile: {
    id: '11111111-1111-4111-8111-000000000001',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000001',
    display_name: 'Jannes Test',
    is_active: true,
  },
  roles: ['owner', 'therapist'],
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: 'Europe/Berlin',
  appointmentGridMinutes: 5,
  staffMemberId: '55555555-5555-4555-8555-000000000001',
  revenueShare: false,
};

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData([...KENNZAHLEN_KEY, null], beispielKennzahlen());
client.setQueryData(MONATE_KEY, beispielMonate());
client.setQueryData([...LEISTUNGEN_KEY, null], beispielLeistungen());
client.setQueryData([...JE_PERSON_KEY, 6], beispielJePerson());
client.setQueryData(ZIELE_KEY, {
  revenue_cents: 1_500_000,
  open_items_cents: 30_000,
  utilization_percent: 80,
  ending_bases: null,
  absences: 3,
});

const rahmen = (kind: ReactNode) => <main className="mx-auto max-w-5xl px-4 py-6">{kind}</main>;

const router = createMemoryRouter(
  [
    { path: '/statistiken', element: rahmen(<StatisticsPage user={jannes} />) },
    { path: '*', element: rahmen(<p>Ende der Prüfseite.</p>) },
  ],
  { initialEntries: ['/statistiken'] },
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
