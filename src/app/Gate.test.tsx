import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { render, screen } from '@testing-library/react';

/**
 * Welche Welt bekommt jemand zu sehen — und an welcher Adresse (FIX-001).
 *
 * Vor diesem Loop war die Antwort binär: Sitzung oder Anmeldemaske. Eine
 * öffentliche Seite konnte es deshalb nicht geben, und die Mails zeigten ins
 * Leere. Die beiden Zusicherungen, die hier zusammenkommen:
 *
 *   * Ohne Sitzung führt **jede** Adresse auf die Anmeldemaske — auch
 *     `/patienten`. Das hält `tests/e2e/login.spec.ts` ebenfalls fest; hier
 *     steht es zusätzlich als Komponententest, weil E2E hinter der Anmeldung
 *     in der Cloudumgebung nicht läuft.
 *   * `/kennwort-neu` bleibt sichtbar, **auch wenn inzwischen eine Sitzung
 *     besteht**. Genau das entsteht mitten im Ablauf: Der eingelöste Link
 *     erzeugt eine Sitzung, bevor das Kennwort gesetzt ist. Ohne diese
 *     Ausnahme übernähme die angemeldete Anwendung und leitete auf „/" um.
 */

let sitzung: { user: { id: string } } | null = null;

vi.mock('@/features/auth/SessionProvider', () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/features/auth/sessionContext', () => ({
  useSession: () => ({ session: sitzung, initialising: false, signOut: vi.fn() }),
}));

const verifyOtp = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc: vi.fn().mockResolvedValue({ error: null }),
    auth: {
      verifyOtp,
      updateUser: vi.fn().mockResolvedValue({ error: null }),
      signInWithPassword: vi.fn(),
      resetPasswordForEmail: vi.fn(),
    },
  }),
}));

const { App } = await import('./App');

function oeffne(pfad: string) {
  window.history.pushState({}, '', pfad);
  render(<App />);
}

beforeEach(() => {
  sitzung = null;
  // Haengt bewusst: Geprueft wird, WELCHE Seite das Gate zeigt, nicht wohin
  // sie danach springt.
  verifyOtp.mockReset().mockReturnValue(new Promise(() => {}));
});

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('Gate ohne Sitzung', () => {
  it('führt die Wurzel auf die Anmeldemaske', () => {
    oeffne('/');

    expect(screen.getByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
  });

  it('führt auch eine Seite mit Patientendaten auf die Anmeldemaske, ohne sie zu erwähnen', () => {
    oeffne('/patienten');

    expect(screen.getByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
    expect(screen.queryByText('Patient:innen')).not.toBeInTheDocument();
  });

  it('öffnet die Seite zum Setzen eines neuen Kennworts', async () => {
    oeffne('/kennwort-neu?token_hash=abc&type=recovery');

    expect(
      await screen.findByRole('heading', { name: 'Neues Kennwort setzen' }),
    ).toBeInTheDocument();
  });
});

describe('Gate ohne Sitzung, Fortsetzung', () => {
  it('öffnet die Seite der Zugangsmail und nicht die Anmeldemaske', async () => {
    oeffne('/zugang?token_hash=abc&type=magiclink');

    expect(await screen.findByText('Der Link wird geprüft …')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Anmelden' })).not.toBeInTheDocument();
  });
});

describe('Gate mit Sitzung', () => {
  it('hält die Wiederherstellungsseite offen, obwohl der eingelöste Link schon eine Sitzung erzeugt hat', async () => {
    sitzung = { user: { id: '00000000-0000-0000-0000-000000000001' } };
    oeffne('/kennwort-neu?token_hash=abc&type=recovery');

    // Ohne die Pfadbedingung in Gate stünde hier die angemeldete Anwendung,
    // deren Auffangroute /kennwort-neu auf "/" umleitet.
    expect(
      await screen.findByRole('heading', { name: 'Neues Kennwort setzen' }),
    ).toBeInTheDocument();
  });

  /**
   * Der Befund aus dem Review, und der Grund, warum die Liste der
   * Einlösepfade bei den Seiten steht und nicht hier: `/zugang` war in der
   * Gate-Bedingung vergessen. Mit bestehender Sitzung wurde der Link deshalb
   * nie eingelöst — die Auffangroute der angemeldeten Anwendung leitete
   * stumm auf den Tagesplan der bereits angemeldeten Person.
   */
  it('hält auch die Seite der Zugangsmail offen, wenn schon jemand angemeldet ist', async () => {
    sitzung = { user: { id: '00000000-0000-0000-0000-000000000001' } };
    oeffne('/zugang?token_hash=abc&type=magiclink');

    expect(
      await screen.findByText(/Auf diesem Gerät ist bereits jemand angemeldet/),
    ).toBeInTheDocument();
  });
});
