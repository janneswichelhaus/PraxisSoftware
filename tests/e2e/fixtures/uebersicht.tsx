import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { VorschauProvider } from '@/features/preview/VorschauProvider';
import { MyDayPage } from '@/features/today/MyDayPage';
import type { DayPlanEntry } from '@/features/today/api';
import { Stammdaten } from '@/features/patients/PatientMasterDataPage';
import type { Patient } from '@/features/patients/api';
import { tagePlus } from '@/features/appointments/calendar';
import { todayInTimeZone } from '@/features/appointments/api';
import type { CurrentUser } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `uebersicht.html` (UX-EPIC-003).
 *
 * Der Tagesstart einer Therapeutin mit erfundenem Tag, ohne Server: drei
 * Hausbesuche, der zweite braucht die Behandlungsliege. `?ansicht=akte` zeigt
 * die Stammdaten einer Person mit dem Schalter für die Liege.
 */
const ZONE = 'Europe/Berlin';
const STAFF = '55555555-5555-4555-8555-000000000002';
const heute = todayInTimeZone(ZONE);
const ansicht = new URLSearchParams(window.location.search).get('ansicht');

const nutzer: CurrentUser = {
  profile: {
    id: '11111111-1111-4111-8111-000000000002',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000002',
    display_name: 'Anna Beispiel',
    is_active: true,
  },
  roles: ['therapist'],
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: ZONE,
  appointmentGridMinutes: 5,
  staffMemberId: STAFF,
};

/** Ortszeit des heutigen Tages als Zeitpunkt; Sommer- und Winterzeit egal. */
function um(uhrzeit: string): string {
  const [stunde, minute] = uhrzeit.split(':').map(Number) as [number, number];
  const [jahr, monat, tag] = heute.split('-').map(Number) as [number, number, number];
  const utc = Date.UTC(jahr, monat - 1, tag, stunde, minute);
  const versatz =
    new Date(new Date(utc).toLocaleString('en-US', { timeZone: ZONE })).getTime() -
    new Date(new Date(utc).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(utc - versatz).toISOString();
}

function besuch(
  nummer: number,
  von: string,
  bis: string,
  teil: Partial<DayPlanEntry>,
): DayPlanEntry {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${nummer}`,
    patient_id: `66666666-6666-4666-8666-00000000000${nummer}`,
    staff_member_id: STAFF,
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: um(von),
    ends_at: um(bis),
    patient_given_name: null,
    patient_family_name: null,
    location_name: null,
    visit_street: null,
    visit_house_number: null,
    visit_postal_code: null,
    visit_city: 'Tuebingen',
    patient_phone: null,
    patient_phone_mobile: null,
    home_visit_access_note: null,
    special_note: null,
    documentation_status: 'none',
    organization_time_zone: ZONE,
    visit_lat: null,
    visit_lon: null,
    treatment_table_required: false,
    ...teil,
  };
}

const tag: DayPlanEntry[] = [
  besuch(1, '08:30', '09:30', {
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    patient_phone_mobile: '+49 160 0000006',
    home_visit_access_note: 'Erdgeschoss, Klingel "Beispiel". Schlüssel bei der Nachbarin.',
  }),
  besuch(2, '10:00', '11:00', {
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    visit_street: 'Beispielstrasse',
    visit_house_number: '12',
    visit_postal_code: '72070',
    patient_phone_mobile: '+49 160 0000005',
    home_visit_access_note: '2. OG links, Aufzug vorhanden.',
    special_note: 'Hund im Flur, wird vor dem Termin weggesperrt.',
    treatment_table_required: true,
  }),
  besuch(3, '11:30', '12:30', {
    patient_given_name: 'Petra',
    patient_family_name: 'Platzhalter',
    visit_street: 'Fiktivgasse',
    visit_house_number: '9',
    visit_postal_code: '72074',
  }),
];

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(['day-plan', heute, STAFF], tag);
client.setQueryData(['appointments', heute, tagePlus(heute, 1), null, null, 'active'], []);

const patient: Patient = {
  id: '66666666-6666-4666-8666-000000000002',
  status: 'active',
  care_started_on: '2026-09-01',
  care_concluded_on: null,
  given_name: 'Max',
  family_name: 'Mustermann',
  date_of_birth: '1957-04-30',
  email: null,
  phone: null,
  phone_work: null,
  phone_mobile: '+49 160 0000005',
  fax: null,
  institution: null,
  street: 'Beispielstrasse',
  house_number: '12',
  postal_code: '72070',
  city: 'Tuebingen',
  primary_therapist_staff_member_id: STAFF,
  primary_therapist_name: 'Anna Beispiel',
  home_visit_access_note: '2. OG links, Aufzug vorhanden.',
  special_note: null,
  remark: null,
  geocode_precision: 'address',
  treatment_table_required: true,
};

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter
      initialEntries={[ansicht === 'akte' ? `/patienten/${patient.id}/stammdaten` : '/']}
    >
      <VorschauProvider>
        <AppShell user={nutzer} onSignOut={() => undefined}>
          {ansicht === 'akte' ? (
            <Stammdaten patient={patient} user={nutzer} />
          ) : (
            <MyDayPage user={nutzer} />
          )}
        </AppShell>
      </VorschauProvider>
    </MemoryRouter>
  </QueryClientProvider>,
);
