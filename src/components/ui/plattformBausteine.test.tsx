import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Aufgabenkarte } from './Aufgabenkarte';
import { ButtonLink } from './ButtonLink';
import { EmptyState } from './Feedback';
import { HeroKarte } from './HeroKarte';
import { ListRow, ListRows } from './ListRow';
import { Personenbild } from './Personenbild';
import { Skelett, SkelettBereich } from './Skelett';
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
    // Gedrückt vertieft und 98 %, bei reduzierter Bewegung nur vertieft.
    expect(karte.className).toContain('active:scale-98');
    expect(karte.className).toContain('motion-reduce:active:scale-100');
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
      expect(klassen, variante).toContain('[.plattform-schrift_&]:not-disabled:active:scale-98');
      expect(klassen, variante).toContain('motion-reduce:[.plattform-schrift_&]:active:scale-100');
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
    expect(zeile.className).toContain('[.plattform-schrift_&]:active:scale-98');
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
    expect(bild.className).toContain('text-[1.25rem]');
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
        <SkelettBereich beschriftung="Übersicht wird geladen">
          <Skelett form="karte" />
        </SkelettBereich>
      </main>,
    );
    await pruefeBarrierefreiheit(container);
  });
});
