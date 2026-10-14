import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { VorschauProvider } from '@/features/preview/VorschauProvider';
import { MyDayPage } from '@/features/today/MyDayPage';
import { CompleteTreatmentPage } from '@/features/documentation/CompleteTreatmentPage';
import type { DayPlanEntry } from '@/features/today/api';
import type { Appointment } from '@/features/appointments/api';
import { todayInTimeZone } from '@/features/appointments/api';
import { tagePlus } from '@/features/appointments/calendar';
import type { TextSnippet } from '@/features/documentation/textbausteine';
import type { Routenergebnis } from '@/lib/location/route';
import { startpunkt, type Standort } from '@/features/tours/startort';
import {
  PRAXISPROFIL,
  routenplan,
  stoppsDesTages,
  type Tagesstopp,
} from '@/features/tours/tagesroute';
import type { CurrentUser } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `besuch.html` (Auftrag C1 „Besuch in einem
 * Zug“): Übersicht und Schreibseite mit echten Routen im Rahmen der
 * Anwendung, damit ein Test den Ablauf von der Tür bis zur Navigation zum
 * nächsten Besuch durchtippen und Tipps und Seitenwechsel zählen kann.
 *
 * Der Tag ist erfunden: zwei Hausbesuche, der erste läuft, wenn der Test die
 * Uhr auf 09:20 stellt. Was beim Öffnen gebraucht wird, liegt im
 * Zwischenspeicher; alles, was danach zum Server ginge - Festschreiben,
 * Heilmittel, Folgetermin und das Nachladen -, beantwortet der Test über
 * abgefangene Anfragen (`besuch.spec.ts`). Die gegangenen Wege stehen in
 * `window.__wege`.
 */
const ZONE = 'Europe/Berlin';
const STAFF = '55555555-5555-4555-8555-000000000002';
const BESUCH_1 = 'cccccccc-cccc-4ccc-8ccc-000000000001';
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
  staffMemberId: STAFF,
  revenueShare: false,
};

