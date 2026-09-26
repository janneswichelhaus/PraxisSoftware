import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { StaffListPage } from '@/features/staff/StaffListPage';
import type { StaffMember } from '@/features/staff/api';
import type { CurrentUser, RoleKey } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `organisation.html` (UX-EPIC-002, UX-002h).
 *
 * „Organisatorisches → Mitarbeitende" mit Rahmen, Untermenü und Tableiste —
 * mit erfundenen Personen, ohne Server. `?rolle=trainer` zeigt das Menü, wie
 * trainer es sieht (BEF-034).
 */
const rolle = (new URLSearchParams(window.location.search).get('rolle') ?? 'owner') as RoleKey;

const nutzer: CurrentUser = {
  profile: {
    id: '11111111-1111-4111-8111-000000000001',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000001',
    display_name: 'Jannes Test',
    is_active: true,
  },
  roles: [rolle],
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: 'Europe/Berlin',
  appointmentGridMinutes: 5,
  staffMemberId: null,
};

function person(nummer: number, vorname: string, nachname: string): StaffMember {
  return {
    id: `55555555-5555-4555-8555-00000000000${nummer}`,
    person_id: `44444444-4444-4444-8444-00000000000${nummer}`,
    given_name: vorname,
    family_name: nachname,
    employment_status: nummer === 4 ? 'inactive' : 'active',
    work_email: `${vorname.toLowerCase()}@praxis.invalid`,
    work_phone: `+49 7071 000010${nummer}`,
    primary_location_id: null,
    primary_location_name: 'Hauptstandort Tuebingen',
    date_of_birth: null,
    private_email: null,
    private_phone: null,
    street: null,
    postal_code: null,
    city: null,
  };
}

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(
  ['staff-members'],
  [person(2, 'Anna', 'Beispiel'), person(3, 'Nina', 'Neu'), person(4, 'Tim', 'Teamleitung')],
);
client.setQueryData(
  ['assignable-therapists'],
  [{ staff_member_id: '55555555-5555-4555-8555-000000000002', display_name: 'Anna Beispiel' }],
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={['/praxis/team']}>
      <AppShell user={nutzer} onSignOut={() => undefined}>
        <StaffListPage user={nutzer} />
      </AppShell>
    </MemoryRouter>
  </QueryClientProvider>,
);
