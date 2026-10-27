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
const alleAbstecherVerwerfen = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ auth: { getSession, onAuthStateChange, signOut } }),
}));

vi.mock('@/lib/abstecher', async (original) => ({
  ...(await original<Record<string, unknown>>()),
  alleAbstecherVerwerfen,
}));

const { SessionProvider } = await import('./SessionProvider');
const { gemerkterSuchbegriff, suchbegriffMerken } = await import('@/lib/suchbegriff');
const { tabstandLegen, tabstandLesen } = await import('@/lib/tabstand');
const { beimAbmeldenLeeren } = await import('@/lib/abmelden');
const { STARTBILD_MERKER } = await import('@/lib/startbildMerker');
const { useSession } = await import('./sessionContext');
const { useSitzungEndeteVonAussen } = await import('./sitzungsende');

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
  alleAbstecherVerwerfen.mockReset();

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

    // Ohne ausdrückliches `local` wäre es `global` - siehe ANN-045.
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ scope: 'local' }));
  });
});

describe('SessionProvider — Grenze zwischen zwei Konten', () => {
  it('räumt beim Abmelden über die Kopfzeile ab', async () => {
    await anbieterZeigen();
    patientenAblegen();

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));

    await waitFor(() => expect(patientenImSpeicher()).toBeUndefined());
    // Abstecher-Entwürfe räumt hier niemand still ab (ABN-019, BEF-110): Beim
    // freiwilligen Abmelden fragt `AbstecherAbmeldewache`.
    expect(alleAbstecherVerwerfen).not.toHaveBeenCalled();
  });

  it('räumt auch ab, wenn die Abmeldung nicht über die Oberfläche kam — anderer Tab, „Alle Sitzungen beenden", abgelaufene Sitzung', async () => {
    await anbieterZeigen();
    patientenAblegen();

    act(() => melde?.('SIGNED_OUT', null));

    expect(patientenImSpeicher()).toBeUndefined();
    // Eine automatische Abmeldung verwirft keinen Abstecher-Entwurf (BEF-110);
    // er bleibt an das Konto gebunden.
    expect(alleAbstecherVerwerfen).not.toHaveBeenCalled();
  });

  it('räumt beim Wechsel auf ein anderes Konto ab, auch ohne Abmeldung dazwischen', async () => {
    await anbieterZeigen();
    patientenAblegen();

    act(() => melde?.('SIGNED_IN', sitzung('bert')));

    expect(patientenImSpeicher()).toBeUndefined();
    expect(await screen.findByText('bert')).toBeInTheDocument();
  });

  it('leert die gemerkten Suchbegriffe der Listen, meist Namen', async () => {
    await anbieterZeigen();
    suchbegriffMerken('patienten', 'Mustermann');
    suchbegriffMerken('mitarbeitende', 'Anna');

    act(() => melde?.('SIGNED_OUT', null));

    expect(gemerkterSuchbegriff('patienten')).toBe('');
    expect(gemerkterSuchbegriff('mitarbeitende')).toBe('');
  });

  it('leert die Suchbegriffe auch beim Wechsel auf ein anderes Konto ohne Abmeldung', async () => {
    await anbieterZeigen();
    suchbegriffMerken('radflotte', 'Nina');

    act(() => melde?.('SIGNED_IN', sitzung('bert')));

    expect(gemerkterSuchbegriff('radflotte')).toBe('');
    expect(await screen.findByText('bert')).toBeInTheDocument();
  });

  it('behält die Suchbegriffe beim turnusmäßigen Verlängern', async () => {
    await anbieterZeigen();
    suchbegriffMerken('radflotte', 'Nina');

    act(() => melde?.('TOKEN_REFRESHED', sitzung('anna')));

    expect(gemerkterSuchbegriff('radflotte')).toBe('Nina');
  });

  it('leert, was Fachmodule eingetragen haben, beim Kontowechsel und Abmelden, nicht beim Verlängern', async () => {
    const leeren = vi.fn();
    beimAbmeldenLeeren(leeren);
    await anbieterZeigen();

    act(() => melde?.('TOKEN_REFRESHED', sitzung('anna')));
    expect(leeren).not.toHaveBeenCalled();

    act(() => melde?.('SIGNED_IN', sitzung('bert')));
    expect(leeren).toHaveBeenCalledTimes(1);

    act(() => melde?.('SIGNED_OUT', null));
    expect(leeren).toHaveBeenCalledTimes(2);
  });

  it('leert die Anrufliste im Tab beim Abmelden und beim Kontowechsel, nicht beim Verlängern', async () => {
    await anbieterZeigen();
    tabstandLegen('anna', 'v1', { abgesagt: ['t1'] });
    sessionStorage.setItem('anderes', 'bleibt');

    act(() => melde?.('TOKEN_REFRESHED', sitzung('anna')));
    expect(tabstandLesen('anna', 'v1')).toEqual({ abgesagt: ['t1'] });

    act(() => melde?.('SIGNED_IN', sitzung('bert')));
    expect(tabstandLesen('anna', 'v1')).toBeUndefined();
    expect(sessionStorage.getItem('anderes')).toBe('bleibt');

    tabstandLegen('bert', 'v2', { abgesagt: ['t2'] });
    act(() => melde?.('SIGNED_OUT', null));
    expect(tabstandLesen('bert', 'v2')).toBeUndefined();
  });

  it('leert beim ersten Blick den Stand eines anderen Kontos, etwa nach einem Wechsel im zweiten Tab', async () => {
    tabstandLegen('bert', 'v1', { abgesagt: ['t1'] });
    tabstandLegen('anna', 'v2', { abgesagt: ['t2'] });

    await anbieterZeigen();

    expect(tabstandLesen('bert', 'v1')).toBeUndefined();
    expect(tabstandLesen('anna', 'v2')).toEqual({ abgesagt: ['t2'] });
  });

  /**
   * Was dieser Test belegt und was nicht: Er hält fest, dass eine Antwort,
   * die **nach** dem Wechsel eintrifft, nicht im Speicher landet. Das ist die
   * Anforderung. Er unterscheidet **nicht** zwischen `clear()` und
   * `removeQueries()` — nachgeprüft, beide bestehen ihn. Die Wahl von
   * `clear()` ist damit keine Notwendigkeit, sondern eine Entscheidung, und
   * der Kommentar an der Stelle sagt das jetzt auch so.
   */
  it('lässt eine verspätet eintreffende Antwort des vorigen Kontos nicht im Speicher', async () => {
    await anbieterZeigen();

    let antworten: ((wert: unknown) => void) | undefined;
    const laufend = queryClient.fetchQuery({
      queryKey: ['patients'],
      queryFn: () => new Promise((resolve) => (antworten = resolve)),
    });

    act(() => melde?.('SIGNED_OUT', null));
    // Die Antwort kommt erst NACH der Abmeldung an.
    antworten?.([{ id: 'p1', family_name: 'Mustermann' }]);
    await act(async () => {
      // Die Ablehnung ist erwartet: Die Abfrage ist mit dem Speicher
      // verworfen worden.
      await laufend.catch(() => undefined);
    });

    expect(patientenImSpeicher()).toBeUndefined();
  });

  it('räumt beim turnusmäßigen Verlängern NICHT ab — sonst wäre die Tagesliste stündlich weg (ANN-021)', async () => {
    await anbieterZeigen();
    patientenAblegen();

    act(() => melde?.('TOKEN_REFRESHED', sitzung('anna')));

    expect(patientenImSpeicher()).toEqual([{ id: 'p1', family_name: 'Mustermann' }]);
    expect(alleAbstecherVerwerfen).not.toHaveBeenCalled();
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

    expect(alleAbstecherVerwerfen).not.toHaveBeenCalled();
  });
});

