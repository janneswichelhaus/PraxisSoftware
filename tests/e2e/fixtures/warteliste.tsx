import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { todayInTimeZone } from '@/features/appointments/api';
import type { Patient } from '@/features/patients/api';
import type { CurrentUser } from '@/features/session/types';
import { travelItems, type Slot, type TravelRating } from '@/features/slot-search/api';
import { SlotSearchPage } from '@/features/slot-search/SlotSearchPage';
import type { Territory } from '@/features/territories/api';
import { TerritoriesPage } from '@/features/territories/TerritoriesPage';
import type { TreatmentBasis } from '@/features/treatment-bases/api';
import type { WaitlistEntry, WaitlistMatch } from '@/features/waitlist/api';
import { NewWaitlistEntryPage } from '@/features/waitlist/WaitlistFormPage';
import { WaitlistMatches } from '@/features/waitlist/WaitlistMatches';
import { WaitlistPage } from '@/features/waitlist/WaitlistPage';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `warteliste.html` (PRX-EPIC-001).
 *
 * Fünf Ansichten über `?ansicht=`: `liste` (Warteliste), `formular` (Auf die
 * Warteliste setzen), `suche` (freie Termine aus einem Eintrag), `gebiete`
 * (Gebietstage) und `nachruecken` (passt von der Warteliste). Die Daten liegen
 * vorab im Cache; gesprochen wird mit keinem Server. Alles ist synthetisch.
 */
const ansicht = new URLSearchParams(window.location.search).get('ansicht') ?? 'liste';

const ZONE = 'Europe/Berlin';
const HEUTE = todayInTimeZone(ZONE);
const MAX = '66666666-6666-4666-8666-000000000001';
const ERIKA = '66666666-6666-4666-8666-000000000002';
const PETRA = '66666666-6666-4666-8666-000000000003';
const ANNA = '55555555-5555-4555-8555-000000000002';
const TIM = '55555555-5555-4555-8555-000000000004';
const EINTRAG = '99999999-9999-4999-8999-000000000001';

