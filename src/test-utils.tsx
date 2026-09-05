import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { render, type RenderResult } from '@testing-library/react';
import { VorschauProvider } from '@/features/preview/VorschauProvider';
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

/** Synthetischer Benutzer für Komponententests. */
export function testUser(roles: RoleKey[], displayName = 'Anna Beispiel'): CurrentUser {
  return {
    profile: {
      id: '11111111-1111-4111-8111-000000000002',
      organization_id: '22222222-2222-4222-8222-000000000001',
      person_id: '44444444-4444-4444-8444-000000000002',
      display_name: displayName,
    },
    roles,
    organizationName: 'Test Praxis Tuebingen',
    organizationTimeZone: 'Europe/Berlin',
    appointmentGridMinutes: 5,
  };
}
