import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { VorschauProvider } from '@/features/core/preview/VorschauProvider';
import { InvoicesPage } from '@/features/billing/InvoicesPage';
import { SammeldruckPage } from '@/features/billing/SammeldruckPage';
import type { CurrentUser } from '@/features/core/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `abrechnungslauf.html` (Bereichsüberholung 4):
 * Rechnungen und Sammeldruck mit echten Routen im Rahmen der Anwendung, damit
 * ein Test den Monatslauf (K13) und die Sammelbuchung (K14) durchtippen und
 * die Tipps zählen kann. Alle Serverantworten beantwortet der Test über
 * abgefangene Anfragen (`abrechnungslauf.spec.ts`); die Daten sind erfunden.
 */
const nutzer: CurrentUser = {
  profile: {
    id: '11111111-1111-4111-8111-000000000003',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000003',
    display_name: 'Olivia Office',
    is_active: true,
  },
  roles: ['office'],
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: 'Europe/Berlin',
  appointmentGridMinutes: 5,
  staffMemberId: null,
  revenueShare: false,
};

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });

export function Rahmen({ children }: { children: ReactNode }) {
  return (
    <VorschauProvider>
      <AppShell user={nutzer} onSignOut={() => undefined}>
        {children}
      </AppShell>
    </VorschauProvider>
  );
}

const router = createMemoryRouter(
  [
    {
      path: '/abrechnung',
      element: (
        <Rahmen>
          <InvoicesPage user={nutzer} />
        </Rahmen>
      ),
    },
    {
      path: '/abrechnung/druck',
      element: (
        <Rahmen>
          <SammeldruckPage />
        </Rahmen>
      ),
    },
    {
      path: '*',
      element: (
        <Rahmen>
          <p>Andere Seite der Anwendung (Prüfseite).</p>
        </Rahmen>
      ),
    },
  ],
  { initialEntries: ['/abrechnung'] },
);

// Die gegangenen Wege für die Zählung im Test.
const wege: string[] = ['/abrechnung'];
(window as unknown as { __wege: string[] }).__wege = wege;
router.subscribe((stand) => {
  const weg = `${stand.location.pathname}${stand.location.search}`;
  if (wege[wege.length - 1] !== weg) wege.push(weg);
});

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