/** Ortszeit des heutigen Tages als Zeitpunkt. */
function um(uhrzeit: string): string {
  const [stunde, minute] = uhrzeit.split(':').map(Number) as [number, number];
  const [jahr, monat, tag] = heute.split('-').map(Number) as [number, number, number];
  const utc = Date.UTC(jahr, monat - 1, tag, stunde, minute);
  const versatz =
    new Date(new Date(utc).toLocaleString('en-US', { timeZone: ZONE })).getTime() -
    new Date(new Date(utc).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(utc - versatz).toISOString();
}

function besuch(id: string, von: string, bis: string, teil: Partial<DayPlanEntry>): DayPlanEntry {
  return {
    id,
    patient_id: null,
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

// Erfundene Punkte in Tübingen; keine davon ist eine Wohnadresse.
const tag: DayPlanEntry[] = [
  besuch(BESUCH_1, '09:00', '10:00', {
    patient_id: '66666666-6666-4666-8666-000000000101',
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_lat: 48.5216,
    visit_lon: 9.0576,
    patient_phone_mobile: '+49 160 0000006',
    // K3: hinter „Vor der Tür“ (ANN-501).
    home_visit_access_note: '2. OG, Klingel Beispiel',
    take_along_items: ['Theraband', 'Faszienrolle'],
  }),
  besuch('cccccccc-cccc-4ccc-8ccc-000000000002', '10:30', '11:30', {
    patient_id: '66666666-6666-4666-8666-000000000102',
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    visit_street: 'Beispielstrasse',
    visit_house_number: '12',
    visit_postal_code: '72070',
    visit_lat: 48.5262,
    visit_lon: 9.0642,
    patient_phone_mobile: '+49 160 0000005',
    treatment_table_required: true,
  }),
];

const termin: Appointment = {
  id: BESUCH_1,
  patient_id: tag[0]!.patient_id,
  kind: 'therapy',
  title: null,
  event_group_id: null,
  event_series_id: null,
  staff_member_id: STAFF,
  location_id: null,
  appointment_type: 'home_visit',
  status: 'confirmed',
  starts_at: tag[0]!.starts_at,
  ends_at: tag[0]!.ends_at,
  updated_at: `${heute}T05:00:00.000000+00`,
  visit_street: 'Testweg',
  visit_house_number: '7',
  visit_postal_code: '72072',
  visit_city: 'Tuebingen',
  completed_at: null,
  cancellation_reason: null,
  no_show_recorded_at: null,
  no_show_protocol_confirmed: null,
  cancellation_received_at: null,
  fee_basis: null,
  fee_waived_at: null,
  patient_given_name: 'Erika',
  patient_family_name: 'Beispiel',
  staff_given_name: 'Anna',
  staff_family_name: 'Beispiel',
  location_name: null,
  notification_channels: [],
  treatment_basis_covered: true,
  organization_time_zone: ZONE,
};

const punkte: Tagesstopp[] = tag.map((t) => ({
  id: t.id,
  kind: t.kind,
  appointment_type: 'home_visit',
  status: t.status,
  starts_at: t.starts_at,
  ends_at: t.ends_at,
  lat: t.visit_lat ?? null,
  lon: t.visit_lon ?? null,
  geocode_precision: 'address',
  position_source: 'visit',
}));

const standort: Standort = {
  id: '33333333-3333-4333-8333-000000000001',
  name: 'Hauptstandort Tuebingen',
  street: 'Praxisweg',
  house_number: '1',
  postal_code: '72070',
  city: 'Tuebingen',
  lat: 48.5204,
  lon: 9.0527,
  geocode_precision: 'address',
};

const fahrzeiten = [12, 9];
const route: Routenergebnis = {
  ok: true,
  value: {
    quelle: 'anbieter',
    route: {
      distanceMeters: 6000,
      durationSeconds: fahrzeiten.reduce((summe, minuten) => summe + minuten * 60, 0),
      legs: fahrzeiten.map((minuten) => ({
        distanceMeters: minuten * 200,
        durationSeconds: minuten * 60,
      })),
      geometry: [],
    },
  },
};

const bausteine: TextSnippet[] = [
  {
    id: 'b1',
    title: 'Hausbesuch',
    body: 'Hausbesuch durchgeführt.',
    shared: true,
    editable: false,
  },
];

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(['travel-time-factor'], 1);
client.setQueryData(['day-plan', heute, STAFF], tag);
for (let abstand = -7; abstand <= 7; abstand++) {
  if (abstand !== 0) client.setQueryData(['day-plan', tagePlus(heute, abstand), STAFF], []);
}
client.setQueryData(['day-route', heute, STAFF], punkte);
client.setQueryData(['standorte'], [standort]);
client.setQueryData(
  [
    'route',
    PRAXISPROFIL,
    routenplan(startpunkt(standort), [
      ...stoppsDesTages(tag, punkte),
      { position: startpunkt(standort) },
    ]).punkte,
  ],
  route,
);
client.setQueryData(['open-points', 'intakes'], []);
client.setQueryData(['appointments', heute, tagePlus(heute, 1), null, null, 'active'], []);
client.setQueryData(['appointment', BESUCH_1], termin);
client.setQueryData(['treatment-note', BESUCH_1], { primary: null, addenda: [] });
client.setQueryData(['text-snippets'], bausteine);
client.setQueryData(['treatment-draft-findings', BESUCH_1], null);

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
      path: '/',
      element: (
        <Rahmen>
          <MyDayPage user={nutzer} />
        </Rahmen>
      ),
    },
    {
      path: '/termine/:appointmentId/abschluss',
      element: (
        <Rahmen>
          <CompleteTreatmentPage user={nutzer} />
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
  { initialEntries: ['/'] },
);

// Die gegangenen Wege für die Zählung im Test.
const wege: string[] = ['/'];
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
