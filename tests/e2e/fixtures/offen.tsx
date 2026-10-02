import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { todayInTimeZone } from '@/features/appointments/api';
import type { OffenerScan } from '@/features/files/api';
import type { CallEntry } from '@/features/open-points/call-list-api';
import { CALL_LIST_KEY } from '@/features/open-points/call-list-api';
import { CallListPage } from '@/features/open-points/CallListPage';
import { OPEN_INTAKES_KEY, type OpenIntake } from '@/features/open-points/intake-api';
import { OpenPointsPage } from '@/features/open-points/OpenPointsPage';
import { OPEN_SCANS_KEY } from '@/features/open-points/PrescriptionsToCapture';
import {
  ENDING_KEY,
  IDLE_KEY,
  type CareWithoutConclusion,
  type EndingPrescription,
} from '@/features/open-points/reminders-api';
import { TASKS_KEY, type Task } from '@/features/open-points/tasks-api';
import type { CurrentUser } from '@/features/session/types';
import type { StaffMember } from '@/features/staff/api';
import type { WaitlistEntry } from '@/features/waitlist/api';
import { WAITLIST_REVIEW_KEY } from '@/features/open-points/WaitlistReview';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `offen.html` (PRX-EPIC-003).
 *
 * Drei Ansichten über `?ansicht=`: `liste` (Offene Punkte als Praxisinhaberin,
 * alle Abschnitte), `formular` (Aufgabe anlegen mit einer Person) und
 * `anrufe` (Anrufliste für morgen). Die Daten liegen vorab im Cache; gesprochen
 * wird mit keinem Server. Alles ist synthetisch.
 */
const ansicht = new URLSearchParams(window.location.search).get('ansicht') ?? 'liste';

const ZONE = 'Europe/Berlin';
const HEUTE = todayInTimeZone(ZONE);
const MAX = '66666666-6666-4666-8666-000000000001';
const ERIKA = '66666666-6666-4666-8666-000000000002';
const PETRA = '66666666-6666-4666-8666-000000000003';
const ANNA = '55555555-5555-4555-8555-000000000002';

