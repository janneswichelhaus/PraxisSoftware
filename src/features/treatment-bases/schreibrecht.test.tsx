import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as SessionContextModule from '@/features/auth/sessionContext';
import type { RoleKey } from '@/features/session/types';
import { testUser } from '@/test-utils';

const BENUTZER_ID = '11111111-1111-4111-8111-000000000002';

vi.mock('@/features/auth/sessionContext', async (importOriginal) => {
  const actual = await importOriginal<typeof SessionContextModule>();
  return {
    ...actual,
    useSession: () => ({
      session: { user: { id: BENUTZER_ID } },
      initialising: false,
      signOut: vi.fn(),
    }),
  };
});

const { useDarfGrundlagenSchreiben } = await import('./schreibrecht');

function Anzeige() {
  const darf = useDarfGrundlagenSchreiben();
  return <p>{darf === null ? 'unbekannt' : darf ? 'darf' : 'darf nicht'}</p>;
}

/** Legt die angemeldete Person so in den Zwischenspeicher, wie `App.tsx` es tut. */
function mitPerson(rollen: RoleKey[] | null) {
  const queryClient = new QueryClient();
  if (rollen) queryClient.setQueryData(['current-user', BENUTZER_ID], testUser(rollen));
  render(
    <QueryClientProvider client={queryClient}>
      <Anzeige />
    </QueryClientProvider>,
  );
}

// VER-04, ANN-011: Schreiben dürfen owner, therapist und team_lead - office
// nicht. Die Seite fragt dafür keinen Server, sie liest, was die Anwendung zur
// angemeldeten Person schon geladen hat.
describe('useDarfGrundlagenSchreiben', () => {
  it.each([['owner'], ['therapist'], ['team_lead']] as const)('laesst %s schreiben', (rolle) => {
    mitPerson([rolle]);
    expect(screen.getByText('darf')).toBeInTheDocument();
  });

  it('laesst office nicht schreiben', () => {
    mitPerson(['office']);
    expect(screen.getByText('darf nicht')).toBeInTheDocument();
  });

  it('sagt „unbekannt", solange keine Person geladen ist - dann entscheidet der Server', () => {
    mitPerson(null);
    expect(screen.getByText('unbekannt')).toBeInTheDocument();
  });
});
