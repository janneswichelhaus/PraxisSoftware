import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import type * as SperrstandModul from './sperrstand';
import type { Sperrstand } from './sperrstand';
import type * as PasskeyModul from '../passkey';
import type * as PinModul from '../appPin';
import type { PinErgebnis } from '../appPin';
import { useSperrsicherung } from './sperrsicherung';
import { Dialogfenster } from '@/components/ui/Dialogfenster';

/**
 * Die Sitzungssperre der Oberfläche (SEC-002, SEC-003; ADR-025).
 *
 * Geprüft wird, was jsdom zeigen kann: erst prüfen, dann zeigen; sperren zur
 * gemeldeten Frist mit Vorlauf; Bedienung höchstens einmal je Minute melden;
 * bei Rückkehr nach Ablauf sofort verbergen; geräumter Speicher; offene Texte
 * vor der Sperre sichern oder festhalten; entsperren mit dem Passkey, als
 * Rückweg mit der App-PIN (ADR-025 Fassung 2). Ein Kennwortfeld gibt es nicht.
 * Dass der Server dieselben Fristen durchsetzt, prüft
 * `supabase/tests/sitzungssperre.test.ts`.
 */

const ladeSperrstand = vi.fn<(bedient: boolean) => Promise<Sperrstand>>();
vi.mock('./sperrstand', async (importOriginal) => ({
  ...(await importOriginal<typeof SperrstandModul>()),
  ladeSperrstand: (bedient: boolean) => ladeSperrstand(bedient),
}));

const signOut = vi.fn(() => Promise.resolve());
vi.mock('../sessionContext', () => ({
  useSession: () => ({
    session: { user: { id: 'konto-1', email: 'anna@example.test' } },
    initialising: false,
    signOut,
  }),
}));

const anmeldenMitPasskey = vi.fn<() => Promise<void>>();
const passkeyMoeglich = vi.fn(() => true);
vi.mock('../passkey', async (importOriginal) => ({
  ...(await importOriginal<typeof PasskeyModul>()),
  anmeldenMitPasskey: () => anmeldenMitPasskey(),
  passkeyMoeglich: () => passkeyMoeglich(),
}));

const hatPin = vi.fn<() => Promise<boolean>>();
const gibMitPinFrei = vi.fn<(pin: string) => Promise<PinErgebnis>>();
vi.mock('../appPin', async (importOriginal) => ({
  ...(await importOriginal<typeof PinModul>()),
  hatPin: () => hatPin(),
  gibMitPinFrei: (pin: string) => gibMitPinFrei(pin),
}));

vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));

const { Sitzungssperre } = await import('./Sitzungssperre');

function offen(sekundenBisInaktiv = 30 * 60, sekundenBisHoechstdauer = 60 * 60): Sperrstand {
  return { gesperrt: false, sekundenBisInaktiv, sekundenBisHoechstdauer };
}

let queryClient: QueryClient;

/** Eine Seite mit Patientendaten im Abfragespeicher und einem Eingabefeld. */
function Inhalt({ sicherung }: { sicherung?: () => Promise<boolean> }) {
  const client = useQueryClient();
  const [text, setText] = useState('');
  useSperrsicherung(sicherung ?? (() => Promise.resolve(true)));
  return (
    <div>
      <p>Akte von Max Mustermann</p>
      <p>{client.getQueryData(['akte']) ? 'mit Daten' : 'ohne Daten'}</p>
      <label>
        Befund
        <input value={text} onChange={(e) => setText(e.target.value)} />
      </label>
    </div>
  );
}

function zeichne(sicherung?: () => Promise<boolean>) {
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  queryClient.setQueryData(['akte'], { name: 'Max Mustermann' });
  return render(
    <QueryClientProvider client={queryClient}>
      <Sitzungssperre>
        <Inhalt {...(sicherung ? { sicherung } : {})} />
      </Sitzungssperre>
    </QueryClientProvider>,
  );
}

