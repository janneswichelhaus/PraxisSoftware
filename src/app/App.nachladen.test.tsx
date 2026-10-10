import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { onlineManager } from '@tanstack/react-query';
import type * as CurrentUserModul from '@/features/session/useCurrentUser';
import type * as PlattformApi from '@/features/platform/api';
import type { CurrentUser } from '@/features/session/types';

/**
 * Ein gescheitertes Nachladen ersetzt die laufende Anwendung nicht mehr
 * (BEF-046, Entscheidung Jannes 2026-10-09).
 *
 * Bis UX-006b baute jede gescheiterte Profilabfrage den ganzen Baum ab - auch
 * nach einem Funkloch mit längst geladenem Profil. Ein halb getippter Text war
 * dann weg. Geprüft wird deshalb, dass die angemeldete Anwendung eingehängt
 * bleibt und ein Feld seinen Inhalt behält, während „Kein Profil" und „Zugang
 * gesperrt" weiter sofort ersetzen.
 */

vi.mock('@/features/auth/SessionProvider', () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/features/auth/sitzungssperre/Sitzungssperre', () => ({
  Sitzungssperre: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/features/auth/sessionContext', () => ({
  useSession: () => ({
    session: { user: { id: '00000000-0000-0000-0000-000000000001' } },
    initialising: false,
    signOut: vi.fn(),
  }),
}));

// Statt der ganzen Praxisoberfläche: ein Feld und die Hinweiszeile des
// Rahmens. Bleibt der Baum stehen, behält das Feld seinen Text.
vi.mock('@/routes/AuthenticatedRoutes', async () => {
  const { Profilhinweis } = await import('./Profilhinweis');
  return {
    AuthenticatedRoutes: () => (
      <main>
        <Profilhinweis />
        <label>
          Notiz
          <textarea />
        </label>
      </main>
    ),
  };
});

const { KeinProfilError, ZugangGesperrtError } = await vi.importActual<typeof CurrentUserModul>(
  '@/features/session/useCurrentUser',
);

const PROFIL = { profile: { id: 'p1' }, roles: ['therapist'] } as unknown as CurrentUser;
const refetch = vi.fn(() => Promise.resolve());
let zustand: { data: CurrentUser | undefined; isError: boolean; error: Error | null } = {
  data: PROFIL,
  isError: false,
  error: null,
};

// Der Router hält `<Gate />` fest; ein `rerender` erreicht die Abfrage nicht.
// Deshalb ein kleiner Speicher, auf den der Haken hört - wie die echte Abfrage.
const zuhoerer = new Set<() => void>();
function setzeZustand(naechster: typeof zustand) {
  zustand = naechster;
  zuhoerer.forEach((melden) => melden());
}

vi.mock('@/features/session/useCurrentUser', async (importOriginal) => {
  const { useSyncExternalStore } = await import('react');
  return {
    ...(await importOriginal<typeof CurrentUserModul>()),
    useCurrentUser: () => {
      const aktuell = useSyncExternalStore(
        (melden) => {
          zuhoerer.add(melden);
          return () => zuhoerer.delete(melden);
        },
        () => zustand,
      );
      return { ...aktuell, isPending: false, refetch };
    },
  };
});

const ladePlattformkontext = vi.fn<() => Promise<PlattformApi.Plattformzugang[]>>();
vi.mock('@/features/platform/api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladePlattformkontext: () => ladePlattformkontext(),
}));

const { App } = await import('./App');

afterEach(() => {
  zustand = { data: PROFIL, isError: false, error: null };
  refetch.mockClear();
  ladePlattformkontext.mockReset();
});

describe('Nachladefehler mit geladenem Profil', () => {
  it('lässt die Anwendung eingehängt; getippter Text bleibt, die Zeile sagt es', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText('Notiz'), 'Befund halb getippt');
    expect(screen.queryByText(/ließ sich gerade nicht aktualisieren/)).not.toBeInTheDocument();

    act(() =>
      setzeZustand({
        data: PROFIL,
        isError: true,
        error: new Error('Profil konnte nicht geladen werden.'),
      }),
    );

    expect(screen.getByLabelText('Notiz')).toHaveValue('Befund halb getippt');
    expect(screen.getByRole('status')).toHaveTextContent(
      'Ihr Profil ließ sich gerade nicht aktualisieren. Eingaben bleiben erhalten.',
    );
    expect(screen.queryByText('Anwendung nicht geladen')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('ersetzt bei „Zugang gesperrt" weiter sofort', () => {
    zustand = { data: PROFIL, isError: true, error: new ZugangGesperrtError() };
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Zugang gesperrt' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Notiz')).not.toBeInTheDocument();
  });

  it('ersetzt bei „Kein Profil" weiter sofort', async () => {
    ladePlattformkontext.mockResolvedValue([]);
    zustand = { data: PROFIL, isError: true, error: new KeinProfilError() };
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Zugang einrichten' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Notiz')).not.toBeInTheDocument();
  });
});

describe('Plattform: gescheitertes Nachladen des Zugangs', () => {
  it('lässt die Plattform stehen und zeigt die Zeile', async () => {
    zustand = { data: undefined, isError: true, error: new KeinProfilError() };
    ladePlattformkontext.mockResolvedValueOnce([
      {
        access_id: 'cafecafe-cafe-4afe-8afe-000000000001',
        organization_name: 'Test Praxis Tuebingen',
        relationship_kind: 'training',
        status: 'active',
        readable: true,
        read_until: null,
        access_kind: 'self',
        represented_name: null,
      },
    ]);
    window.history.pushState(null, '', '/p');
    render(<App />);
    expect(await screen.findByRole('heading', { name: 'Guten Tag' })).toBeInTheDocument();

    // Wieder online: Die Abfrage lädt nach, und das scheitert.
    ladePlattformkontext.mockRejectedValue(new Error('Failed to fetch'));
    act(() => onlineManager.setOnline(false));
    act(() => onlineManager.setOnline(true));

    expect(
      await screen.findByText(/Ihr Zugang ließ sich gerade nicht aktualisieren/),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Guten Tag' })).toBeInTheDocument();
    expect(screen.queryByText('Zugang nicht geladen')).not.toBeInTheDocument();
  });
});
