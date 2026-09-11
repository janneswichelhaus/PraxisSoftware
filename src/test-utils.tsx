import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, type RenderResult } from '@testing-library/react';
import { VorschauProvider } from '@/features/preview/VorschauProvider';
import type { Patient } from '@/features/patients/api';
import type { CurrentUser, RoleKey } from '@/features/session/types';

export function renderWithProviders(ui: ReactElement, initialPath = '/'): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });

  function Wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>{children}</MemoryRouter>
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