/** Lässt ausstehende Versprechen und Uhren laufen. */
async function warte(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] });
  vi.setSystemTime(new Date('2026-10-06T09:00:00Z'));
  ladeSperrstand.mockReset();
  signOut.mockClear();
  anmeldenMitPasskey.mockReset();
  passkeyMoeglich.mockReset().mockReturnValue(true);
  hatPin.mockReset().mockResolvedValue(true);
  gibMitPinFrei.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Sitzungssperre: erst prüfen, dann zeigen (Punkt 5)', () => {
  it('zeigt nichts, bis der Server geantwortet hat', async () => {
    let antworten: (s: Sperrstand) => void = () => undefined;
    ladeSperrstand.mockReturnValue(new Promise((fertig) => (antworten = fertig)));
    zeichne();
    expect(screen.getByText('Sitzung wird geprüft …')).toBeInTheDocument();
    expect(screen.queryByText('Akte von Max Mustermann')).toBeNull();
    expect(ladeSperrstand).toHaveBeenCalledWith(false);

    antworten(offen());
    await warte();
    expect(screen.getByText('Akte von Max Mustermann')).toBeVisible();
  });

  it('zeigt einer gesperrten Sitzung nur die Sperrseite - nie den Inhalt', async () => {
    ladeSperrstand.mockResolvedValue({ gesperrt: true, grund: 'hoechstdauer' });
    zeichne();
    await warte();
    expect(screen.getByRole('heading', { name: 'Gesperrt' })).toBeInTheDocument();
    expect(screen.getByText(/Nach 60 Minuten ist eine erneute Freigabe nötig/)).toBeInTheDocument();
    // Kein Kennwortfeld, auch nicht als Rückweg (ADR-025 Punkte 7 und 15).
    expect(screen.queryByLabelText('Kennwort')).toBeNull();
    expect(screen.queryByText('Akte von Max Mustermann')).toBeNull();
    // Kein Name, keine E-Mail-Adresse sichtbar (Punkt 3).
    expect(screen.queryByText(/anna@example.test/)).toBeNull();
  });

  it('bietet nach einem Fehler der ersten Prüfung nur „erneut“ und Abmelden an', async () => {
    ladeSperrstand.mockRejectedValueOnce(new Error('offline'));
    zeichne();
    await warte();
    expect(screen.getByText('Die Sitzung konnte nicht geprüft werden.')).toBeInTheDocument();
    expect(screen.queryByText('Akte von Max Mustermann')).toBeNull();

    ladeSperrstand.mockResolvedValue(offen());
    fireEvent.click(screen.getByRole('button', { name: /erneut/i }));
    await warte();
    expect(screen.getByText('Akte von Max Mustermann')).toBeVisible();
  });
});

