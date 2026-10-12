import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type * as SperrstandModul from './sperrstand';
import type { Sperrstand } from './sperrstand';
import type * as PasskeyModul from '../passkey';
import type * as OhneNetzModul from '../freigabeOhneNetz';
import type { OhneNetz } from './Sitzungssperre';

/**
 * Die Sperre ohne Verbindung (TRK-009, ADR-025 Punkt 16, ADR-024 Punkt 9):
 * Ohne Antwort des Servers zeigt die Anwendung nichts; liegt etwas auf dem
 * Gerät und ist ein Schlüssel abgelegt, öffnet der Passkey nur die lokale
 * Ansicht - mit eigener Uhr, und mit Verbindung wird wieder geprüft.
 */

const ladeSperrstand = vi.fn<(bedient: boolean) => Promise<Sperrstand>>();
vi.mock('./sperrstand', async (importOriginal) => ({
  ...(await importOriginal<typeof SperrstandModul>()),
  ladeSperrstand: (bedient: boolean) => ladeSperrstand(bedient),
}));

vi.mock('../sessionContext', () => ({
  useSession: () => ({
    session: { user: { id: 'konto-1', email: 'erika@example.test' } },
    initialising: false,
    signOut: () => Promise.resolve(),
  }),
}));

vi.mock('../passkey', async (importOriginal) => ({
  ...(await importOriginal<typeof PasskeyModul>()),
  anmeldenMitPasskey: () => Promise.reject(new Error('ohne Netz')),
  passkeyMoeglich: () => true,
}));
vi.mock('../appPin', () => ({
  PIN_LAENGE: 6,
  hatPin: () => Promise.reject(new Error('ohne Netz')),
  gibMitPinFrei: () => Promise.reject(new Error('ohne Netz')),
}));

const freigabeOhneNetzMoeglich = vi.fn<(besitzer: string) => Promise<boolean>>();
const freigebenOhneNetz = vi.fn<(besitzer: string) => Promise<void>>();
vi.mock('../freigabeOhneNetz', async (importOriginal) => ({
  ...(await importOriginal<typeof OhneNetzModul>()),
  freigabeOhneNetzMoeglich: (b: string) => freigabeOhneNetzMoeglich(b),
  freigebenOhneNetz: (b: string) => freigebenOhneNetz(b),
}));

vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({}) }));

const { Sitzungssperre } = await import('./Sitzungssperre');
const { PasskeyFehler, PASSKEY_SAETZE } = await import('../passkey');

const hatAblage = vi.fn<() => Promise<boolean>>();
const OHNE_NETZ: OhneNetz = {
  hatAblage: () => hatAblage(),
  ansicht: (sperren) => (
    <div>
      <p>Lokale Übungen</p>
      <button type="button" onClick={sperren}>
        Sperren
      </button>
    </div>
  ),
};

function zeichne() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Sitzungssperre ohneNetz={OHNE_NETZ}>
        <p>Akte von Erika Muster</p>
      </Sitzungssperre>
    </QueryClientProvider>,
  );
}

async function warte(ms = 0) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

