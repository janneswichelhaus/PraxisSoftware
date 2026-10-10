import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import type * as PasskeyModul from '../passkey';
import type * as PinModul from '../appPin';

/**
 * In Produktion niemand ohne Passkey und PIN (SEC-006, ADR-025 Fassung 2,
 * Punkte 9 und 13). Außerhalb der Produktion ist die Einrichtung freiwillig
 * (Punkt 15, ANN-327).
 */

const ladePasskeys = vi.fn<() => Promise<PasskeyModul.Passkey[]>>();
const passkeyEinrichten = vi.fn<() => Promise<void>>();
vi.mock('../passkey', async (importOriginal) => ({
  ...(await importOriginal<typeof PasskeyModul>()),
  ladePasskeys: () => ladePasskeys(),
  passkeyEinrichten: () => passkeyEinrichten(),
  passkeyMoeglich: () => true,
}));

const hatPin = vi.fn<() => Promise<boolean>>();
const setzePin = vi.fn<(pin: string) => Promise<void>>();
vi.mock('../appPin', async (importOriginal) => ({
  ...(await importOriginal<typeof PinModul>()),
  hatPin: () => hatPin(),
  setzePin: (pin: string) => setzePin(pin),
}));

const signOut = vi.fn(() => Promise.resolve());
vi.mock('../sessionContext', () => ({
  useSession: () => ({ session: { user: { id: 'k1' } }, initialising: false, signOut }),
}));

const { Einrichtungspflicht } = await import('./Einrichtungspflicht');

const PASSKEY: PasskeyModul.Passkey = {
  id: 'p1',
  name: null,
  angelegtAm: '2026-10-10T08:00:00Z',
  zuletztAm: null,
};

function zeichne(pflicht: boolean) {
  return renderWithProviders(
    <Einrichtungspflicht pflicht={pflicht}>
      <p>Tagesplan</p>
    </Einrichtungspflicht>,
  );
}

beforeEach(() => {
  ladePasskeys.mockReset().mockResolvedValue([PASSKEY]);
  passkeyEinrichten.mockReset().mockResolvedValue(undefined);
  hatPin.mockReset().mockResolvedValue(true);
  setzePin.mockReset().mockResolvedValue(undefined);
  signOut.mockClear();
});

describe('Einrichtungspflicht', () => {
  it('lässt ein eingerichtetes Konto durch', async () => {
    zeichne(true);
    expect(await screen.findByText('Tagesplan')).toBeInTheDocument();
  });

  it('fragt außerhalb der Produktion gar nicht erst', () => {
    ladePasskeys.mockResolvedValue([]);
    zeichne(false);
    expect(screen.getByText('Tagesplan')).toBeInTheDocument();
    expect(ladePasskeys).not.toHaveBeenCalled();
  });

  it('zeigt ohne Passkey die Einrichtung statt der Anwendung', async () => {
    ladePasskeys.mockResolvedValue([]);
    hatPin.mockResolvedValue(false);
    zeichne(true);
    expect(
      await screen.findByRole('heading', { name: 'Anmeldung einrichten' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Tagesplan')).toBeNull();
    // Erst der Passkey, die PIN danach.
    expect(screen.queryByLabelText(/^Neue PIN/)).toBeNull();
    // In Produktion gibt es kein „Später“.
    expect(screen.queryByRole('button', { name: /Später/ })).toBeNull();
  });

  it('führt durch Passkey und PIN und öffnet dann die Anwendung', async () => {
    ladePasskeys.mockResolvedValueOnce([]);
    hatPin.mockResolvedValueOnce(false);
    const user = userEvent.setup();
    zeichne(true);
    await user.click(
      await screen.findByRole('button', { name: 'Passkey auf diesem Gerät einrichten' }),
    );
    expect(passkeyEinrichten).toHaveBeenCalledTimes(1);
    expect(
      await screen.findByText('Auf diesem Konto ist ein Passkey eingerichtet.'),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/^Neue PIN/), '483920');
    await user.type(screen.getByLabelText('PIN wiederholen'), '483920');
    await user.click(screen.getByRole('button', { name: 'PIN festlegen und fertig' }));
    await waitFor(() => expect(setzePin).toHaveBeenCalledWith('483920'));
    expect(await screen.findByText('Tagesplan')).toBeInTheDocument();
  });

  it('verlangt die PIN auch, wenn nur sie fehlt', async () => {
    hatPin.mockResolvedValue(false);
    zeichne(true);
    expect(
      await screen.findByText('Auf diesem Konto ist ein Passkey eingerichtet.'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Neue PIN/)).toBeInTheDocument();
  });

  it('lässt ohne Antwort niemanden durch und bietet Abmelden an', async () => {
    ladePasskeys.mockRejectedValue(new Error('offline'));
    const user = userEvent.setup();
    zeichne(true);
    expect(
      await screen.findByText('Die Anmeldung dieses Kontos konnte nicht geprüft werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Tagesplan')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