describe('Sitzungssperre: sperren zur Frist (Punkte 1 bis 3)', () => {
  it('sperrt mit Vorlauf vor der früheren Frist und räumt den Abfragespeicher', async () => {
    ladeSperrstand.mockResolvedValueOnce(offen(120, 3000));
    zeichne();
    await warte();
    expect(screen.getByText('mit Daten')).toBeInTheDocument();

    // 120 s bis zur Inaktivität, 20 s Vorlauf: Bei 99 s ist noch nichts.
    ladeSperrstand.mockResolvedValue({ gesperrt: true, grund: 'inaktiv' });
    await warte(99_000);
    expect(screen.getByText('Akte von Max Mustermann')).toBeVisible();

    await warte(2_000);
    expect(screen.getByRole('heading', { name: 'Gesperrt' })).toBeInTheDocument();
    expect(screen.getByText(/30 Minuten ohne Bedienung/)).toBeInTheDocument();
    expect(screen.queryByText('Akte von Max Mustermann')).toBeNull();
    expect(queryClient.getQueryData(['akte'])).toBeUndefined();
  });

  it('sperrt nicht, wenn ein zweiter Tab derselben Sitzung inzwischen bedient hat', async () => {
    ladeSperrstand.mockResolvedValueOnce(offen(60, 3000));
    zeichne();
    await warte();
    ladeSperrstand.mockResolvedValue(offen(25 * 60, 2900));
    await warte(41_000);
    expect(screen.getByText('Akte von Max Mustermann')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Gesperrt' })).toBeNull();
  });

  it('sperrt ohne Netz nach der eigenen Uhr', async () => {
    ladeSperrstand.mockResolvedValueOnce(offen(60, 3000));
    zeichne();
    await warte();
    ladeSperrstand.mockRejectedValue(new Error('offline'));
    await warte(41_000);
    expect(screen.getByRole('heading', { name: 'Gesperrt' })).toBeInTheDocument();
  });

  it('verbirgt den Inhalt bei der Rückkehr nach Ablauf sofort, noch vor der Antwort', async () => {
    ladeSperrstand.mockResolvedValueOnce(offen(60, 3000));
    zeichne();
    await warte();
    // Das Gerät schlief: Die Uhr springt, ohne dass ein Zeitgeber lief.
    vi.setSystemTime(Date.now() + 10 * 60_000);
    ladeSperrstand.mockReturnValue(new Promise(() => undefined));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(screen.getByText('Sitzung wird geprüft …')).toBeInTheDocument();
    expect(screen.getByText('Akte von Max Mustermann')).not.toBeVisible();
    expect(screen.getByTestId('sitzung-inhalt')).toHaveAttribute('inert');
  });

  it('meldet „Mit anderem Konto anmelden“ als Abmeldung', async () => {
    ladeSperrstand.mockResolvedValue({ gesperrt: true, grund: 'inaktiv' });
    zeichne();
    await warte();
    fireEvent.click(screen.getByRole('button', { name: 'Mit anderem Konto anmelden' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});

describe('Sitzungssperre: Bedienung melden (Punkt 2, W2)', () => {
  it('meldet einen Tipp höchstens einmal je Minute, Hintergrund zählt nicht', async () => {
    ladeSperrstand.mockResolvedValue(offen());
    zeichne();
    await warte();
    expect(ladeSperrstand).toHaveBeenCalledTimes(1);

    fireEvent.pointerDown(screen.getByText('Akte von Max Mustermann'));
    await warte();
    expect(ladeSperrstand).toHaveBeenLastCalledWith(true);
    expect(ladeSperrstand).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(screen.getByLabelText('Befund'), { key: 'a' });
    await warte(30_000);
    expect(ladeSperrstand).toHaveBeenCalledTimes(2);

    await warte(31_000);
    fireEvent.keyDown(screen.getByLabelText('Befund'), { key: 'b' });
    await warte();
    expect(ladeSperrstand).toHaveBeenCalledTimes(3);
  });
});

describe('Sitzungssperre: offene Texte (Punkt 4)', () => {
  it('sichert vor der Sperre und gibt die Seite danach frei', async () => {
    const sicherung = vi.fn(() => Promise.resolve(true));
    ladeSperrstand.mockResolvedValueOnce(offen(30, 3000));
    zeichne(sicherung);
    await warte();
    ladeSperrstand.mockResolvedValue({ gesperrt: true, grund: 'inaktiv' });
    await warte(11_000);
    expect(sicherung).toHaveBeenCalledTimes(1);
    expect(screen.queryByLabelText('Befund')).toBeNull();
    expect(screen.getByText(/als Entwurf gesichert/)).toBeInTheDocument();
  });

  it('hält eine Seite mit ungesichertem Text verborgen fest und zeigt sie nach der Freigabe wieder', async () => {
    ladeSperrstand.mockResolvedValueOnce(offen(30, 3000));
    zeichne(() => Promise.resolve(false));
    await warte();
    fireEvent.change(screen.getByLabelText('Befund'), { target: { value: 'Knie frei' } });

    ladeSperrstand.mockResolvedValue({ gesperrt: true, grund: 'inaktiv' });
    await warte(31_000);
    expect(screen.getByRole('heading', { name: 'Gesperrt' })).toBeInTheDocument();
    expect(screen.getByText(/ließ sich nicht sichern/)).toBeInTheDocument();
    expect(screen.getByTestId('sitzung-inhalt')).toHaveAttribute('inert');
    expect(screen.getByText('Akte von Max Mustermann')).not.toBeVisible();

    anmeldenMitPasskey.mockResolvedValue(undefined);
    ladeSperrstand.mockResolvedValue(offen());
    fireEvent.click(screen.getByRole('button', { name: 'Mit Passkey entsperren' }));
    await warte();
    expect(anmeldenMitPasskey).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Befund')).toHaveValue('Knie frei');
    expect(screen.getByLabelText('Befund')).toBeVisible();
  });

  it('wartet nicht ewig auf eine Sicherung', async () => {
    ladeSperrstand.mockResolvedValueOnce(offen(30, 3000));
    zeichne(() => new Promise(() => undefined));
    await warte();
    ladeSperrstand.mockResolvedValue({ gesperrt: true, grund: 'inaktiv' });
    await warte(11_000 + 10_000);
    expect(screen.getByRole('heading', { name: 'Gesperrt' })).toBeInTheDocument();
    expect(screen.getByText(/ließ sich nicht sichern/)).toBeInTheDocument();
  });
});

describe('Sperrseite: entsperren mit Passkey, Rückweg App-PIN (ADR-025 Fassung 2)', () => {
  async function gesperrt(grund: 'inaktiv' | 'hoechstdauer' | 'verbraucht' = 'inaktiv') {
    ladeSperrstand.mockResolvedValue({ gesperrt: true, grund });
    zeichne();
    await warte();
  }

  it('bietet zuerst den Passkey an, die PIN erst auf Nachfrage', async () => {
    await gesperrt();
    expect(screen.getByRole('button', { name: 'Mit Passkey entsperren' })).toHaveFocus();
    expect(screen.queryByLabelText('PIN', { exact: true })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Passkey klappt nicht?' }));
    await warte();
    expect(screen.getByLabelText('PIN', { exact: true })).toHaveFocus();
  });

  it('kehrt nach der Freigabe per Passkey zurück, mit frischem Inhalt', async () => {
    await gesperrt('hoechstdauer');
    anmeldenMitPasskey.mockResolvedValue(undefined);
    ladeSperrstand.mockResolvedValue(offen());
    fireEvent.click(screen.getByRole('button', { name: 'Mit Passkey entsperren' }));
    await warte();
    expect(screen.getByText('Akte von Max Mustermann')).toBeVisible();
    expect(screen.getByText('ohne Daten')).toBeInTheDocument();
  });

  it('sagt einen Fehlschlag des Passkeys und bleibt gesperrt', async () => {
    await gesperrt();
    const { PasskeyFehler, PASSKEY_SAETZE } = await import('../passkey');
    anmeldenMitPasskey.mockRejectedValue(new PasskeyFehler(PASSKEY_SAETZE.abgebrochen, true));
    fireEvent.click(screen.getByRole('button', { name: 'Mit Passkey entsperren' }));
    await warte();
    expect(screen.getByText(PASSKEY_SAETZE.abgebrochen)).toBeInTheDocument();
    expect(screen.queryByText('Akte von Max Mustermann')).toBeNull();
  });

  it('gibt mit der PIN frei', async () => {
    await gesperrt();
    fireEvent.click(screen.getByRole('button', { name: 'Passkey klappt nicht?' }));
    await warte();
    gibMitPinFrei.mockResolvedValue({ art: 'frei' });
    ladeSperrstand.mockResolvedValue(offen());
    fireEvent.change(screen.getByLabelText('PIN', { exact: true }), {
      target: { value: '48 39 20' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mit PIN entsperren' }));
    await warte();
    expect(gibMitPinFrei).toHaveBeenCalledWith('483920');
    expect(screen.getByText('Akte von Max Mustermann')).toBeVisible();
  });

  it('nennt die übrigen Versuche bei einer falschen PIN', async () => {
    await gesperrt();
    fireEvent.click(screen.getByRole('button', { name: 'Passkey klappt nicht?' }));
    await warte();
    expect(screen.getByRole('button', { name: 'Mit PIN entsperren' })).toBeDisabled();
    gibMitPinFrei.mockResolvedValue({ art: 'falsch', versucheUebrig: 3 });
    fireEvent.change(screen.getByLabelText('PIN', { exact: true }), {
      target: { value: '111222' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mit PIN entsperren' }));
    await warte();
    expect(screen.getByText('Die PIN passt nicht. Noch 3 Versuche.')).toBeInTheDocument();
    expect(screen.getByLabelText('PIN', { exact: true })).toHaveValue('');
    expect(screen.queryByText('Akte von Max Mustermann')).toBeNull();
  });

  it('führt nach fünf falschen PINs zur Anmeldung', async () => {
    await gesperrt();
    fireEvent.click(screen.getByRole('button', { name: 'Passkey klappt nicht?' }));
    await warte();
    gibMitPinFrei.mockResolvedValue({ art: 'verbraucht' });
    fireEvent.change(screen.getByLabelText('PIN', { exact: true }), {
      target: { value: '111222' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mit PIN entsperren' }));
    await warte();
    expect(screen.getByText('Zu viele falsche PINs. Die Sitzung ist beendet.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mit Passkey entsperren' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Zur Anmeldung' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('zeigt eine verbrauchte Sitzung schon beim Öffnen als beendet', async () => {
    await gesperrt('verbraucht');
    expect(screen.getByText('Zu viele falsche PINs. Die Sitzung ist beendet.')).toBeInTheDocument();
  });

  it('sagt im Funkloch „keine Verbindung“ statt „PIN passt nicht“ (BEF-047)', async () => {
    await gesperrt();
    fireEvent.click(screen.getByRole('button', { name: 'Passkey klappt nicht?' }));
    await warte();
    gibMitPinFrei.mockRejectedValue(new Error('offline'));
    fireEvent.change(screen.getByLabelText('PIN', { exact: true }), {
      target: { value: '483920' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Mit PIN entsperren' }));
    await warte();
    expect(
      screen.getByText('Keine Verbindung zum Anmeldedienst. Ihre Angaben wurden nicht geprüft.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/PIN passt nicht/)).toBeNull();
  });

  it('bietet ohne PIN keinen Rückweg an', async () => {
    hatPin.mockResolvedValue(false);
    await gesperrt();
    expect(screen.getByRole('button', { name: 'Mit Passkey entsperren' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Passkey klappt nicht?' })).toBeNull();
  });

  it('geht ohne Passkey-fähigen Browser direkt zur PIN', async () => {
    passkeyMoeglich.mockReturnValue(false);
    await gesperrt();
    await warte();
    expect(screen.getByText(/Dieser Browser unterstützt keine Passkeys/)).toBeInTheDocument();
    expect(screen.getByLabelText('PIN', { exact: true })).toBeInTheDocument();
  });
});

describe('Sitzungssperre: Befunde aus dem Zweitreview', () => {
  it('sperrt im Vorlauf, solange der Server noch offen ist, und sichert dabei', async () => {
    const sicherung = vi.fn(() => Promise.resolve(true));
    ladeSperrstand.mockResolvedValueOnce(offen(60, 3000));
    zeichne(sicherung);
    await warte();
    // Die Uhr läuft 20 s vor der Frist ab; der Server meldet ehrlich „noch 19 s“.
    ladeSperrstand.mockResolvedValue(offen(19, 2900));
    await warte(41_000);
    expect(sicherung).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Gesperrt' })).toBeInTheDocument();
    expect(screen.getByText(/als Entwurf gesichert/)).toBeInTheDocument();
    // Kein Dauerfeuer von Abfragen im Vorlauf.
    expect(ladeSperrstand.mock.calls.length).toBeLessThanOrEqual(3);
  });

  it('verbirgt ein offenes Fenster mit der Seite', async () => {
    function MitFenster() {
      useSperrsicherung(() => Promise.resolve(false));
      return (
        <Dialogfenster titel="Foto übernehmen?" onSchliessen={() => undefined}>
          <p>Kamerabild</p>
        </Dialogfenster>
      );
    }
    queryClient = new QueryClient();
    ladeSperrstand.mockResolvedValueOnce(offen(30, 3000));
    render(
      <QueryClientProvider client={queryClient}>
        <Sitzungssperre>
          <MitFenster />
        </Sitzungssperre>
      </QueryClientProvider>,
    );
    await warte();
    const fenster = screen.getByRole('dialog', { name: 'Foto übernehmen?' });
    expect(screen.getByTestId('sitzung-fenster')).toContainElement(fenster);

    ladeSperrstand.mockResolvedValue({ gesperrt: true, grund: 'inaktiv' });
    await warte(11_000);
    expect(screen.getByRole('heading', { name: 'Gesperrt' })).toBeInTheDocument();
    expect(screen.getByText('Kamerabild')).not.toBeVisible();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('wirft beim Festhalten die Abfragen anderer Seiten weg', async () => {
    ladeSperrstand.mockResolvedValueOnce(offen(30, 3000));
    zeichne(() => Promise.resolve(false));
    await warte();
    // Eine Abfrage ohne Beobachter - etwa die einer vorher besuchten Seite.
    queryClient.setQueryData(['andere-akte'], { name: 'Erika Beispiel' });
    ladeSperrstand.mockResolvedValue({ gesperrt: true, grund: 'inaktiv' });
    await warte(11_000);
    expect(screen.getByText(/ließ sich nicht sichern/)).toBeInTheDocument();
    expect(queryClient.getQueryData(['andere-akte'])).toBeUndefined();
  });

  it('verbirgt bei einer verspäteten Uhr nach Ablauf der Serverfrist sofort', async () => {
    ladeSperrstand.mockResolvedValueOnce(offen(60, 3000));
    zeichne();
    await warte();
    ladeSperrstand.mockReturnValue(new Promise(() => undefined));
    // Die Uhr springt über die Frist des Servers hinaus, bevor der Zeitgeber läuft.
    vi.setSystemTime(Date.now() + 5 * 60_000);
    await warte(41_000);
    expect(screen.getByText('Akte von Max Mustermann')).not.toBeVisible();
  });
});
