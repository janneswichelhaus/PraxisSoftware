import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { KENNZAHLEN_KEY, ZIELE_KEY } from '@/features/statistics/api';
import { StatisticsPage } from '@/features/statistics/StatisticsPage';
import { beispielKennzahlen } from '@/features/statistics/testdaten';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `statistik.html` (STA-EPIC-001).
 *
 * Die Kennzahlen und Zielwerte liegen vorab im Cache; gesprochen wird mit
 * keinem Server. Alles ist synthetisch und besteht nur aus Summen.
 */
const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData([...KENNZAHLEN_KEY, null], beispielKennzahlen());
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
    { path: '/statistiken', element: rahmen(<StatisticsPage />) },
    { path: '*', element: rahmen(<p>Ende der Prüfseite.</p>) },
  ],
  { initialEntries: ['/statistiken'] },
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
