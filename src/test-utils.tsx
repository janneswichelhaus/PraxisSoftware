import { createContext, useState, type ReactElement, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { render, type RenderResult } from '@testing-library/react';
import { VorschauProvider } from '@/features/preview/VorschauProvider';
import type { Appointment } from '@/features/appointments/api';
import type { Patient } from '@/features/patients/api';
import type { StaffMember } from '@/features/staff/api';
import type { CurrentUser, RoleKey } from '@/features/session/types';

/**
 * Der zu prüfende Inhalt auf dem Weg in die Route.
 *
 * `Consumer` statt einer eigenen Komponente: Eine Komponente in dieser Datei
 * wäre ein Verstoß gegen `react-refresh/only-export-components`, und für einen
 * einzelnen Durchreicher lohnt keine zweite Datei.
 */
const KinderKontext = createContext<ReactNode>(null);

/**
 * Derselbe Routertyp wie in der Anwendung (`src/app/App.tsx`): ein Data Router
 * mit einer Platzhalterroute.
 *
 * `<MemoryRouter>` stand hier bis FIX-EPIC-003. Er stellt den
 * Data-Router-Kontext nicht bereit, und ein Test einer Seite mit
 * Navigationsschutz hätte deshalb an `useBlocker` geworfen — die Prüfung wäre
 * grün gewesen, ohne den Schutz je gesehen zu haben.
 */
export function renderWithProviders(ui: ReactElement, initialPath = '/'): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    // Der Router entsteht genau einmal: `createMemoryRouter` legt den
    // Verlaufszustand an, und ein neuer bei jedem Rendern setzte ihn zurück -
    // ein `rerender()` im Test landete wieder auf `initialPath`. Der Inhalt
    // kommt deshalb über den Kontext in die Route hinein und nicht über das
    // Routenobjekt.
    const [router] = useState(() =>
      createMemoryRouter(
        [
          {
            path: '*',
            element: <KinderKontext.Consumer>{(kinder) => kinder}</KinderKontext.Consumer>,
          },
        ],
        { initialEntries: [initialPath] },
      ),
    );

    return (
      <QueryClientProvider client={queryClient}>
        <KinderKontext.Provider value={children}>
          <RouterProvider router={router} />
        </KinderKontext.Provider>
      </QueryClientProvider>
    );
  }

  return render(ui, { wrapper: Wrapper });
}

/**
 * Wie `renderWithProviders`, zusätzlich mit dem Zustand des Vorschaugerüsts.
 *
 * Nur für Seiten der noch nicht angebundenen Bereiche. Der Provider hält
 * ausschließlich synthetische Daten im Arbeitsspeicher und spricht mit keinem
 * Server; die Tests brauchen dafür keine Mocks.
 */
export function renderMitVorschau(ui: ReactElement, initialPath = '/'): RenderResult {
  return renderWithProviders(<VorschauProvider>{ui}</VorschauProvider>, initialPath);
}

/**
 * Synthetischer Patient für Komponententests.
 *
 * Die Kartei ist eine breite Projektion; ohne gemeinsamen Ausgangswert müsste
 * jeder Test jedes Feld nennen und bei jedem neuen Feld nachziehen. Die
 * Vorgabe ist bewusst leer, wo ein Feld optional ist - ein Test, der ein Feld
 * braucht, setzt es ausdrücklich.
 */
export function testPatient(overrides: Partial<Patient> = {}): Patient {
  return {
    id: '66666666-6666-4666-8666-000000000001',
    status: 'active',
    care_started_on: '2026-02-10',
    care_concluded_on: null,
    given_name: 'Max',
    family_name: 'Mustermann',
    date_of_birth: '1957-04-30',
    email: null,
    phone: null,
    phone_work: null,
    phone_mobile: null,
    fax: null,
    institution: null,
    street: null,
    house_number: null,
    postal_code: null,
    city: null,
    primary_therapist_staff_member_id: null,
    primary_therapist_name: null,
    home_visit_access_note: null,
    special_note: null,
    remark: null,
    ...overrides,
  };
}

/**
 * Beschäftigtenkennungen des Seeds, nach Anzeigename.
 *
 * Damit trägt ein Testbenutzer dieselbe Kennung wie sein Gegenstück in
 * `supabase/seed.sql`. Das ist kein Beiwerk: die Vorbelegung „ich" im
 * Terminformular hängt daran, und Olivia Office ist bewusst **nicht**
 * zuordenbar - ein Test, der sie mit Annas Kennung ausstattet, würde eine
 * Vorbelegung prüfen, die es in Wirklichkeit nicht gäbe.
 */
const STAFF_IDS: Record<string, string> = {
  'Jannes Test': '55555555-5555-4555-8555-000000000001',
  'Anna Beispiel': '55555555-5555-4555-8555-000000000002',
  'Olivia Office': '55555555-5555-4555-8555-000000000003',
  'Tim Teamleitung': '55555555-5555-4555-8555-000000000004',
};

