import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

/**
 * Der Profilweg beim Start (BEF-070): Passt die Zeile des Profils nicht zum
 * Schema, steht ein deutscher Satz im Fehler, nicht der englische Prüftext.
 * Die Erstlade-Seite zeigt ihn seit BEF-046 ohnehin nicht mehr wörtlich; der
 * Satz bleibt trotzdem der richtige, falls ihn eine andere Stelle zeigt.
 */

const KONTO = '55555555-5555-4555-8555-000000000002';

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (tabelle: string) => ({
      select: () => ({
        eq: () =>
          tabelle === 'user_profiles'
            ? {
                maybeSingle: () =>
                  Promise.resolve({
                    // `is_active` als Text statt Wahrheitswert: eine Abweichung
                    // nach einer Datenbankänderung (BEF-010).
                    data: {
                      id: KONTO,
                      organization_id: '11111111-1111-4111-8111-000000000001',
                      person_id: '22222222-2222-4222-8222-000000000002',
                      display_name: 'Anna',
                      is_active: 'ja',
                    },
                    error: null,
                  }),
              }
            : Promise.resolve({ data: [], error: null }),
      }),
    }),
  }),
}));

const { useCurrentUser } = await import('./useCurrentUser');

describe('useCurrentUser bei unerwarteter Profilzeile', () => {
  it('meldet den deutschen Satz', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );

    const { result } = renderHook(() => useCurrentUser(KONTO), { wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error?.message).toBe('Profil konnte nicht geladen werden.');
    expect(result.current.error?.message).not.toMatch(/expected|invalid_type/);
  });
});
