import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { VorschauProvider } from '@/features/preview/VorschauProvider';
import { PatientRecordLayout } from '@/features/patients/PatientRecordLayout';
import { PatientMasterDataPage } from '@/features/patients/PatientMasterDataPage';
import { PatientAppointmentsPage } from '@/features/appointments/PatientAppointmentsPage';
import { PatientRecordDocumentation } from '@/features/documentation/PatientRecordDocumentation';
import type { PatientTreatmentNotesEntry, TreatmentNote } from '@/features/documentation/api';
import type { Patient } from '@/features/patients/api';
import type { PatientAppointment } from '@/features/appointments/api';
import type { TreatmentBasis, TreatmentBasisKontingent } from '@/features/treatment-bases/api';
import { tagePlus } from '@/features/appointments/calendar';
import { todayInTimeZone } from '@/features/appointments/api';
import type { CurrentUser, RoleKey } from '@/features/session/types';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `akte.html` (UI-Redesign Schritt 5).
 *
 * `?bereich=termine` (Standard), `stammdaten` oder `verlauf`, `?rolle=therapist`
 * (Standard) oder `office`, `?leer=1` für eine Akte ohne Hinweise, Grundlage
 * und Kontakt. Die Daten liegen vorab im Cache; gesprochen wird mit keinem
 * Server. Alles ist synthetisch.
 */
const suche = new URLSearchParams(window.location.search);
const bereich = ['stammdaten', 'verlauf'].includes(suche.get('bereich') ?? '')
  ? (suche.get('bereich') as 'stammdaten' | 'verlauf')
  : 'termine';
const rolle: RoleKey = suche.get('rolle') === 'office' ? 'office' : 'therapist';
const leer = suche.get('leer') === '1';

const ZONE = 'Europe/Berlin';
const PATIENT = '66666666-6666-4666-8666-000000000001';
const GRUNDLAGE = '99999999-9999-4999-8999-000000000001';
const heute = todayInTimeZone(ZONE);

const nutzer: CurrentUser = {
  profile: {
    id: '11111111-1111-4111-8111-000000000002',
    organization_id: '22222222-2222-4222-8222-000000000001',
    person_id: '44444444-4444-4444-8444-000000000002',
    display_name: rolle === 'office' ? 'Olivia Office' : 'Anna Beispiel',
    is_active: true,
  },
  roles: [rolle],
  organizationName: 'Test Praxis Tuebingen',
  organizationTimeZone: ZONE,
  appointmentGridMinutes: 5,
  staffMemberId: '55555555-5555-4555-8555-000000000002',
  revenueShare: false,
};

/** Ortszeit eines Tages als Zeitpunkt; Sommer- und Winterzeit egal. */
function um(tag: string, uhrzeit: string): string {
  const [stunde, minute] = uhrzeit.split(':').map(Number) as [number, number];
  const [jahr, monat, t] = tag.split('-').map(Number) as [number, number, number];
  const utc = Date.UTC(jahr, monat - 1, t, stunde, minute);
  const versatz =
    new Date(new Date(utc).toLocaleString('en-US', { timeZone: ZONE })).getTime() -
    new Date(new Date(utc).toLocaleString('en-US', { timeZone: 'UTC' })).getTime();
  return new Date(utc - versatz).toISOString();
}

const patient: Patient = {
  id: PATIENT,
  status: 'active',
  care_started_on: '2026-09-01',
  care_concluded_on: null,
  given_name: 'Max',
  family_name: 'Mustermann',
  date_of_birth: '1961-03-12',
  email: leer ? null : 'max.mustermann@example.invalid',
  phone: null,
  phone_work: null,
  phone_mobile: leer ? null : '+49 160 0000005',
  fax: null,
  institution: null,
  street: leer ? null : 'Beispielstrasse',
  house_number: leer ? null : '12',
  postal_code: leer ? null : '72070',
  city: leer ? null : 'Tuebingen',
  primary_therapist_staff_member_id: null,
  primary_therapist_name: 'Anna Beispiel',
  home_visit_access_note: leer ? null : '2. OG links\nKlingel Mustermann',
  special_note: leer ? null : 'Synthetisch: Hund im Flur.',
  remark: null,
  geocode_precision: 'address',
  treatment_table_required: !leer,
  take_along_items: ['Theraband'],
};

function termin(
  nummer: number,
  tag: string,
  beginn: string,
  ende: string,
  status: PatientAppointment['status'],
): PatientAppointment {
  return {
    id: `77777777-7777-4777-8777-00000000000${nummer}`,
    starts_at: um(tag, beginn),
    ends_at: um(tag, ende),
    appointment_type: 'home_visit',
    status,
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    notification_channels: [],
    organization_time_zone: ZONE,
    treatment_basis_id: GRUNDLAGE,
    treatment_basis_kind: 'first',
    treatment_basis_issued_on: '2026-09-20',
    treatment_basis_covered: status === 'cancelled' ? null : true,
  };
}

const kommende = leer
  ? []
  : [
      termin(1, heute, '09:10', '10:10', 'confirmed'),
      termin(2, tagePlus(heute, 7), '09:10', '10:10', 'confirmed'),
      termin(3, tagePlus(heute, 14), '09:10', '10:10', 'confirmed'),
    ];
