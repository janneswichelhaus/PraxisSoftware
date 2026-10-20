import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Badge } from './Badge';
import { Button } from './Button';
import { Datenliste } from './Datenliste';
import { Listenabschnitt } from './Listenabschnitt';
import { ListRow, ListRows } from './ListRow';
import { Medienbild } from './Medienbild';
import { Symbolknopf } from './Symbolknopf';
import { Textlink } from './Textlink';

/** Die Klassen eines Elements als Liste - für Zusicherungen ohne Teiltreffer. */
function klassenVon(element: Element | null | undefined): string[] {
  return (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

describe('ListRow mit Bild, Betrag und Aktion (Design-Fundament)', () => {
  it('setzt die Aktion neben das Ziel, nicht hinein - kompakt und mit eigenem Namen', async () => {
    const user = userEvent.setup();
    const abhaken = vi.fn();
    const { container } = renderWithProviders(
      <ListRows>
        <ListRow
          zeit="10:00"
          titel="Max Mustermann"
          meta="Beispielstrasse 12"
          to="/termine/1"
          aktion={
            <Symbolknopf beschriftung="Termin abschließen" variant="secondary" onClick={abhaken}>
              ✓
            </Symbolknopf>
          }
        />
        <ListRow
          titel="Berta Bestand"
          to="/termine/2"
          aktion={
            <Button type="button" variant="secondary">
              Doku
            </Button>
          }
        />
      </ListRows>,
    );
    const ziel = screen.getByRole('link', { name: /Max Mustermann/ });
    const knopf = screen.getByRole('button', { name: 'Termin abschließen' });
    // Kein Ziel im Ziel.
    expect(ziel).not.toContainElement(knopf);
    expect(ziel.parentElement).toContainElement(knopf);
    // Das Ziel reicht nur links über den Kartenrand und endet vor der Aktion.
    expect(klassenVon(ziel)).toEqual(
      expect.arrayContaining(['-ml-4', 'pl-4', 'flex-1', 'min-w-0', 'min-h-14']),
    );
    expect(klassenVon(ziel)).not.toContain('w-[calc(100%+2rem)]');
    expect(klassenVon(ziel.parentElement)).toEqual(
      expect.arrayContaining(['flex', 'items-center', 'border-t', 'first:border-t-0']),
    );
    // Knöpfe in der Zeile sind ohne Angabe kompakt.
    expect(screen.getByRole('button', { name: 'Doku' })).toHaveClass('min-h-11');
    await user.click(knopf);
    expect(abhaken).toHaveBeenCalledTimes(1);
    await pruefeBarrierefreiheit(container);
  });

  it('setzt ein Vorschaubild 56 × 56 vorn, statt der Zeit', () => {
    renderWithProviders(
      <ListRows>
        <ListRow
          bild={<Medienbild vorschau alt="Kniebeuge an der Wand" />}
          titel="Wandsitz"
          meta="3 × 30 s"
          to="/uebungen/1"
        />
      </ListRows>,
    );
    const ziel = screen.getByRole('link', { name: /Wandsitz/ });
    expect(klassenVon(ziel)).toContain('grid-cols-[auto_minmax(0,1fr)_auto]');
    const platz = ziel.firstElementChild!;
    // Die Größe bringt das Bild mit (TEAM-006: auch ein Personenbild passt).
    expect(klassenVon(platz)).toContain('shrink-0');
    expect(platz.querySelector('.size-14')).not.toBeNull();
    expect(within(platz as HTMLElement).getByRole('img')).toBeInTheDocument();
  });

  it('setzt den Betrag rechts, tabellarisch, über den Status', () => {
    renderWithProviders(
      <ListRows>
        <ListRow
          titel="Rechnung 2026-014"
          meta="Max Mustermann"
          betrag="126,40 €"
          status={<Badge ton="warnung">Offen</Badge>}
        />
      </ListRows>,
    );
    const betrag = screen.getByText('126,40 €');
    expect(klassenVon(betrag)).toEqual(
      expect.arrayContaining(['text-liste', 'font-semibold', 'tabular-nums']),
    );
    expect(klassenVon(betrag.parentElement)).toEqual(
      expect.arrayContaining(['flex-col', 'items-end', 'shrink-0']),
    );
    expect(betrag.parentElement).toContainElement(screen.getByText('Offen'));
  });

  it('bleibt ohne die neuen Plätze, wie sie war (Übersicht, Akte, Kalender)', () => {
    renderWithProviders(
      <ListRows>
        <ListRow zeit="10:00" titel="Max Mustermann" to="/termine/1" />
      </ListRows>,
    );
    const ziel = screen.getByRole('link');
    expect(klassenVon(ziel)).toEqual(
      expect.arrayContaining(['-mx-4', 'w-[calc(100%+2rem)]', 'px-4']),
    );
    expect(klassenVon(ziel.parentElement)).toEqual(['border-line', 'border-t', 'first:border-t-0']);
  });
});

describe('Listenabschnitt (Design-Fundament)', () => {
  it('trägt Titel mit Zahl, Aktion und die Zeilen in einer Karte', async () => {
    const { container } = renderWithProviders(
      <Listenabschnitt
        titel="Kommende"
        anzahl={2}
        aktion={
          <Textlink alleinstehend to="/termine/neu">
            Termin anlegen
          </Textlink>
        }
        mehr={<Textlink to="/alle">Alle anzeigen</Textlink>}
      >
        <ListRow zeit="Mo" titel="Hausbesuch" />
        <ListRow zeit="Di" titel="Hausbesuch" />
      </Listenabschnitt>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Kommende (2)' })).toBeInTheDocument();
    const liste = screen.getByRole('list');
    expect(klassenVon(liste)).toEqual(expect.arrayContaining(['rounded-card', 'border']));
    expect(within(liste).getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Termin anlegen' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Alle anzeigen' })).toBeInTheDocument();
    await pruefeBarrierefreiheit(container);
  });

  it('zeigt ohne Zeilen den Leerzustand in einer Karte, nie eine leere Liste', () => {
    renderWithProviders(
      <Listenabschnitt
        titel="Kommende"
        leer={{
          titel: 'Noch keine Termine',
          beschreibung: 'Der erste entsteht über „Termin anlegen“.',
        }}
      >
        {[].map(() => null)}
      </Listenabschnitt>,
    );
    expect(screen.queryByRole('list')).toBeNull();
    const titel = screen.getByText('Noch keine Termine');
    expect(klassenVon(titel.parentElement)).toEqual(
      expect.arrayContaining(['rounded-card', 'border', 'bg-surface']),
    );
  });

  it('steht ohne Karte, wo schon ein Rahmen ist - im Fenster (TEAM-002, Regel 2)', () => {
    renderWithProviders(
      <>
        <Listenabschnitt titel="Angeheftet" rahmen={false} leer={{ titel: 'Nichts angeheftet' }}>
          {[].map(() => null)}
        </Listenabschnitt>
        <Listenabschnitt titel="Wer liest" rahmen={false}>
          <ListRow titel="Anna Beispiel" />
        </Listenabschnitt>
      </>,
    );
    expect(klassenVon(screen.getByText('Nichts angeheftet').parentElement)).not.toContain(
      'rounded-card',
    );
    expect(klassenVon(screen.getByRole('list'))).not.toContain('rounded-card');
  });
});

type Rechnung = { id: string; nummer: string; person: string; zustand: string; betrag: string };

const RECHNUNGEN: Rechnung[] = [
  { id: '1', nummer: '2026-014', person: 'Max Mustermann', zustand: 'Offen', betrag: '126,40 €' },
  { id: '2', nummer: '2026-015', person: 'Berta Bestand', zustand: 'Bezahlt', betrag: '84,00 €' },
];

describe('Datenliste (Design-Fundament, nach der Rechnungsliste)', () => {
  it('zeigt ab 1024 px Spalten mit Kopf und darunter Zeilen, die alles selbst sagen', async () => {
    const { container } = renderWithProviders(
      <Datenliste
        beschriftung="Rechnungen"
        zeilen={RECHNUNGEN}
        schluessel={(r) => r.id}
        spalten={[
          {
            titel: 'Nummer',
            breite: '10rem',
            inhalt: (r) => <Textlink to={`/rechnungen/${r.id}`}>{r.nummer}</Textlink>,
          },
          { titel: 'Person', inhalt: (r) => r.person },
          { titel: 'Zustand', breite: '12rem', inhalt: (r) => <Badge>{r.zustand}</Badge> },
          {
            titel: 'Betrag',
            breite: '8rem',
            rechts: true,
            telefon: 'ende',
            inhalt: (r) => r.betrag,
          },
        ]}
      />,
    );
    const rahmen = container.firstElementChild as HTMLElement;
    // Die Spuren reisen als Variable mit; das Raster greift ab 1024 px.
    expect(rahmen.style.getPropertyValue('--datenliste-spalten')).toBe(
      '10rem minmax(0,1fr) 12rem 8rem',
    );
    expect(klassenVon(rahmen)).toEqual(expect.arrayContaining(['rounded-card', 'border']));

    // Der Kopf steht nur am Rechner und ist für Vorlesesoftware ausgeblendet.
    const kopf = rahmen.firstElementChild!;
    expect(kopf).toHaveAttribute('aria-hidden', 'true');
    expect(klassenVon(kopf)).toEqual(
      expect.arrayContaining(['hidden', 'lg:grid', 'lg:grid-cols-(--datenliste-spalten)']),
    );

    const liste = screen.getByRole('list', { name: 'Rechnungen' });
    const zeilen = within(liste).getAllByRole('listitem');
    expect(zeilen).toHaveLength(2);
    expect(klassenVon(zeilen[0])).toEqual(
      expect.arrayContaining(['flex', 'flex-wrap', 'lg:grid', 'border-t', 'first:border-t-0']),
    );

    // Jeder Wert außer dem Kopf nennt seine Spalte für Vorlesesoftware.
    expect(within(zeilen[0]!).getByText('Zustand:')).toHaveClass('sr-only');
    expect(within(zeilen[0]!).queryByText('Nummer:')).toBeNull();

    // Der Betrag steht am Telefon oben rechts, am Rechner rechtsbündig.
    const betrag = within(zeilen[0]!).getByText('126,40 €');
    expect(klassenVon(betrag)).toEqual(
      expect.arrayContaining(['ml-auto', 'lg:ml-0', 'tabular-nums', 'lg:text-right']),
    );
    // Übrige Werte stehen am Telefon je in einer Zeile darunter.
    expect(klassenVon(within(zeilen[0]!).getByText('Max Mustermann'))).toEqual(
      expect.arrayContaining(['order-last', 'w-full', 'lg:order-none', 'lg:w-auto']),
    );

    await pruefeBarrierefreiheit(container);
  });

  it('steht ohne Rahmen in einer Karte, die es schon gibt', () => {
    const { container } = renderWithProviders(
      <Datenliste
        beschriftung="Leistungen"
        rahmen={false}
        zeilen={RECHNUNGEN}
        schluessel={(r) => r.id}
        spalten={[{ titel: 'Nummer', inhalt: (r) => r.nummer }]}
      />,
    );
    expect(container.firstElementChild).not.toHaveClass('rounded-card');
  });
});
