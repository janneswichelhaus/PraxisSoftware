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
    expect(screen.getByRole('img', { name: 'Own Motion' })).toBeInTheDocument();
    expect(screen.queryByText('Test Praxis Tuebingen')).toBeNull();
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
