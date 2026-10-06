import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { VorschauProvider } from '@/features/preview/VorschauProvider';
import { MyDayPage } from '@/features/today/MyDayPage';
import type { DayPlanEntry } from '@/features/today/api';
import type { Abrechnungslage } from '@/features/appointments/abrechnungslage-api';
import type { Routenergebnis } from '@/lib/location/route';
import { startpunkt, type Standort } from '@/features/tours/startort';
import {
  PRAXISPROFIL,
  routenplan,
  stoppsDesTages,
  type Tagesstopp,
} from '@/features/tours/tagesroute';
import { Stammdaten } from '@/features/patients/PatientMasterDataPage';
import type { Patient } from '@/features/patients/api';
import { tagePlus } from '@/features/appointments/calendar';
import { todayInTimeZone, type CalendarEntry } from '@/features/appointments/api';
import type { CurrentUser } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `uebersicht.html` (UX-EPIC-003).
 *
 * Der Tag einer Therapeutin als Zeitstrahl mit erfundenem Tag, ohne Server:
 * drei Hausbesuche mit Kartenposition und eine Teambesprechung, der zweite
 * Besuch braucht die Behandlungsliege. Tagesroute, Startort und Route liegen
 * fertig im Zwischenspeicher - hinaus geht nichts. Welche Uhrzeit „jetzt" ist,
 * stellt der Test über die Uhr des Browsers.
 *
 * `?ansicht=morgen` zeigt denselben Tag als morgigen über `?tag=` (UBK-003,
 * ANN-234). `?ansicht=abend` zeigt den Tag, wenn alles erledigt ist, `?ansicht=doku`
 * mit einer noch offenen Dokumentation, `?ansicht=akte` die Stammdaten einer
 * Person mit dem Schalter für die Liege.
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
  revenueShare: false,
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

/** Der Stand des Tages je Ansicht: morgens offen, abends erledigt. */
function stand(nummer: number): Partial<DayPlanEntry> {
  if (ansicht === 'abend') return { status: 'documented', documentation_status: 'final' };
  if (ansicht === 'doku') {
    return nummer === 3
      ? { status: 'completed', documentation_status: 'draft' }
      : { status: 'documented', documentation_status: 'final' };
  }
  return {};
}

// Erfundene Punkte in Tübingen; keine davon ist eine Wohnadresse.
const tag: DayPlanEntry[] = [
  besuch(1, '08:30', '09:30', {
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_lat: 48.5216,
    visit_lon: 9.0576,
    patient_phone_mobile: '+49 160 0000006',
    home_visit_access_note: 'Erdgeschoss, Klingel "Beispiel". Schlüssel bei der Nachbarin.',
    // PRX-007: Mitnehmen steht im Kurzblick am Termin, nicht in der Übersicht.
    take_along_items: ['Theraband'],
    ...stand(1),
  }),
  besuch(2, '10:00', '11:00', {
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    visit_street: 'Beispielstrasse',
    visit_house_number: '12',
    visit_postal_code: '72070',
    visit_lat: 48.5262,
    visit_lon: 9.0642,
    patient_phone_mobile: '+49 160 0000005',
    home_visit_access_note: '2. OG links, Aufzug vorhanden.',
    special_note: 'Hund im Flur, wird vor dem Termin weggesperrt.',
    treatment_table_required: true,
    take_along_items: ['Theraband', 'Kinesiotape'],
    ...stand(2),
  }),
  besuch(3, '11:30', '12:30', {
    patient_given_name: 'Petra',
    patient_family_name: 'Platzhalter',
    visit_street: 'Fiktivgasse',
    visit_house_number: '9',
    visit_postal_code: '72074',
    visit_lat: 48.5385,
    visit_lon: 9.0461,
    ...stand(3),
  }),
  besuch(4, '13:00', '14:00', {
    kind: 'internal',
    patient_id: null,
    title: 'Teambesprechung',
    appointment_type: 'video',
    visit_city: null,
    documentation_status: null,
  }),
];