function tagPlus(tage: number): string {
  const d = new Date(`${HEUTE}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + tage);
  return d.toISOString().slice(0, 10);
}

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
  organizationTimeZone: ZONE,
  appointmentGridMinutes: 5,
  staffMemberId: null,
  revenueShare: false,
};

const eintraege: WaitlistEntry[] = [
  {
    id: EINTRAG,
    patient_id: MAX,
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    phone: '+49 7071 0000005',
    phone_mobile: '+49 160 0000005',
    postal_code: '72070',
    treatment_basis_id: '88888888-8888-4888-8888-000000000002',
    treatment_basis_kind: 'follow_up',
    treatment_basis_issued_on: '2026-06-18',
    preferred_staff_member_id: ANNA,
    preferred_staff_name: 'Anna Beispiel',
    appointment_type: 'home_visit',
    duration_minutes: 60,
    time_windows: [
      { weekday: 1, from: '08:00', to: '12:00' },
      { weekday: 3, from: '14:00', to: '18:00' },
    ],
    earliest_on: null,
    needed_by: tagPlus(10),
    priority_reason: 'prescription_ending',
    note: 'Synthetisch: vormittags am besten auf dem Handy erreichbar.',
    status: 'open',
    placed_appointment_id: null,
    created_at: `${tagPlus(-6)}T08:00:00+00:00`,
    updated_at: `${tagPlus(-6)}T08:00:00+00:00`,
    closed_at: null,
    review_due: false,
  },
  {
    id: '99999999-9999-4999-8999-000000000002',
    patient_id: PETRA,
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
    earliest_on: tagPlus(3),
    needed_by: null,
    priority_reason: 'patient_wish',
    note: null,
    status: 'open',
    placed_appointment_id: null,
    created_at: `${tagPlus(-1)}T08:00:00+00:00`,
    updated_at: `${tagPlus(-1)}T08:00:00+00:00`,
    closed_at: null,
    review_due: false,
  },
];

const gebiete: Territory[] = [
  {
    id: 't1',
    name: 'Nord',
    day_parts: [
      { weekday: 1, part: 'am' },
      { weekday: 3, part: 'day' },
    ],
    postal_codes: ['72070', '72072', '72076'],
    updated_at: '2026-09-28T08:00:00+00:00',
  },
  {
    id: 't2',
    name: 'Süd und Weststadt',
    day_parts: [{ weekday: 2, part: 'pm' }],
    postal_codes: ['72074', '72108'],
    updated_at: '2026-09-28T08:00:00+00:00',
  },
];

function vorschlag(
  tage: number,
  von: string,
  bis: string,
  gebiet: Slot['territory_status'],
  name = 'Anna Beispiel',
  staff = ANNA,
): Slot {
  return {
    staff_member_id: staff,
    staff_name: name,
    slot_date: tagPlus(tage),
    start_time: von,
    end_time: bis,
    territory_status: gebiet,
    prev_appointment_id: tage === 3 ? 'aaaaaaaa-aaaa-4aaa-8aaa-0000000000f1' : null,
    prev_lat: null,
    prev_lon: null,
    next_appointment_id: null,
    next_lat: null,
    next_lon: null,
    target_lat: null,
    target_lon: null,
  };
}

const vorschlaege: Slot[] = [
  vorschlag(3, '09:00', '10:00', 'match'),
  vorschlag(3, '10:00', '11:00', 'match'),
  vorschlag(5, '14:00', '15:00', 'match', 'Tim Teamleitung', TIM),
  vorschlag(7, '08:00', '09:00', 'outside'),
];
const bewertungen: TravelRating[] = [
  { item_index: 0, status: 'tight', shortfall_minutes: 10 },
  { item_index: 1, status: 'ok', shortfall_minutes: 0 },
  { item_index: 2, status: 'ok', shortfall_minutes: 0 },
  { item_index: 3, status: 'unknown', shortfall_minutes: 0 },
];

const treffer: WaitlistMatch[] = eintraege.map((e, i) => ({
  id: e.id,
  patient_id: e.patient_id,
  patient_given_name: e.patient_given_name,
  patient_family_name: e.patient_family_name,
  phone: e.phone,
  phone_mobile: e.phone_mobile,
  treatment_basis_id: e.treatment_basis_id,
  appointment_type: e.appointment_type,
  duration_minutes: e.duration_minutes,
  time_windows: e.time_windows,
  needed_by: e.needed_by,
  priority_reason: e.priority_reason,
  territory_status: i === 0 ? 'match' : 'none',
  updated_at: e.updated_at,
}));

const patient = { id: ERIKA, given_name: 'Erika', family_name: 'Beispiel' } as Patient;
const grundlagen = [
  {
    id: '88888888-8888-4888-8888-000000000003',
    prescriber_id: null,
    prescriber_name: 'Dr. Probst',
    prescriber_practice_name: null,
    treatment_basis_kind: 'first',
    issued_on: '2026-09-12',
    frequency_note: null,
    note: null,
    items: [],
    updated_at: '2026-09-12T08:00:00+00:00',
  },
] as TreatmentBasis[];

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(['waitlist', 'open'], eintraege);
client.setQueryData(['waitlist', 'open', MAX], eintraege.slice(0, 1));
client.setQueryData(['territories'], gebiete);
client.setQueryData(
  ['assignable-therapists'],
  [
    { staff_member_id: ANNA, display_name: 'Anna Beispiel' },
    { staff_member_id: TIM, display_name: 'Tim Teamleitung' },
  ],
);
client.setQueryData(['patient', ERIKA], patient);
client.setQueryData(['patient', MAX], {
  ...patient,
  id: MAX,
  given_name: 'Max',
  family_name: 'Mustermann',
});
client.setQueryData(['treatment-bases', ERIKA], grundlagen);
client.setQueryData(
  [
    'free-slots',
    {
      patientId: MAX,
      staffMemberId: ANNA,
      type: 'home_visit',
      duration: 60,
      from: HEUTE,
      to: tagPlus(13),
      windows: eintraege[0]!.time_windows,
    },
  ],
  vorschlaege,
);
client.setQueryData(['slot-travel', travelItems(vorschlaege, null, null)], bewertungen);
const PLATZ = { staffMemberId: ANNA, date: tagPlus(2), start: '09:00', end: '10:00' };
client.setQueryData(['waitlist', 'matches', PLATZ], treffer);

const start: Record<string, string> = {
  liste: '/warteliste',
  formular: `/warteliste/neu?patient=${ERIKA}`,
  suche: `/patienten/${MAX}/plaetze?warteliste=${EINTRAG}`,
  gebiete: '/praxis/gebiete',
  nachruecken: '/nachruecken',
};

const rahmen = (kind: ReactNode) => <main className="mx-auto max-w-5xl px-4 py-6">{kind}</main>;

const router = createMemoryRouter(
  [
    { path: '/warteliste', element: rahmen(<WaitlistPage user={nutzer} />) },
    { path: '/warteliste/neu', element: rahmen(<NewWaitlistEntryPage />) },
    { path: '/patienten/:patientId/plaetze', element: rahmen(<SlotSearchPage user={nutzer} />) },
    { path: '/praxis/gebiete', element: rahmen(<TerritoriesPage user={nutzer} />) },
    { path: '/nachruecken', element: rahmen(<WaitlistMatches slot={PLATZ} back="/warteliste" />) },
    { path: '*', element: rahmen(<p>Ende der Prüfseite.</p>) },
  ],
  { initialEntries: [start[ansicht] ?? '/warteliste'] },
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
