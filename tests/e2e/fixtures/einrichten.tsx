import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { VorschauProvider } from '@/features/preview/VorschauProvider';
import { NewStaffMemberPage } from '@/features/staff/NewStaffMemberPage';
import type { CurrentUser, RoleKey } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `einrichten.html` (Überholung 6, G5): „Neue:n
 * Mitarbeiter:in einrichten“ mit echter Route im Rahmen der Anwendung, damit
 * ein Test den Ablauf durchtippen, die Tipps zählen und jede Seite bei 375 px
 * vermessen kann. Alle Serverantworten beantwortet der Test über abgefangene
 * Anfragen (`einrichten.spec.ts`); die Daten sind erfunden. `?rolle=office`
 * meldet Olivia Office statt Jannes Test an.
 */
const office = new URLSearchParams(window.location.search).get('rolle') === 'office';
const roles: RoleKey[] = office ? ['office'] : ['owner', 'therapist'];

const nutzer: CurrentUser = {
  profile: {
    id: office ? '11111111-1111-4111-8111-000000000003' : '11111111-1111-4111-8111-000000000001',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: office
      ? '44444444-4444-4444-8444-000000000003'
      : '44444444-4444-4444-8444-000000000001',
    display_name: office ? 'Olivia Office' : 'Jannes Test',
    is_active: true,
  },
  roles,
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: 'Europe/Berlin',
  appointmentGridMinutes: 5,
  staffMemberId: office
    ? '55555555-5555-4555-8555-000000000003'
    : '55555555-5555-4555-8555-000000000001',
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
      path: '/praxis/team/neu',
      element: (
        <Rahmen>
          <NewStaffMemberPage user={nutzer} />
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
  { initialEntries: ['/praxis/team/neu'] },
);

// Die gegangenen Wege für den Test.
const wege: string[] = [router.state.location.pathname];
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
