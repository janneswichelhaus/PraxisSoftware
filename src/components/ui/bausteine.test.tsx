import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Badge } from './Badge';
import { Button } from './Button';
import { ButtonLink } from './ButtonLink';
import { Card, Disclosure } from './Card';
import { EmptyState, ErrorState } from './Feedback';
import { PageHeader } from './PageHeader';
import { RoleBadge } from './RoleBadge';
import { kartenAktionKlassen } from './buttonStile';
import { DetailList, DetailRow } from './DetailList';
import { Rueckfrage } from './Rueckfrage';
import { SearchCombobox, type Suchtreffer } from './SearchCombobox';
import { SearchField } from './SearchField';
import { Feldgruppe, Section } from './Section';
import { Statusmeldung } from './Statusmeldung';
import { SubNav, type SubNavEintrag } from './SubNav';
import { Symbolknopf } from './Symbolknopf';
import { Textlink } from './Textlink';
import { ListRow, ListRows } from './ListRow';
import { NowMarker } from './NowMarker';
import { ProgressDots } from './ProgressDots';
import { StatusMark } from './StatusMark';
import { Tile, TileGrid, TileRow, TileRows } from './Tile';
import { TravelBar } from './TravelBar';
import { zeitstrahlRaster } from './timelineStile';
import { pufferText, travelLevel, travelPlan } from './travelPlan';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/** Die Klassen eines Elements als Liste - für Zusicherungen ohne Teiltreffer. */
function klassenVon(element: Element | null | undefined): string[] {
  return (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

describe('Badge', () => {
  /**
   * Seit DS-001 sind `akzent` und `positiv` dieselbe Farbe (Hauptfarbe auf
   * Salbei hell). Vorher hielt sie ein Kontrasttest ueber ihre Buntheit
   * auseinander; jetzt traegt das Zeichen die Unterscheidung. Faellt es weg,
   * sind zwei Abzeichen nebeneinander nicht mehr zu trennen.
   */
  it('setzt positiv mit einem Zeichen von akzent ab', () => {
    const { unmount } = renderWithProviders(<Badge ton="positiv">Abgeschlossen</Badge>);
    expect(screen.getByText('Abgeschlossen').parentElement?.textContent).toBe('✓Abgeschlossen');
    unmount();

    renderWithProviders(<Badge ton="akzent">Vorschau</Badge>);
    expect(screen.getByText('Vorschau').parentElement?.textContent).toBe('Vorschau');
  });

  it('kennzeichnet Warnung und Kritisch mit eigenen Zeichen', () => {
    const { unmount } = renderWithProviders(<Badge ton="warnung">Offen</Badge>);
    expect(screen.getByText('Offen').parentElement?.textContent).toBe('!Offen');
    unmount();

    renderWithProviders(<Badge ton="kritisch">Abgesagt</Badge>);
    expect(screen.getByText('Abgesagt').parentElement?.textContent).toBe('×Abgesagt');
  });

  it('haelt das Zeichen aus dem Vorlesetext heraus', () => {
    // Der Zustand steht als Wort daneben; "Haekchen Abgeschlossen" waere nur
    // Rauschen.
    renderWithProviders(<Badge ton="positiv">Abgeschlossen</Badge>);
    expect(screen.getByText('✓')).toHaveAttribute('aria-hidden', 'true');
  });

  it('ist 28 px hoch und setzt 14 px in 600 (Design-Handoff 2026-10-01)', () => {
    renderWithProviders(<Badge ton="warnung">Offen</Badge>);
    const klassen = screen.getByText('Offen').className.split(/\s+/);
    expect(klassen).toEqual(
      expect.arrayContaining(['min-h-7', 'px-3', 'text-sm', 'font-semibold']),
    );
    // Die alten Maße stehen nicht daneben - zwei Schriftgrade an einem
    // Element entscheidet sonst die Reihenfolge im Stylesheet.
    expect(klassen).not.toContain('text-xs');
    expect(klassen).not.toContain('font-medium');
  });
});

describe('Card', () => {
  it('ist weiss, hat Radius 14, eine Linie und 16 innen - ohne Schatten (Design-Handoff 2026-10-01)', () => {
    renderWithProviders(
      <Card className="max-w-xl">
        <p>Inhalt</p>
      </Card>,
    );
    const klassen = screen.getByText('Inhalt').parentElement!.className.split(/\s+/);
    expect(klassen).toEqual(
      expect.arrayContaining(['rounded-card', 'bg-surface', 'border', 'border-line', 'p-4']),
    );
    expect(klassen).not.toContain('p-6');
    expect(klassen).toContain('max-w-xl');
    expect(klassen.join(' ')).not.toMatch(/shadow|ring/);
  });
});

describe('PageHeader', () => {
  it('setzt den Kicker über den Titel, nicht in die Überschrift', () => {
    renderWithProviders(<PageHeader kicker="Termin" title="Berta Bestand" />);
    const kicker = screen.getByText('Termin');
    expect(kicker.tagName).toBe('P');
    expect(kicker).toHaveClass('uppercase', 'text-xs');
    expect(screen.getByRole('heading', { level: 1 })).toHaveAccessibleName('Berta Bestand');
    // Der Kicker steht vor dem Titel.
    expect(
      kicker.compareDocumentPosition(screen.getByRole('heading', { level: 1 })) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it('haelt den kompakten Kopf flach, ohne die Identitaet wegzunehmen', () => {
    // IDEA-PRX-038: auf den Dokumentationsseiten muss das Textfeld ohne
    // Scrollen erreichbar sein. Gespart wird Hoehe - nicht die Zeile, die
    // sagt, in wessen Akte gerade geschrieben wird.
    renderWithProviders(
      <PageHeader
        title="Behandlung abschließen"
        description="Max Mustermann · 12.05.2027, 09:00–10:00"
        kompakt
      />,
    );

    const titel = screen.getByRole('heading', { name: 'Behandlung abschließen' });
    expect(titel.className).toContain('text-h4');
    expect(titel.className).not.toContain('text-h2');
    expect(screen.getByText('Max Mustermann · 12.05.2027, 09:00–10:00')).toBeInTheDocument();
  });

  it('bleibt ohne kompakt beim vollen Seitentitel', () => {
    renderWithProviders(<PageHeader title="Patient:innen" />);
    expect(screen.getByRole('heading', { name: 'Patient:innen' }).className).toContain('text-h2');
  });

  it('setzt den Titel am Telefon in 26 px und ab 640 px in 32 (Design-Handoff 2026-10-01)', () => {
    renderWithProviders(<PageHeader title="Patient:innen" description="12 Personen" />);
    const klassen = screen.getByRole('heading', { name: 'Patient:innen' }).className.split(/\s+/);
    expect(klassen).toContain('text-h2-mobil');
    expect(klassen).toContain('sm:text-h2');
    // Ohne Breitenangabe gilt die kleine Stufe - `text-h2` allein wäre 32 px
    // auf jeder Breite.
    expect(klassen).not.toContain('text-h2');
    expect(klassen).toEqual(expect.arrayContaining(['font-extrabold', 'tracking-display']));
    // Beschreibung: 14 px, leise, 4 px unter dem Titel.
    const beschreibung = screen.getByText('12 Personen').className.split(/\s+/);
    expect(beschreibung).toEqual(expect.arrayContaining(['text-ink-muted', 'text-sm', 'mt-1']));
  });
});

describe('ButtonLink', () => {
  it('ist ein Link und keine Schaltflaeche', () => {
    renderWithProviders(<ButtonLink to="/patienten/neu">Patient anlegen</ButtonLink>);

    const link = screen.getByRole('link', { name: 'Patient anlegen' });
    expect(link).toHaveAttribute('href', '/patienten/neu');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('traegt dieselben Klassen wie die Schaltflaeche und ein ausreichendes Tippziel', () => {
    renderWithProviders(<ButtonLink to="/a">Primaer</ButtonLink>);
    const link = screen.getByRole('link', { name: 'Primaer' });
    // Seit DS-001 ist die Schaltflaeche 48 px hoch (`--control-height`); die
    // Untergrenze von 44 px aus der Oberflaechen-Checkliste bleibt damit
    // erfuellt. Geprueft wird die Hoehe, nicht eine bestimmte Klasse.
    expect(link.className).toMatch(/\bh-12\b/);
    expect(link.className).toContain('bg-accent');
  });

  it('haelt die kompakte Variante bei 44 px', () => {
    // Das Design System nennt 40 px fuer den kompakten Knopf und zugleich
    // "Ziele >= 44". Fuer einen Knopf ohne umgebende Polsterung widersprechen
    // sich beide; es gilt die zugaengliche Lesart.
    expect(kartenAktionKlassen()).toMatch(/\bmin-h-11\b/);
  });

  it('kennt die sekundaere Variante', () => {
    renderWithProviders(
      <ButtonLink to="/a" variant="secondary">
        Sekundaer
      </ButtonLink>,
    );
    expect(screen.getByRole('link', { name: 'Sekundaer' }).className).toContain(
      'border-line-strong',
    );
  });

  it('nimmt zusaetzliche Klassen und die kompakte Groesse wie der Knopf (UIK-13)', () => {
    renderWithProviders(
      <ButtonLink to="/a" variant="secondary" groesse="kompakt" className="w-full">
        Abbrechen
      </ButtonLink>,
    );
    const link = screen.getByRole('link', { name: 'Abbrechen' });
    expect(link).toHaveClass('w-full', 'min-h-11', 'text-sm', 'border-line-strong');
    expect(link.className).not.toMatch(/\bh-12\b/);
  });

  it('ersetzt mit replace den Verlaufseintrag, statt einen neuen anzulegen', async () => {
    const user = userEvent.setup();
    function Seite() {
      const art = useNavigationType();
      const { pathname } = useLocation();
      return (
        <>
          <p>
            {pathname} {art}
          </p>
          <ButtonLink to="/ersetzt" replace>
            Ersetzen
          </ButtonLink>
          <ButtonLink to="/neu">Anlegen</ButtonLink>
        </>
      );
    }
    // Ein einfacher Router genügt: Der Link braucht keinen Data Router, und
    // dessen Navigation baut unter Node 24 mit jsdom keinen `Request` (bekannt,
    // siehe Router-Tests).
    render(
      <MemoryRouter initialEntries={['/start']}>
        <Seite />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('link', { name: 'Ersetzen' }));
    expect(screen.getByText('/ersetzt REPLACE')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Anlegen' }));
    expect(screen.getByText('/neu PUSH')).toBeInTheDocument();
  });
});

describe('Button', () => {
  it('ist kompakt so hoch und so beschriftet wie die Kartenaktion (UIK-14)', () => {
    renderWithProviders(
      <Button type="button" variant="secondary" groesse="kompakt">
        Bearbeiten
      </Button>,
    );
    const knopf = screen.getByRole('button', { name: 'Bearbeiten' });
    expect(knopf.className).toBe(kartenAktionKlassen('secondary'));
    expect(knopf).toHaveClass('min-h-11', 'text-sm', 'font-bold');
  });

  it('bleibt ohne Angabe bei 48 px', () => {
    renderWithProviders(<Button type="button">Speichern</Button>);
    expect(screen.getByRole('button', { name: 'Speichern' }).className).toMatch(/\bh-12\b/);
  });
});

describe('Symbolknopf', () => {
  it('ist 44 px gross, benannt und schickt kein Formular ab (UIK-01)', () => {
    renderWithProviders(
      <Symbolknopf beschriftung="Vorheriger Zeitraum" onClick={() => {}}>
        ‹
      </Symbolknopf>,
    );
    const knopf = screen.getByRole('button', { name: 'Vorheriger Zeitraum' });
    expect(knopf).toHaveClass('size-11');
    expect(knopf).toHaveAttribute('type', 'button');
    // Das Symbol ist fuer Vorlesesoftware ausgeblendet; der Name kommt aus
    // der Beschriftung.
    expect(screen.getByText('‹')).toHaveAttribute('aria-hidden', 'true');
    // Ohne Angabe leise: Hauptfarbe ohne Flaeche.
    expect(knopf).toHaveClass('text-accent', 'hover:bg-surface-sunken');
  });

  it('kennt die Varianten des Buttons und den abgeschalteten Zustand', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithProviders(
      <>
        <Symbolknopf beschriftung="Ansicht und Filter" variant="primary" aria-expanded>
          ☰
        </Symbolknopf>
        <Symbolknopf beschriftung="Naechster Zeitraum" disabled onClick={onClick}>
          ›
        </Symbolknopf>
      </>,
    );
    const offen = screen.getByRole('button', { name: 'Ansicht und Filter' });
    expect(offen).toHaveClass('bg-accent', 'text-surface');
    expect(offen).toHaveAttribute('aria-expanded', 'true');

    const gesperrt = screen.getByRole('button', { name: 'Naechster Zeitraum' });
    expect(gesperrt).toBeDisabled();
    expect(gesperrt).toHaveClass('disabled:bg-surface-sunken', 'disabled:text-ink-muted');
    await user.click(gesperrt);
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Textlink', () => {
  it('ist im Satz unterstrichen und in der Hauptfarbe (TOK-12)', () => {
    renderWithProviders(
      <p>
        Termin angelegt. <Textlink to="/termine/1">Termin öffnen</Textlink>
      </p>,
    );
    const link = screen.getByRole('link', { name: 'Termin öffnen' });
    expect(link).toHaveAttribute('href', '/termine/1');
    expect(link).toHaveClass('text-accent', 'underline', 'underline-offset-3');
    // Im Satz kein eigenes Tippziel - WCAG 2.5.8 nimmt ihn aus.
    expect(link).not.toHaveClass('min-h-11');
  });

  it('bekommt allein stehend ein Tippziel von 44 px (UIK-15)', () => {
    renderWithProviders(
      <Textlink to="/betrieb/flotte" alleinstehend className="text-sm">
        Zur Radflotte
      </Textlink>,
    );
    expect(screen.getByRole('link', { name: 'Zur Radflotte' })).toHaveClass(
      'inline-flex',
      'min-h-11',
      'items-center',
      'underline',
      'text-sm',
    );
  });

  it('fuehrt mit href aus dem Router heraus, etwa auf tel:', () => {
    renderWithProviders(
      <Textlink href="tel:+491600000005" alleinstehend>
        +49 160 0000005
      </Textlink>,
    );
    const link = screen.getByRole('link', { name: '+49 160 0000005' });
    expect(link).toHaveAttribute('href', 'tel:+491600000005');
    expect(link).toHaveClass('min-h-11', 'underline');
  });
});

describe('Statusmeldung', () => {
  it('unterbricht bei einem Fehler und wird sonst nur gelesen', () => {
    renderWithProviders(
      <>
        <Statusmeldung ton="fehler">Speichern fehlgeschlagen.</Statusmeldung>
        <Statusmeldung>3 von 12 Terminen</Statusmeldung>
      </>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Speichern fehlgeschlagen.');
    expect(screen.getByRole('status')).toHaveTextContent('3 von 12 Terminen');
  });

  it('unterbricht bei einer Warnung nicht - sie muss sichtbar sein, nicht dringend', () => {
    renderWithProviders(<Statusmeldung ton="warnung">Der Stand kann veraltet sein.</Statusmeldung>);

    const meldung = screen.getByRole('status');
    expect(meldung).toHaveTextContent('Der Stand kann veraltet sein.');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Der Zustand haengt nicht allein an der Farbe, aber die Farbe traegt ihn
    // mit (Oberflaechen-Checkliste Punkt 4).
    expect(meldung.className).toContain('text-warnung');
  });

  it('meldet Erfolg in der Farbe des Erfolgs und mit Haekchen (UIK-21)', () => {
    renderWithProviders(
      <Statusmeldung ton="erfolg">Das Praxisraster ist gespeichert.</Statusmeldung>,
    );

    const meldung = screen.getByRole('status');
    expect(meldung).toHaveClass('text-positiv');
    expect(meldung.textContent).toBe('✓Das Praxisraster ist gespeichert.');
    // Das Zeichen ist fuer Vorlesesoftware ausgeblendet - der Satz sagt es.
    expect(screen.getByText('✓')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('setzt Warnung und Fehler mit den Zeichen des Badge ab, neutral ohne', () => {
    renderWithProviders(
      <>
        <Statusmeldung ton="warnung">Veraltet.</Statusmeldung>
        <Statusmeldung ton="fehler">Nicht gespeichert.</Statusmeldung>
        <Statusmeldung>3 von 12 Terminen</Statusmeldung>
      </>,
    );
    expect(screen.getByText('Veraltet.').textContent).toBe('!Veraltet.');
    expect(screen.getByRole('alert').textContent).toBe('×Nicht gespeichert.');
    expect(screen.getByText('3 von 12 Terminen').textContent).toBe('3 von 12 Terminen');
    for (const zeichen of ['!', '×']) {
      expect(screen.getByText(zeichen)).toHaveAttribute('aria-hidden', 'true');
    }
  });
});

describe('Disclosure', () => {
  it('hat einen Kopf von mindestens 44 px und ein sichtbares Aufklappzeichen (UIK-07)', () => {
    renderWithProviders(
      <Disclosure summary="Rechenvorschrift">
        <p>Summe der Punkte</p>
      </Disclosure>,
    );
    const kopf = screen.getByText('Rechenvorschrift');
    expect(kopf.tagName).toBe('SUMMARY');
    expect(kopf.className).toMatch(/\bmin-h-11\b/);
    // Das Zeichen steht im Kopf, ist fuer Vorlesesoftware ausgeblendet und
    // dreht sich, wenn das <details> offen ist - ohne Bewegung, wenn die
    // Person reduzierte Bewegung eingestellt hat.
    const zeichen = kopf.querySelector('[data-aufklappzeichen]');
    expect(zeichen).not.toBeNull();
    expect(zeichen).toHaveAttribute('aria-hidden', 'true');
    expect(zeichen).toHaveClass('group-open:rotate-90', 'motion-reduce:transition-none');
    // Ohne Pfad und Linienzug: Die Akte schließt sie für ihr Verlaufsbild
    // aus und zählt sie in ihrem Test (ADR-006 Punkt 11).
    expect(kopf.querySelector('svg, path, polyline')).toBeNull();
    expect(kopf.closest('details')).toHaveClass('group');
    // Kein zweites Zeichen des Browsers daneben.
    expect(kopf).toHaveClass('list-none');
    expect(kopf.closest('details')).not.toHaveAttribute('open');
  });

  it('nimmt mehr als Text im Kopf und oeffnet auf Wunsch von Anfang an', () => {
    renderWithProviders(
      <Disclosure
        offen
        summary={
          <>
            Buchungen <Badge>3</Badge>
          </>
        }
      >
        <p>Inhalt</p>
      </Disclosure>,
    );
    const details = screen.getByText('Inhalt').closest('details');
    expect(details).toHaveAttribute('open');
    expect(details?.querySelector('summary')?.textContent).toBe('Buchungen 3');
  });

  it('sieht ohne die neuen Angaben aus wie bisher (Design-Handoff 2026-10-01)', () => {
    renderWithProviders(
      <Disclosure summary="Rechenvorschrift">
        <p>Summe der Punkte</p>
      </Disclosure>,
    );
    const kopf = screen.getByText('Rechenvorschrift');
    expect(klassenVon(kopf)).toEqual(expect.arrayContaining(['text-ink-muted', 'text-sm']));
    expect(klassenVon(kopf)).not.toContain('font-semibold');
    expect(klassenVon(kopf.closest('details'))).toEqual(
      expect.arrayContaining(['border-t', 'border-line', 'mt-2', 'pt-2']),
    );
    expect(klassenVon(kopf.closest('details'))).not.toContain('rounded-card');
  });

  it('setzt den Zaehler in Klammern hinter den Titel', () => {
    renderWithProviders(
      <Disclosure summary="Erledigt heute" anzahl={3} kopf="betont">
        <p>Inhalt</p>
      </Disclosure>,
    );
    const kopf = screen.getByText('Inhalt').closest('details')!.querySelector('summary')!;
    expect(kopf.textContent).toBe('Erledigt heute (3)');
    expect(klassenVon(kopf)).toEqual(expect.arrayContaining(['text-sm', 'font-semibold']));
    // Auch null ist ein Zaehler: „(0)" sagt, dass nichts da ist.
    renderWithProviders(
      <Disclosure summary="Weitere offene heute" anzahl={0}>
        <p>Leer</p>
      </Disclosure>,
    );
    expect(screen.getByText('Leer').closest('details')!.querySelector('summary')!.textContent).toBe(
      'Weitere offene heute (0)',
    );
  });

  it('wird mit inKarte zu einer weissen Karte mit einer Linie ueber dem Inhalt', () => {
    renderWithProviders(
      <Disclosure summary="Alle Angaben" kopf="label" inKarte>
        <p>Inhalt</p>
      </Disclosure>,
    );
    const details = screen.getByText('Inhalt').closest('details')!;
    expect(klassenVon(details)).toEqual(
      expect.arrayContaining(['group', 'rounded-card', 'border', 'border-line', 'bg-surface']),
    );
    // Der Kopf im Stil eines Abschnittstitels, weiter 44 px Tippziel; mit
    // den 4 px der Karte darüber und darunter sind es die 52 px des Handoffs.
    const kopf = details.querySelector('summary')!;
    expect(klassenVon(kopf)).toEqual(
      expect.arrayContaining(['min-h-11', 'tracking-label', 'text-xs', 'uppercase']),
    );
    expect(klassenVon(details)).toEqual(expect.arrayContaining(['px-4', 'py-1']));
    expect(klassenVon(screen.getByText('Inhalt').parentElement)).toEqual(
      expect.arrayContaining(['border-t', 'border-line', 'pt-3']),
    );
    // Kein Schatten, auch nicht als Karte.
    expect(details.className).not.toMatch(/shadow|ring/);
  });

  it('oeffnet mit offenAb="lg" ab 1024 px von Anfang an, darunter nicht', () => {
    const breit = vi.fn((abfrage: string) => ({ matches: abfrage === '(min-width: 1024px)' }));
    vi.stubGlobal('matchMedia', breit);
    const { unmount } = renderWithProviders(
      <Disclosure summary="Vor der Tür" offenAb="lg">
        <p>Breit</p>
      </Disclosure>,
    );
    expect(breit).toHaveBeenCalledWith('(min-width: 1024px)');
    expect(screen.getByText('Breit').closest('details')).toHaveAttribute('open');
    unmount();

    vi.stubGlobal(
      'matchMedia',
      vi.fn(() => ({ matches: false })),
    );
    renderWithProviders(
      <Disclosure summary="Vor der Tür" offenAb="lg">
        <p>Schmal</p>
      </Disclosure>,
    );
    expect(screen.getByText('Schmal').closest('details')).not.toHaveAttribute('open');
  });

  it('bleibt ohne matchMedia zu und fragt ohne offenAb gar nicht nach der Breite', () => {
    // jsdom kennt kein matchMedia; dort darf nichts werfen.
    renderWithProviders(
      <Disclosure summary="Vor der Tür" offenAb="lg">
        <p>Ohne</p>
      </Disclosure>,
    );
    expect(screen.getByText('Ohne').closest('details')).not.toHaveAttribute('open');

    const abfrage = vi.fn(() => ({ matches: true }));
    vi.stubGlobal('matchMedia', abfrage);
    renderWithProviders(
      <Disclosure summary="Seltenes">
        <p>Zu</p>
      </Disclosure>,
    );
    expect(abfrage).not.toHaveBeenCalled();
    expect(screen.getByText('Zu').closest('details')).not.toHaveAttribute('open');
  });
});

describe('ErrorState und EmptyState', () => {
  it('bietet mit onErneut einen Weg aus dem Fehler (ZST-04, UIK-16)', async () => {
    const user = userEvent.setup();
    const erneut = vi.fn();
    renderWithProviders(
      <ErrorState title="Der Termin konnte nicht geladen werden." onErneut={erneut} />,
    );

    const knopf = screen.getByRole('button', { name: 'Erneut versuchen' });
    // Kompakter Sekundaerknopf wie die Kartenaktionen.
    expect(knopf).toHaveClass('min-h-11', 'border-line-strong');
    await user.click(knopf);
    expect(erneut).toHaveBeenCalledTimes(1);
  });

  it('zeigt waehrend eines langsamen Versuchs, dass er laeuft, und nimmt keinen zweiten an', async () => {
    const user = userEvent.setup();
    let fertig: () => void = () => {};
    const erneut = vi.fn(
      () =>
        new Promise<void>((aufloesen) => {
          fertig = aufloesen;
        }),
    );
    renderWithProviders(<ErrorState title="Nicht geladen." onErneut={erneut} />);

    await user.click(screen.getByRole('button', { name: 'Erneut versuchen' }));
    const laufend = screen.getByRole('button', { name: 'Wird erneut geladen …' });
    expect(laufend).toBeDisabled();
    await user.click(laufend);
    expect(erneut).toHaveBeenCalledTimes(1);

    await act(async () => {
      fertig();
      await Promise.resolve();
    });
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeEnabled();
  });

  it('bleibt ohne onErneut ein reiner Hinweis und erzwingt keine Beschreibung', () => {
    renderWithProviders(<ErrorState title="Die Liste konnte nicht geladen werden." />);
    const kasten = screen.getByRole('alert');
    expect(kasten.textContent).toBe('Die Liste konnte nicht geladen werden.');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('gibt dem leeren Zustand einen Platz fuer den naechsten Schritt', () => {
    renderWithProviders(
      <EmptyState
        title="Noch keine Zahlung erfasst."
        aktion={<ButtonLink to="/abrechnung">Zu den Rechnungen</ButtonLink>}
      />,
    );
    expect(screen.getByText('Noch keine Zahlung erfasst.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zu den Rechnungen' })).toHaveAttribute(
      'href',
      '/abrechnung',
    );
  });
});

describe('Section', () => {
  it('setzt die Ueberschriftenebene, ohne das Aussehen zu aendern', () => {
    renderWithProviders(
      <>
        <Section titel="Kontakt">
          <p>Inhalt</p>
        </Section>
        <Section titel="Positionen" ebene={3} hinweis="Je Heilmittel eine Position.">
          <p>Inhalt</p>
        </Section>
      </>,
    );

    expect(screen.getByRole('heading', { level: 2, name: 'Kontakt' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Positionen' })).toBeInTheDocument();
    expect(screen.getByText('Je Heilmittel eine Position.')).toBeInTheDocument();
  });

  it('nimmt eine Aktion neben der Ueberschrift auf', () => {
    renderWithProviders(
      <Section titel="Verordnungen" aktion={<ButtonLink to="/x">Erfassen</ButtonLink>}>
        <p>Inhalt</p>
      </Section>,
    );
    expect(screen.getByRole('link', { name: 'Erfassen' })).toBeInTheDocument();
  });

  it('stapelt Felder in der Feldgruppe', () => {
    const { container } = renderWithProviders(
      <Feldgruppe>
        <input aria-label="a" />
      </Feldgruppe>,
    );
    expect(container.querySelector('.flex-col')).not.toBeNull();
  });
});

describe('DetailList', () => {
  it('liest Bezeichnung und Wert als Definitionsliste zusammen', () => {
    renderWithProviders(
      <DetailList>
        <DetailRow label="Mobil">
          <a href="tel:+491600000005">+49 160 0000005</a>
        </DetailRow>
      </DetailList>,
    );

    expect(screen.getByText('Mobil').tagName).toBe('DT');
    expect(screen.getByRole('link', { name: '+49 160 0000005' })).toBeInTheDocument();
  });

  it('laesst einen langen Wert umbrechen, statt die Karte zu sprengen (BEF-005, PAT-B01)', () => {
    // Ab sm ist die Zeile ein Flex-Row; ohne min-w-0 waere der Wert so breit
    // wie sein laengstes Wort. Die Wirkung selbst misst die Aufnahme der
    // Stammdaten bei 1024 px - jsdom kennt kein Layout.
    renderWithProviders(
      <DetailList>
        <DetailRow label="E-Mail">carl-friedrich.mueller-luedenscheidt@beispiel.invalid</DetailRow>
      </DetailList>,
    );
    const wert = screen.getByText('carl-friedrich.mueller-luedenscheidt@beispiel.invalid');
    expect(wert.tagName).toBe('DD');
    expect(wert).toHaveClass('min-w-0', 'wrap-anywhere', 'whitespace-pre-line');
  });
});

describe('RoleBadge', () => {
  it('ist ein Badge im Ton akzent, ohne Statuszeichen (UIK-18)', () => {
    renderWithProviders(<RoleBadge role="therapist" />);
    const etikett = screen.getByText('Therapeut:in');
    expect(etikett).toHaveClass('bg-accent-soft', 'text-accent', 'rounded-pill', 'shrink-0');
    expect(etikett.textContent).toBe('Therapeut:in');
  });
});

describe('SubNav', () => {
  const abrechnung: SubNavEintrag[] = [
    {
      to: '/abrechnung',
      label: 'Rechnungen',
      pfade: ['/abrechnung/rechnungen', '/abrechnung/erinnerungen'],
    },
    { to: '/abrechnung/leistungen', label: 'Leistungen' },
    { to: '/abrechnung/katalog', label: 'Katalog' },
    { to: '/abrechnung/stammdaten', label: 'Praxisstammdaten' },
    { to: '/abrechnung/zahlungen', label: 'Zahlungen' },
    { to: '/abrechnung/auswertung', label: 'Auswertung' },
  ];

  it('markiert einen Eintrag auch unter seinen weiteren Pfaden (NAV-15)', () => {
    renderWithProviders(
      <SubNav eintraege={abrechnung} label="Bereich Abrechnung" />,
      '/abrechnung/rechnungen/8d2c278b',
    );
    expect(screen.getByRole('link', { name: 'Rechnungen' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Zahlungen' })).not.toHaveAttribute('aria-current');
  });

  it('bleibt ohne weitere Pfade beim genauen Pfad, mit end: false auch darunter', () => {
    const { unmount } = renderWithProviders(
      <SubNav eintraege={abrechnung} label="Bereich Abrechnung" />,
      '/abrechnung/leistungen',
    );
    // „Rechnungen" zeigt auf /abrechnung und leuchtet nicht im ganzen Bereich.
    expect(screen.getByRole('link', { name: 'Rechnungen' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Leistungen' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    unmount();

    renderWithProviders(
      <SubNav
        eintraege={[
          { to: '/patienten', label: 'Patient:innen', end: false },
          { to: '/verordner', label: 'Verordner:innen' },
        ]}
        label="Bereich Patient:innen"
      />,
      '/patienten/66666666-6666-4666-8666-000000000001/stammdaten',
    );
    expect(screen.getByRole('link', { name: 'Patient:innen' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  /**
   * jsdom kennt kein Layout. Die Leiste bekommt deshalb eine Geometrie
   * untergeschoben: 300 px sichtbar, jeder Eintrag 120 px breit, und die Lage
   * eines Eintrags verschiebt sich mit dem `scrollLeft` der Liste - wie im
   * Browser.
   */
  function geometrie() {
    const breite = 300;
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockImplementation(function (this: Element) {
      return this.tagName === 'UL' ? abrechnung.length * 120 : 0;
    });
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockImplementation(function (this: Element) {
      return this.tagName === 'UL' ? breite : 0;
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      const rechteck = (left: number, width: number) =>
        ({ left, right: left + width, width, top: 0, bottom: 44, height: 44 }) as DOMRect;
      if (this.tagName === 'UL') return rechteck(0, breite);
      const liste = this.closest('ul');
      const index = abrechnung.findIndex((eintrag) => eintrag.label === this.textContent);
      return rechteck(index * 120 - (liste?.scrollLeft ?? 0), 120);
    });
  }

  it('rollt den aktiven Eintrag waagerecht ins Bild, ohne die Seite zu rollen (UIK-10)', () => {
    geometrie();
    const seiteRollen = vi.spyOn(Element.prototype, 'scrollIntoView');
    renderWithProviders(
      <SubNav eintraege={abrechnung} label="Bereich Abrechnung" />,
      '/abrechnung/zahlungen',
    );

    // „Zahlungen" liegt bei 480-600 px, sichtbar sind 300: Die Liste rollt so
    // weit, dass der Eintrag ganz und 24 px vom Nachbarn zu sehen sind.
    expect(screen.getByRole('list').scrollLeft).toBe(600 + 24 - 300);
    expect(seiteRollen).not.toHaveBeenCalled();
  });

  it('rollt bei jedem Pfadwechsel nach, in beide Richtungen', async () => {
    geometrie();
    const user = userEvent.setup();
    // Einfacher Router wie beim ButtonLink: Die Navigation des Data Routers
    // baut unter Node 24 mit jsdom keinen `Request`.
    render(
      <MemoryRouter initialEntries={['/abrechnung']}>
        <SubNav eintraege={abrechnung} label="Bereich Abrechnung" />
      </MemoryRouter>,
    );
    const liste = screen.getByRole('list');
    // Der erste Eintrag ist schon zu sehen - nichts zu rollen.
    expect(liste.scrollLeft).toBe(0);

    await user.click(screen.getByRole('link', { name: 'Auswertung' }));
    expect(liste.scrollLeft).toBe(720 + 24 - 300);

    await user.click(screen.getByRole('link', { name: 'Rechnungen' }));
    expect(liste.scrollLeft).toBe(0);
  });

  it('laesst die Leiste stehen, wo sie umbricht und alles zu sehen ist', () => {
    // Ab 640 px bricht die Leiste um: Inhalt und Fenster sind gleich breit.
    vi.spyOn(Element.prototype, 'scrollWidth', 'get').mockReturnValue(300);
    vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(300);
    renderWithProviders(
      <SubNav eintraege={abrechnung} label="Bereich Abrechnung" />,
      '/abrechnung/auswertung',
    );
    expect(screen.getByRole('list').scrollLeft).toBe(0);
  });
});

describe('SearchCombobox', () => {
  const treffer: Suchtreffer[] = Array.from({ length: 10 }, (_, index) => ({
    id: `p${index}`,
    bezeichnung: `Person ${index + 1}`,
    zusatz: `geboren 0${(index % 9) + 1}.01.1960`,
  }));

  function Suche(props: { treffer?: Suchtreffer[]; zustand?: string; labelSichtbar?: boolean }) {
    return (
      <main>
        <h1>Termin anlegen</h1>
        <SearchCombobox
          label="Patient:in suchen"
          wert="Pe"
          onChange={() => {}}
          treffer={props.treffer ?? []}
          zustand={props.zustand}
          onAuswahl={() => {}}
          labelSichtbar={props.labelSichtbar ?? false}
        />
        <button type="button">Weiter</button>
      </main>
    );
  }

  it('verweist mit aria-controls nur auf eine Liste, die es gibt (UIK-08)', async () => {
    const user = userEvent.setup();
    const { container } = renderWithProviders(<Suche zustand="Mindestens 3 Zeichen." />);
    const feld = screen.getByRole('combobox', { name: 'Patient:in suchen' });

    await user.click(feld);
    expect(screen.getByRole('status')).toHaveTextContent('Mindestens 3 Zeichen.');
    // Keine Liste, also kein Verweis darauf - und nicht „aufgeklappt": Ein
    // aufgeklapptes Suchfeld ohne aria-controls wäre der naechste Befund.
    expect(feld).not.toHaveAttribute('aria-controls');
    expect(feld).toHaveAttribute('aria-expanded', 'false');
    // Genau der Zustand, den axe in der laufenden Anwendung bemängelte.
    await pruefeBarrierefreiheit(container);
  });

  it('verweist mit Treffern auf die Liste', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Suche treffer={treffer} />);
    const feld = screen.getByRole('combobox', { name: 'Patient:in suchen' });

    await user.click(feld);
    expect(feld).toHaveAttribute('aria-controls', screen.getByRole('listbox').id);
    expect(feld).toHaveAttribute('aria-expanded', 'true');
  });

  it('schliesst die Liste, wenn der Fokus die Suche verlaesst', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Suche treffer={treffer} />);

    await user.click(screen.getByRole('combobox', { name: 'Patient:in suchen' }));
    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Weiter' })).toHaveFocus();
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('laesst die Liste offen, wenn in sie getippt wird', async () => {
    const user = userEvent.setup();
    renderWithProviders(<Suche zustand="Kein Treffer." />);
    const feld = screen.getByRole('combobox', { name: 'Patient:in suchen' });

    await user.click(feld);
    await user.click(screen.getByRole('status'));
    expect(feld).toHaveFocus();
    expect(screen.getByRole('status')).toHaveTextContent('Kein Treffer.');
  });

  it('rollt den mit den Pfeiltasten gewaehlten Treffer mit ins Bild', async () => {
    const user = userEvent.setup();
    const gerollt: string[] = [];
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (
      this: Element,
      wie?: boolean | ScrollIntoViewOptions,
    ) {
      gerollt.push(`${this.textContent?.slice(0, 8)} ${JSON.stringify(wie)}`);
    });
    renderWithProviders(<Suche treffer={treffer} />);

    await user.click(screen.getByRole('combobox', { name: 'Patient:in suchen' }));
    await user.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(gerollt.at(-1)).toBe('Person 3 {"block":"nearest"}');
    expect(screen.getByRole('option', { name: /Person 3/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('zeigt eine sichtbare Beschriftung wie ein Feld (UIK-22)', () => {
    renderWithProviders(<Suche labelSichtbar />);
    const beschriftung = screen.getByText('Patient:in suchen');
    expect(beschriftung.tagName).toBe('LABEL');
    expect(beschriftung).toHaveClass('text-ink', 'text-sm', 'font-medium');
    expect(beschriftung).not.toHaveClass('text-ink-muted');
  });
});

describe('SearchField', () => {
  it('hat immer eine Beschriftung, nicht nur einen Platzhalter', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<SearchField placeholder="Name, Ort" value="" onChange={onChange} />);

    const feld = screen.getByLabelText('Suche');
    expect(feld).toHaveAttribute('type', 'search');
    expect(feld).toHaveAttribute('placeholder', 'Name, Ort');

    await user.type(feld, 'M');
    expect(onChange).toHaveBeenCalledWith('M');
  });
});

describe('Rueckfrage', () => {
  function aufbau(rest: Partial<React.ComponentProps<typeof Rueckfrage>> = {}) {
    const onBestaetigen = vi.fn();
    renderWithProviders(
      <Rueckfrage
        ausloeser="Verordnung löschen"
        bestaetigen="Ja, Verordnung löschen"
        abbrechen="Nicht löschen"
        onBestaetigen={onBestaetigen}
        {...rest}
      >
        Die Verordnung wird endgültig entfernt.
      </Rueckfrage>,
    );
    return { onBestaetigen };
  }

  it('zeigt zuerst nur die ausloesende Schaltflaeche', () => {
    aufbau();
    expect(screen.getByRole('button', { name: 'Verordnung löschen' })).toBeInTheDocument();
    expect(screen.queryByText('Die Verordnung wird endgültig entfernt.')).not.toBeInTheDocument();
  });

  it('schreibt erst nach der Rueckfrage', async () => {
    const user = userEvent.setup();
    const { onBestaetigen } = aufbau();

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    expect(onBestaetigen).not.toHaveBeenCalled();
    expect(screen.getByText('Die Verordnung wird endgültig entfernt.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Ja, Verordnung löschen' }));
    expect(onBestaetigen).toHaveBeenCalledTimes(1);
  });

  it('fuehrt den Fokus in die Rueckfrage und wieder zurueck', async () => {
    const user = userEvent.setup();
    aufbau();

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ja, Verordnung löschen' })).toHaveFocus(),
    );

    await user.click(screen.getByRole('button', { name: 'Nicht löschen' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Verordnung löschen' })).toHaveFocus(),
    );
  });

  it('benennt den Kasten fuer Vorlesesoftware', async () => {
    const user = userEvent.setup();
    aufbau({ bezeichnung: 'Verordnung endgültig löschen' });

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    expect(screen.getByRole('group', { name: 'Verordnung endgültig löschen' })).toBeInTheDocument();
  });

  it('meldet einen Fehler so, dass er vorgelesen wird', async () => {
    const user = userEvent.setup();
    aufbau({ fehler: 'Die Verordnung konnte nicht gelöscht werden.' });

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Die Verordnung konnte nicht gelöscht werden.',
    );
  });

  it('schliesst sich nach einem erfolgreichen Vorgang', async () => {
    const user = userEvent.setup();
    const { onBestaetigen } = aufbau();
    onBestaetigen.mockResolvedValue(undefined);

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, Verordnung löschen' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Verordnung löschen' })).toBeInTheDocument(),
    );
  });

  it('bleibt nach einem gescheiterten Vorgang offen', async () => {
    const user = userEvent.setup();
    const { onBestaetigen } = aufbau();
    onBestaetigen.mockRejectedValue(new Error('kaputt'));

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, Verordnung löschen' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ja, Verordnung löschen' })).toBeInTheDocument(),
    );
  });

  it('loest bei doppeltem Klick nur einen Vorgang aus', async () => {
    const user = userEvent.setup();
    const { onBestaetigen } = aufbau();
    let aufloesen: () => void = () => {};
    onBestaetigen.mockReturnValue(
      new Promise<void>((resolve) => {
        aufloesen = resolve;
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    const knopf = screen.getByRole('button', { name: 'Ja, Verordnung löschen' });
    await user.click(knopf);
    await user.click(knopf);

    expect(onBestaetigen).toHaveBeenCalledTimes(1);
    aufloesen();
  });

  it('sperrt die Schaltflaeche, solange der Vorgang laeuft', async () => {
    const user = userEvent.setup();
    aufbau({ laeuft: true, bestaetigenLaeuft: 'Wird gelöscht …' });

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    expect(screen.getByRole('button', { name: 'Wird gelöscht …' })).toBeDisabled();
  });

  /**
   * ABR-03, ZST-06: `() => x.mutateAsync()` statt `() => x.mutate()`. Der
   * Kasten wartet dann selbst - die Seite muss `laeuft` nicht durchreichen.
   */
  it('wartet auf ein Versprechen, zeigt so lange „laeuft" und schliesst erst danach', async () => {
    const user = userEvent.setup();
    const { onBestaetigen } = aufbau({ bestaetigenLaeuft: 'Wird gelöscht …' });
    let fertig: () => void = () => {};
    onBestaetigen.mockReturnValue(
      new Promise<void>((aufloesen) => {
        fertig = aufloesen;
      }),
    );

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, Verordnung löschen' }));
    expect(screen.getByRole('button', { name: 'Wird gelöscht …' })).toBeDisabled();
    expect(screen.getByRole('group', { name: 'Verordnung löschen' })).toBeInTheDocument();
    // Abbrechen bräche nichts ab – der Aufruf läuft am Server weiter
    // (Zweitreview H2). Bis zur Antwort ist der Knopf deshalb gesperrt.
    expect(screen.getByRole('button', { name: 'Nicht löschen' })).toBeDisabled();

    await act(async () => {
      fertig();
      await Promise.resolve();
    });
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Verordnung löschen' })).toBeInTheDocument();
  });

  it('bleibt bei einem verworfenen Versprechen offen und nennt den Fehler ohne Technik', async () => {
    const user = userEvent.setup();
    const { onBestaetigen } = aufbau();
    onBestaetigen.mockRejectedValue(new Error('price list has no items'));

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, Verordnung löschen' }));

    const meldung = await screen.findByRole('alert');
    expect(meldung).toHaveTextContent('Das hat nicht geklappt.');
    expect(meldung).not.toHaveTextContent('has no items');
    // Noch einmal versuchen geht: Die Schaltflaeche ist wieder frei.
    expect(screen.getByRole('button', { name: 'Ja, Verordnung löschen' })).toBeEnabled();
  });

  it('nennt statt des Standardsatzes den Fehler der Seite', async () => {
    const user = userEvent.setup();
    const { onBestaetigen } = aufbau({ fehler: 'Die Verordnung konnte nicht gelöscht werden.' });
    onBestaetigen.mockRejectedValue(new Error('kaputt'));

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, Verordnung löschen' }));

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ja, Verordnung löschen' })).toBeEnabled(),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Die Verordnung konnte nicht gelöscht werden.',
    );
    expect(screen.getByRole('alert')).not.toHaveTextContent('Das hat nicht geklappt.');
  });

  it('schliesst bei einem synchronen Aufruf wie bisher sofort', async () => {
    const user = userEvent.setup();
    const { onBestaetigen } = aufbau({ bestaetigenLaeuft: 'Wird gelöscht …' });

    await user.click(screen.getByRole('button', { name: 'Verordnung löschen' }));
    await user.click(screen.getByRole('button', { name: 'Ja, Verordnung löschen' }));

    expect(onBestaetigen).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('group')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wird gelöscht …' })).not.toBeInTheDocument();
  });
});

/**
 * Die Bausteine aus dem Design-Handoff vom 2026-10-01 (Abschnitte 3 und 5a,
 * `docs/design/handoff-2026-10-01-uebersicht-termin-akte.md`). Die Namen im
 * Handoff sind deutsch; im Code heißen neue Bausteine englisch
 * (`docs/DEVELOPMENT.md`, „Benennung im Code"): Wegbalken = `TravelBar`,
 * Zeile = `ListRow`, Statuszeichen = `StatusMark`, Fortschrittspunkte =
 * `ProgressDots`, Jetzt-Marke = `NowMarker`. Kachel und Aufklapper sind die
 * erweiterten `Tile` und `Disclosure`.
 */
describe('Wegbalken (TravelBar)', () => {
  it('stuft nach dem Puffer ein: bis 0 zu spaet, bis 3 und unter 5 knapp, ab 5 frei', () => {
    expect([-4, 0].map(travelLevel)).toEqual(['late', 'late']);
    expect([1, 3].map(travelLevel)).toEqual(['tight', 'tight']);
    expect(travelLevel(4)).toBe('narrow');
    expect([5, 28].map(travelLevel)).toEqual(['clear', 'clear']);
  });

  it('rechnet eingeplante Zeit, Puffer, spaeteste Abfahrt und den Anteil der Fahrt', () => {
    expect(travelPlan('08:30', '09:10', 12)).toEqual({
      geplantMin: 40,
      pufferMin: 28,
      abfahrt: '08:58',
      anteil: 30,
      stufe: 'clear',
    });
    // Reicht die Zeit nicht, ist der Puffer negativ und die Fahrt füllt die Spur.
    expect(travelPlan('12:00', '12:08', 12)).toEqual({
      geplantMin: 8,
      pufferMin: -4,
      abfahrt: '11:56',
      anteil: 100,
      stufe: 'late',
    });
    expect(travelPlan('10:10', '10:26', 12)).toMatchObject({ pufferMin: 4, stufe: 'narrow' });
    expect(travelPlan('11:00', '11:15', 12)).toMatchObject({ pufferMin: 3, stufe: 'tight' });
  });

  it('behauptet ohne Zeitfenster keine Zahl, sondern gilt als zu spaet', () => {
    // Termine ohne Abstand, ein Ziel vor dem Start, eine Angabe, die keine
    // Uhrzeit ist: nichts eingeplant, die Fahrt füllt die Spur.
    for (const [von, bis] of [
      ['10:00', '10:00'],
      ['10:30', '10:00'],
      ['—', '09:00'],
    ] as const) {
      expect(travelPlan(von, bis, 5)).toMatchObject({ geplantMin: 0, anteil: 100, stufe: 'late' });
    }
    // Eine Abfahrt vor Mitternacht gibt es nicht.
    expect(travelPlan('00:00', '00:05', 20).abfahrt).toBe('00:00');
    // Ohne lesbares Ziel bleibt die Angabe stehen, wie sie kam.
    expect(travelPlan('09:00', 'offen', 5).abfahrt).toBe('offen');
  });

  it('nennt den Puffer als Zahl und sagt, wenn er fehlt', () => {
    expect(pufferText(28)).toBe('28 min Puffer');
    expect(pufferText(0)).toBe('0 min Puffer');
    expect(pufferText(-4)).toBe('4 min zu knapp');
  });

  it('zeigt die grosse Fassung mit Kopf, beiden Enden und dreispaltiger Legende', async () => {
    const { container } = renderWithProviders(
      <TravelBar
        von={{ zeit: '08:30', label: 'Ende Erika Beispiel' }}
        bis={{ zeit: '09:10', label: 'Max Mustermann' }}
        fahrtMin={12}
      />,
    );
    const karte = screen.getByRole('region', { name: 'Nächster Weg' });
    expect(klassenVon(karte)).toEqual(
      expect.arrayContaining(['rounded-card', 'border', 'border-line', 'bg-surface']),
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Nächster Weg' })).toBeInTheDocument();

    // Kopf: leise, ohne Zeichen, die Abfahrt fett und tabellarisch.
    const kopf = screen.getByText('Abfahrt spätestens').parentElement!;
    expect(kopf.textContent).toBe('Abfahrt spätestens 08:58');
    expect(klassenVon(kopf)).toContain('text-ink-muted');
    expect(klassenVon(screen.getByText('08:58'))).toEqual(
      expect.arrayContaining(['font-bold', 'tabular-nums']),
    );

    expect(screen.getByText('08:30')).toBeInTheDocument();
    expect(screen.getByText('Ende Erika Beispiel')).toBeInTheDocument();
    expect(screen.getByText('09:10')).toBeInTheDocument();
    expect(screen.getByText('Max Mustermann')).toBeInTheDocument();

    // Legende: Puffer in seiner Farbe, Fahrt in Tinte, Summe leise.
    expect(klassenVon(screen.getByText('28 min Puffer'))).toEqual(
      expect.arrayContaining(['text-accent', 'font-semibold']),
    );
    expect(klassenVon(screen.getByText('≈ 12 min Rad'))).toEqual(
      expect.arrayContaining(['text-ink', 'font-semibold']),
    );
    expect(screen.getByText('40 min eingeplant')).toBeInTheDocument();

    // Der Balken: Spur in der Pufferfarbe, die Fahrt mittig darauf mit ihrem
    // Anteil als Breite - und für Vorlesesoftware ausgeblendet.
    const fahrt = karte.querySelector<HTMLElement>('[style]')!;
    expect(fahrt.style.width).toBe('30%');
    expect(klassenVon(fahrt)).toEqual(
      expect.arrayContaining(['bg-accent', 'left-1/2', '-translate-x-1/2', 'rounded-pill']),
    );
    expect(klassenVon(fahrt.previousElementSibling)).toContain('bg-accent-soft');
    expect(fahrt.parentElement).toHaveAttribute('aria-hidden', 'true');
    // Keine Marker, keine Kreise, keine Bewegung, kein Schatten.
    expect(fahrt.parentElement!.children).toHaveLength(2);
    expect(karte.innerHTML).not.toMatch(/transition|animate|shadow|ring-/);

    await pruefeBarrierefreiheit(container);
  });

  it('sagt die Stufe als Wort: knapp in Orange, zu spaet in Rot ohne Uhrzeit', () => {
    const { unmount } = renderWithProviders(
      <TravelBar
        von={{ zeit: '11:00', label: 'Ende Berta Bestand' }}
        bis={{ zeit: '11:15', label: 'Carl Muster' }}
        fahrtMin={12}
      />,
    );
    let kopf = screen.getByText('Knapp, Abfahrt spätestens').parentElement!;
    expect(kopf.textContent).toBe('! Knapp, Abfahrt spätestens 11:03');
    expect(klassenVon(kopf)).toContain('text-warnung');
    // Das Zeichen ist Schmuck; die Bedeutung trägt das Wort.
    expect(kopf.querySelector('[aria-hidden="true"]')?.textContent).toBe('! ');
    expect(klassenVon(screen.getByText('3 min Puffer'))).toContain('text-warnung');
    let fahrt = screen.getByRole('region').querySelector<HTMLElement>('[style]')!;
    expect(klassenVon(fahrt)).toContain('bg-warnung');
    expect(klassenVon(fahrt.previousElementSibling)).toContain('bg-warnung-soft');
    unmount();

    renderWithProviders(
      <TravelBar
        von={{ zeit: '12:00', label: 'Ende Carl Muster' }}
        bis={{ zeit: '12:08', label: 'Dora Probe' }}
        fahrtMin={12}
      />,
    );
    kopf = screen.getByText('Zu spät, Abfahrt sofort').parentElement!;
    expect(kopf.textContent).toBe('! Zu spät, Abfahrt sofort');
    expect(klassenVon(kopf)).toContain('text-danger');
    // „Sofort" ist die Angabe - eine Abfahrtszeit in der Vergangenheit nicht.
    expect(screen.queryByText(/11:56/)).toBeNull();
    expect(klassenVon(screen.getByText('4 min zu knapp'))).toContain('text-danger');
    expect(screen.getByText('8 min eingeplant')).toBeInTheDocument();
    fahrt = screen.getByRole('region').querySelector<HTMLElement>('[style]')!;
    expect(fahrt.style.width).toBe('100%');
    expect(klassenVon(fahrt)).toContain('bg-danger');
    expect(klassenVon(fahrt.previousElementSibling)).toContain('bg-danger-soft');
  });

  it('nimmt das hellere Orange nur als Flaeche, nie als Textfarbe', () => {
    renderWithProviders(
      <TravelBar
        von={{ zeit: '10:10', label: 'Ende Max Mustermann' }}
        bis={{ zeit: '10:26', label: 'Berta Bestand' }}
        fahrtMin={12}
      />,
    );
    const karte = screen.getByRole('region');
    expect(klassenVon(karte.querySelector('[style]'))).toContain('bg-warnung-mittel');
    expect(karte.innerHTML).not.toContain('text-warnung-mittel');
    expect(klassenVon(screen.getByText('4 min Puffer'))).toContain('text-warnung');
    expect(screen.getByText('Knapp, Abfahrt spätestens').parentElement!.textContent).toBe(
      '! Knapp, Abfahrt spätestens 10:14',
    );
  });

  it('nimmt Titel und Ebene von der Seite und rundet die Fahrzeit', () => {
    renderWithProviders(
      <TravelBar
        titel="Nächster Weg danach"
        ebene={3}
        von={{ zeit: '10:10', label: 'Ende Max Mustermann' }}
        bis={{ zeit: '11:00', label: 'Berta Bestand' }}
        fahrtMin={11.6}
      />,
    );
    expect(
      screen.getByRole('heading', { level: 3, name: 'Nächster Weg danach' }),
    ).toBeInTheDocument();
    expect(screen.getByText('≈ 12 min Rad')).toBeInTheDocument();
    expect(screen.getByText('38 min Puffer')).toBeInTheDocument();
  });

  it('zeigt klein nur den schmalen Balken und eine Zeile in der Stufenfarbe', () => {
    const { container, unmount } = renderWithProviders(
      <TravelBar
        size="klein"
        von={{ zeit: '09:30', label: '' }}
        bis={{ zeit: '10:00', label: '' }}
        fahrtMin={9}
      />,
    );
    expect(screen.queryByRole('region')).toBeNull();
    expect(screen.queryByRole('heading')).toBeNull();
    const zeile = screen.getByText(/min Rad/);
    expect(zeile.textContent).toBe('≈ 9 min Rad · 21 min Puffer');
    expect(klassenVon(zeile)).toEqual(
      expect.arrayContaining(['text-xs', 'font-semibold', 'text-accent']),
    );
    // Uhrzeiten und Namen stehen im Zeitstrahl daneben, nicht noch einmal hier.
    expect(container.textContent).not.toMatch(/09:30|10:00/);
    const fahrt = container.querySelector<HTMLElement>('[style]')!;
    expect(fahrt.style.width).toBe('30%');
    // Spur 4 px, Fahrt 6 px.
    expect(klassenVon(fahrt)).toEqual(expect.arrayContaining(['h-1.5', 'bg-accent']));
    expect(klassenVon(fahrt.previousElementSibling)).toEqual(
      expect.arrayContaining(['h-1', 'bg-accent-soft']),
    );
    expect(fahrt.parentElement).toHaveAttribute('aria-hidden', 'true');
    unmount();

    renderWithProviders(
      <TravelBar
        size="klein"
        von={{ zeit: '12:15', label: '' }}
        bis={{ zeit: '12:30', label: '' }}
        fahrtMin={19}
      />,
    );
    const knapp = screen.getByText(/min Rad/);
    expect(knapp.textContent).toBe('! ≈ 19 min Rad · 4 min zu knapp');
    expect(klassenVon(knapp)).toContain('text-danger');
    expect(knapp.querySelector('[aria-hidden="true"]')?.textContent).toBe('! ');
  });
});

describe('Kachel (Tile)', () => {
  it('traegt Beschriftung, Wert, Nebenzeile und Handlung in den Massen des Handoffs', async () => {
    const { container } = renderWithProviders(
      <TileGrid spalte="kachel">
        <Tile
          label="Anschrift"
          zusatz="72070 Tuebingen"
          aktion={
            <Textlink alleinstehend to="/navigation">
              Navigation starten
            </Textlink>
          }
        >
          Beispielstrasse 12
        </Tile>
      </TileGrid>,
    );
    const beschriftung = screen.getByText('Anschrift');
    expect(beschriftung.tagName).toBe('DT');
    expect(klassenVon(beschriftung)).toEqual(
      expect.arrayContaining(['text-xs', 'font-semibold', 'uppercase', 'tracking-label']),
    );
    // Radius 14, innen 12/14 aus den Tokens, mindestens 72 px hoch.
    const kachel = beschriftung.parentElement!;
    expect(klassenVon(kachel)).toEqual(
      expect.arrayContaining(['rounded-card', 'px-kachel-x', 'py-kachel-y', 'min-h-18', 'border']),
    );
    // Der Wert folgt der Beschriftung direkt - so finden ihn auch die Seiten.
    const wert = beschriftung.nextElementSibling!;
    expect(wert.tagName).toBe('DD');
    expect(wert).toHaveTextContent('Beispielstrasse 12');
    expect(klassenVon(wert)).toEqual(
      expect.arrayContaining(['text-base', 'font-semibold', 'leading-[1.3]', 'text-ink']),
    );
    const zusatz = screen.getByText('72070 Tuebingen');
    expect(zusatz.tagName).toBe('DD');
    expect(klassenVon(zusatz)).toEqual(expect.arrayContaining(['text-sm', 'text-ink-muted']));
    const handlung = screen.getByRole('link', { name: 'Navigation starten' });
    expect(handlung.closest('dd')).not.toBeNull();
    expect(klassenVon(handlung)).toContain('min-h-11');
    expect(kachel.className).not.toMatch(/shadow|ring/);

    await pruefeBarrierefreiheit(container);
  });

  it('legt die neutrale Kachel mit Linie auf den Seitengrund, die uebrigen ohne Rahmen auf ihre Flaeche', () => {
    renderWithProviders(
      <TileGrid>
        <Tile label="Wann">Do 01.10.2026</Tile>
        <Tile label="Grundlage" ton="akzent" zusatz="gedeckt">
          Termin 2 von 6
        </Tile>
        <Tile label="Erstaufnahme offen" ton="warnung" zusatz="Einwilligung fehlt">
          2 Angaben fehlen
        </Tile>
        <Tile label="Absage" ton="kritisch">
          Absage durch die Praxis
        </Tile>
      </TileGrid>,
    );
    const flaeche = (label: string) => klassenVon(screen.getByText(label).parentElement);
    expect(flaeche('Wann')).toEqual(expect.arrayContaining(['bg-canvas', 'border-line']));
    expect(flaeche('Grundlage')).toEqual(
      expect.arrayContaining(['bg-accent-soft', 'border-transparent']),
    );
    expect(flaeche('Erstaufnahme offen')).toEqual(
      expect.arrayContaining(['bg-warnung-soft', 'border-transparent']),
    );
    expect(flaeche('Absage')).toEqual(
      expect.arrayContaining(['bg-danger-soft', 'border-transparent']),
    );

    // Beschriftung und Nebenzeile im Ton der Kachel.
    expect(klassenVon(screen.getByText('Grundlage'))).toContain('text-accent');
    expect(klassenVon(screen.getByText('gedeckt'))).toContain('text-accent');
    expect(klassenVon(screen.getByText('Einwilligung fehlt'))).toContain('text-warnung');

    // Ein Zustand trägt sein Zeichen vor der Beschriftung, ausgeblendet für
    // Vorlesesoftware; neutral und Akzent sind kein Zustand.
    const warnung = screen.getByText('Erstaufnahme offen');
    expect(warnung.textContent).toBe('! Erstaufnahme offen');
    expect(warnung.querySelector('[aria-hidden="true"]')?.textContent).toBe('! ');
    expect(screen.getByText('Absage').textContent).toBe('× Absage');
    expect(screen.getByText('Wann').textContent).toBe('Wann');
    expect(screen.getByText('Grundlage').textContent).toBe('Grundlage');
  });

  it('kommt ohne Nebenzeile und Handlung mit Beschriftung und Wert aus', () => {
    renderWithProviders(
      <TileGrid>
        <Tile label="Wann">Do 01.10.2026</Tile>
      </TileGrid>,
    );
    const kachel = screen.getByText('Wann').parentElement!;
    expect(kachel.querySelectorAll('dd')).toHaveLength(1);
  });

  it('haelt Zeilen im Wert einer Kachel im normalen Gewicht', () => {
    renderWithProviders(
      <TileGrid>
        <Tile label="Absage" ton="kritisch">
          <TileRows>
            <TileRow label="Absagegrund">Wunsch der Patient:in</TileRow>
          </TileRows>
        </Tile>
      </TileGrid>,
    );
    // Die Zeile steht im Wert (600) und erbte ihn sonst.
    expect(klassenVon(screen.getByText('Absagegrund').parentElement)).toContain('font-normal');
  });

  it('bricht die Reihe nach der gewaehlten Mindestbreite um', () => {
    const reihe = (spalte?: 'breit' | 'kachel' | 'akte') => {
      const { container, unmount } = renderWithProviders(
        <TileGrid {...(spalte ? { spalte } : {})}>
          <Tile label="Wann">Do</Tile>
        </TileGrid>,
      );
      const klassen = container.querySelector('dl')!.className;
      unmount();
      return klassen;
    };
    // Ohne Angabe die Reihe aus UX-005a: am Telefon eine Spalte.
    expect(reihe()).toContain('17rem');
    expect(reihe()).toContain('gap-3');
    expect(reihe('breit')).toBe(reihe());
    // Die Reihen des Handoffs teilen sich die Breite, mit 8 px Abstand.
    expect(reihe('kachel')).toMatch(/auto-fit,minmax\(min\(100%,150px\),1fr\)/);
    expect(reihe('kachel')).toContain('gap-2');
    expect(reihe('akte')).toMatch(/auto-fit,minmax\(min\(100%,160px\),1fr\)/);
  });
});

describe('Zeile (ListRow)', () => {
  it('ist mit `to` als ganze Zeile ein Link von 56 px', async () => {
    const { container } = renderWithProviders(
      <ListRows>
        <ListRow
          zeit="10:00"
          titel="Max Mustermann"
          meta="Beispielstrasse 12 · Anfahrt ≈ 9 min"
          status={<Badge ton="positiv">Dokumentiert</Badge>}
          to="/termine/1"
        />
      </ListRows>,
    );
    const liste = screen.getByRole('list');
    expect(klassenVon(liste)).toEqual(
      expect.arrayContaining(['rounded-card', 'border', 'border-line', 'bg-surface', 'px-4']),
    );
    const link = screen.getByRole('link');
    expect(link).toHaveAttribute('href', '/termine/1');
    // Zeit, Titel, Nebenzeile und Status gehören alle zum einen Ziel.
    expect(link).toHaveTextContent('10:00');
    expect(link).toHaveTextContent('Max Mustermann');
    expect(link).toHaveTextContent('Beispielstrasse 12 · Anfahrt ≈ 9 min');
    expect(link).toHaveTextContent('Dokumentiert');
    expect(klassenVon(link)).toEqual(
      expect.arrayContaining(['grid', 'min-h-14', 'py-2', 'hover:bg-surface-sunken']),
    );
    // Über den Innenabstand der Karte hinaus, der Fokusrahmen innen.
    expect(klassenVon(link)).toEqual(
      expect.arrayContaining(['-mx-4', 'px-4', 'focus-visible:-outline-offset-2']),
    );
    expect(klassenVon(screen.getByText('10:00'))).toEqual(
      expect.arrayContaining(['text-liste', 'font-semibold', 'tabular-nums', 'text-ink']),
    );
    expect(klassenVon(screen.getByText('Max Mustermann'))).toEqual(
      expect.arrayContaining(['text-base', 'font-semibold', 'text-ink']),
    );
    expect(klassenVon(screen.getByText('Beispielstrasse 12 · Anfahrt ≈ 9 min'))).toEqual(
      expect.arrayContaining(['text-sm', 'text-ink-muted']),
    );

    await pruefeBarrierefreiheit(container);
  });

  it('ist mit onClick ein Knopf, der kein Formular abschickt', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    renderWithProviders(
      <ListRows>
        <ListRow zeit="11:15" titel="Berta Bestand" onClick={onClick} />
      </ListRows>,
    );
    const knopf = screen.getByRole('button', { name: /Berta Bestand/ });
    expect(knopf).toHaveAttribute('type', 'button');
    // Ein Knopf wird nur so breit wie sein Inhalt - die Zeile soll die ganze
    // Breite der Karte füllen.
    expect(klassenVon(knopf)).toEqual(expect.arrayContaining(['w-[calc(100%+2rem)]', 'text-left']));
    await user.click(knopf);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('ist ohne Ziel weder Link noch Knopf und vertieft sich nicht', () => {
    renderWithProviders(
      <ListRows>
        <ListRow zeit="08:30" titel="Erika Beispiel" />
      </ListRows>,
    );
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
    const zeile = screen.getByText('Erika Beispiel').closest('div')!;
    expect(klassenVon(zeile)).toContain('min-h-14');
    expect(zeile.className).not.toContain('hover:');
  });

  it('trennt ab der zweiten Zeile mit einer Linie', () => {
    renderWithProviders(
      <ListRows>
        <ListRow zeit="08:30" titel="Erika Beispiel" />
        <ListRow zeit="10:00" titel="Max Mustermann" />
      </ListRows>,
    );
    for (const eintrag of screen.getAllByRole('listitem')) {
      expect(klassenVon(eintrag)).toEqual(
        expect.arrayContaining(['border-t', 'border-line', 'first:border-t-0']),
      );
    }
  });

  it('daempft Erledigtes: Zeit und Titel leise, der Titel in 500', () => {
    renderWithProviders(
      <ListRows>
        <ListRow zeit="08:30" titel="Erika Beispiel" meta="Testweg 7" gedaempft />
      </ListRows>,
    );
    expect(klassenVon(screen.getByText('08:30'))).toContain('text-ink-muted');
    const titel = klassenVon(screen.getByText('Erika Beispiel'));
    expect(titel).toEqual(expect.arrayContaining(['text-ink-muted', 'font-medium']));
    expect(titel).not.toContain('font-semibold');
  });

  it('rueckt dicht zusammen und kuerzt lange Namen, statt umzubrechen', () => {
    renderWithProviders(
      <ListRows rahmen={false}>
        <ListRow
          dicht
          zeit="08:00"
          titel="Frida Test mit einem langen Doppelnamen"
          meta="Tim Teamleitung · Praxis"
          status={<StatusMark ton="positiv">erledigt</StatusMark>}
        />
      </ListRows>,
    );
    // Ohne Rahmen: Die Liste steht schon in einer Karte.
    expect(screen.getByRole('list').className).not.toContain('rounded-card');
    const zeile = screen.getByText('08:00').parentElement!;
    expect(klassenVon(zeile)).toEqual(expect.arrayContaining(['min-h-12', 'py-1.5']));
    expect(klassenVon(zeile)).not.toContain('min-h-14');
    expect(klassenVon(screen.getByText('08:00'))).toContain('text-sm');
    expect(klassenVon(screen.getByText('Frida Test mit einem langen Doppelnamen'))).toEqual(
      expect.arrayContaining(['text-liste', 'truncate']),
    );
    expect(klassenVon(screen.getByText('Tim Teamleitung · Praxis'))).toEqual(
      expect.arrayContaining(['text-sm', 'truncate']),
    );
    expect(zeile).toHaveTextContent('erledigt');
  });
});

describe('Statuszeichen (StatusMark)', () => {
  it('setzt Zeichen und Wort ohne Pille, mit den Zeichen des Badge', () => {
    renderWithProviders(
      <>
        <StatusMark ton="positiv">erledigt</StatusMark>
        <StatusMark ton="warnung">nicht angetroffen</StatusMark>
        <StatusMark ton="kritisch">abgesagt</StatusMark>
        <StatusMark>bestätigt</StatusMark>
      </>,
    );
    const erledigt = screen.getByText('erledigt');
    expect(erledigt.textContent).toBe('✓erledigt');
    expect(klassenVon(erledigt)).toEqual(
      expect.arrayContaining(['text-sm', 'font-semibold', 'text-positiv']),
    );
    // Keine Pille: weder Fläche noch Radius.
    expect(erledigt.className).not.toMatch(/\bbg-|rounded/);
    expect(screen.getByText('nicht angetroffen').textContent).toBe('!nicht angetroffen');
    expect(klassenVon(screen.getByText('nicht angetroffen'))).toContain('text-warnung');
    expect(screen.getByText('abgesagt').textContent).toBe('×abgesagt');
    expect(klassenVon(screen.getByText('abgesagt'))).toContain('text-danger');
    // Ein bestätigter Termin ist kein Zustand, der ein Zeichen bräuchte.
    expect(screen.getByText('bestätigt').textContent).toBe('bestätigt');
    expect(klassenVon(screen.getByText('bestätigt'))).toContain('text-ink-muted');
  });

  it('haelt das Zeichen aus dem Vorlesetext heraus', () => {
    renderWithProviders(<StatusMark ton="positiv">erledigt</StatusMark>);
    expect(screen.getByText('✓')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('Fortschrittspunkte (ProgressDots)', () => {
  it('zeigt je Termin einen Punkt und daneben den Satz', () => {
    const { container } = renderWithProviders(
      <ProgressDots punkte={['erledigt', 'nicht_angetroffen', 'naechster', 'offen', 'abgesagt']}>
        1 von 5 Besuchen erledigt
      </ProgressDots>,
    );
    const punkte = Array.from(container.querySelectorAll('[data-punkt]'));
    expect(punkte.map((punkt) => punkt.getAttribute('data-punkt'))).toEqual([
      'erledigt',
      'nicht_angetroffen',
      'naechster',
      'offen',
      'abgesagt',
    ]);
    const [erledigt, nichtAngetroffen, naechster, offen, abgesagt] = punkte.map(klassenVon);
    // Erledigt gefüllt, der nächste hohl in der Hauptfarbe, spätere hohl und leise.
    expect(erledigt).toEqual(expect.arrayContaining(['bg-accent', 'border-accent']));
    expect(naechster).toEqual(expect.arrayContaining(['bg-surface', 'border-accent']));
    expect(offen).toEqual(expect.arrayContaining(['bg-surface-sunken', 'border-line-strong']));
    expect(abgesagt).toEqual(expect.arrayContaining(['bg-danger', 'border-danger']));
    expect(nichtAngetroffen).toEqual(expect.arrayContaining(['bg-warnung', 'border-warnung']));
    // 12 px, rund, Farbwechsel in 200 ms.
    for (const klassen of [erledigt, naechster, offen]) {
      expect(klassen).toEqual(
        expect.arrayContaining(['size-3', 'border-2', 'rounded-pill', 'duration-200']),
      );
    }
    // Die Punkte sind Schmuck; was zählt, steht als Satz daneben.
    expect(punkte[0]!.parentElement).toHaveAttribute('aria-hidden', 'true');
    expect(klassenVon(screen.getByText('1 von 5 Besuchen erledigt'))).toEqual(
      expect.arrayContaining(['text-sm', 'text-ink-muted']),
    );
  });

  it('laesst die Punktreihe weg, wenn es keinen Termin gibt', () => {
    const { container } = renderWithProviders(
      <ProgressDots punkte={[]}>Heute keine Besuche</ProgressDots>,
    );
    expect(container.querySelector('[data-punkt]')).toBeNull();
    expect(container.querySelector('[aria-hidden="true"]')).toBeNull();
    expect(screen.getByText('Heute keine Besuche')).toBeInTheDocument();
  });
});

describe('Jetzt-Marke (NowMarker)', () => {
  it('ist ein Eintrag im Raster des Zeitstrahls und wird als „Jetzt, … Uhr" gelesen', async () => {
    const { container } = renderWithProviders(
      <ol>
        <NowMarker zeit="08:45" />
      </ol>,
    );
    const eintrag = screen.getByRole('listitem');
    // Dieselben Spalten wie die Termine, sonst steht der Punkt neben der Schiene.
    expect(klassenVon(eintrag)).toEqual(expect.arrayContaining(zeitstrahlRaster.split(' ')));
    expect(zeitstrahlRaster).toContain('grid-cols-[52px_20px_minmax(0,1fr)]');

    // Vorgelesen wird ein Satz; Uhrzeit, Punkt und Linie sind Bild.
    expect(screen.getByText('Jetzt, 08:45 Uhr')).toHaveClass('sr-only');
    const sichtbar = screen.getByText('08:45');
    expect(sichtbar).toHaveAttribute('aria-hidden', 'true');
    expect(klassenVon(sichtbar)).toEqual(
      expect.arrayContaining(['text-accent', 'text-xs', 'font-bold', 'tabular-nums']),
    );
    // 8-px-Punkt und 2-px-Linie in der Hauptfarbe.
    const flaechen = Array.from(eintrag.querySelectorAll('.bg-accent')).map(klassenVon);
    expect(flaechen).toHaveLength(2);
    expect(flaechen[0]).toEqual(expect.arrayContaining(['size-2', 'rounded-pill']));
    expect(flaechen[1]).toEqual(expect.arrayContaining(['h-0.5']));

    await pruefeBarrierefreiheit(container);
  });

  it('laesst am Ende des Strahls den Abstand darunter weg', () => {
    const { unmount } = renderWithProviders(
      <ol>
        <NowMarker zeit="17:00" />
      </ol>,
    );
    const inhalt = () => screen.getByText('Jetzt, 17:00 Uhr').parentElement!;
    expect(inhalt().className).toContain('pb-');
    unmount();

    renderWithProviders(
      <ol>
        <NowMarker zeit="17:00" letzter />
      </ol>,
    );
    expect(inhalt().className).not.toContain('pb-');
  });
});

describe('Druck-Basis', () => {
  it('nimmt Schaltflaechen und Schaltflaechen-Links vom Druck aus', () => {
    renderWithProviders(
      <>
        <ButtonLink to="/x">Erfassen</ButtonLink>
        <button type="button">Speichern</button>
      </>,
    );
    // Der Link ist ein <a>; die Regel `button { display: none }` im Druck
    // greift dort nicht. Deshalb traegt er die Markierung selbst (UI-000).
    expect(screen.getByRole('link', { name: 'Erfassen' }).className).toContain('nicht-drucken');
  });
});
