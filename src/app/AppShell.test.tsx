import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import { AppShell } from './AppShell';
import { renderWithProviders, testUser } from '@/test-utils';

describe('AppShell', () => {
  it('bietet Praxisrollen den Weg in die Patientenkartei an', () => {
    renderWithProviders(
      <AppShell user={testUser(['therapist'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
    );
    expect(screen.getAllByRole('link', { name: 'Patient:innen' }).length).toBeGreaterThan(0);
  });

  it('fuehrt die Marke in der Kopfzeile, nicht den Organisationsnamen', () => {
    // ADR-003: Mandantenfaehigkeit ist keine Produktfunktion - es gibt eine
    // Praxis, und die heisst Own Motion. Der Name aus den Stammdaten
    // ("Test Praxis Tuebingen" im Seed) waere daneben eine zweite Antwort auf
    // dieselbe Frage. Umkehrbar nach ANN-023.
    renderWithProviders(
      <AppShell user={testUser(['therapist'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
    );
    // Seit DS-001 liegen zwei Fassungen im DOM: die farbige in der Kopfzeile
    // fuers Telefon, die Papier-Fassung in der tiefgruenen Seitenleiste. Je
    // nach Breite blendet CSS eine aus; jsdom kennt kein CSS und sieht beide.
    const marken = screen.getAllByRole('img', { name: 'Own Motion' });
    expect(marken.length).toBe(2);
    expect(marken.map((m) => m.getAttribute('src'))).toEqual([
      '/marke/own-motion-block-papier.svg',
      '/marke/own-motion-block-farbig.svg',
    ]);
    expect(screen.queryByText('Test Praxis Tuebingen')).toBeNull();
  });

  it('fuehrt von der Marke zurueck auf die Startseite', () => {
    renderWithProviders(
      <AppShell user={testUser(['therapist'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
      '/betrieb/urlaub',
    );
    const wege = screen.getAllByRole('link', { name: 'Own Motion, zur Startseite' });
    expect(wege.length).toBeGreaterThan(0);
    for (const weg of wege) expect(weg).toHaveAttribute('href', '/');
  });

  it('bietet einem reinen Patientenkonto keine Kartei an', () => {
    renderWithProviders(
      <AppShell user={testUser(['patient'], 'Max Mustermann')} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
    );
    expect(screen.queryByRole('link', { name: 'Patient:innen' })).toBeNull();
    expect(screen.getAllByRole('link', { name: 'Mein Tag' }).length).toBeGreaterThan(0);
  });

  it('haelt Betrieb und Team von einem Patientenkonto fern', () => {
    renderWithProviders(
      <AppShell user={testUser(['patient'], 'Max Mustermann')} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
    );
    expect(screen.queryByRole('link', { name: 'Betrieb' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Team' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Abrechnung' })).toBeNull();
  });

  it('zeigt das Untermenue des aktiven Arbeitsbereichs', () => {
    renderWithProviders(
      <AppShell user={testUser(['owner'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
      '/betrieb/urlaub',
    );
    // Bereichsintern, nicht global: die Unterpunkte gehoeren zu "Betrieb".
    expect(screen.getByRole('navigation', { name: 'Bereich Betrieb' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Radflotte/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Arbeitszeiten' })).toBeInTheDocument();
  });

  it('zeigt kein Untermenue eines anderen Bereichs', () => {
    renderWithProviders(
      <AppShell user={testUser(['owner'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
      '/patienten',
    );
    expect(screen.queryByRole('navigation', { name: 'Bereich Betrieb' })).toBeNull();
  });

  it('markiert den Arbeitsbereich, nicht nur seine Einstiegsseite', () => {
    renderWithProviders(
      <AppShell user={testUser(['owner'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
      '/betrieb/erstattungen',
    );
    const betrieb = screen.getAllByRole('link', { name: 'Betrieb' });
    expect(betrieb.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('gibt jeder Seite dieselbe Breite (UI-001)', () => {
    // Der gemeldete Fehler: beim Wechsel zwischen Kalender und jeder anderen
    // Seite sprang das ganze Geruest, weil allein der Kalender die breite
    // Spalte bekam. Verglichen wird der Rahmen um den Inhalt - er traegt die
    // Breitenklassen.
    const rahmen = (pfad: string) => {
      const { unmount } = renderWithProviders(
        <AppShell user={testUser(['owner'])} onSignOut={vi.fn()}>
          <p>Inhalt</p>
        </AppShell>,
        pfad,
      );
      const klassen = screen.getByRole('main').className;
      unmount();
      return klassen;
    };

    expect(rahmen('/kalender')).toBe(rahmen('/patienten'));
    expect(rahmen('/kalender')).toBe(rahmen('/'));
    // Seit DS-001 gibt es eine Kappung (1200 px), aber dieselbe auf jeder
    // Seite - der Sprung entstand nicht durch die Kappung, sondern dadurch,
    // dass sie je Route eine andere war.
    expect(rahmen('/kalender')).toContain('max-w-inhalt');
  });

  it('enthaelt einen Sprunglink zum Inhalt', () => {
    renderWithProviders(
      <AppShell user={testUser(['office'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
    );
    expect(screen.getByRole('link', { name: 'Zum Inhalt springen' })).toHaveAttribute(
      'href',
      '#inhalt',
    );
    expect(screen.getByRole('main')).toHaveAttribute('id', 'inhalt');
  });
});