/** Einmal je Tab beim Öffnen, nicht nach der Anmeldung (ANN-243 Fassung 2). */
describe('SessionProvider — Merker des Startbilds', () => {
  beforeEach(() => sessionStorage.setItem(STARTBILD_MERKER, '1'));

  it('lässt ihn bei der Anmeldung stehen, damit ein Neuladen danach kein zweites Intro zeigt', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <Probe />
        </SessionProvider>
      </QueryClientProvider>,
    );
    await screen.findByText('keine Sitzung');
    patientenAblegen();

    act(() => melde?.('SIGNED_IN', sitzung('anna')));

    expect(await screen.findByText('anna')).toBeInTheDocument();
    expect(sessionStorage.getItem(STARTBILD_MERKER)).toBe('1');
    // Abgeräumt wird bei der Anmeldung weiter alles andere.
    expect(patientenImSpeicher()).toBeUndefined();
  });

  it('löscht ihn beim Kontowechsel und beim Abmelden', async () => {
    await anbieterZeigen();

    act(() => melde?.('SIGNED_IN', sitzung('bert')));
    expect(sessionStorage.getItem(STARTBILD_MERKER)).toBeNull();

    sessionStorage.setItem(STARTBILD_MERKER, '1');
    act(() => melde?.('SIGNED_OUT', null));
    expect(sessionStorage.getItem(STARTBILD_MERKER)).toBeNull();
  });

  it('löscht ihn auch, wenn das Abmelden scheitert und der Anbieter selbst nachräumt', async () => {
    signOut.mockResolvedValue({ error: new Error('Sitzung nicht lesbar') });
    await anbieterZeigen();
    patientenAblegen();

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));

    await waitFor(() => expect(sessionStorage.getItem(STARTBILD_MERKER)).toBeNull());
    // Ohne Ereignis des Anmeldedienstes ist dieses Nachräumen der einzige Schutz.
    expect(patientenImSpeicher()).toBeUndefined();
  });

  it('behält ihn beim turnusmäßigen Verlängern', async () => {
    await anbieterZeigen();

    act(() => melde?.('TOKEN_REFRESHED', sitzung('anna')));

    expect(sessionStorage.getItem(STARTBILD_MERKER)).toBe('1');
  });
});