/** Synthetischer Benutzer für Komponententests. */
export function testUser(roles: RoleKey[], displayName = 'Anna Beispiel'): CurrentUser {
  return {
    profile: {
      id: '11111111-1111-4111-8111-000000000002',
      organization_id: '22222222-2222-4222-8222-000000000001',
      person_id: '44444444-4444-4444-8444-000000000002',
      display_name: displayName,
      is_active: true,
    },
    roles,
    organizationName: 'Test Praxis Tuebingen',
    organizationTimeZone: 'Europe/Berlin',
    appointmentGridMinutes: 5,
    // Wie in der Anwendung: ein Patientenkonto hat keinen Mitarbeiterdatensatz.
    staffMemberId: roles.some((rolle) => rolle !== 'patient')
      ? (STAFF_IDS[displayName] ?? null)
      : null,
  };
}

/**
 * Synthetischer Termin für Komponententests.
 *
 * Wie `testPatient`: ein Termin trägt fast dreißig Felder, und ohne
 * gemeinsamen Ausgangswert müsste jeder Test jedes davon nennen. Die Vorgabe
 * ist ein gewöhnlicher Praxistermin von Berta Bestand bei Anna Beispiel; alles
 * Abweichende - Hausbesuch, Ereignis, abgesagt - setzt der Test ausdrücklich.
 */
export function testAppointment(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: '77777777-7777-4777-8777-000000000001',
    patient_id: '66666666-6666-4666-8666-000000000001',
    kind: 'treatment',
    title: null,
    event_group_id: null,
    event_series_id: null,
    staff_member_id: '55555555-5555-4555-8555-000000000002',
    location_id: '33333333-3333-4333-8333-000000000001',
    appointment_type: 'practice',
    status: 'confirmed',
    starts_at: '2027-05-12T07:00:00.000Z',
    ends_at: '2027-05-12T08:00:00.000Z',
    updated_at: '2027-05-01T10:00:00.000000+00',
    visit_street: null,
    visit_house_number: null,
    visit_postal_code: null,
    visit_city: null,
    completed_at: null,
    cancellation_reason: null,
    no_show_recorded_at: null,
    no_show_protocol_confirmed: null,
    cancellation_received_at: null,
    fee_basis: null,
    patient_given_name: 'Berta',
    patient_family_name: 'Bestand',
    staff_given_name: 'Anna',
    staff_family_name: 'Beispiel',
    location_name: 'Hauptstandort Tuebingen',
    notification_channels: [],
    // Gedeckt: der Regelfall, an dem kein Zeichen steht (CAL-022).
    treatment_basis_covered: true,
    organization_time_zone: 'Europe/Berlin',
    ...overrides,
  };
}

/**
 * Synthetischer Mitarbeiterdatensatz für Komponententests.
 *
 * Vorgabe ist Anna Beispiel aus dem Seed. Die privaten Felder sind leer: Wer
 * sie prüft, setzt sie ausdrücklich - dann steht im Test selbst, dass es um
 * genau diesen Rollenschnitt geht (§4.7).
 */
export function testStaffMember(overrides: Partial<StaffMember> = {}): StaffMember {
  return {
    id: '55555555-5555-4555-8555-000000000002',
    person_id: '44444444-4444-4444-8444-000000000002',
    given_name: 'Anna',
    family_name: 'Beispiel',
    employment_status: 'active',
    work_email: 'anna.beispiel@praxis.invalid',
    work_phone: null,
    primary_location_id: null,
    primary_location_name: null,
    date_of_birth: null,
    private_email: null,
    private_phone: null,
    street: null,
    postal_code: null,
    city: null,
    ...overrides,
  };
}

/**
 * Der morgige Tag in der **Ortszeit** des Rechners, auf dem der Test läuft.
 *
 * `new Date(Date.now() + 86_400_000).toISOString()` liefert den UTC-Tag — und
 * der ist westlich von UTC noch der heutige, östlich schon der übernächste.
 * Die Formulare prüfen mit `new Date('YYYY-MM-DDT00:00:00')`, also in
 * Ortszeit; zwischen Mitternacht und 01:00 oder 02:00 Berliner Zeit lief
 * beides auseinander und die Tests waren rot, ohne dass Code betroffen war
 * (R3-024).
 */
export function morgenOrtszeit(): string {
  const jetzt = new Date();
  const morgen = new Date(jetzt.getFullYear(), jetzt.getMonth(), jetzt.getDate() + 1);
  const monat = String(morgen.getMonth() + 1).padStart(2, '0');
  const tag = String(morgen.getDate()).padStart(2, '0');
  return `${morgen.getFullYear()}-${monat}-${tag}`;
}
