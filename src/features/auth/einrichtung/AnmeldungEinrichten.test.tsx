import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import type * as PasskeyModul from '../passkey';

/**
 * Anmeldung einrichten als geführter Ablauf (Handoff 2026-10-22, Abschnitt
 * 5.2): Passkey, dann PIN, je eine Seite mit dem Hauptknopf im Fuß; ohne
 * Passkey-Browser eine Auskunft, ein ✕ fragt nach (ANN-686).
 */
const passkeyEinrichten = vi.fn<() => Promise<void>>();
const passkeyMoeglich = vi.fn(() => true);
vi.mock('../passkey', async (importOriginal) => {
  const echt = await importOriginal<typeof PasskeyModul>();
  return {
    ...echt,
    passkeyEinrichten: () => passkeyEinrichten(),
    passkeyMoeglich: () => passkeyMoeglich(),
  };
});

const { AnmeldungEinrichten } = await import('./AnmeldungEinrichten');
const { PASSKEY_SAETZE, PasskeyFehler } = await import('../passkey');

beforeEach(() => {
  passkeyEinrichten.mockReset().mockResolvedValue(undefined);
  passkeyMoeglich.mockReset().mockReturnValue(true);
});

describe('AnmeldungEinrichten', () => {
  it('zählt ohne Einladung zwei Schritte und spricht von Gesicht oder Finger', async () => {
    render(
      <AnmeldungEinrichten
        stand={{ passkeys: 0, pin: false }}
        onFertig={vi.fn()}
        onAbmelden={vi.fn()}
      />,
    );
    expect(
      await screen.findByRole('heading', { name: 'Mit Gesicht oder Finger anmelden' }),
    ).toBeVisible();
    expect(screen.getByText('Schritt 1 von 2')).toBeInTheDocument();
    expect(screen.getByText(/Own Motion bekommt sie nie/)).toBeInTheDocument();
    expect(screen.getByText('Was passiert dabei genau?')).toBeInTheDocument();
    // DR-103: keine Abschnitte „1. PASSKEY“, kein Kennwort, kein Konto.
    expect(document.body.textContent).not.toMatch(/1\. Passkey|Konto|Sitzung/i);
    expect(document.title).toBe('Anmelden – Own Motion');
  });

  it('sagt „Nicht bestätigt“ und bietet „Erneut versuchen“ an', async () => {
    passkeyEinrichten.mockRejectedValue(new PasskeyFehler(PASSKEY_SAETZE.abgebrochen, true));
    const nutzer = userEvent.setup();
    render(
      <AnmeldungEinrichten
        ausEinladung
        stand={{ passkeys: 0, pin: false }}
        onFertig={vi.fn()}
        onAbmelden={vi.fn()}
      />,
    );
    await nutzer.click(await screen.findByRole('button', { name: 'Jetzt einrichten' }));
    expect(await screen.findByText(/Ihr Telefon fragt dann erneut/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
    expect(document.title).toBe('Einladung – Own Motion');
  });

  it('meldet beim ✕ nicht sofort ab, sondern fragt nach (ANN-686)', async () => {
    const onAbmelden = vi.fn();
    const nutzer = userEvent.setup();
    render(
      <AnmeldungEinrichten
        ausEinladung
        stand={{ passkeys: 0, pin: false }}
        onFertig={vi.fn()}
        onAbmelden={onAbmelden}
      />,
    );
    await nutzer.click(await screen.findByRole('button', { name: 'Einrichtung abbrechen' }));
    expect(onAbmelden).not.toHaveBeenCalled();
    expect(screen.getByText(/nur mit einer neuen Einladung der Praxis hinein/)).toBeVisible();
    await nutzer.click(screen.getByRole('button', { name: 'Weiter einrichten' }));
    expect(screen.queryByText(/nur mit einer neuen Einladung/)).toBeNull();
    await nutzer.click(screen.getByRole('button', { name: 'Einrichtung abbrechen' }));
    await nutzer.click(screen.getByRole('button', { name: 'Abbrechen und abmelden' }));
    expect(onAbmelden).toHaveBeenCalledTimes(1);
  });

  it('beginnt mit der PIN, wenn der Passkey schon da ist - Schritt 3 von 3', async () => {
    const onFertig = vi.fn();
    render(
      <AnmeldungEinrichten
        ausEinladung
        stand={{ passkeys: 1, pin: false }}
        onFertig={onFertig}
        onAbmelden={vi.fn()}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Eine PIN festlegen' })).toBeVisible();
    expect(screen.getByText('Schritt 3 von 3')).toBeInTheDocument();
    expect(screen.getByText('Nicht die PIN Ihrer Bankkarte.')).toBeInTheDocument();
    expect(screen.getByLabelText('PIN noch einmal')).toBeInTheDocument();
    // Der Knopf im Fuß sendet das Formular der PIN.
    expect(screen.getByRole('button', { name: 'PIN speichern' })).toHaveAttribute(
      'form',
      'einrichtung-pin',
    );
  });

  it('sagt ohne Passkey-Browser, was zu tun ist, und bietet nur „Abmelden“', async () => {
    passkeyMoeglich.mockReturnValue(false);
    const onAbmelden = vi.fn();
    const { container } = render(
      <AnmeldungEinrichten
        ausEinladung
        stand={{ passkeys: 0, pin: false }}
        onFertig={vi.fn()}
        onAbmelden={onAbmelden}
      />,
    );
    expect(
      screen.getByRole('heading', { name: 'Hier lässt sich kein Passkey anlegen' }),
    ).toBeVisible();
    expect(screen.getByText(/Bitten Sie die Praxis um eine neue Einladung/)).toBeVisible();
    await userEvent.setup().click(screen.getByRole('button', { name: 'Abmelden' }));
    expect(onAbmelden).toHaveBeenCalledTimes(1);
    await pruefeBarrierefreiheit(container);
  });

  it('zeichnet das Fenster mit der Schrift der Plattform (ANN-584)', async () => {
    render(
      <AnmeldungEinrichten
        stand={{ passkeys: 0, pin: false }}
        onFertig={vi.fn()}
        onAbmelden={vi.fn()}
      />,
    );
    const titel = await screen.findByRole('heading', { name: 'Mit Gesicht oder Finger anmelden' });
    await waitFor(() => expect(titel.closest('.plattform-schrift')).not.toBeNull());
  });
});
