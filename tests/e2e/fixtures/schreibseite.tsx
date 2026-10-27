import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type { Appointment } from '@/features/calendar/appointments/api';
import type { Abrechnungslage } from '@/features/calendar/appointments/abrechnungslage-api';
import { CompleteTreatmentPage } from '@/features/clinical/documentation/CompleteTreatmentPage';
import { TreatmentNoteAddendumPage } from '@/features/clinical/documentation/TreatmentNoteAddendumPage';
import { TreatmentNoteHistoryPage } from '@/features/clinical/documentation/TreatmentNoteHistoryPage';
import { TreatmentNotePage } from '@/features/clinical/documentation/TreatmentNotePage';
import { TreatmentNoteRevisionPage } from '@/features/clinical/documentation/TreatmentNoteRevisionPage';
import type {
  PatientTreatmentNotesEntry,
  TreatmentNote,
  TreatmentNoteVersion,
} from '@/features/clinical/documentation/api';
import type { TextSnippet } from '@/features/clinical/documentation/textbausteine';
import type { CurrentUser } from '@/features/core/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `schreibseite.html` (Design-Handoff 2026-10-01,
 * Abschnitt 6a): die eine Schreibseite im Rahmen des Inhaltsbereichs, mit
 * einer Tableiste am Telefon. Ansichten über `?ansicht=`: `neu` (leeres Feld),
 * `entwurf` (vorhandener Entwurf) und `tuer` (Hausbesuch-Szenario 1, „Mit
 * Vermerk festschreiben"). Dazu die übrigen Wege eines Eintrags in derselben
 * Hülle (Design-Rollout B4): `nachtrag`, `nachtrag-entwurf` (Nachtrag
 * bearbeiten), `korrektur` und `verlauf`. Die Daten liegen vorab im Cache;
 * gesprochen wird mit keinem Server. Alles ist synthetisch.
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
  fee_waived_at: null,
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

const FESTGESCHRIEBEN = note({
  content:
    'Synthetisch: Schulter rechts, Elevation aktiv bis 140°. Übungen im Stand wiederholt; Theraband gelb mitgegeben.',
  version_count: 2,
});

const NACHTRAG_ID = '99999999-9999-4999-8999-000000000002';
const nachtragEntwurf = note({
  id: NACHTRAG_ID,
  addendum_to_note_id: FESTGESCHRIEBEN.id,
  status: 'draft',
  content: 'Synthetisch: Nachgereicht – Heimprogramm telefonisch bestätigt.',
  finalized_at: null,
  finalisation_kind: null,
  version_count: 0,
});

const versionen: TreatmentNoteVersion[] = [
  {
    version_no: 1,
    content: 'Synthetisch: Schulter rechts, Elevation aktiv bis 130°. Übungen im Stand wiederholt.',
    change_reason: null,
    recorded_at: '2026-09-28T09:05:00.000000+00:00',
    author_name: 'Anna Beispiel',
  },
  {
    version_no: 2,
    content: FESTGESCHRIEBEN.content,
    change_reason: 'Zahlendreher beim Winkel.',
    recorded_at: '2026-09-29T07:30:00.000000+00:00',
    author_name: 'Anna Beispiel',
  },
];

const WEGE: Record<string, string> = {
  nachtrag: `/termine/${TERMIN}/dokumentation/${FESTGESCHRIEBEN.id}/nachtrag`,
  'nachtrag-entwurf': `/termine/${TERMIN}/dokumentation/${NACHTRAG_ID}/bearbeiten`,
  korrektur: `/termine/${TERMIN}/dokumentation/${FESTGESCHRIEBEN.id}/korrektur`,
  verlauf: `/termine/${TERMIN}/dokumentation/${FESTGESCHRIEBEN.id}/verlauf`,
};
const weg = WEGE[ansicht];

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
  closing_talk_due: false,
};

/**
 * Drei eigene Bausteine für die Chipzeile und einer der Praxis, der seit B5
 * (ANN-531) nicht mehr in der Leiste steht. `?bausteine=keine`: nur dieser -
 * die Leiste zeigt dann „Eigene Bausteine anlegen“.
 */
const PRAXISBAUSTEIN: TextSnippet = {
  id: 'b0',
  title: 'Eigenuebungen besprochen',
  body: 'Eigenübungen besprochen.',
  shared: true,
  editable: false,
};

const bausteine: TextSnippet[] = [
  PRAXISBAUSTEIN,
  {
    id: 'b1',
    title: 'Hausbesuch',
    body: 'Hausbesuch durchgeführt.',
    shared: false,
    editable: true,
  },
  {
    id: 'b2',
    title: 'Heimprogramm',
    body: 'Heimprogramm besprochen.',
    shared: false,
    editable: true,
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
client.setQueryData(
  ['treatment-note', TERMIN],
  weg
    ? {
        primary: FESTGESCHRIEBEN,
        addenda: ansicht === 'nachtrag-entwurf' ? [nachtragEntwurf] : [],
      }
    : { primary: ansicht === 'entwurf' ? entwurf : null, addenda: [] },
);
client.setQueryData(['treatment-note-versions', FESTGESCHRIEBEN.id], versionen);
client.setQueryData(['appointment', TERMIN, 'abrechnungslage'], lage);
client.setQueryData(
  ['text-snippets'],
  new URLSearchParams(window.location.search).get('bausteine') === 'keine'
    ? [PRAXISBAUSTEIN]
    : bausteine,
);
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

/** Derselbe Inhaltsbereich wie in der Anwendung (AppShell), mit Tableiste am Telefon. */
export function Rahmen({ children }: { children: ReactNode }) {
  return (
    <>
      <main className="max-w-inhalt mx-auto w-full min-w-0 px-4 pt-4 pb-28 sm:px-6 sm:pt-6 sm:pb-10 lg:px-8 lg:pb-12">
        {children}
      </main>
      {/* Platzhalter der Tableiste am Telefon. */}
      <div className="border-line bg-surface fixed inset-x-0 bottom-0 z-30 h-14 border-t sm:hidden" />
    </>
  );
}

const router = createMemoryRouter(
  [
    {
      path: '/termine/:appointmentId/abschluss',
      element: (
        <Rahmen>
          <CompleteTreatmentPage user={benutzer} />
        </Rahmen>
      ),
    },
    {
      path: '/termine/:appointmentId/dokumentation/:noteId/nachtrag',
      element: (
        <Rahmen>
          <TreatmentNoteAddendumPage user={benutzer} />
        </Rahmen>
      ),
    },
    {
      path: '/termine/:appointmentId/dokumentation/:noteId/bearbeiten',
      element: (
        <Rahmen>
          <TreatmentNotePage user={benutzer} />
        </Rahmen>
      ),
    },
    {
      path: '/termine/:appointmentId/dokumentation/:noteId/korrektur',
      element: (
        <Rahmen>
          <TreatmentNoteRevisionPage user={benutzer} />
        </Rahmen>
      ),
    },
    {
      path: '/termine/:appointmentId/dokumentation/:noteId/verlauf',
      element: (
        <Rahmen>
          <TreatmentNoteHistoryPage user={benutzer} />
        </Rahmen>
      ),
    },
    { path: '*', element: <p>Ende der Prüfseite.</p> },
  ],
  { initialEntries: [`${weg ?? `/termine/${TERMIN}/abschluss`}${suche}`] },
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
