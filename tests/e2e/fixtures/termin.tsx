import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type { Appointment } from '@/features/appointments/api';
import { AppointmentDetailPage } from '@/features/appointments/AppointmentDetailPage';
import type { Abrechnungslage } from '@/features/appointments/abrechnungslage-api';
import type { Kurzblick } from '@/features/appointments/kurzblick-api';
import type { LeistungenAmTermin } from '@/features/appointments/leistungenAmTermin';
import type { Vorschlag } from '@/features/billing/api';
import type { TreatmentNote } from '@/features/documentation/api';
import type { CurrentUser, RoleKey } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `termin.html` (PRX-EPIC-002, UX-EPIC-005).
 *
 * Ansichten über `?ansicht=`: `behandelnd` (Anna an ihrem dokumentierten
 * Hausbesuch: Zähler, Kurzblick, Heilmittel bestätigen), `buero` (derselbe
 * Termin für das Büro: dazu Empfänger und offene Rechnungen), `bestaetigt`
 * (Heilmittel bestätigt, Grundlage ausgeschöpft), `hausbesuch` (Anna vor der
 * Tür: der bestätigte Hausbesuch mit dem Ablauf „Niemand öffnet?"), `fremd`
 * (Jannes am bestätigten Hausbesuch von Anna, mit Mitteilungszeichen),
 * `praxis` (ein Praxistermin: die Ausnahme trägt ihr Kennzeichen) und
 * `abgesagt` (die Absage mit Grund und Ausfallhonorar). Die Daten liegen
 * vorab im Cache; gesprochen wird mit keinem Server. Alles ist synthetisch.
 */
const ansicht = new URLSearchParams(window.location.search).get('ansicht') ?? 'behandelnd';

const ZONE = 'Europe/Berlin';
const TERMIN = '77777777-7777-4777-8777-000000000001';
const MAX = '66666666-6666-4666-8666-000000000001';
const ANNA = '55555555-5555-4555-8555-000000000002';
const KG = 'cccccccc-cccc-4ccc-8ccc-000000000001';
const WAERME = 'cccccccc-cccc-4ccc-8ccc-000000000002';

function nutzer(rolle: RoleKey, name: string, staff: string | null): CurrentUser {
  return {
    profile: {
      id: '11111111-1111-4111-8111-000000000002',
      organization_id: '22222222-2222-4222-8222-000000000001',
      person_id: '44444444-4444-4444-8444-000000000002',
      display_name: name,
      is_active: true,
    },
    roles: [rolle],
    organizationName: 'Test Praxis Tuebingen',
    organizationTimeZone: ZONE,
    appointmentGridMinutes: 5,
    staffMemberId: staff,
    revenueShare: false,
  };
}

const benutzer =
  ansicht === 'buero'
    ? nutzer('office', 'Olivia Office', '55555555-5555-4555-8555-000000000003')
    : ansicht === 'fremd'
      ? nutzer('owner', 'Jannes Test', '55555555-5555-4555-8555-000000000001')
      : nutzer('therapist', 'Anna Beispiel', ANNA);

/** Der bestätigte Hausbesuch, wie er vor der Tür aussieht (UX-EPIC-005). */
const offen = ansicht === 'hausbesuch' || ansicht === 'fremd' || ansicht === 'praxis';

const termin: Appointment = {
  id: TERMIN,
  patient_id: MAX,
  kind: 'therapy',
  title: null,
  event_group_id: null,
  event_series_id: null,
  staff_member_id: ANNA,
  location_id: ansicht === 'praxis' ? '33333333-3333-4333-8333-000000000001' : null,
  appointment_type: ansicht === 'praxis' ? 'practice' : 'home_visit',
  status: ansicht === 'abgesagt' ? 'cancelled' : offen ? 'confirmed' : 'documented',
  // Ein kommender Termin, damit der Ablauf vor der Tür und die Absage
  // mit Frist so aussehen wie im Alltag.
  starts_at: offen ? '2027-05-12T08:00:00.000Z' : '2026-09-28T08:00:00.000Z',
  ends_at: offen ? '2027-05-12T09:00:00.000Z' : '2026-09-28T09:00:00.000Z',
  updated_at: '2026-09-28T09:10:00.000000+00',
  visit_street: ansicht === 'praxis' ? null : 'Beispielstrasse',
  visit_house_number: ansicht === 'praxis' ? null : '12',
  visit_postal_code: ansicht === 'praxis' ? null : '72070',
  visit_city: ansicht === 'praxis' ? null : 'Tuebingen',
  completed_at: offen || ansicht === 'abgesagt' ? null : '2026-09-28T09:05:00.000Z',
  cancellation_reason: ansicht === 'abgesagt' ? 'patient_request' : null,
  no_show_recorded_at: null,
  no_show_protocol_confirmed: null,
  cancellation_received_at: ansicht === 'abgesagt' ? '2026-09-27T17:30:00.000Z' : null,
  fee_basis: ansicht === 'abgesagt' ? 'late_cancellation' : null,
  fee_waived_at: null,
  patient_given_name: 'Max',
  patient_family_name: 'Mustermann',
  staff_given_name: 'Anna',
  staff_family_name: 'Beispiel',
  location_name: ansicht === 'praxis' ? 'Hauptstandort Tuebingen' : null,
  notification_channels: ansicht === 'fremd' ? ['slip', 'phone'] : [],
  treatment_basis_covered: true,
  organization_time_zone: ZONE,
};

const eintrag: TreatmentNote = {
  id: '99999999-9999-4999-8999-000000000001',
  appointment_id: TERMIN,
  addendum_to_note_id: null,
  status: 'final',
  content: 'Synthetisch: Übungen im Stand angeleitet, Heimprogramm besprochen.',
  visit_without_treatment: false,
  created_at: '2026-09-28T09:00:00.000000+00:00',
  updated_at: '2026-09-28T09:04:00.000000+00:00',
  finalized_at: '2026-09-28T09:05:00.000000+00:00',
  finalisation_kind: 'manual',
  version_count: 1,
  author_name: 'Anna Beispiel',
  last_editor_name: 'Anna Beispiel',
  finalized_by_name: 'Anna Beispiel',
};

const kurzblick: Kurzblick = {
  appointment_id: TERMIN,
  patient_id: MAX,
  home_visit_access_note:
    '2. OG links, Klingel „Mustermann“. Aufzug vorhanden. Rad im Hinterhof abstellen.',
  special_note: 'Hund im Flur, wird vor dem Termin weggesperrt.',
  take_along_items: ['Theraband', 'Kinesiotape', 'Übungsplan ausgedruckt'],
  primary_therapist_name: 'Tim Teamleitung',
  treatment_basis_id: '88888888-8888-4888-8888-000000000002',
  treatment_basis_kind: 'follow_up',
  treatment_basis_issued_on: '2026-06-18',
  basis_appointment_count: 10,
  basis_used: 7,
  basis_planned: 10,
  basis_items: [
    { remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 7 },
    { remedy: 'Wärmetherapie', prescribed_quantity: 10, used_quantity: 7 },
  ],
  last_note_id: '99999999-9999-4999-8999-000000000000',
  last_note_appointment_start: '2026-09-24T08:00:00+00:00',
  last_note_status: 'final',
  last_note_content:
    'Synthetisch: Schulter rechts, Beweglichkeit im Alltag besser. Übungen für den Stand eingeführt; Theraband gelb mitgegeben.',
  last_note_visit_without_treatment: false,
  last_note_author_name: 'Tim Teamleitung',
  organization_time_zone: ZONE,
};

const buero = ansicht === 'buero';
const lage: Abrechnungslage = {
  appointment_id: TERMIN,
  treatment_basis_id: kurzblick.treatment_basis_id,
  treatment_basis_kind: 'follow_up',
  treatment_basis_issued_on: '2026-06-18',
  basis_position: ansicht === 'bestaetigt' ? 10 : 8,
  basis_appointment_count: 10,
  billing_visible: buero,
  recipient_kind: buero ? 'aid_authority' : null,
  open_invoice_count: buero ? 1 : null,
  open_outstanding_cents: buero ? 9000 : null,
  open_overdue: buero ? true : null,
};

const bestaetigt = ansicht === 'bestaetigt';
const leistungen: LeistungenAmTermin = {
  appointment_id: TERMIN,
  can_record: true,
  services: bestaetigt
    ? [
        { code: 'KG', label: 'Krankengymnastik', quantity: 1, status: 'billable' },
        { code: 'WT', label: 'Wärmetherapie', quantity: 1, status: 'billable' },
      ]
    : [],
  recorded_at: bestaetigt ? '2026-09-28T09:06:00+00:00' : null,
  recorded_by_name: bestaetigt ? 'Anna Beispiel' : null,
  basis_items: [
    { remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: bestaetigt ? 10 : 7 },
    { remedy: 'Wärmetherapie', prescribed_quantity: 10, used_quantity: bestaetigt ? 10 : 7 },
  ],
};

function vorschlag(id: string, code: string, label: string, suggested: boolean): Vorschlag {
  return {
    catalog_item_id: id,
    code,
    label,
    item_kind: 'treatment',
    unit_price_cents: 4500,
    currency: 'EUR',
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
    service_area: 'therapy',
    suggested,
  };
}

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(['appointment', TERMIN], termin);
client.setQueryData(['treatment-note', TERMIN], {
  primary: offen || ansicht === 'abgesagt' ? null : eintrag,
  addenda: [],
});
// Die Rufnummer im Ablauf „Niemand öffnet?" kommt aus der Tagesliste (UX-005b).
client.setQueryData(
  ['day-plan', '2027-05-12', ANNA],
  [
    {
      id: TERMIN,
      patient_id: MAX,
      staff_member_id: ANNA,
      appointment_type: 'home_visit',
      kind: 'therapy',
      title: null,
      status: 'confirmed',
      starts_at: termin.starts_at,
      ends_at: termin.ends_at,
      patient_given_name: 'Max',
      patient_family_name: 'Mustermann',
      location_name: null,
      visit_street: 'Beispielstrasse',
      visit_house_number: '12',
      visit_postal_code: '72070',
      visit_city: 'Tuebingen',
      patient_phone: '+49 7071 0000005',
      patient_phone_mobile: '+49 160 0000005',
      home_visit_access_note: null,
      special_note: null,
      documentation_status: 'none',
      organization_time_zone: ZONE,
    },
  ],
);
client.setQueryData(['appointment-brief', TERMIN], kurzblick);
client.setQueryData(['appointment', TERMIN, 'abrechnungslage'], lage);
client.setQueryData(['appointment', TERMIN, 'leistungen'], leistungen);
client.setQueryData(
  ['appointment', TERMIN, 'leistungsvorschlag'],
  [
    vorschlag(KG, 'KG', 'Krankengymnastik', true),
    vorschlag(WAERME, 'WT', 'Wärmetherapie', true),
    vorschlag('cccccccc-cccc-4ccc-8ccc-000000000003', 'MT', 'Manuelle Therapie', false),
  ],
);

const rahmen = (kind: ReactNode) => <main className="mx-auto max-w-5xl px-4 py-6">{kind}</main>;

const router = createMemoryRouter(
  [
    { path: '/termine/:appointmentId', element: rahmen(<AppointmentDetailPage user={benutzer} />) },
    { path: '*', element: rahmen(<p>Ende der Prüfseite.</p>) },
  ],
  { initialEntries: [`/termine/${TERMIN}`] },
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
