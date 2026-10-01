import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type { Appointment } from '@/features/appointments/api';
import type { Abrechnungslage } from '@/features/appointments/abrechnungslage-api';
import { CompleteTreatmentPage } from '@/features/documentation/CompleteTreatmentPage';
import type { PatientTreatmentNotesEntry, TreatmentNote } from '@/features/documentation/api';
import type { TextSnippet } from '@/features/documentation/textbausteine';
import type { CurrentUser } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `schreibseite.html` (Design-Handoff 2026-10-01,
 * Abschnitt 6a): die eine Schreibseite im Rahmen des Inhaltsbereichs, mit
 * einer Tableiste am Telefon. Ansichten über `?ansicht=`: `neu` (leeres Feld),
 * `entwurf` (vorhandener Entwurf) und `tuer` (Hausbesuch-Szenario 1, „Mit
 * Vermerk festschreiben"). Die Daten liegen vorab im Cache; gesprochen wird
 * mit keinem Server. Alles ist synthetisch.
 */
const ansicht = new URLSearchParams(window.location.search).get('ansicht') ?? 'neu';

const ZONE = 'Europe/Berlin';
const TERMIN = '77777777-7777-4777-8777-000000000001';
const MAX = '66666666-6666-4666-8666-000000000001';
const ANNA = '55555555-5555-4555-8555-000000000002';

const benutzer: CurrentUser = {
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

const termin: Appointment = {
  id: TERMIN,
  patient_id: MAX,
  kind: 'therapy',
  title: null,
  event_group_id: null,
  event_series_id: null,
  staff_member_id: ANNA,
  location_id: null,
  appointment_type: 'home_visit',
  status: 'confirmed',
  starts_at: '2026-10-01T07:10:00.000Z',
  ends_at: '2026-10-01T08:10:00.000Z',
  updated_at: '2026-10-01T06:00:00.000000+00',
  visit_street: 'Beispielstrasse',
  visit_house_number: '12',
  visit_postal_code: '72070',
  visit_city: 'Tuebingen',
  completed_at: null,
  cancellation_reason: null,
  no_show_recorded_at: null,
  no_show_protocol_confirmed: null,
  cancellation_received_at: null,
  fee_basis: null,
  patient_given_name: 'Max',
  patient_family_name: 'Mustermann',
  staff_given_name: 'Anna',
  staff_family_name: 'Beispiel',
  location_name: null,
  notification_channels: [],
  treatment_basis_covered: true,
  organization_time_zone: ZONE,
};

function note(teil: Partial<TreatmentNote>): TreatmentNote {
  return {
    id: '99999999-9999-4999-8999-000000000001',
    appointment_id: TERMIN,
    addendum_to_note_id: null,
    status: 'final',
    content: '',
    visit_without_treatment: false,
    created_at: '2026-09-28T09:00:00.000000+00:00',
    updated_at: '2026-09-28T09:04:00.000000+00:00',
    finalized_at: '2026-09-28T09:05:00.000000+00:00',
    finalisation_kind: 'manual',
    version_count: 1,
    author_name: 'Anna Beispiel',
    last_editor_name: 'Anna Beispiel',
    finalized_by_name: 'Anna Beispiel',
    ...teil,
  };
}

const entwurf = note({
  status: 'draft',
  content: 'Synthetisch: Schulter rechts, Elevation aktiv bis 140°. Übungen im Stand wiederholt.',
  finalized_at: null,
  finalisation_kind: null,
  version_count: 0,
});

function frueher(id: string, tag: string, inhalt: string): PatientTreatmentNotesEntry {
  return {
    appointment_id: id,
    starts_at: `${tag}T07:00:00.000Z`,
    ends_at: `${tag}T08:00:00.000Z`,
    appointment_type: 'home_visit',
    appointment_status: 'documented',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    organization_time_zone: ZONE,
    notes: [note({ id: `n-${id}`, appointment_id: id, content: inhalt })],
  };
}

const lage: Abrechnungslage = {
  appointment_id: TERMIN,
  treatment_basis_id: '88888888-8888-4888-8888-000000000002',
  treatment_basis_kind: 'follow_up',
  treatment_basis_issued_on: '2026-06-18',
  basis_position: 2,
  basis_appointment_count: 6,
  billing_visible: false,
  recipient_kind: null,
  open_invoice_count: null,
  open_outstanding_cents: null,
  open_overdue: null,
};

const bausteine: TextSnippet[] = [
  {
    id: 'b1',
    title: 'Hausbesuch',
    body: 'Hausbesuch durchgeführt.',
    shared: true,
    editable: false,
  },
  {
    id: 'b2',
    title: 'Heimprogramm',
    body: 'Heimprogramm besprochen.',
    shared: true,
    editable: false,
  },
  {
    id: 'b3',
    title: 'Schmerz unverändert',
    body: 'Schmerz unverändert.',
    shared: false,
    editable: true,
  },
];

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(['appointment', TERMIN], termin);
client.setQueryData(['treatment-note', TERMIN], {
  primary: ansicht === 'entwurf' ? entwurf : null,
  addenda: [],
});
client.setQueryData(['appointment', TERMIN, 'abrechnungslage'], lage);
client.setQueryData(['text-snippets'], bausteine);
client.setQueryData(
  ['patient-treatment-notes', MAX, 'schreibseite'],
  [
    frueher(
      'a2',
      '2026-09-28',
      'Synthetisch: Schulter rechts, Beweglichkeit im Alltag besser. Übungen für den Stand eingeführt; Theraband gelb mitgegeben.',
    ),
    frueher(
      'a1',
      '2026-09-24',
      'Synthetisch: Erstbefund. Elevation aktiv 110°, Schmerz bei Abduktion. Ziel: Haare kämmen ohne Schmerz.',
    ),
  ],
);

const suche = ansicht === 'tuer' ? '?ohne-behandlung=1&zurueck=%2F' : '?zurueck=%2F';

const router = createMemoryRouter(
  [
    {
      path: '/termine/:appointmentId/abschluss',
      element: (
        <>
          {/* Derselbe Inhaltsbereich wie in der Anwendung (AppShell). */}
          <main className="max-w-inhalt mx-auto w-full min-w-0 px-4 pt-4 pb-28 sm:px-6 sm:pt-6 sm:pb-10 lg:px-8 lg:pb-12">
            <CompleteTreatmentPage user={benutzer} />
          </main>
          {/* Platzhalter der Tableiste am Telefon. */}
          <div className="border-line bg-surface fixed inset-x-0 bottom-0 z-30 h-14 border-t sm:hidden" />
        </>
      ),
    },
    { path: '*', element: <p>Ende der Prüfseite.</p> },
  ],
  { initialEntries: [`/termine/${TERMIN}/abschluss${suche}`] },
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
