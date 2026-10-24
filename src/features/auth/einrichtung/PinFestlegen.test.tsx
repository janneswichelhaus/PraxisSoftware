import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PasskeyModul from '../passkey';
import type * as PinModul from '../appPin';

/**
 * PIN festlegen mit Bestätigung durch den Passkey (ANN-325). Liefert der
 * Passkey ein anderes Konto, ist das ein Kontowechsel und keine Bestätigung
 * (ADR-025 Punkt 7): keine PIN für das andere Konto (Zweitreview, Befund 5).
 */

const getSession = vi.fn();
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ auth: { getSession } }) }));

const anmeldenMitPasskey = vi.fn<() => Promise<void>>();
vi.mock('../passkey', async (importOriginal) => ({
  ...(await importOriginal<typeof PasskeyModul>()),
  anmeldenMitPasskey: () => anmeldenMitPasskey(),
}));

const setzePin = vi.fn<(pin: string) => Promise<void>>();
vi.mock('../appPin', async (importOriginal) => ({
  ...(await importOriginal<typeof PinModul>()),
  setzePin: (pin: string) => setzePin(pin),
}));

const { PinFestlegen } = await import('./PinFestlegen');
const { ErneutAnmeldenError } = await import('../appPin');

function sitzungVon(id: string) {
  return { data: { session: { user: { id } } } };
}

async function bisZurBestaetigung() {
  const nutzer = userEvent.setup();
  const onGesetzt = vi.fn();
  render(<PinFestlegen onGesetzt={onGesetzt} />);
  await nutzer.type(screen.getByLabelText(/^Neue PIN/), '483920');
  await nutzer.type(screen.getByLabelText('PIN wiederholen'), '483920');
  await nutzer.click(screen.getByRole('button', { name: 'PIN festlegen' }));
  await nutzer.click(await screen.findByRole('button', { name: 'Mit Passkey bestätigen' }));
  return onGesetzt;
}

beforeEach(() => {
  getSession.mockReset();
  anmeldenMitPasskey.mockReset().mockResolvedValue(undefined);
  setzePin.mockReset().mockRejectedValueOnce(new ErneutAnmeldenError());
});

describe('PinFestlegen', () => {
  it('setzt die PIN nach der Bestätigung mit dem eigenen Passkey', async () => {
    getSession.mockResolvedValue(sitzungVon('konto-1'));
    setzePin.mockResolvedValueOnce(undefined);
    const onGesetzt = await bisZurBestaetigung();
    await waitFor(() => expect(onGesetzt).toHaveBeenCalledTimes(1));
    expect(setzePin).toHaveBeenLastCalledWith('483920');
  });

  it('setzt keine PIN, wenn der Passkey ein anderes Konto anmeldet', async () => {
    getSession
      .mockResolvedValueOnce(sitzungVon('konto-1'))
      .mockResolvedValueOnce(sitzungVon('konto-2'));
    const onGesetzt = await bisZurBestaetigung();
    expect(await screen.findByText(/gehört zu einem anderen Zugang/)).toBeInTheDocument();
    expect(setzePin).toHaveBeenCalledTimes(1);
    expect(onGesetzt).not.toHaveBeenCalled();
  });

  it('bietet Passwortmanagern die PIN nicht zum Speichern an', () => {
    render(<PinFestlegen onGesetzt={vi.fn()} />);
    expect(screen.getByLabelText(/^Neue PIN/)).toHaveAttribute('autocomplete', 'off');
    expect(screen.getByLabelText('PIN wiederholen')).toHaveAttribute('autocomplete', 'off');
  });

  it('bietet die PIN auch in der Einrichtung keinem Passwortmanager an (ADR-025 Punkt 11, ANN-689)', () => {
    render(<PinFestlegen onGesetzt={vi.fn()} formular="einrichtung-pin" />);
    expect(screen.getByLabelText(/^PIN/, { selector: '#pin-neu' })).toHaveAttribute(
      'autocomplete',
      'off',
    );
    expect(screen.getByLabelText('PIN noch einmal')).toHaveAttribute('autocomplete', 'off');
    // Der Knopf steht im Fuß des Ablaufs, nicht im Formular.
    expect(screen.queryByRole('button', { name: /PIN festlegen/ })).toBeNull();
  });
});
