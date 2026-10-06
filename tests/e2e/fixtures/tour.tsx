import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { TourenPage } from '@/features/tours/TourenPage';
import type { DayPlanEntry } from '@/features/today/api';
import type { Routenergebnis } from '@/lib/location/route';
import { startpunkt, type Standort } from '@/features/tours/startort';
import {
  PRAXISPROFIL,
  fahrzeitZwischen,
  routenplan,
  stoppsDesTages,
  type Tagesstopp,
} from '@/features/tours/tagesroute';
import { todayInTimeZone } from '@/features/appointments/api';
import type { CurrentUser } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `tour.html` (UBK-009).
 *
 * Die Tour eines erfundenen Tages ohne Server: ein Praxistermin, ein
 * Hausbesuch, zwei Praxistermine am selben Standort. Tagesliste, Route und
 * Fahrpuffer liegen im Zwischenspeicher; hinaus geht nichts.
 */
const ZONE = 'Europe/Berlin';
const STAFF = '55555555-5555-4555-8555-000000000001';
const ORT = '33333333-3333-4333-8333-000000000001';
const heute = todayInTimeZone(ZONE);

const nutzer: CurrentUser = {
  profile: {
    id: '11111111-1111-4111-8111-000000000001',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000001',
    display_name: 'Jannes Test',
    is_active: true,
  },
  roles: ['owner', 'therapist'],
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: ZONE,
  appointmentGridMinutes: 5,
  staffMemberId: STAFF,
  revenueShare: false,
};

function um(uhrzeit: string): string {
  const [stunde, minute] = uhrzeit.split(':').map(Number) as [number, number];
  const [jahr, monat, tag] = heute.split('-').map(Number) as [number, number, number];
  const utc = Date.UTC(jahr, monat - 1, tag, stunde, minute);
  const versatz =
    new Date(new Date(utc).toLocaleString('en-US', { timeZone: ZONE })).getTime() -
    new Date(new Date(utc).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(utc - versatz).toISOString();
}

function termin(
  nummer: number,
  von: string,
  bis: string,
  name: [string, string],
  teil: Partial<DayPlanEntry> = {},
): DayPlanEntry {
  return {
    id: `aaaaaaaa-aaaa-4aaa-8aaa-00000000000${nummer}`,
    patient_id: `66666666-6666-4666-8666-00000000000${nummer}`,
    staff_member_id: STAFF,
    appointment_type: 'practice',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: um(von),
    ends_at: um(bis),
    patient_given_name: name[0],
    patient_family_name: name[1],
    location_name: 'Hauptstandort Tuebingen',
    visit_street: null,
    visit_house_number: null,
    visit_postal_code: null,
    visit_city: null,
    patient_phone: null,
    patient_phone_mobile: null,
    home_visit_access_note: null,
    special_note: null,
    documentation_status: 'none',
    organization_time_zone: ZONE,
    treatment_table_required: false,
    ...teil,
  };
}

const plan: DayPlanEntry[] = [
  termin(1, '09:00', '09:45', ['Ben', 'Beispielsohn']),
  termin(2, '10:30', '11:30', ['Friedrich', 'Fiktiv'], {
    appointment_type: 'home_visit',
    location_name: null,
    visit_street: 'Am Fiktivstift',
    visit_house_number: '2',
    visit_postal_code: '72072',
    visit_city: 'Tuebingen',
  }),
  termin(3, '14:00', '15:00', ['Erika', 'Beispiel']),
  termin(4, '16:00', '17:00', ['Emma', 'Erfunden']),
];

const standort: Standort = {
  id: ORT,
  name: 'Hauptstandort Tuebingen',
  street: 'Praxisweg',
  house_number: '1',
  postal_code: '72070',
  city: 'Tuebingen',
  lat: 48.5204,
  lon: 9.0527,
  geocode_precision: 'address',
};

const punkte: Tagesstopp[] = plan.map((t) => ({
  id: t.id,
  kind: t.kind,
  appointment_type: t.appointment_type === 'home_visit' ? 'home_visit' : 'practice',
  status: t.status,
  starts_at: t.starts_at,
  ends_at: t.ends_at,
  lat: t.appointment_type === 'home_visit' ? 48.5085 : standort.lat,
  lon: t.appointment_type === 'home_visit' ? 9.0612 : standort.lon,
  geocode_precision: 'address',
  position_source: t.appointment_type === 'home_visit' ? 'visit' : 'location',
}));

const stopps = stoppsDesTages(plan, punkte);
const start = startpunkt(standort);
// UBK-015: Ohne Garage beginnt und endet die Tour an der Praxis - der
// Rückweg ist der letzte Abschnitt derselben Route.
const { punkte: wegpunkte, index } = routenplan(start, [...stopps, { position: start }]);
// Start = Praxis = Ben; dann Friedrich und zurück in die Praxis, je 4 Minuten.
const legs = wegpunkte.slice(1).map(() => ({ distanceMeters: 1600, durationSeconds: 240 }));
const route: Routenergebnis = {
  ok: true,
  value: {
    quelle: 'anbieter',
    route: {
      distanceMeters: legs.length * 1600,
      durationSeconds: legs.length * 240,
      legs,
      geometry: wegpunkte,
    },
  },
};

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
// UBK-010: Fahrzeitfaktor 1,0 - die Minuten der Prüfseite stehen, wie sie
// eingetragen sind (ANN-237).
client.setQueryData(['travel-time-factor'], 1);
client.setQueryData(
  ['assignable-therapists'],
  [{ staff_member_id: STAFF, display_name: 'Jannes Test' }],
);
client.setQueryData(['standorte'], [standort]);
client.setQueryData(['day-plan', heute, STAFF, ''], plan);
client.setQueryData(['day-route', heute, STAFF, ''], punkte);
client.setQueryData(['route', PRAXISPROFIL, wegpunkte], route);
const paare = stopps.slice(1).flatMap((stopp, i) => {
  const sekunden = fahrzeitZwischen(index[i] ?? null, index[i + 1] ?? null, legs);
  return sekunden === null
    ? []
    : [{ from: stopps[i]!.termin.id, to: stopp.termin.id, travel_seconds: Math.round(sekunden) }];
});
client.setQueryData(
  ['travel-buffers', paare],
  paare.map((p, i) => ({
    from_appointment_id: p.from,
    to_appointment_id: p.to,
    travel_seconds: p.travel_seconds,
    earliest_start: new Date(
      Date.parse(stopps[i]!.termin.ends_at) + p.travel_seconds * 1000,
    ).toISOString(),
    shortfall_minutes: 0,
  })),
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[`/touren?tag=${heute}&person=${STAFF}`]}>
      <AppShell user={nutzer} onSignOut={() => undefined}>
        <TourenPage user={nutzer} />
      </AppShell>
    </MemoryRouter>
  </QueryClientProvider>,
);
