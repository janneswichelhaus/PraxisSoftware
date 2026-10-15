import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { NewAppointmentPage } from '@/features/appointments/NewAppointmentPage';
import { VorschauProvider } from '@/features/preview/VorschauProvider';
import type { Patient } from '@/features/patients/api';
import type { WorkingHour } from '@/features/scheduling/api';
import type { CurrentUser } from '@/features/session/types';
import { tagePlus } from '@/features/appointments/calendar';
import { todayInTimeZone } from '@/features/appointments/api';
import type { Standort } from '@/features/tours/startort';
import { PRAXISPROFIL, type Tagesstopp } from '@/features/tours/tagesroute';
import type { Routenergebnis } from '@/lib/location/route';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `terminformular.html` (B2, ANN-530): „Termin
 * anlegen“ für einen Praxistermin am Mittwoch, 12.05.2027, 16:15 bei Anna.
 *
 * Davor liegt ein Hausbesuch bis 16:05, 17 Minuten Rad vom Standort; danach
 * nichts bis zum Arbeitsende um 17:30 am Standort. „Passt es?“ sagt deshalb
 * „Anfahrt: zu knapp um 10 Min., frühester Beginn 16:25 Uhr“ (Bild 1 aus B2)
 * und bietet „Auf 16:25 verschieben“ an. Was beim Öffnen gebraucht wird, liegt
 * im Zwischenspeicher; `check_travel_fit` beantwortet der Test mit der
 * Rundung des Servers (`terminformular.spec.ts`). Alles ist synthetisch.
 */
const ZONE = 'Europe/Berlin';
const DATUM = '2027-05-12';
const ANNA = '55555555-5555-4555-8555-000000000002';
const PATIENT = '66666666-6666-4666-8666-000000000001';
const ORT = '33333333-3333-4333-8333-000000000001';
const heute = todayInTimeZone(ZONE);

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
  staffMemberId: ANNA,
  revenueShare: false,
};

const patient: Patient = {
  id: PATIENT,
  care_started_on: '2026-02-10',
  care_concluded_on: null,
  given_name: 'Max',
  family_name: 'Mustermann',
  date_of_birth: '1957-04-30',
  email: null,
  phone: null,
  phone_work: null,
  phone_mobile: null,
  institution: null,
  street: null,
  house_number: null,
  postal_code: null,
  city: null,
  primary_therapist_staff_member_id: null,
  primary_therapist_name: null,
  home_visit_access_note: null,
  special_note: null,
  remark: null,
};

// Erfundene Punkte in Tübingen; keiner davon ist eine Wohnadresse.
const STANDORT = { lat: 48.5216, lon: 9.0576 };
const BESUCH_DAVOR = { lat: 48.5301, lon: 9.0402 };

const standort: Standort = {
  id: ORT,
  name: 'Hauptstandort Tuebingen',
  street: 'Teststrasse',
  house_number: '1',
  postal_code: '72072',
  city: 'Tuebingen',
  geocode_precision: 'address',
  ...STANDORT,
};

/** Der Hausbesuch davor, 15:05–16:05 Ortszeit (Sommerzeit, UTC+2). */
const tag: Tagesstopp[] = [
  {
    id: 'cccccccc-cccc-4ccc-8ccc-000000000001',
    kind: 'therapy',
    appointment_type: 'home_visit',
    status: 'confirmed',
    starts_at: '2027-05-12T13:05:00.000Z',
    ends_at: '2027-05-12T14:05:00.000Z',
    geocode_precision: 'address',
    position_source: 'visit',
    ...BESUCH_DAVOR,
  },
];

/** Mittwochs 08:00–17:30. */
const wochenplan: WorkingHour[] = [
  { id: 'w1', staff_member_id: ANNA, weekday: 3, starts_at: '08:00', ends_at: '17:30' },
];

/** Vom Besuch davor zum Standort: 17 Minuten Rad. */
const route: Routenergebnis = {
  ok: true,
  value: {
    quelle: 'anbieter',
    route: {
      distanceMeters: 3400,
      durationSeconds: 17 * 60,
      legs: [{ distanceMeters: 3400, durationSeconds: 17 * 60 }],
      geometry: [],
    },
  },
};

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(['travel-time-factor'], 1);
client.setQueryData(['patient', PATIENT], patient);
client.setQueryData(
  ['assignable-therapists'],
  [{ staff_member_id: ANNA, display_name: 'Anna Beispiel' }],
);
client.setQueryData(['locations'], [{ id: ORT, name: standort.name }]);
client.setQueryData(['standorte'], [standort]);
client.setQueryData(['day-route', DATUM, ANNA], tag);
client.setQueryData(['working-hours'], wochenplan);
client.setQueryData(['working-hour-exceptions', DATUM, DATUM], []);
// Die Stopps davor und hier; die Rückfahrt endet am selben Ort.
client.setQueryData(['route', PRAXISPROFIL, [BESUCH_DAVOR, STANDORT]], route);
// Was der Rahmen beim Öffnen fragt.
client.setQueryData(['open-points', 'intakes'], []);
client.setQueryData(['appointments', heute, tagePlus(heute, 1), null, null, 'active'], []);

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
      path: '/patienten/:patientId/termine/neu',
      element: (
        <Rahmen>
          <NewAppointmentPage user={nutzer} />
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
  {
    initialEntries: [
      `/patienten/${PATIENT}/termine/neu?art=practice&datum=${DATUM}&beginn=16:15&person=${ANNA}`,
    ],
  },
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
