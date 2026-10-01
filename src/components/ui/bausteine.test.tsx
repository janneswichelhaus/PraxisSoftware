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

afterEach(() => {
  vi.restoreAllMocks();
});

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
