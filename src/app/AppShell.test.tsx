import { useEffect, useRef, type ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation, useNavigate, type NavigateFunction } from 'react-router-dom';
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

  it('haelt die Kopfzeile bei 56 px und Konto und Abmelden leise (Design-Handoff 2026-10-01)', () => {
    const onSignOut = vi.fn();
    const { container } = renderWithProviders(
      <AppShell user={testUser(['therapist'], 'Anna Beispiel')} onSignOut={onSignOut}>
        <p>Inhalt</p>
      </AppShell>,
    );
    // 56 px auf jeder Breite - nicht erst ab sm.
    const zeile = container.querySelector('header > div')!.className.split(/\s+/);
    expect(zeile).toContain('min-h-14');
    expect(zeile).not.toContain('sm:min-h-14');

    // „Abmelden" ist der seltenste Vorgang des Tages: 14 px, leise, nicht
    // fett und nicht in der Hauptfarbe - aber weiter ein Tippziel von 44 px
    // und weiter ein Knopf, der abmeldet.
    const abmelden = screen.getByRole('button', { name: 'Abmelden' });
    const klassen = abmelden.className.split(/\s+/);
    expect(klassen).toEqual(expect.arrayContaining(['text-ink-muted', 'text-sm', 'min-h-11']));
    expect(klassen).not.toContain('text-accent');
    expect(klassen).not.toContain('font-bold');
    expect(abmelden).toHaveAttribute('type', 'button');
    fireEvent.click(abmelden);
    expect(onSignOut).toHaveBeenCalledTimes(1);

    // „Mein Konto" in 600, der Name daneben in normalem Gewicht.
    const konto = screen.getByRole('link', { name: 'Mein Konto, Anna Beispiel' });
    expect(konto.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['text-ink-muted', 'text-sm', 'min-h-11']),
    );
    expect(within(konto).getByText('Mein Konto').className).toContain('font-semibold');

    // Die Marke am Telefon in ihrer Mindesthoehe, der Bereichsname in 14 px.
    const marke = container.querySelector('header img')!;
    expect(marke).toHaveAttribute('height', '24');
    const bereich = container.querySelector('header p')!;
    expect(bereich).toHaveTextContent('Übersicht');
    expect(bereich.className.split(/\s+/)).toEqual(
      expect.arrayContaining(['text-ink-muted', 'text-sm', 'truncate']),
    );
  });

  it('gibt dem Inhalt 16, 24 und 32 px Rand je Breite (Design-Handoff 2026-10-01)', () => {
    renderWithProviders(
      <AppShell user={testUser(['therapist'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
      '/patienten',
    );
    const inhalt = screen.getByRole('main').className.split(/\s+/);
    expect(inhalt).toEqual(expect.arrayContaining(['px-4', 'sm:px-6', 'lg:px-8', 'max-w-inhalt']));
    // Das Untermenue reicht am Telefon bis zum Rand - mit demselben Wert.
    const untermenue = screen.getByRole('navigation', { name: 'Bereich Patient:innen' });
    expect(untermenue.className.split(/\s+/)).toEqual(expect.arrayContaining(['-mx-4', 'px-4']));
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
    // und das prueft die Rolle selbst (ADR-004). Das Feld verspricht deshalb
    // auch keine Namen (NAV-16).
    renderWithProviders(
      <AppShell user={testUser(['patient'], 'Max Mustermann')} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
    );
    expect(
      screen.getByRole('combobox', { name: 'Funktion oder Bereich suchen' }),
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
    // Der Sprung landet wirklich im Inhalt: `main` nimmt den Fokus an.
    expect(screen.getByRole('main')).toHaveAttribute('id', 'inhalt');
    expect(screen.getByRole('main')).toHaveAttribute('tabindex', '-1');
  });
});

// -----------------------------------------------------------------------------
// UXR-002: Rahmen und Navigation
// -----------------------------------------------------------------------------

/** Die Tableiste am unteren Rand - die zweite Navigation dieses Namens. */
function tableiste() {
  const navigationen = screen.getAllByRole('navigation', { name: 'Arbeitsbereiche' });
  return navigationen[navigationen.length - 1]!;
}

describe('AppShell: Orientierung (UXR-002)', () => {
  it('zeichnet den aktiven Tab nicht nur mit Farbe aus (NAV-04)', () => {
    renderWithProviders(
      <AppShell user={testUser(['therapist'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
      '/kalender',
    );
    const aktiv = within(tableiste()).getByRole('link', { name: 'Kalender' });
    expect(aktiv).toHaveAttribute('aria-current', 'page');
    // Ein Strich am oberen Rand, inaktiv durchsichtig; dazu das Gewicht.
    expect(aktiv.className).toContain('border-t-3');
    expect(aktiv.className).toContain('border-transparent');
    expect(aktiv.className).toContain('aria-[current=page]:border-accent');
    expect(aktiv.className).toContain('aria-[current=page]:font-semibold');
    // Kein Schatten als Zeichen (DS-001).
    expect(aktiv.className).not.toMatch(/shadow|ring-/);
  });

  it('markiert „Rechnungen" auch auf der Rechnung selbst (NAV-15, ABR-29)', () => {
    renderWithProviders(
      <AppShell user={testUser(['office'], 'Olivia Office')} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
      '/abrechnung/rechnungen/0f0fede1-842c-4168-b66f-9004ff4c6516',
    );
    const menue = screen.getByRole('navigation', { name: 'Bereich Abrechnung' });
    expect(within(menue).getByRole('link', { name: 'Rechnungen' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(within(menue).getByRole('link', { name: 'Zahlungen' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('markiert „Verordner:innen" auch auf dem Formular (VER-B01)', () => {
    renderWithProviders(
      <AppShell user={testUser(['therapist'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
      '/verordner/neu',
    );
    const menue = screen.getByRole('navigation', { name: 'Bereich Patient:innen' });
    expect(within(menue).getByRole('link', { name: 'Verordner:innen' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('nennt den Weg zum Konto „Mein Konto" und markiert ihn auf der Kontoseite (NAV-17)', () => {
    renderWithProviders(
      <AppShell user={testUser(['office'], 'Olivia Office')} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
      '/mein-konto',
    );
    // Ab sm: „Mein Konto" sichtbar, der Name als Zusatz im zugänglichen Namen.
    const breit = screen.getByRole('link', { name: 'Mein Konto, Olivia Office' });
    expect(breit).toHaveTextContent('Mein Konto');
    expect(breit).toHaveAttribute('aria-current', 'page');
    expect(breit.className).toContain('aria-[current=page]:border-accent');
    // Am Telefon: „Konto", derselbe Weg, derselbe Zustand.
    expect(screen.getByRole('link', { name: 'Mein Konto' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  it('markiert den Weg zum Konto nur auf der Kontoseite', () => {
    renderWithProviders(
      <AppShell user={testUser(['office'], 'Olivia Office')} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
      '/patienten',
    );
    expect(screen.getByRole('link', { name: 'Mein Konto, Olivia Office' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('zeigt am Telefon ein Kreuz, solange die Suche offen ist (NAV-08)', () => {
    const { container } = renderWithProviders(
      <AppShell user={testUser(['therapist'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
    );
    const knopf = screen.getByRole('button', { name: 'Suche öffnen' });
    expect(knopf.querySelector('circle')).not.toBeNull();
    // Der Symbolknopf hält 44 px (UIK-01).
    expect(knopf.className).toContain('size-11');

    fireEvent.click(knopf);

    const schliessen = screen.getByRole('button', { name: 'Suche schließen' });
    expect(schliessen.querySelector('circle')).toBeNull();
    expect(container.querySelector('#kopf-suche')?.className).not.toContain('max-sm:hidden');
  });

  it('lässt Verbindungsanzeige und Kopfzeile zusammen kleben (NAV-11, RSP-10)', () => {
    const { container } = renderWithProviders(
      <AppShell user={testUser(['therapist'])} onSignOut={vi.fn()}>
        <p>Inhalt</p>
      </AppShell>,
    );
    const kopfzeile = container.querySelector('header')!;
    const huelle = kopfzeile.parentElement!;
    // Eine Hülle klebt, darin der Hinweis über der Kopfzeile - nicht mehr
    // zwei Geschwister bei top-0, von denen einer den anderen verdeckt.
    expect(huelle.className).toContain('sticky');
    expect(huelle.className).toContain('top-0');
    expect(kopfzeile.className).not.toContain('sticky');
    expect(huelle).toContainElement(screen.getByRole('status'));
    expect(
      screen.getByRole('status').compareDocumentPosition(kopfzeile) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  describe('Höhe der Kopfzeile für klebende Köpfe darunter (KAL-02)', () => {
    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('stellt sie als CSS-Variable am Rahmen bereit', () => {
      const beobachtet: Element[] = [];
      vi.stubGlobal(
        'ResizeObserver',
        class {
          observe(ziel: Element) {
            beobachtet.push(ziel);
          }
          disconnect() {}
        },
      );
      const { container } = renderWithProviders(
        <AppShell user={testUser(['therapist'])} onSignOut={vi.fn()}>
          <p>Inhalt</p>
        </AppShell>,
      );
      const rahmen = container.firstElementChild as HTMLElement;
      // jsdom misst nichts; die Variable steht trotzdem, mit dem gemessenen
      // Wert der Hülle um Hinweis und Kopfzeile.
      expect(rahmen.style.getPropertyValue('--kopfzeile-hoehe')).toBe('0px');
      expect(beobachtet).toEqual([container.querySelector('header')!.parentElement]);
    });
  });
});

// -----------------------------------------------------------------------------
// Seitenwechsel: Bildlauf und Fokus (NAV-09, VER-06)
//
// Ein `MemoryRouter` statt des Data Routers aus `renderWithProviders`: Hier
// wird wirklich navigiert, und das geht so unter Node 22 wie unter Node 24.
// -----------------------------------------------------------------------------

let navigieren: NavigateFunction | undefined;

function Weg() {
  navigieren = useNavigate();
  return null;
}

/** Eine Seite, die ihr erstes Feld selbst fokussiert - wie ein Formular. */
function Seite() {
  const { pathname } = useLocation();
  const feld = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (pathname === '/formular') feld.current?.focus();
  }, [pathname]);
  return pathname === '/formular' ? (
    <label>
      Name
      <input ref={feld} />
    </label>
  ) : (
    <p>Seite {pathname}</p>
  );
}

function mitRouter(kinder: ReactNode, pfad = '/') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[pfad]}>
        <Weg />
        {kinder}
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('AppShell: Seitenwechsel (NAV-09, VER-06)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  function bildlauf() {
    return vi.spyOn(Element.prototype, 'scrollTop', 'set');
  }

  it('beginnt eine neue Seite oben und gibt dem Inhalt den Fokus', async () => {
    const user = userEvent.setup();
    mitRouter(
      <AppShell user={testUser(['therapist'])} onSignOut={vi.fn()}>
        <Seite />
      </AppShell>,
    );
    const gesetzt = bildlauf();

    // Die Seitenleiste steht vor der Tableiste im Baum.
    await user.click(screen.getAllByRole('link', { name: 'Kalender' })[0]!);

    expect(screen.getByText('Seite /kalender')).toBeInTheDocument();
    expect(gesetzt).toHaveBeenCalledWith(0);
    expect(screen.getByRole('main')).toHaveFocus();
  });

  it('lässt den Fokus, den die neue Seite selbst setzt', async () => {
    const user = userEvent.setup();
    mitRouter(
      <AppShell user={testUser(['therapist'])} onSignOut={vi.fn()}>
        <Seite />
      </AppShell>,
    );

    await user.click(screen.getAllByRole('link', { name: 'Kalender' })[0]!);
    act(() => {
      void navigieren?.('/formular');
    });

    expect(screen.getByRole('textbox', { name: 'Name' })).toHaveFocus();
  });

  it('bleibt bei einem Wechsel nur der Suchparameter, wo es ist', () => {
    mitRouter(
      <AppShell user={testUser(['therapist'])} onSignOut={vi.fn()}>
        <Seite />
      </AppShell>,
      '/kalender',
    );
    const gesetzt = bildlauf();

    // Blättern im Kalender, Filtern einer Liste: kein Sprung nach oben.
    act(() => {
      void navigieren?.('/kalender?ansicht=woche');
    });

    expect(gesetzt).not.toHaveBeenCalled();
    expect(screen.getByRole('main')).not.toHaveFocus();
  });

  it('überlässt Zurück dem Browser und ein Sprungziel der Seite', () => {
    mitRouter(
      <AppShell user={testUser(['therapist'])} onSignOut={vi.fn()}>
        <Seite />
      </AppShell>,
      '/patienten',
    );
    act(() => {
      void navigieren?.('/kalender');
    });
    const gesetzt = bildlauf();

    // Zurück: Der Browser stellt die Stelle wieder her, an der man war.
    act(() => {
      void navigieren?.(-1);
    });
    expect(screen.getByText('Seite /patienten')).toBeInTheDocument();
    // Ein Sprungziel wie #verordnung-… steuert die Seite selbst an (VER-06).
    act(() => {
      void navigieren?.('/patienten/p1/verordnungen#verordnung-g1');
    });

    expect(gesetzt).not.toHaveBeenCalled();
  });
});
