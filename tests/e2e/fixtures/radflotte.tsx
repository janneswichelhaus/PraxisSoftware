import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { VorschauProvider } from '@/features/preview/VorschauProvider';
import { BikePage } from '@/features/fleet/BikePage';
import { BreakdownPage } from '@/features/fleet/BreakdownPage';
import { CheckupPage } from '@/features/fleet/CheckupPage';
import { FleetPage } from '@/features/fleet/FleetPage';
import { KeyPage } from '@/features/fleet/KeyPage';
import { WerkstattblattPage } from '@/features/fleet/WerkstattblattPage';
import type { CurrentUser, RoleKey } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `radflotte.html` (FLT-EPIC-001): die Seiten der
 * Radflotte mit echten Routen im Rahmen der Anwendung, damit ein Test die
 * Abläufe durchtippen und die Tipps zählen kann. Alle Serverantworten
 * beantwortet der Test über abgefangene Anfragen (`radflotte.spec.ts`); die
 * Daten sind erfunden. `?rolle=teamleitung` meldet Tim statt Anna an.
 */
const teamleitung = new URLSearchParams(window.location.search).get('rolle') === 'teamleitung';
const roles: RoleKey[] = teamleitung ? ['therapist', 'team_lead'] : ['therapist'];

const nutzer: CurrentUser = {
  profile: {
    id: teamleitung
      ? '11111111-1111-4111-8111-000000000004'
      : '11111111-1111-4111-8111-000000000002',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000002',
    display_name: teamleitung ? 'Tim Teamleitung' : 'Anna Beispiel',
    is_active: true,
  },
  roles,
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: 'Europe/Berlin',
  appointmentGridMinutes: 5,
  staffMemberId: teamleitung ? 'staff-tim' : 'staff-anna',
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

const seiten: [string, ReactNode][] = [
  ['/betrieb/flotte', <FleetPage user={nutzer} />],
  ['/betrieb/flotte/rad/:radId', <BikePage user={nutzer} />],
  ['/betrieb/flotte/rad/:radId/werkstatt', <WerkstattblattPage user={nutzer} />],
  ['/betrieb/flotte/checkup', <CheckupPage user={nutzer} />],
  ['/betrieb/flotte/panne', <BreakdownPage user={nutzer} />],
  ['/betrieb/flotte/schluessel', <KeyPage user={nutzer} />],
];

const router = createMemoryRouter(
  [
    ...seiten.map(([path, seite]) => ({ path, element: <Rahmen>{seite}</Rahmen> })),
    {
      path: '*',
      element: (
        <Rahmen>
          <p>Andere Seite der Anwendung (Prüfseite).</p>
        </Rahmen>
      ),
    },
  ],
  {
    initialEntries: [new URLSearchParams(window.location.search).get('pfad') ?? '/betrieb/flotte'],
  },
);

// Die gegangenen Wege für die Zählung im Test.
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