// Die Tagesroute: nur Punkte, keine Namen (MAP-006b). Die Fehlzeit hat keinen Ort.
const punkte: Tagesstopp[] = tag
  .filter((termin) => termin.kind === 'therapy')
  .map((termin) => ({
    id: termin.id,
    kind: termin.kind,
    appointment_type: 'home_visit',
    status: termin.status,
    starts_at: termin.starts_at,
    ends_at: termin.ends_at,
    lat: termin.visit_lat ?? null,
    lon: termin.visit_lon ?? null,
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

// Eine Route über Startort und alle Stopps: 12, 9 und 26 Minuten. Der dritte
// Weg ist damit knapp - 30 Minuten Abstand, 4 Minuten Puffer.
const fahrzeiten = [12, 9, 26];
const route: Routenergebnis = {
  ok: true,
  value: {
    quelle: 'anbieter',
    route: {
      distanceMeters: 9400,
      durationSeconds: fahrzeiten.reduce((summe, minuten) => summe + minuten * 60, 0),
      legs: fahrzeiten.map((minuten) => ({
        distanceMeters: minuten * 200,
        durationSeconds: minuten * 60,
      })),
      geometry: [],
    },
  },
};

function teamtermin(
  nummer: number,
  von: string,
  bis: string,
  teil: Partial<CalendarEntry>,
): CalendarEntry {
  return {
    id: `bbbbbbbb-bbbb-4bbb-8bbb-00000000000${nummer}`,
    patient_id: `66666666-6666-4666-8666-00000000001${nummer}`,
    staff_member_id: '55555555-5555-4555-8555-000000000003',
    location_id: null,
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: um(von),
    ends_at: um(bis),
    patient_given_name: 'Frida',
    patient_family_name: 'Test',
    staff_given_name: 'Tim',
    staff_family_name: 'Teamleitung',
    location_name: null,
    ...teil,
  };
}

const team: CalendarEntry[] = [
  teamtermin(1, '08:00', '09:00', { status: 'documented' }),
  teamtermin(2, '09:15', '10:15', {
    patient_given_name: 'Gustav',
    patient_family_name: 'Vorlage',
    status: 'no_show',
  }),
  teamtermin(3, '10:30', '11:15', {
    patient_given_name: 'Dora',
    patient_family_name: 'Probe mit einem langen Doppelnamen',
    appointment_type: 'practice',
    location_name: 'Hauptstandort',
  }),
  teamtermin(4, '11:45', '12:45', {
    patient_given_name: 'Carl',
    patient_family_name: 'Muster',
    status: 'cancelled',
  }),
];

const lage: Abrechnungslage = {
  appointment_id: tag[0]!.id,
  treatment_basis_id: '77777777-7777-4777-8777-000000000001',
  treatment_basis_kind: null,
  treatment_basis_issued_on: null,
  basis_position: 2,
  basis_appointment_count: 6,
  billing_visible: false,
  recipient_kind: null,
  open_invoice_count: null,
  open_outstanding_cents: null,
  open_overdue: null,
};

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
// UBK-010: Fahrzeitfaktor 1,0 - die Minuten der Prüfseite stehen, wie sie
// eingetragen sind (ANN-237).
client.setQueryData(['travel-time-factor'], 1);
client.setQueryData(['day-plan', heute, STAFF], tag);
client.setQueryData(['day-route', heute, STAFF], punkte);
client.setQueryData(['standorte'], [standort]);
// Mit dem Ende des Tages als letztem Punkt - wie Tour und Kalender (UBK-015).
const stopps = stoppsDesTages(tag, punkte);
client.setQueryData(
  [
    'route',
    PRAXISPROFIL,
    routenplan(startpunkt(standort), [...stopps, { position: startpunkt(standort) }]).punkte,
  ],
  route,
);
client.setQueryData(['appointment', tag[0]!.id, 'abrechnungslage'], lage);
// PRX-013: Bei der ersten Person ist die Erstaufnahme noch offen.
client.setQueryData(
  ['open-points', 'intakes'],
  [
    {
      patient_id: tag[0]!.patient_id,
      patient_given_name: 'Erika',
      patient_family_name: 'Beispiel',
      open_items: ['finding', 'privacy'],
    },
  ],
);
// POR-002: der Abschnitt „Plattform" in den Stammdaten - ohne Zugang.
client.setQueryData(['platform-access', 'treatment', '66666666-6666-4666-8666-000000000002'], null);
client.setQueryData(['appointments', heute, tagePlus(heute, 1), null, null, 'active'], team);

// UBK-003: derselbe Tag, einen Tag später - für den Tageswechsel.
const morgen = tagePlus(heute, 1);
const einenTagSpaeter = (iso: string) => new Date(Date.parse(iso) + 86_400_000).toISOString();
const tagMorgen = tag.map((termin) => ({
  ...termin,
  starts_at: einenTagSpaeter(termin.starts_at),
  ends_at: einenTagSpaeter(termin.ends_at),
}));
const punkteMorgen = punkte.map((punkt) => ({
  ...punkt,
  starts_at: einenTagSpaeter(punkt.starts_at),
  ends_at: einenTagSpaeter(punkt.ends_at),
}));
client.setQueryData(['day-plan', morgen, STAFF], tagMorgen);
client.setQueryData(['day-route', morgen, STAFF], punkteMorgen);
client.setQueryData(['appointments', morgen, tagePlus(morgen, 1), null, null, 'active'], []);

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
  take_along_items: ['Theraband', 'Kinesiotape'],
};

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter
      initialEntries={[
        ansicht === 'akte'
          ? `/patienten/${patient.id}/stammdaten`
          : ansicht === 'morgen'
            ? `/?tag=${morgen}`
            : '/',
      ]}
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
