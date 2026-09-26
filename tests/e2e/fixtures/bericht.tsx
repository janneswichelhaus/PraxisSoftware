import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { CurrentUser } from '@/features/session/types';
import {
  berichtQueryKey,
  quellenQueryKey,
  type Bericht,
  type Berichtsdokument,
  type Quellenzeile,
} from '@/features/therapy-reports/api';
import { TherapieberichtPage } from '@/features/therapy-reports/TherapieberichtPage';
import { TherapieberichtDruckPage } from '@/features/therapy-reports/TherapieberichtDruckPage';
import '@/index.css';

/**
 * Einstieg der Prüfseite aus `bericht.html` (DOK-005).
 *
 * Zwei Ansichten über `?ansicht=`: das Formular eines Entwurfs und das
 * Druckblatt eines abgeschlossenen Berichts. Die Daten liegen vorab im Cache;
 * gesprochen wird mit keinem Server. Alles ist synthetisch.
 */
const ansicht = new URLSearchParams(window.location.search).get('ansicht') ?? 'formular';
const PATIENT = '66666666-6666-4666-8666-000000000001';

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
  organizationTimeZone: 'Europe/Berlin',
  appointmentGridMinutes: 5,
  staffMemberId: '55555555-5555-4555-8555-000000000002',
};

const BEFUND =
  'Synthetischer Befund Schulter rechts: Flexion 120°, Abduktion 90°, Außenrotation 30°. ' +
  'Painful Arc zwischen 70° und 110°. Kraft Außenrotation 4/5. Nachtschmerz beim Liegen auf der rechten Seite.';

const dokument: Berichtsdokument = {
  schema_version: 1,
  praxis: {
    name: 'Physiotherapie Fiktiv',
    street: 'Musterweg',
    house_number: '1',
    postal_code: '72070',
    city: 'Tübingen',
    phone: '+49 7071 0000001',
    email: 'praxis@physio.invalid',
  },
  empfaenger: {
    title: 'Dr. med.',
    given_name: 'Petra',
    family_name: 'Probst',
    practice_name: 'Orthopädische Gemeinschaftspraxis Fiktiv',
    street: 'Ärztegasse',
    house_number: '3',
    postal_code: '72070',
    city: 'Tübingen',
    fax: '+49 7071 0000402',
  },
  patient: { given_name: 'Max', family_name: 'Mustermann', date_of_birth: '1957-04-30' },
  verordnung: {
    treatment_basis_kind: 'follow_up',
    issued_on: '2026-06-18',
    diagnosis: 'Synthetisch: Fortbestehende Bewegungseinschränkung rechte Schulter.',
    items: [
      { remedy: 'Krankengymnastik', prescribed_quantity: 10 },
      { remedy: 'Wärmetherapie', prescribed_quantity: 10 },
    ],
    termine_durchgefuehrt: 7,
    erster_termin: '2026-06-22',
    letzter_termin: '2026-08-03',
  },
  eintraege: [
    {
      note_id: 'n1',
      datum: '2026-06-22',
      verfasser: 'Anna Beispiel',
      inhalt: BEFUND,
      ergaenzung: false,
    },
    {
      note_id: 'n2',
      datum: '2026-08-03',
      verfasser: 'Tim Teamleitung',
      inhalt:
        'Synthetisch: Flexion 150°, Abduktion 130°. Eigenübungen selbstständig, Schlaf auf der rechten Seite möglich.',
      ergaenzung: false,
    },
  ],
  koerperschema: {
    erhoben_am: '2026-06-20',
    markierungen: [
      { x: 0.185, y: 0.19, bereich: 'schulter_rechts' },
      { x: 0.815, y: 0.19, bereich: 'schulter_rechts' },
    ],
  },
  text: {
    inhalt:
      'Synthetisch: Die Beweglichkeit hat im Verlauf der sieben Termine zugenommen; die Werte stehen oben wörtlich aus der Dokumentation.',
    verfasser: 'Anna Beispiel',
    datum: '2026-09-21',
  },
  empfehlung: {
    inhalt: 'Synthetisch: Eine weitere Folgeverordnung über sechs Termine halte ich für sinnvoll.',
    verfasser: 'Anna Beispiel',
    datum: '2026-09-21',
  },
};

const abgeschlossen: Bericht = {
  id: 'b1',
  patient_id: PATIENT,
  treatment_basis_id: '88888888-8888-4888-8888-000000000002',
  status: 'abgeschlossen',
  report_text: dokument.text!.inhalt,
  recommendation: dokument.empfehlung!.inhalt,
  note_ids: ['n1', 'n2'],
  body_chart_response_id: 'q1',
  updated_at: '2026-09-21T10:00:00Z',
  document: { ...dokument, abgeschlossen: { datum: '2026-09-21', von: 'Anna Beispiel' } },
};

const entwurf: Bericht = {
  ...abgeschlossen,
  id: 'b2',
  status: 'entwurf',
  document: { ...dokument, text: null, empfehlung: null, eintraege: [dokument.eintraege[0]!] },
  report_text: null,
  recommendation: null,
  note_ids: ['n1'],
  body_chart_response_id: null,
};

const quellen: Quellenzeile[] = [
  {
    kind: 'eintrag',
    id: 'n2',
    occurred_on: '2026-08-03',
    author_name: 'Tim Teamleitung',
    content: dokument.eintraege[1]!.inhalt,
    in_treatment_basis: true,
    is_addendum: false,
    body_chart: null,
  },
  {
    kind: 'eintrag',
    id: 'n1',
    occurred_on: '2026-06-22',
    author_name: 'Anna Beispiel',
    content: BEFUND,
    in_treatment_basis: true,
    is_addendum: false,
    body_chart: null,
  },
  {
    kind: 'eintrag',
    id: 'n0',
    occurred_on: '2026-03-02',
    author_name: 'Anna Beispiel',
    content: 'Synthetisch: Abschluss der Erstverordnung.',
    in_treatment_basis: false,
    is_addendum: false,
    body_chart: null,
  },
  {
    kind: 'koerperschema',
    id: 'q1',
    occurred_on: '2026-06-20',
    author_name: 'Anna Beispiel',
    content: null,
    in_treatment_basis: null,
    is_addendum: false,
    body_chart: dokument.koerperschema!.markierungen,
  },
];

const client = new QueryClient({
  defaultOptions: { queries: { staleTime: Infinity, retry: false } },
});
client.setQueryData(berichtQueryKey('b1'), abgeschlossen);
client.setQueryData(berichtQueryKey('b2'), entwurf);
client.setQueryData(quellenQueryKey('b2'), quellen);

const start =
  ansicht === 'blatt'
    ? `/patienten/${PATIENT}/berichte/b1/druck`
    : `/patienten/${PATIENT}/berichte/b2`;

createRoot(document.getElementById('wurzel')!).render(
  <QueryClientProvider client={client}>
    <MemoryRouter initialEntries={[start]}>
      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route
            path="/patienten/:patientId/berichte/:berichtId"
            element={<TherapieberichtPage user={nutzer} />}
          />
          <Route
            path="/patienten/:patientId/berichte/:berichtId/druck"
            element={<TherapieberichtDruckPage user={nutzer} />}
          />
        </Routes>
      </main>
    </MemoryRouter>
  </QueryClientProvider>,
);
