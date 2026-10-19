import { afterEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { useAbmeldeanfrage } from '@/app/abmeldeschutz';
import { AbmeldeschutzProvider } from '@/app/AbmeldeschutzProvider';
import type * as TeamchatApi from './api';

/**
 * Kein stilles Verwerfen ungesendeter Nachrichten beim Abmelden (TEAM-002,
 * Praxis-Sichtung): Der Ausgang liegt nur im Arbeitsspeicher und fiel bis
 * dahin mit der Abmeldung ohne Wort. Ebenso Anhänge, die noch nicht oben
 * sind (TEAM-003, Praxis-Review).
 */

const senden = vi.fn();
const hochladen = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof TeamchatApi>()),
  sendeNachricht: (...a: unknown[]): unknown => senden(...a),
  ladeAnhangHoch: (...a: unknown[]): unknown => hochladen(...a),
  verwirfAnhang: () => Promise.resolve(),
}));

const { TeamchatFehler } = await import('./api');
const { ausgangLeeren, einreihen, offeneImAusgang } = await import('./ausgang');
const { anhaengeLeeren, anhaengen } = await import('./entwurfsanhaenge');
const { AusgangAbmeldewache } = await import('./AusgangAbmeldewache');

function Kopfzeile() {
  const anfragen = useAbmeldeanfrage();
  return (
    <button type="button" onClick={() => anfragen?.()}>
      Abmelden
    </button>
  );
}

function zeigen(onAbmelden: () => void) {
  renderWithProviders(
    <AbmeldeschutzProvider onAbmelden={onAbmelden}>
      <AusgangAbmeldewache kontoId="anna" />
      <Kopfzeile />
    </AbmeldeschutzProvider>,
  );
}

async function ohneNetzGesendet() {
  senden.mockRejectedValue(new TeamchatFehler('Kein Netz', true));
  einreihen('anna', null, {
    id: crypto.randomUUID(),
    kanalId: 'k-allgemein',
    threadId: null,
    text: 'Bin 10 Minuten später',
    erwaehnt: [],
    anhaenge: [],
    alle: false,
    auchImKanal: false,
    um: null,
  });
  await vi.waitFor(() => expect(senden).toHaveBeenCalled());
}

describe('AusgangAbmeldewache', () => {
  afterEach(() => {
    ausgangLeeren();
    anhaengeLeeren();
    senden.mockReset();
    hochladen.mockReset();
  });

  it('meldet ohne Wartendes sofort ab', async () => {
    const abmelden = vi.fn();
    zeigen(abmelden);
    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(abmelden).toHaveBeenCalledTimes(1);
  });

  it('fragt bei einer wartenden Nachricht und behält sie bei „Angemeldet bleiben“', async () => {
    await ohneNetzGesendet();
    const abmelden = vi.fn();
    zeigen(abmelden);
    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(screen.getByRole('dialog', { name: 'Noch nicht gesendet' })).toBeInTheDocument();
    expect(
      screen.getByText(/1 Nachricht im Teamchat ist noch nicht beim Server/),
    ).toBeInTheDocument();
    // Beim Fragen versucht der Ausgang es gleich noch einmal.
    await vi.waitFor(() => expect(senden).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole('button', { name: 'Angemeldet bleiben' }));
    expect(abmelden).not.toHaveBeenCalled();
    expect(offeneImAusgang('anna')).toBe(1);
  });

  it('fragt auch bei einem Anhang, der nur im Speicher liegt - und warnt vor dem Verlassen (ADR-017 Punkt 33)', async () => {
    hochladen.mockRejectedValue(
      new TeamchatFehler('Nicht hochgeladen – kein Netz? Bitte noch einmal.', true),
    );
    anhaengen('anna', 'k-allgemein', null, [
      { datei: new Blob(['x'], { type: 'image/jpeg' }), name: 'Foto Rad.jpg' },
    ]);
    await vi.waitFor(() => expect(hochladen).toHaveBeenCalledTimes(1));
    const abmelden = vi.fn();
    zeigen(abmelden);

    const verlassen = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(verlassen);
    expect(verlassen.defaultPrevented).toBe(true);

    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(
      screen.getByText(
        '1 Anhang im Teamchat ist noch nicht hochgeladen. Beim Abmelden geht er verloren.',
      ),
    ).toBeInTheDocument();
    // Beim Fragen versucht es auch der Anhang gleich noch einmal.
    await vi.waitFor(() => expect(hochladen).toHaveBeenCalledTimes(2));
    await userEvent.click(screen.getByRole('button', { name: 'Angemeldet bleiben' }));
    expect(abmelden).not.toHaveBeenCalled();
  });

  it('meldet erst nach ausdrücklichem Verwerfen ab', async () => {
    await ohneNetzGesendet();
    const abmelden = vi.fn();
    zeigen(abmelden);
    await userEvent.click(screen.getByRole('button', { name: 'Abmelden' }));
    await userEvent.click(screen.getByRole('button', { name: 'Verwerfen und abmelden' }));
    expect(abmelden).toHaveBeenCalledTimes(1);
  });
});
