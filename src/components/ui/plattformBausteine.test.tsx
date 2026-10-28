import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Aufgabenkarte } from './Aufgabenkarte';
import { ButtonLink } from './ButtonLink';
import { EmptyState } from './Feedback';
import { HeroKarte } from './HeroKarte';
import { Linkliste } from './Linkliste';
import { ListRow, ListRows } from './ListRow';
import { Personenbild } from './Personenbild';
import { Skelett, SkelettBereich } from './Skelett';
import { Uebungsliste, Uebungszeile } from './Uebungszeile';
import { buttonKlassen } from './buttonStile';

/**
 * Die Bausteine der Plattform (Handoff 2026-10-22, Abschnitt 3;
 * `docs/design/PLATTFORM.md`). Synthetische Inhalte.
 */

const ZEICHEN = (
  <svg viewBox="0 0 24 24">
    <circle cx="12" cy="12" r="8" />
  </svg>
);

function zeige(inhalt: React.ReactNode) {
  return render(
    <MemoryRouter>
      <div className="plattform-schrift">{inhalt}</div>
    </MemoryRouter>,
  );
}

describe('HeroKarte', () => {
  it('ist eine Section mit dem Titel als h2, Etikett, Satz und einem Knopf auf Tiefgrün', () => {
    zeige(
      <HeroKarte
        titel="Fragebogen vor Ihrem ersten Termin"
        satz="Etwa 10 Minuten."
        aktion={{ text: 'Fragebogen beginnen', to: '/p/befundbogen' }}
      />,
    );
    const karte = screen.getByRole('region', { name: 'Fragebogen vor Ihrem ersten Termin' });
    expect(
      within(karte).getByRole('heading', { level: 2, name: 'Fragebogen vor Ihrem ersten Termin' }),
    ).toBeInTheDocument();
    expect(within(karte).getByText('Als Nächstes')).toBeInTheDocument();
    expect(within(karte).getByText('Etwa 10 Minuten.')).toBeInTheDocument();
    const knopf = within(karte).getByRole('link', { name: 'Fragebogen beginnen' });
    expect(knopf).toHaveAttribute('href', '/p/befundbogen');
    // Papier auf Tiefgrün, die eine Tiefenstufe der Plattform (ANN-678).
    expect(karte.className).toContain('bg-surface-inverse');
    expect(karte.className).toContain('shadow-plattform');
    expect(knopf.className).toContain('bg-surface');
    expect(knopf.className).toContain('text-surface-inverse');
    // Das Laufrad ist Markenform, keine Information.
    expect(karte.querySelector('[data-laufrad]')).toHaveAttribute('aria-hidden', 'true');
  });

  it('zeigt die Person mit Bild in 56 px und läuft nur auf Wunsch ein', () => {
    const { container } = zeige(
      <HeroKarte
        titel="Besuch am Samstag"
        person={{ name: 'Anna Beispiel', farbe: 'tanne', zeile: 'Anna Beispiel kommt zu Ihnen' }}
        aktion={{ text: 'Termin ansehen', to: '/p/termine' }}
      />,
    );
    expect(screen.getByText('Anna Beispiel kommt zu Ihnen')).toBeInTheDocument();
    const bild = container.querySelector('[data-personenbild]')!;
    expect(bild).toHaveTextContent('AB');
    expect(bild.className).toContain('size-14');
    expect(container.querySelector('.hero-erscheint')).toBeNull();
    expect(container.querySelector('.laufrad-dreht')).toBeNull();
  });

  it('lässt beim Markenmoment Karte und Laufrad einlaufen', () => {
    const { container } = zeige(
      <HeroKarte
        titel="Ihre Übungen für heute"
        aktion={{ text: 'Übungen beginnen', to: '/p/uebungen' }}
        markenmoment
      />,
    );
    expect(container.querySelector('section.hero-erscheint')).not.toBeNull();
    expect(container.querySelector('[data-laufrad].laufrad-dreht')).not.toBeNull();
  });

  it('trägt als Vorschau der Einheit Angaben mit stummen Zeichen (Handoff 2026-10-24)', () => {
    const { container } = zeige(
      <HeroKarte
        etikett="Heute ist Übungstag"
        titel="Ihre Übungen für heute"
        angaben={[
          { schluessel: 'umfang', zeichen: ZEICHEN, text: '3 Übungen · etwa 10 Minuten' },
          { schluessel: 'brauchen', zeichen: ZEICHEN, text: 'Sie brauchen: Theraband gelb' },
        ]}
        aktion={{ text: 'Übungen beginnen', to: '/p/uebungen/einheit/a1' }}
        schmalOhneRad
      />,
    );
    const karte = screen.getByRole('region', { name: 'Ihre Übungen für heute' });
    const angaben = within(karte).getAllByRole('listitem');
    expect(angaben.map((a) => a.textContent)).toEqual([
      '3 Übungen · etwa 10 Minuten',
      'Sie brauchen: Theraband gelb',
    ]);
    for (const angabe of angaben) {
      expect(angabe.querySelector('.text-salbei')).toHaveAttribute('aria-hidden', 'true');
    }
    // Unter 23rem ohne Laufrad und innen 16 (Abschnitt 4).
    expect(karte.className).toContain('max-[23rem]:p-4');
    expect(container.querySelector('[data-laufrad]')!.getAttribute('class')).toContain(
      'max-[23rem]:hidden',
    );
  });

  it('bietet statt des Knopfs eine leise Aktion als Textlink an', () => {
    zeige(
      <HeroKarte
        etikett="Heute geübt"
        titel="Ihre Übungen für heute"
        satz="Gespeichert. Anna Beispiel sieht Ihre Einheit beim nächsten Termin."
        leiseAktion={{ text: 'Noch einmal üben', to: '/p/uebungen/einheit/a1' }}
      />,
    );
    const link = screen.getByRole('link', { name: 'Noch einmal üben' });
    expect(link).toHaveAttribute('href', '/p/uebungen/einheit/a1');
    // Ein Textlink in Papier-Schrift mit Tippziel 44, kein Knopf.
    expect(link.className).toContain('underline');
    expect(link.className).toContain('min-h-11');
    expect(link.className).not.toContain('bg-surface ');
    // Ohne `schmalOhneRad` bleibt die Karte unter 23rem wie in Briefing 1.
    expect(screen.getByRole('region').className).toContain('max-[23rem]:p-3');
  });
});