beforeEach(() => {
  vi.useFakeTimers({
    toFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'Date'],
  });
  vi.setSystemTime(new Date('2026-10-12T09:00:00Z'));
  ladeSperrstand
    .mockReset()
    .mockRejectedValue(new Error('Die Sitzung konnte nicht geprüft werden.'));
  freigabeOhneNetzMoeglich.mockReset().mockResolvedValue(true);
  freigebenOhneNetz
    .mockReset()
    .mockRejectedValue(new PasskeyFehler(PASSKEY_SAETZE.abgebrochen, true));
  hatAblage.mockReset().mockResolvedValue(true);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Sperre ohne Verbindung (TRK-009)', () => {
  it('startet ohne Antwort gesperrt und bietet den Passkey an - nie den Inhalt, nie die PIN', async () => {
    zeichne();
    await warte();
    expect(screen.getByRole('heading', { name: 'Gesperrt – ohne Verbindung' })).toBeInTheDocument();
    expect(screen.queryByText('Akte von Erika Muster')).toBeNull();
    expect(screen.queryByLabelText('PIN')).toBeNull();
    // Das Fenster öffnete sich von selbst (ADR-025 Punkt 11 Fassung 3).
    expect(freigebenOhneNetz).toHaveBeenCalledWith('konto-1');
    // Abgebrochen: kein Fehler.
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('öffnet mit dem Passkey nur die lokale Ansicht', async () => {
    freigebenOhneNetz.mockResolvedValue(undefined);
    zeichne();
    await warte();
    expect(screen.getByText('Lokale Übungen')).toBeInTheDocument();
    expect(screen.queryByText('Akte von Erika Muster')).toBeNull();
  });

  it('sagt, wenn der Passkey nicht angenommen wurde', async () => {
    zeichne();
    await warte();
    freigebenOhneNetz.mockRejectedValue(
      new PasskeyFehler('Der Passkey wurde nicht angenommen. Bitte erneut versuchen.'),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Mit Passkey öffnen' }));
    await warte();
    expect(screen.getByText(/nicht angenommen/)).toBeInTheDocument();
    expect(screen.queryByText('Lokale Übungen')).toBeNull();
  });

  it('ohne Schlüssel oder ohne Ablage: kein Angebot, nur der Fehler wie bisher', async () => {
    freigabeOhneNetzMoeglich.mockResolvedValue(false);
    zeichne();
    await warte();
    expect(screen.getByText('Die Sitzung konnte nicht geprüft werden.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mit Passkey öffnen' })).toBeNull();
  });

  it('ohne Ablage: kein Angebot', async () => {
    hatAblage.mockResolvedValue(false);
    zeichne();
    await warte();
    expect(screen.queryByRole('button', { name: 'Mit Passkey öffnen' })).toBeNull();
  });

  it('die lokale Ansicht sperrt nach 30 Minuten ohne Bedienung und nach 60 Minuten', async () => {
    freigebenOhneNetz.mockResolvedValueOnce(undefined);
    zeichne();
    await warte();
    expect(screen.getByText('Lokale Übungen')).toBeInTheDocument();
    await warte(29 * 60_000);
    expect(screen.getByText('Lokale Übungen')).toBeInTheDocument();
    await warte(60_000);
    expect(screen.queryByText('Lokale Übungen')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Gesperrt – ohne Verbindung' })).toBeInTheDocument();

    // Mit Bedienung hält sie bis zur Höchstdauer.
    freigebenOhneNetz.mockResolvedValueOnce(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Mit Passkey öffnen' }));
    await warte();
    for (let minute = 0; minute < 59; minute += 10) {
      fireEvent.pointerDown(screen.getByText('Lokale Übungen'));
      await warte(10 * 60_000);
    }
    expect(screen.queryByText('Lokale Übungen')).toBeNull();
  });

  it('„Sperren" schließt die lokale Ansicht', async () => {
    freigebenOhneNetz.mockResolvedValueOnce(undefined);
    zeichne();
    await warte();
    fireEvent.click(screen.getByRole('button', { name: 'Sperren' }));
    await warte();
    expect(screen.queryByText('Lokale Übungen')).toBeNull();
  });

  it('mit Verbindung wird wieder geprüft; erst der Server öffnet den Inhalt (Punkt 16)', async () => {
    freigebenOhneNetz.mockResolvedValue(undefined);
    zeichne();
    await warte();
    expect(screen.getByText('Lokale Übungen')).toBeInTheDocument();
    ladeSperrstand.mockResolvedValue({ gesperrt: true, grund: 'hoechstdauer' });
    await act(async () => {
      window.dispatchEvent(new Event('online'));
      await vi.advanceTimersByTimeAsync(11_000);
    });
    expect(screen.queryByText('Lokale Übungen')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Gesperrt' })).toBeInTheDocument();
    expect(screen.queryByText('Akte von Erika Muster')).toBeNull();

    // Ist die Sitzung beim Server noch offen, geht es mit dem Inhalt weiter.
    ladeSperrstand.mockResolvedValue({
      gesperrt: false,
      sekundenBisInaktiv: 1800,
      sekundenBisHoechstdauer: 3600,
    });
    fireEvent.focus(window);
    await warte();
    expect(screen.getByText('Akte von Erika Muster')).toBeVisible();
  });

  it('gesperrt mit Verbindung, dann ohne: bietet die Freigabe ohne Netz an', async () => {
    ladeSperrstand.mockResolvedValue({ gesperrt: true, grund: 'inaktiv' });
    zeichne();
    await warte(11_000);
    expect(screen.getByRole('heading', { name: 'Gesperrt' })).toBeInTheDocument();
    await act(async () => {
      window.dispatchEvent(new Event('offline'));
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(screen.getByRole('heading', { name: 'Gesperrt – ohne Verbindung' })).toBeInTheDocument();
  });
});
