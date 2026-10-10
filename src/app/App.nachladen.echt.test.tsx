import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useQueryClient } from '@tanstack/react-query';

/**
 * BEF-046 mit der echten Profilabfrage (Zweitreview H2).
 *
 * `App.nachladen.test.tsx` ersetzt `useCurrentUser`. Hier läuft die echte
 * Abfrage gegen einen Ersatz der Datenbank, damit das Verhalten von
 * react-query v5 mitgeprüft ist: Scheitert ein Nachladen, bleiben die Daten
 * stehen und `isError` wird wahr - die Anwendung soll dann stehen bleiben.
 * Kommt beim Nachladen „gesperrt" zurück, ersetzt die Sperrseite sofort.
 */

vi.mock('@/features/auth/SessionProvider', () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/features/auth/sitzungssperre/Sitzungssperre', () => ({
  Sitzungssperre: ({ children }: { children: ReactNode }) => children,
}));

const KONTO = '00000000-0000-0000-0000-000000000001';

vi.mock('@/features/auth/sessionContext', () => ({
  useSession: () => ({
    session: { user: { id: KONTO } },
    initialising: false,
    signOut: vi.fn(),
  }),
}));

// Statt der Praxisoberfläche: ein Feld, die Hinweiszeile und ein Knopf, der
// das Profil nachladen lässt - wie nach dem Wieder-online.
vi.mock('@/routes/AuthenticatedRoutes', async () => {
  const { Profilhinweis } = await import('./Profilhinweis');
  function Ersatz() {
    const client = useQueryClient();
    return (
      <main>
        <Profilhinweis />
        <label>
          Notiz
          <textarea />
        </label>
        <button
          type="button"
          onClick={() => void client.invalidateQueries({ queryKey: ['current-user'] })}
        >
          Nachladen
        </button>
      </main>
    );
  }
  return { AuthenticatedRoutes: Ersatz };
});

/** Was die Profilzeile beim nächsten Abruf liefert. */
let profil: 'aktiv' | 'fehler' | 'gesperrt' = 'aktiv';

function profilzeile() {
  if (profil === 'fehler') return { data: null, error: { message: 'Failed to fetch' } };
  return {
    data: {
      id: KONTO,
      organization_id: '11111111-1111-4111-8111-000000000001',
      person_id: '22222222-2222-4222-8222-000000000002',
      display_name: 'Anna',
      is_active: profil === 'aktiv',
    },
    error: null,
  };
}

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    from: (tabelle: string) => ({
      select: () => ({
        eq: () => {
          if (tabelle === 'user_profiles') {
            return { maybeSingle: () => Promise.resolve(profilzeile()) };
          }
          if (tabelle === 'user_roles') {
            return Promise.resolve({ data: [{ role_key: 'therapist' }], error: null });
          }
          return { maybeSingle: () => Promise.resolve({ data: null, error: null }) };
        },
      }),
    }),
  }),
}));

const { App } = await import('./App');

describe('BEF-046 mit echter Profilabfrage', () => {
  it('bleibt nach einem gescheiterten Nachladen stehen; „gesperrt" ersetzt danach sofort', async () => {
    const user = userEvent.setup();
    render(<App />);

    const feld = await screen.findByLabelText('Notiz');
    await user.type(feld, 'Befund halb getippt');

    profil = 'fehler';
    await user.click(screen.getByRole('button', { name: 'Nachladen' }));

    expect(
      await screen.findByText(/Ihr Profil ließ sich gerade nicht aktualisieren/),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Notiz')).toHaveValue('Befund halb getippt');

    profil = 'gesperrt';
    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

    expect(await screen.findByRole('heading', { name: 'Zugang gesperrt' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Notiz')).not.toBeInTheDocument();
  });
});