describe('Linkliste', () => {
  it('ist eine Liste von Links, ganz das Ziel, Zeichen und Pfeil stumm, Druck mit 98 %', () => {
    zeige(
      <Linkliste
        eintraege={[
          { text: 'Plan als PDF', zeichen: ZEICHEN, to: '/p/uebungen/blatt/a1' },
          { text: 'Frage zu diesem Plan', zeichen: ZEICHEN, to: '/p/nachrichten/neu?plan=a1' },
        ]}
      />,
    );
    const pdf = screen.getByRole('link', { name: 'Plan als PDF' });
    expect(pdf).toHaveAttribute('href', '/p/uebungen/blatt/a1');
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    // 60 hoch am Telefon, 44 als Textlink am Rechner.
    expect(pdf.className).toContain('min-h-15');
    expect(pdf.className).toContain('[[data-rechner]_&]:min-h-11');
    // Druck wie an jeder Zeile der Plattform (DR-117): 98 % nur ohne „Bewegung reduzieren“.
    expect(pdf.className).toContain('motion-safe:active:scale-98');
    for (const stumm of pdf.querySelectorAll('svg')) {
      expect(stumm.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    // Der Pfeil fällt unter 23rem und am Rechner weg.
    const pfeil = pdf.querySelector('[data-pfeil]')!.getAttribute('class')!;
    expect(pfeil).toContain('max-[23rem]:hidden');
    expect(pfeil).toContain('[[data-rechner]_&]:hidden');
  });
});

describe('Uebungszeile', () => {
  it('ist ganz ein Knopf mit Nummer, Name und Dosierung; Kreis und Pfeil stumm', () => {
    const tipp = vi.fn();
    const { container } = zeige(
      <Uebungsliste beschriftung="Die Übungen">
        <Uebungszeile
          nummer={1}
          titel="Am Treppengeländer in die Hocke"
          dosierung="3 Durchgänge · je 8 bis 12 Wiederholungen"
          onClick={tipp}
        />
        <Uebungszeile
          nummer={2}
          titel="Becken anheben"
          dosierung="2 Durchgänge"
          erledigt
          onClick={tipp}
        />
      </Uebungsliste>,
    );
    const erste = screen.getByRole('button', {
      name: '1. Am Treppengeländer in die Hocke 3 Durchgänge · je 8 bis 12 Wiederholungen',
    });
    expect(erste.className).toContain('min-h-20');
    // Der Name trennt nur unter 23rem an der Silbe (ANN-707).
    expect(within(erste).getByText('Am Treppengeländer in die Hocke').className).toContain(
      'trennen-schmal',
    );
    fireEvent.click(erste);
    expect(tipp).toHaveBeenCalledTimes(1);
    for (const stumm of container.querySelectorAll('button > [aria-hidden="true"], [data-pfeil]')) {
      expect(stumm).toHaveAttribute('aria-hidden', 'true');
    }
    // Bei „Sehr groß“ und unter 23rem fällt der Pfeil weg.
    expect(erste.querySelector('[data-pfeil]')!.getAttribute('class')).toContain(
      '[[data-schrift=sehr-gross]_&]:hidden',
    );
  });

  it('sagt heute Erledigtes mit Wort und Haken, nicht nur mit Farbe', () => {
    zeige(
      <Uebungsliste>
        <Uebungszeile
          nummer={2}
          titel="Becken anheben"
          dosierung="2 Durchgänge"
          erledigt
          onClick={() => undefined}
        />
      </Uebungsliste>,
    );
    const zeile = screen.getByRole('button', { name: /Becken anheben/ });
    expect(zeile).toHaveTextContent('Heute erledigt');
    const kreis = zeile.querySelector('span[aria-hidden="true"]')!;
    expect(kreis.className).toContain('bg-accent');
    expect(kreis.querySelector('svg')).not.toBeNull();
  });

  it('zeigt in der Lesefrist den Kreis vertieft', () => {
    zeige(
      <Uebungsliste>
        <Uebungszeile
          nummer={1}
          titel="Becken anheben"
          dosierung="2 Durchgänge"
          beendet
          onClick={() => undefined}
        />
      </Uebungsliste>,
    );
    const kreis = screen.getByRole('button').querySelector('span[aria-hidden="true"]')!;
    expect(kreis.className).toContain('bg-surface-sunken');
  });
});

describe('Aufgabenkarte', () => {
  it('ist ganz ein Link; Titel und Satz sind sein Name, Zeichen und Pfeil stumm', () => {
    zeige(
      <Aufgabenkarte
        zeichen={ZEICHEN}
        titel="Eine kleine Gewohnheit"
        satz="Zwei Minuten Mobilität"
        to="/p/gewohnheiten"
      />,
    );
    const karte = screen.getByRole('link', {
      name: 'Eine kleine Gewohnheit Zwei Minuten Mobilität',
    });
    expect(karte).toHaveAttribute('href', '/p/gewohnheiten');
    expect(karte.className).toContain('min-h-20');
    expect(karte.className).toContain('shadow-plattform');
    // Gedrückt vertieft und 98 %, bei reduzierter Bewegung nur vertieft:
    // der Maßstab nur unter `motion-safe:`.
    expect(karte.className.split(' ').filter((k) => k.includes('scale-98'))).toEqual([
      'motion-safe:active:scale-98',
    ]);
    expect(karte.querySelector('[data-pfeil]')).toHaveAttribute('aria-hidden', 'true');
    // Bei „Sehr groß“ fällt der Pfeil weg (Handoff, Abschnitt 0).
    expect(karte.querySelector('[data-pfeil]')!.getAttribute('class')).toContain(
      '[[data-schrift=sehr-gross]_&]:hidden',
    );
  });
});

describe('Skelett', () => {
  it('ist stumm; der Bereich sagt, was lädt, und ist beschäftigt', () => {
    const { container } = zeige(
      <SkelettBereich beschriftung="Übersicht wird geladen">
        <Skelett form="hero" />
        <Skelett form="zeile" className="w-2/3" />
      </SkelettBereich>,
    );
    expect(container.querySelector('[aria-busy="true"]')).toHaveTextContent(
      'Übersicht wird geladen',
    );
    const formen = container.querySelectorAll('[data-skelett]');
    expect(formen).toHaveLength(2);
    for (const form of formen) {
      expect(form).toHaveAttribute('aria-hidden', 'true');
      expect(form.className).toContain('skelett-puls');
    }
    expect(formen[0]!.className).toContain('rounded-image');
    expect(formen[1]!.className).toContain('w-2/3');
  });
});

describe('Leerzustand mit Markenform', () => {
  it('zeigt das Laufrad im tiefgrünen Kreis, Titel und was als Nächstes kommt', () => {
    const { container } = zeige(
      <EmptyState
        markenform
        title="Noch keine Termine"
        description="Die Praxis trägt Ihren ersten Termin hier ein."
      />,
    );
    expect(screen.getByText('Noch keine Termine')).toBeInTheDocument();
    expect(screen.getByText('Die Praxis trägt Ihren ersten Termin hier ein.')).toBeInTheDocument();
    const rad = container.querySelector('[data-laufrad]')!;
    expect(rad).toHaveAttribute('aria-hidden', 'true');
    expect(rad.parentElement!.className).toContain('bg-surface-inverse');
    // Ohne `inKarte` keine eigene Karte - sonst Kasten im Kasten.
    const wurzel = rad.parentElement!.parentElement!;
    expect(wurzel.className).toContain('flex-col');
    expect(wurzel.className).not.toContain('rounded-card');
  });

  it('steht mit inKarte in einer Karte', () => {
    const { container } = zeige(<EmptyState markenform inKarte title="Noch keine Termine" />);
    const rad = container.querySelector('[data-laufrad]')!;
    expect(rad.parentElement!.parentElement!.className).toContain('rounded-card');
  });

  it('setzt mit zeichen statt des Laufrads das Zeichen auf die Vertiefung (Handoff 2026-10-24, 5.1)', () => {
    const { container } = zeige(
      <EmptyState
        markenform
        inKarte
        zeichen={<svg data-testid="uhr" />}
        title="Ihr Wunsch ist bei der Praxis."
      />,
    );
    expect(container.querySelector('[data-laufrad]')).toBeNull();
    const kreis = screen.getByTestId('uhr').parentElement!;
    expect(kreis).toHaveAttribute('aria-hidden', 'true');
    expect(kreis.className).toContain('bg-surface-sunken');
    expect(kreis.className).not.toContain('bg-surface-inverse');
    expect(kreis.parentElement!.className).toContain('rounded-card');
  });

  it('bleibt ohne markenform, wie es war', () => {
    const { container } = zeige(<EmptyState title="Keine Einträge" />);
    expect(container.querySelector('[data-laufrad]')).toBeNull();
    expect(container.querySelector('.text-center')).not.toBeNull();
  });
});

describe('Knopf marke und Druck auf der Plattform', () => {
  it('setzt den Knopf auf der Markenfläche in Papier mit Tiefgrün und Fokusring in Papier', () => {
    const klassen = buttonKlassen('marke');
    expect(klassen).toContain('bg-surface');
    expect(klassen).toContain('text-surface-inverse');
    expect(klassen).toContain('focus-visible:outline-surface');
  });

  it('lässt Knöpfe und Zeilen nur unter .plattform-schrift nachgeben (DR-117)', () => {
    for (const variante of ['primary', 'secondary', 'quiet'] as const) {
      const klassen = buttonKlassen(variante);
      // Der Maßstab nur unter `motion-safe:`: Eine Rücknahme unter
      // `motion-reduce:` verlor gegen `not-disabled` (Design-Review 1a).
      expect(
        klassen.split(' ').filter((k) => k.includes('scale-98')),
        variante,
      ).toEqual(['motion-safe:[.plattform-schrift_&]:not-disabled:active:scale-98']);
      // Ohne Plattform kein Druck: Kein `active:` ohne den Vorsatz.
      expect(
        klassen.split(' ').filter((k) => k.startsWith('active:')),
        variante,
      ).toEqual([]);
    }
    zeige(
      <ListRows>
        <ListRow titel="Rechnungen" to="/p/rechnungen" />
      </ListRows>,
    );
    const zeile = screen.getByRole('link', { name: 'Rechnungen' });
    expect(zeile.className.split(' ').filter((k) => k.includes('scale-98'))).toEqual([
      'motion-safe:[.plattform-schrift_&]:active:scale-98',
    ]);
    expect(zeile.className).toContain('[.plattform-schrift_&]:active:bg-surface-sunken');
  });

  it('führt einen Knopf-Link in der Variante marke', () => {
    zeige(
      <div className="bg-surface-inverse">
        <ButtonLink variant="marke" to="/p/uebungen">
          Übungen beginnen
        </ButtonLink>
      </div>,
    );
    expect(screen.getByRole('link', { name: 'Übungen beginnen' }).className).toContain(
      'text-surface-inverse',
    );
  });
});

describe('Personenbild in der Karte', () => {
  it('ist 56 px groß mit Initialen in 700, in rem', () => {
    const { container } = render(
      <Personenbild name="Anna Beispiel" farbe="tanne" groesse="karte" />,
    );
    const bild = container.querySelector('[data-personenbild]')!;
    expect(bild.className).toContain('size-14');
    expect(bild.className).toContain('text-initialen');
    expect(bild.className).toContain('font-bold');
    expect(bild).toHaveTextContent('AB');
  });
});

describe('Barrierefreiheit der Plattform-Bausteine', () => {
  it('besteht die automatische Prüfung', async () => {
    const { container } = zeige(
      <main>
        <h1>Guten Tag</h1>
        <HeroKarte
          titel="Fragebogen vor Ihrem ersten Termin"
          satz="Etwa 10 Minuten."
          person={{ name: 'Anna Beispiel', zeile: 'Anna Beispiel kommt zu Ihnen' }}
          aktion={{ text: 'Fragebogen beginnen', to: '/p/befundbogen' }}
        />
        <Aufgabenkarte
          zeichen={ZEICHEN}
          titel="Eine kleine Gewohnheit"
          satz="Zwei Minuten Mobilität"
          to="/p/gewohnheiten"
        />
        <EmptyState markenform title="Noch keine Termine" />
        <HeroKarte
          etikett="Heute geübt"
          titel="Ihre Übungen"
          angaben={[{ schluessel: 'umfang', zeichen: ZEICHEN, text: '3 Übungen' }]}
          leiseAktion={{ text: 'Noch einmal üben', to: '/p/uebungen/einheit/a1' }}
        />
        <Linkliste
          eintraege={[{ text: 'Plan als PDF', zeichen: ZEICHEN, to: '/p/uebungen/blatt/a1' }]}
        />
        <Uebungsliste beschriftung="Die Übungen">
          <Uebungszeile
            nummer={1}
            titel="Becken anheben"
            dosierung="2 Durchgänge"
            onClick={() => undefined}
          />
          <Uebungszeile
            nummer={2}
            titel="Auf einem Bein stehen"
            dosierung="2 Durchgänge"
            erledigt
            onClick={() => undefined}
          />
        </Uebungsliste>
        <SkelettBereich beschriftung="Übersicht wird geladen">
          <Skelett form="karte" />
        </SkelettBereich>
      </main>,
    );
    await pruefeBarrierefreiheit(container);
  });
});