/**
 * Sitzungsende von außen (BEF-047): Die Anmeldemaske soll sagen, dass die
 * Sitzung beendet wurde - aber nur, wenn die Person es nicht selbst auf
 * dieser Seite ausgelöst hat.
 */
describe('SessionProvider — Sitzungsende von außen', () => {
  function EndeProbe() {
    const { session, signOut: abmelden } = useSession();
    const endeVonAussen = useSitzungEndeteVonAussen();
    return (
      <div>
        <p>{session?.user?.id ?? 'keine Sitzung'}</p>
        <p>{endeVonAussen ? 'von außen beendet' : 'kein Ende von außen'}</p>
        <button type="button" onClick={() => void abmelden()}>
          Abmelden
        </button>
      </div>
    );
  }

  async function zeigen() {
    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <EndeProbe />
        </SessionProvider>
      </QueryClientProvider>,
    );
    await screen.findByText('anna');
  }

  it('meldet ein Ende von außen - anderer Tab, anderes Gerät, abgelehnte Erneuerung', async () => {
    await zeigen();
    expect(screen.getByText('kein Ende von außen')).toBeInTheDocument();

    act(() => melde?.('SIGNED_OUT', null));

    expect(screen.getByText('von außen beendet')).toBeInTheDocument();
  });

  it('meldet nichts, wenn die Person selbst abmeldet', async () => {
    await zeigen();

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));

    expect(await screen.findByText('keine Sitzung')).toBeInTheDocument();
    expect(screen.getByText('kein Ende von außen')).toBeInTheDocument();
  });

  it('nimmt die Meldung mit der nächsten Anmeldung zurück', async () => {
    await zeigen();
    act(() => melde?.('SIGNED_OUT', null));
    expect(screen.getByText('von außen beendet')).toBeInTheDocument();

    act(() => melde?.('SIGNED_IN', sitzung('anna')));

    expect(screen.getByText('kein Ende von außen')).toBeInTheDocument();
  });

  it('meldet beim ersten Blick auf eine leere Sitzung nichts', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    render(
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <EndeProbe />
        </SessionProvider>
      </QueryClientProvider>,
    );

    expect(await screen.findByText('keine Sitzung')).toBeInTheDocument();
    expect(screen.getByText('kein Ende von außen')).toBeInTheDocument();
  });
});
