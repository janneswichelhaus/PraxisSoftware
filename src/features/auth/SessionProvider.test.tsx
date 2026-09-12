import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Der Sitzungsanbieter ist die einzige Stelle, die weiß, wann ein Konto geht
 * und ein anderes kommt. Was daran hängt, hängt an nichts sonst — deshalb
 * dieser Test (FIX-004, FIX-005).
 */

const getSession = vi.fn();
const onAuthStateChange = vi.fn();
const signOut = vi.fn();
const unsubscribe = vi.fn();
const alleEntwuerfeVerwerfen = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { getSession, onAuthStateChange, signOut } }),
}));

vi.mock('@/features/prescriptions/api', () => ({ alleEntwuerfeVerwerfen }));

const { SessionProvider } = await import('./SessionProvider');
const { useSession } = await import('./sessionContext');

/** Gibt den aktuellen Ereignisrückruf des Anbieters frei. */
let melde: ((ereignis: string, sitzung: unknown) => void) | undefined;

function Probe() {
  const { session, initialising, signOut: abmelden } = useSession();
  return (
    <div>
      <p>{initialising ? 'lädt' : (session?.user?.id ?? 'keine Sitzung')}</p>
      <button type="button" onClick={() => void abmelden()}>
        Abmelden
      </button>
    </div>
  );
}

function sitzung(userId: string) {
  return { user: { id: userId } };
}

beforeEach(() => {
  melde = undefined;
  getSession.mockReset();
  onAuthStateChange.mockReset();
  signOut.mockReset();
  unsubscribe.mockReset();
  alleEntwuerfeVerwerfen.mockReset();

  getSession.mockResolvedValue({ data: { session: sitzung('anna') } });
  signOut.mockResolvedValue({ error: null });
  onAuthStateChange.mockImplementation((rueckruf: typeof melde) => {
    melde = rueckruf;
    return { data: { subscription: { unsubscribe } } };
  });
});

async function anbieterZeigen() {
  render(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
  await screen.findByText('anna');
}

describe('SessionProvider', () => {
  it('beendet beim gewöhnlichen Abmelden nur diese Sitzung, nicht die auf anderen Geräten', async () => {
    await anbieterZeigen();

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));

    // Ohne ausdrückliches `local` wäre es `global` - siehe ANN-044.
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: 'local' }));
  });

  it('verwirft die Verordnungsentwürfe der abmeldenden Person', async () => {
    await anbieterZeigen();

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));

    await waitFor(() => expect(alleEntwuerfeVerwerfen).toHaveBeenCalled());
  });

  it('übernimmt die Sitzung, die der Anmeldedienst meldet', async () => {
    await anbieterZeigen();

    act(() => melde?.('SIGNED_OUT', null));

    expect(await screen.findByText('keine Sitzung')).toBeInTheDocument();
  });
});
