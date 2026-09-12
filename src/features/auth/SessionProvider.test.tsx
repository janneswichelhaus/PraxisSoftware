import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

/**
 * Der Sitzungsanbieter ist die einzige Stelle, die sieht, wann ein Konto geht
 * und ein anderes kommt. Daran hängt, ob Patientendaten des vorigen Kontos im
 * Speicher stehen bleiben — also wird hier geprüft (FIX-004, FIX-005).
 *
 * Der Abfragespeicher ist **echt**, nicht gemockt: Die Frage ist gerade, ob am
 * Ende noch etwas darin liegt.
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

/** Der Ereignisrückruf, den der Anbieter beim Anmeldedienst hinterlegt hat. */
let melde: ((ereignis: string, sitzung: unknown) => void) | undefined;
let queryClient: QueryClient;

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

/** Ein Stellvertreter für geladene Patientendaten im Abfragespeicher. */
function patientenAblegen() {
  queryClient.setQueryData(['patients'], [{ id: 'p1', family_name: 'Mustermann' }]);
}

function patientenImSpeicher() {
  return queryClient.getQueryData(['patients']);
}

beforeEach(() => {
  melde = undefined;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  getSession.mockReset();
  onAuthStateChange.mockReset();
  signOut.mockReset();
  unsubscribe.mockReset();
  alleEntwuerfeVerwerfen.mockReset();

  getSession.mockResolvedValue({ data: { session: sitzung('anna') } });
  onAuthStateChange.mockImplementation((rueckruf: typeof melde) => {
    melde = rueckruf;
    return { data: { subscription: { unsubscribe } } };
  });
  // Wie supabase-js: `signOut` meldet `SIGNED_OUT`, bevor es auflöst.
  signOut.mockImplementation(() => {
    melde?.('SIGNED_OUT', null);
    return Promise.resolve({ error: null });
  });
});

async function anbieterZeigen() {
  render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>,
  );
  await screen.findByText('anna');
}

describe('SessionProvider — Reichweite des Abmeldens', () => {
  it('beendet beim gewöhnlichen Abmelden nur diese Sitzung, nicht die auf anderen Geräten', async () => {
    await anbieterZeigen();

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));

    // Ohne ausdrückliches `local` wäre es `global` - siehe ANN-044.
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: 'local' }));
  });
});

describe('SessionProvider — Grenze zwischen zwei Konten', () => {
  it('räumt beim Abmelden über die Kopfzeile ab', async () => {
    await anbieterZeigen();
    patientenAblegen();

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));

    await waitFor(() => expect(patientenImSpeicher()).toBeUndefined());
    expect(alleEntwuerfeVerwerfen).toHaveBeenCalled();
  });

  it('räumt auch ab, wenn die Abmeldung nicht über die Oberfläche kam — anderer Tab, „Alle Sitzungen beenden", abgelaufene Sitzung', async () => {
    await anbieterZeigen();
    patientenAblegen();

    act(() => melde?.('SIGNED_OUT', null));

    expect(patientenImSpeicher()).toBeUndefined();
    expect(alleEntwuerfeVerwerfen).toHaveBeenCalled();
  });

  it('räumt beim Wechsel auf ein anderes Konto ab, auch ohne Abmeldung dazwischen', async () => {
    await anbieterZeigen();
    patientenAblegen();

    act(() => melde?.('SIGNED_IN', sitzung('bert')));

    expect(patientenImSpeicher()).toBeUndefined();
    expect(await screen.findByText('bert')).toBeInTheDocument();
  });

  it('lässt eine verspätete Antwort des vorigen Kontos nicht mehr in den Speicher', async () => {
    await anbieterZeigen();

    let antworten: ((wert: unknown) => void) | undefined;
    const laufend = queryClient.fetchQuery({
      queryKey: ['patients'],
      queryFn: () => new Promise((resolve) => (antworten = resolve)),
    });

    act(() => melde?.('SIGNED_OUT', null));
    // Die Antwort kommt erst NACH der Abmeldung an - der Fall, den ein
    // Aufräumen ohne Abbruch der laufenden Abfragen offen ließe.
    antworten?.([{ id: 'p1', family_name: 'Mustermann' }]);
    await act(async () => {
      // `clear()` bricht die laufende Abfrage ab; die Ablehnung ist der
      // Beleg, nicht ein Fehler. Ohne Abbruch liefe sie hier durch und
      // schriebe die Daten des vorigen Kontos in den frischen Speicher.
      await laufend.catch(() => undefined);
    });

    expect(patientenImSpeicher()).toBeUndefined();
  });

  it('räumt beim turnusmäßigen Verlängern NICHT ab — sonst wäre die Tagesliste stündlich weg (ANN-021)', async () => {
    await anbieterZeigen();
    patientenAblegen();

    act(() => melde?.('TOKEN_REFRESHED', sitzung('anna')));

    expect(patientenImSpeicher()).toEqual([{ id: 'p1', family_name: 'Mustermann' }]);
    expect(alleEntwuerfeVerwerfen).not.toHaveBeenCalled();
  });

  it('räumt beim ersten Blick auf eine leere Sitzung nichts ab — das ist kein Wechsel', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </QueryClientProvider>,
    );
    await screen.findByText('keine Sitzung');

    expect(alleEntwuerfeVerwerfen).not.toHaveBeenCalled();
  });
});