function tagPlus(tage: number): string {
  const d = new Date(`${HEUTE}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

const MORGEN = tagPlus(1);

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
  staffMemberId: '55555555-5555-4555-8555-000000000001',
  revenueShare: false,
};

const aufgaben: Task[] = [
  {
    id: 'a1',
    title: 'Folgeverordnung bei Praxis Probst anfragen',
    note: 'Synthetisch: Faxnummer steht in der Kartei.',
    due_on: tagPlus(-2),
    status: 'open',
    patient_id: MAX,
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    assigned_staff_member_id: null,
    assigned_name: null,
    created_at: `${tagPlus(-5)}T08:00:00+00:00`,
    created_by_name: 'Olivia Office',
    done_at: null,
    done_by_name: null,
  },
  {
    id: 'a2',
    title: 'Rückruf wegen Terminwunsch am Nachmittag',
    note: null,
    due_on: HEUTE,
    status: 'open',
    patient_id: ERIKA,
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    assigned_staff_member_id: ANNA,
    assigned_name: 'Anna Beispiel',
    created_at: `${tagPlus(-1)}T08:00:00+00:00`,
    created_by_name: 'Jannes Test',
    done_at: null,
    done_by_name: null,
  },
  {
    id: 'a3',
    title: 'Druckerpatrone für den Empfang bestellen',
    note: null,
    due_on: null,
    status: 'open',
    patient_id: null,
    patient_given_name: null,
    patient_family_name: null,
    assigned_staff_member_id: null,
    assigned_name: null,
    created_at: `${tagPlus(-1)}T08:00:00+00:00`,
    created_by_name: 'Jannes Test',
    done_at: null,
    done_by_name: null,
  },
];

const scans: OffenerScan[] = [
  {
    file_id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
    patient_id: PETRA,
    patient_given_name: 'Petra',
    patient_family_name: 'Platzhalter',
    uploaded_at: `${HEUTE}T07:30:00+00:00`,
    uploaded_by_name: 'Anna Beispiel',
  },
];

const erstaufnahmen: OpenIntake[] = [
  {
    patient_id: PETRA,
    patient_given_name: 'Petra',
    patient_family_name: 'Platzhalter',
    open_items: ['prescription_photo', 'anamnesis', 'finding', 'treatment_table'],
  },
  {
    patient_id: ERIKA,
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    open_items: ['privacy'],
  },
];

function anruf(teil: Partial<CallEntry>): CallEntry {
  return {
    appointment_id: 'c1',
    starts_at: `${MORGEN}T07:00:00+00:00`,
    ends_at: `${MORGEN}T07:45:00+00:00`,
    appointment_type: 'home_visit',
    location_name: null,
    staff_name: 'Anna Beispiel',
    patient_id: MAX,
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    phone: '+49 7071 0000005',
    phone_mobile: '+49 160 0000005',
    notified_channels: [],
    call_outcome: null,
    call_attempts: null,
    call_recorded_at: null,
    call_recorded_by_name: null,
    organization_time_zone: ZONE,
    ...teil,
  };
}

const anrufe: CallEntry[] = [
  anruf({}),
  anruf({
    appointment_id: 'c2',
    starts_at: `${MORGEN}T09:00:00+00:00`,
    ends_at: `${MORGEN}T09:45:00+00:00`,
    patient_id: ERIKA,
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    phone: '+49 7071 0000006',
    phone_mobile: null,
    call_outcome: 'voicemail',
    call_attempts: 2,
    call_recorded_at: `${HEUTE}T08:10:00+00:00`,
    call_recorded_by_name: 'Olivia Office',
  }),
  anruf({
    appointment_id: 'c3',
    starts_at: `${MORGEN}T12:00:00+00:00`,
    ends_at: `${MORGEN}T12:45:00+00:00`,
    appointment_type: 'practice',
    location_name: 'Hauptstandort',
    patient_id: PETRA,
    patient_given_name: 'Petra',
    patient_family_name: 'Platzhalter',
    phone: null,
    phone_mobile: '+49 160 0000007',
    notified_channels: ['slip'],
  }),
];

const endend: EndingPrescription[] = [
  {
    treatment_basis_id: '88888888-8888-4888-8888-000000000002',
    patient_id: MAX,
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    treatment_basis_kind: 'follow_up',
    issued_on: '2026-06-18',
    prescribed: 10,
    used: 8,
    planned: 10,
    last_appointment_at: `${tagPlus(6)}T08:00:00+00:00`,
    has_recommendation: false,
    prescriber_name: 'Dr. med. Petra Probst',
    prescriber_phone: '+49 7071 1234567',
  },
];

const ohneAbschluss: CareWithoutConclusion[] = [
  {
    patient_id: '66666666-6666-4666-8666-000000000004',
    patient_given_name: 'Paula',
    patient_family_name: 'Pause',
    last_appointment_at: '2026-02-12T08:00:00+00:00',
    patient_created_at: '2025-11-03T08:00:00+00:00',
  },
];

const mitarbeitende = [
  { id: ANNA, given_name: 'Anna', family_name: 'Beispiel', employment_status: 'active' },
  {
    id: '55555555-5555-4555-8555-000000000003',
    given_name: 'Olivia',
    family_name: 'Office',
    employment_status: 'active',
  },
] as StaffMember[];

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData([...TASKS_KEY, 'open'], aufgaben);
client.setQueryData(OPEN_SCANS_KEY, scans);
client.setQueryData(OPEN_INTAKES_KEY, erstaufnahmen);
client.setQueryData([...CALL_LIST_KEY, MORGEN], anrufe);
client.setQueryData(ENDING_KEY, endend);
client.setQueryData(IDLE_KEY, ohneAbschluss);
client.setQueryData(['staff-members'], mitarbeitende);
// ABN-018 (BEF-108): seit über acht Wochen unverändert - zu prüfen.
const zuPruefen: WaitlistEntry[] = [
  {
    id: '99999999-9999-4999-8999-000000000002',
    patient_id: '66666666-6666-4666-8666-000000000004',
    patient_given_name: 'Petra',
    patient_family_name: 'Probelauf',
    phone: '+49 7071 0000007',
    phone_mobile: null,
    postal_code: '72074',
    treatment_basis_id: null,
    treatment_basis_kind: null,
    treatment_basis_issued_on: null,
    preferred_staff_member_id: null,
    preferred_staff_name: null,
    appointment_type: 'practice',
    duration_minutes: 45,
    time_windows: [],
    earliest_on: null,
    needed_by: null,
    priority_reason: 'patient_wish',
    note: null,
    status: 'open',
    placed_appointment_id: null,
    created_at: `${tagPlus(-70)}T08:00:00+00:00`,
    updated_at: `${tagPlus(-70)}T08:00:00+00:00`,
    closed_at: null,
    review_due: true,
  },
];
client.setQueryData(WAITLIST_REVIEW_KEY, zuPruefen);
client.setQueryData(['patient', MAX], {
  id: MAX,
  given_name: 'Max',
  family_name: 'Mustermann',
});

const start: Record<string, string> = {
  liste: '/offen',
  formular: `/offen?aufgabe=neu&patient=${MAX}`,
  anrufe: `/offen/anrufe?datum=${MORGEN}`,
};

const rahmen = (kind: ReactNode) => <main className="mx-auto max-w-5xl px-4 py-6">{kind}</main>;

const router = createMemoryRouter(
  [
    { path: '/offen', element: rahmen(<OpenPointsPage user={nutzer} />) },
    { path: '/offen/anrufe', element: rahmen(<CallListPage user={nutzer} />) },
    { path: '*', element: rahmen(<p>Ende der Prüfseite.</p>) },
  ],
  { initialEntries: [start[ansicht] ?? '/offen'] },
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
