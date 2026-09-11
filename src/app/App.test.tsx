import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';
import type * as CurrentUserModul from '@/features/session/useCurrentUser';
import type * as KontoApi from '@/features/staff/konto-api';

/**
 * Die Seite „Zugang nicht vollständig eingerichtet" (MARKE-001).
 *
 * Sie ist neben der Anmeldemaske die einzige Vollseite außerhalb des
 * Anwendungsrahmens — und die einzige, die jemand **nach** erfolgreicher
 * Anmeldung zu sehen bekommt. Ohne die Marke stünde dort ein Fehlerkasten ohne
 * Absender; wer gerade sein Kennwort eingegeben hat, sieht dann eine Seite, die
 * nicht mehr nach derselben Anwendung aussieht.
 *
 * Sitzung und Profil sind ersetzt, weil dieser Zustand sonst einen echten
 * Anmeldedienst und ein kaputtes Profil in der Datenbank bräuchte.
 */

vi.mock('@/features/auth/SessionProvider', () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/features/auth/sessionContext', () => ({
  useSession: () => ({
    session: { user: { id: '00000000-0000-0000-0000-000000000001' } },
    initialising: false,
    signOut: vi.fn(),
  }),
}));

/**
 * Seit STAFF-EPIC-002 unterscheidet App.tsx drei Zustände anhand der
 * Fehlerklasse. Der Mock muss die Klassen deshalb mitliefern - sonst liefe
 * `error instanceof …` gegen `undefined`.
 */
const { KeinProfilError, ZugangGesperrtError } = await vi.importActual<typeof CurrentUserModul>(
  '@/features/session/useCurrentUser',
);

let fehler: Error = new Error('Etwas ist schiefgegangen.');

vi.mock('@/features/session/useCurrentUser', async (importOriginal) => {
  const actual = await importOriginal<typeof CurrentUserModul>();
  return {
    ...actual,
    useCurrentUser: () => ({
      data: undefined,
      isPending: false,
      isError: true,
      error: fehler,
    }),
  };
});

vi.mock('@/features/staff/konto-api', async (importOriginal) => ({
  ...(await importOriginal<typeof KontoApi>()),
  nimmZugangAn: () => Promise.resolve(),
}));

const { App } = await import('./App');

describe('App: Zugang nicht vollständig eingerichtet', () => {
  it('zeigt die Marke über dem Fehler, nicht nur einen nackten Kasten', () => {
    fehler = new Error('Profil konnte nicht geladen werden.');
    render(<App />);

    expect(screen.getByRole('img', { name: 'Own Motion' })).toBeInTheDocument();
    expect(screen.getByText('Zugang nicht vollständig eingerichtet')).toBeInTheDocument();
  });

  it('nennt den Grund und bietet den Weg zurück an', () => {
    fehler = new Error('Profil konnte nicht geladen werden.');
    render(<App />);

    expect(screen.getByText(/Profil konnte nicht geladen werden/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abmelden' })).toBeInTheDocument();
  });
});

describe('App: die beiden Zustände aus STAFF-EPIC-002', () => {
  it('führt ein Konto ohne Praxisprofil auf „Zugang einrichten" statt in einen Fehler', () => {
    // Der Normalfall direkt nach der Anmeldung über eine Einladung
    // (STAFF-002b) - kein Fehlerkasten, sondern ein nächster Schritt.
    fehler = new KeinProfilError();
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Zugang einrichten' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Einladung annehmen' })).toBeInTheDocument();
    expect(screen.queryByText('Zugang nicht vollständig eingerichtet')).not.toBeInTheDocument();
  });

  it('sagt einem gesperrten Zugang, dass er gesperrt ist', () => {
    // Ohne diesen Zweig sähe die Person eine vollständige, aber überall leere
    // Anwendung - der unklare Zustand aus §13 (STAFF-003).
    fehler = new ZugangGesperrtError();
    render(<App />);

    expect(screen.getByText('Dieser Zugang ist gesperrt.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abmelden' })).toBeInTheDocument();
  });

  it('trägt auf beiden Seiten die Marke (MARKE-001)', () => {
    fehler = new KeinProfilError();
    const { unmount } = render(<App />);
    expect(screen.getByRole('img', { name: 'Own Motion' })).toBeInTheDocument();
    unmount();

    fehler = new ZugangGesperrtError();
    render(<App />);
    expect(screen.getByRole('img', { name: 'Own Motion' })).toBeInTheDocument();
  });
});
