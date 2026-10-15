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
 *   * `/zugang` bleibt sichtbar, **auch wenn inzwischen eine Sitzung
 *     besteht**. Genau das entsteht mitten im Ablauf: Der eingelöste Link
 *     erzeugt eine Sitzung, bevor die Seite fertig ist. Ohne diese Ausnahme
 *     übernähme die angemeldete Anwendung und leitete auf „/" um.
 *   * `/kennwort-neu` gibt es seit SEC-EPIC-002 nicht mehr (ADR-025 Punkt 9):
 *     ohne Sitzung die Anmeldemaske wie jede unbekannte Adresse.
 */

let sitzung: { user: { id: string; email?: string } } | null = null;
let pruefend = false;

vi.mock('@/features/auth/SessionProvider', () => ({
  SessionProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/features/auth/sessionContext', () => ({
  useSession: () => ({ session: sitzung, initialising: pruefend, signOut: vi.fn() }),
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
  pruefend = false;
  // Haengt bewusst: Geprueft wird, WELCHE Seite das Gate zeigt, nicht wohin
  // sie danach springt.
  verifyOtp.mockReset().mockReturnValue(new Promise(() => {}));
});

describe('Gate waehrend der Pruefung der Sitzung', () => {
  it('zeigt den Ladezustand mit Marke im Hauptbereich (AUTH-13)', () => {
    // Bis UXR-002 stand hier ein nackter Satz ohne Hauptbereich und Absender.
    pruefend = true;
    oeffne('/');

    const hauptbereich = screen.getByRole('main');
    expect(hauptbereich).toContainElement(screen.getByRole('img', { name: 'Own Motion' }));
    expect(hauptbereich).toContainElement(screen.getByText('Sitzung wird geprüft …'));
  });
});

afterEach(() => {
  window.history.pushState({}, '', '/');
});

describe('Gate ohne Sitzung', () => {
  it('führt die Wurzel auf die Anmeldemaske', () => {
    oeffne('/');

    expect(screen.getByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
  });

  it('zeigt das Startbild schon beim Öffnen, über der Anmeldemaske (ANN-243 Fassung 2)', () => {
    oeffne('/');

    const intro = document.querySelector('[data-startbild]');
    expect(intro).not.toBeNull();
    expect(intro).toHaveAttribute('aria-hidden', 'true');
    // Die Maske steht darunter schon bereit, das Intro hält nichts an.
    expect(screen.getByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
    // Landeplatz: die Wortmarke der Vollseite.
    expect(document.querySelector('[data-startbild-ziel="vollseite"] img')).not.toBeNull();
  });

  it('zeigt das Startbild nur einmal je Tab', () => {
    window.sessionStorage.setItem('startbild-gezeigt', '1');
    oeffne('/');

    expect(document.querySelector('[data-startbild]')).toBeNull();
  });

  it('führt auch eine Seite mit Patientendaten auf die Anmeldemaske, ohne sie zu erwähnen', () => {
    oeffne('/patienten');

    expect(screen.getByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
    expect(screen.queryByText('Patient:innen')).not.toBeInTheDocument();
  });

  it('kennt keine Seite zum Setzen eines Kennworts mehr (ADR-025 Punkt 9)', async () => {
    oeffne('/kennwort-neu?token_hash=abc&type=recovery');

    expect(await screen.findByRole('heading', { name: 'Anmelden' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Neues Kennwort setzen' })).toBeNull();
    expect(verifyOtp).not.toHaveBeenCalled();
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
  /**
   * Der Befund aus dem Review, und der Grund, warum die Liste der
   * Einlösepfade bei den Seiten steht und nicht hier: `/zugang` war in der
   * Gate-Bedingung vergessen. Mit bestehender Sitzung wurde der Link deshalb
   * nie eingelöst — die Auffangroute der angemeldeten Anwendung leitete
   * stumm auf den Tagesplan der bereits angemeldeten Person.
   */
  it('hält auch die Seite der Zugangsmail offen, wenn schon jemand angemeldet ist', async () => {
    sitzung = {
      user: { id: '00000000-0000-0000-0000-000000000001', email: 'anna.beispiel@praxis.invalid' },
    };
    oeffne('/zugang?token_hash=abc&type=magiclink');

    // Seit UXR-002 nennt der Hinweis das angemeldete Konto (AUTH-04).
    expect(
      await screen.findByText(/Auf diesem Gerät ist anna\.beispiel@praxis\.invalid angemeldet/),
    ).toBeInTheDocument();
  });
});
