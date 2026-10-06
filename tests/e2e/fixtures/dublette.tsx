import type { ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type { Patient, PatientSearchHit } from '@/features/patients/api';
import type { Zusammenfuehrungsplan } from '@/features/patients/zusammenfuehren';
import { ZusammenfuehrenPage } from '@/features/patients/ZusammenfuehrenPage';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `dublette.html` (PRX-EPIC-003b).
 *
 * `?sperre=1` zeigt die Vorschau mit einem Sperrgrund, sonst eine, die
 * zusammenführen lässt. Die Dublette wählt der Test mit einem Klick aus. Die
 * Daten liegen vorab im Cache; gesprochen wird mit keinem Server. Alles ist
 * synthetisch.
 */
const gesperrt = new URLSearchParams(window.location.search).get('sperre') === '1';

const PETRA = '66666666-6666-4666-8666-000000000003';
const DUBLETTE = '66666666-6666-4666-8666-0000000000d3';

const petra = {
  id: PETRA,
  status: 'active',
  care_started_on: '2026-02-10',
  care_concluded_on: null,
  given_name: 'Petra',
  family_name: 'Platzhalter',
  date_of_birth: '1971-12-05',
  email: null,
  phone: '+49 7071 0000003',
  phone_work: null,
  phone_mobile: null,
  institution: null,
  street: 'Beispielweg',
  house_number: '3',
  postal_code: '72070',
  city: 'Tübingen',
  primary_therapist_staff_member_id: null,
  primary_therapist_name: null,
  home_visit_access_note: null,
  special_note: 'Klingel defekt, bitte anrufen',
  remark: null,
} as unknown as Patient;

const treffer: PatientSearchHit[] = [
  {
    id: DUBLETTE,
    given_name: 'Petra',
    family_name: 'Platzhalter',
    date_of_birth: null,
    status: 'active',
  },
];

const plan: Zusammenfuehrungsplan = {
  source: {
    id: DUBLETTE,
    given_name: 'Petra',
    family_name: 'Platzhalter',
    date_of_birth: null,
    status: 'active',
    care_concluded_on: null,
  },
  target: {
    id: PETRA,
    given_name: 'Petra',
    family_name: 'Platzhalter',
    date_of_birth: '1971-12-05',
    status: 'active',
    care_concluded_on: null,
  },
  counts: {
    appointments: 4,
    treatment_notes: 3,
    treatment_bases: 1,
    billable_services: 3,
    invoices: 1,
    invoices_issued: 1,
    patient_files: 2,
    privacy_records: 2,
    tasks: 1,
  },
  conflicts: ['phone', 'address'],
  appended: ['special_note'],
  blockers: gesperrt ? ['draft_invoice_overlap'] : [],
};

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(['patient', PETRA], petra);
client.setQueryData(['patient-duplicates', PETRA], treffer);
client.setQueryData(['patient-merge-preview', DUBLETTE, PETRA], plan);

const rahmen = (kind: ReactNode) => <main className="mx-auto max-w-5xl px-4 py-6">{kind}</main>;

const router = createMemoryRouter(
  [
    { path: '/patienten/:patientId/dublette', element: rahmen(<ZusammenfuehrenPage />) },
    { path: '*', element: rahmen(<p>Ende der Prüfseite.</p>) },
  ],
  { initialEntries: [`/patienten/${PETRA}/dublette`] },
);

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <RouterProvider router={router} />
  </QueryClientProvider>,
);
