import { describe, expect, it, vi } from 'vitest';
import { fireEvent, screen, within } from '@testing-library/react';
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
    expect(screen.getAllByRole('link', { name: 'Übersicht' }).length).toBeGreaterThan(0);
  });

  it('haelt Organisatorisches und Kommunikation von einem Patientenkonto fern', () => {
    renderWithProviders(
      <AppShell user={testUser(['patient'], 'Max Mustermann')} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
    );
    expect(screen.queryByRole('link', { name: 'Organisatorisches' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Kommunikation' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Abrechnung' })).toBeNull();
  });

  it('zeigt das Untermenue des aktiven Arbeitsbereichs', () => {
    renderWithProviders(
      <AppShell user={testUser(['owner'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
      '/betrieb/urlaub',
    );
    // Bereichsintern, nicht global: die Unterpunkte gehoeren zu
    // "Organisatorisches".
    expect(
      screen.getByRole('navigation', { name: 'Bereich Organisatorisches' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Radflotte/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Arbeitszeiten' })).toBeInTheDocument();
  });

  it('klappt die Vorschauen hinter die echten Punkte ein (UX-002h)', () => {
    renderWithProviders(
      <AppShell user={testUser(['owner'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
      '/praxis/team',
    );
    const menue = screen.getByRole('navigation', { name: 'Bereich Organisatorisches' });
    expect(within(menue).getByRole('link', { name: 'Mitarbeitende' })).toBeInTheDocument();
    expect(within(menue).queryByRole('link', { name: /Radflotte/ })).toBeNull();

    const knopf = within(menue).getByRole('button', { name: 'Vorschau (4)' });
    expect(knopf).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(knopf);
    expect(within(menue).getByRole('link', { name: /Radflotte/ })).toBeInTheDocument();
    expect(within(menue).getByRole('button', { name: 'Vorschau einklappen' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('zeigt kein Untermenue eines anderen Bereichs', () => {
    renderWithProviders(
      <AppShell user={testUser(['owner'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
      '/patienten',
    );
    expect(screen.queryByRole('navigation', { name: 'Bereich Organisatorisches' })).toBeNull();
  });

  it('markiert den Arbeitsbereich, nicht nur seine Einstiegsseite', () => {
    renderWithProviders(
      <AppShell user={testUser(['owner'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
      '/betrieb/erstattungen',
    );
    const betrieb = screen.getAllByRole('link', { name: 'Organisatorisches' });
    expect(betrieb.some((link) => link.getAttribute('aria-current') === 'page')).toBe(true);
  });

  it('haelt das Geruest auf jeder Seite gleich; nur Flaechen reichen bis an den Rand', () => {
    // UI-001: Beim Wechsel zwischen Kalender und jeder anderen Seite sprang
    // das ganze Geruest - Kopfzeile, Navigation und Inhalt -, weil allein der
    // Kalender die breite Spalte bekam. Die Kopfzeile bleibt deshalb ueberall
    // dieselbe. Der Inhalt darf seit BEF-043 (ANN-114) beim Kalender die
    // ganze Flaeche nutzen; alle Listen- und Textseiten teilen die Kappung.
    const rahmen = (pfad: string) => {
      const { unmount, container } = renderWithProviders(
        <AppShell user={testUser(['owner'])} onSignOut={vi.fn()}>
          <p>Inhalt</p>
        </AppShell>,
        pfad,
      );
      const klassen = {
        inhalt: screen.getByRole('main').className,
        kopf: container.querySelector('header')!.className,
      };
      unmount();
      return klassen;
    };

    const kalender = rahmen('/kalender');
    const patienten = rahmen('/patienten');
    expect(kalender.kopf).toBe(patienten.kopf);
    expect(patienten.inhalt).toBe(rahmen('/').inhalt);
    expect(patienten.inhalt).toBe(rahmen('/touren').inhalt);
    expect(patienten.inhalt).toContain('max-w-inhalt');
    expect(kalender.inhalt).not.toContain('max-w-inhalt');
  });

  it('fuehrt die Suche genau einmal - auf jeder Breite dasselbe Feld (UX-013)', () => {
    // Bis UX-013 stand das Suchfeld zweimal im Baum, einmal je Breite. Mit
    // Tastenkuerzel und Trefferliste waere das zweimal dasselbe Feld, von dem
    // nur eines zu sehen ist; die Zeile bricht jetzt um, statt sich zu
    // verdoppeln.
    renderWithProviders(
      <AppShell user={testUser(['therapist'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
    );
    expect(
      screen.getAllByRole('combobox', { name: 'Funktion, Bereich oder Name suchen' }),
    ).toHaveLength(1);
  });

  it('klappt die Suche am Telefon hinter einer Lupe neben dem Konto ein (BEF-039)', () => {
    renderWithProviders(
      <AppShell user={testUser(['therapist'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
    );
    const feld = screen.getByRole('combobox', { name: 'Funktion, Bereich oder Name suchen' });
    const huelle = document.getElementById('kopf-suche')!;
    // Unter sm verborgen, ab sm wie bisher sichtbar - dasselbe eine Feld.
    expect(huelle.className).toContain('max-sm:hidden');
    expect(huelle).toContainElement(feld);

    const lupe = screen.getByRole('button', { name: 'Suche öffnen' });
    expect(lupe.className).toContain('sm:hidden');
    // Links neben dem Konto.
    expect(lupe.nextElementSibling).toHaveAccessibleName('Mein Konto');

    fireEvent.click(lupe);
    expect(huelle.className).not.toContain('max-sm:hidden');
    expect(feld).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Suche schließen' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('gibt auch einem Patientenkonto die Suche - sie sucht zuerst Funktionen', () => {
    // Sie ist kein Zugang zur Kartei: Namen liefert nur `search_patients`,
    // und das prueft die Rolle selbst (ADR-004).
    renderWithProviders(
      <AppShell user={testUser(['patient'], 'Max Mustermann')} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
    );
    expect(
      screen.getByRole('combobox', { name: 'Funktion, Bereich oder Name suchen' }),
    ).toBeInTheDocument();
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
