import { describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';

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

vi.mock('@/features/session/useCurrentUser', () => ({
  useCurrentUser: () => ({
    data: undefined,
    isPending: false,
    isError: true,
    error: new Error('Für diesen Zugang ist kein Praxisprofil hinterlegt.'),
  }),
}));

const { App } = await import('./App');

describe('App: Zugang ohne Praxisprofil', () => {
  it('zeigt die Marke über dem Fehler, nicht nur einen nackten Kasten', () => {
    render(<App />);

    expect(screen.getByRole('img', { name: 'Own Motion' })).toBeInTheDocument();
    expect(screen.getByText('Zugang nicht vollständig eingerichtet')).toBeInTheDocument();
  });

  it('nennt den Grund und bietet den Weg zurück an', () => {
    render(<App />);

    expect(screen.getByText(/kein Praxisprofil hinterlegt/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Abmelden' })).toBeInTheDocument();
  });
});