const vergangene = leer
  ? []
  : [
      termin(4, tagePlus(heute, -3), '09:10', '10:10', 'documented'),
      termin(5, tagePlus(heute, -10), '09:10', '10:10', 'cancelled'),
    ];

const grundlage: TreatmentBasis = {
  id: GRUNDLAGE,
  prescriber_id: '88888888-8888-4888-8888-000000000001',
  prescriber_name: 'Dr. Synthetisch Roth',
  prescriber_practice_name: null,
  treatment_basis_kind: 'first',
  issued_on: '2026-09-20',
  frequency_note: null,
  note: null,
  items: [],
  updated_at: '2026-09-20T10:00:00.000000+00',
};
const kontingent: TreatmentBasisKontingent = {
  treatment_basis_id: GRUNDLAGE,
  prescribed: 6,
  used: 1,
  planned: 4,
  upcoming: 3,
  remaining: 2,
  covered: 4,
  uncovered: 0,
};

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(['patient', PATIENT], patient);
client.setQueryData(['patient-treatment-bases', PATIENT], leer ? [] : [grundlage]);
client.setQueryData(['patient-treatment-basis-slots', PATIENT], leer ? [] : [kontingent]);
client.setQueryData(
  ['open-points', 'intake', PATIENT],
  leer
    ? []
    : [
        { item: 'finding', state: 'open' },
        { item: 'privacy', state: 'open' },
        { item: 'anamnesis', state: 'done' },
      ],
);
client.setQueryData(['patient-next-appointment', PATIENT, null], kommende.slice(0, 1));
client.setQueryData(['patient-appointments', PATIENT, true, null], {
  pages: [kommende],
  pageParams: [null],
});
client.setQueryData(['patient-appointments', PATIENT, false, null], {
  pages: [vergangene],
  pageParams: [null],
});
client.setQueryData(['waitlist', 'open', PATIENT], []);
client.setQueryData(['platform-access', 'treatment', PATIENT], null);

/** Der Behandlungsverlauf über drei Monate (Design-Handoff 2026-10-01, Abschnitt 7). */
function eintrag(
  id: string,
  tag: string,
  inhalt: string,
  entwurf = false,
): PatientTreatmentNotesEntry {
  const note: TreatmentNote = {
    id: `n-${id}`,
    appointment_id: id,
    addendum_to_note_id: null,
    status: entwurf ? 'draft' : 'final',
    content: inhalt,
    visit_without_treatment: false,
    created_at: `${tag}T08:00:00.000Z`,
    updated_at: `${tag}T08:05:00.000Z`,
    finalized_at: entwurf ? null : `${tag}T08:10:00.000Z`,
    finalisation_kind: entwurf ? null : 'manual',
    version_count: entwurf ? 0 : 1,
    author_name: 'Anna Beispiel',
    last_editor_name: 'Anna Beispiel',
    finalized_by_name: entwurf ? null : 'Anna Beispiel',
  };
  return {
    appointment_id: id,
    starts_at: `${tag}T07:00:00.000Z`,
    ends_at: `${tag}T08:00:00.000Z`,
    appointment_type: 'home_visit',
    appointment_status: entwurf ? 'completed' : 'documented',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    organization_time_zone: ZONE,
    notes: [note],
  };
}
client.setQueryData(['patient-treatment-notes', PATIENT], {
  pages: [
    [
      eintrag(
        'v4',
        '2026-09-30',
        'Synthetisch: Schulter rechts, Übungen im Stand wiederholt.',
        true,
      ),
      eintrag(
        'v3',
        '2026-09-24',
        'Synthetisch: Beweglichkeit im Alltag besser, Theraband gelb mitgegeben.',
      ),
      eintrag(
        'v2',
        '2026-08-27',
        'Synthetisch: Elevation aktiv 120°, Schmerz bei Abduktion geringer.',
      ),
      eintrag(
        'v1',
        '2026-07-15',
        'Synthetisch: Erstbefund. Elevation aktiv 110°, Ziel Haare kämmen ohne Schmerz.',
      ),
    ],
  ],
  pageParams: [null],
});
client.setQueryData(['documentation-deadline', nutzer.profile.organization_id], 1);

const router = createMemoryRouter(
  [
    {
      path: '/patienten/:patientId',
      element: (
        <VorschauProvider>
          <AppShell user={nutzer} onSignOut={() => undefined}>
            <PatientRecordLayout user={nutzer} />
          </AppShell>
        </VorschauProvider>
      ),
      children: [
        { path: 'termine', element: <PatientAppointmentsPage /> },
        { path: 'stammdaten', element: <PatientMasterDataPage /> },
        {
          path: 'verlauf',
          element: <PatientRecordDocumentation patient={patient} user={nutzer} />,
        },
        { path: '*', element: <p>Ende der Prüfseite.</p> },
      ],
    },
    { path: '*', element: <p>Ende der Prüfseite.</p> },
  ],
  { initialEntries: [`/patienten/${PATIENT}/${bereich}`] },
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
