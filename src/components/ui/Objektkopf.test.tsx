import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Badge } from './Badge';
import { Button } from './Button';
import { ButtonLink } from './ButtonLink';
import { Objektkopf, Warnzeile } from './Objektkopf';
import { Reiterleiste } from './Reiterleiste';

/** Die Klassen eines Elements als Liste - für Zusicherungen ohne Teiltreffer. */
function klassenVon(element: Element | null | undefined): string[] {
  return (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

const REITER = [
  { to: '/patienten/1/termine', label: 'Termine' },
  { to: '/patienten/1/doku', label: 'Doku' },
  { to: '/patienten/1/stammdaten', label: 'Stammdaten' },
];

describe('Objektkopf (Design-Fundament, aus dem Rahmen der Akte)', () => {
  it('ist eine Karte mit dem Titel als einziger h1, Metazeile, Abzeichen, Aktionen und Reitern', async () => {
    const { container } = renderWithProviders(
      <Objektkopf
        titel="Max Mustermann"
        rueckweg={{ to: '/patienten', beschriftung: 'Zurück zu den Patient:innen' }}
        meta="geb. 12.03.1961 · 65 Jahre · Tübingen"
        status={<Badge ton="warnung">Nicht in Versorgung</Badge>}
        abzeichen={<Badge ton="akzent">Liege mitnehmen</Badge>}
        aktionen={
          <>
            <ButtonLink to="/patienten/1/termine/neu">Termin anlegen</ButtonLink>
            <ButtonLink to="/patienten/1/verordnungen/neu" variant="secondary">
              Grundlage erfassen
            </ButtonLink>
          </>
        }
        hinweise={
          <Warnzeile aktion={<a href="#foto">Fotografieren</a>}>Anmeldebogen fehlt</Warnzeile>
        }
        reiter={<Reiterleiste label="Bereiche der Akte" reiter={REITER} />}
      />,
      '/patienten/1/termine',
    );

    const kopf = container.querySelector('header')!;
    expect(klassenVon(kopf)).toEqual(
      expect.arrayContaining(['rounded-card', 'border', 'border-line', 'bg-surface']),
    );
    expect(kopf.className).not.toMatch(/shadow|ring/);

    // Der Titel ist der Seitentitel: 26 px am Telefon, 32 ab 640, 800, Hauptfarbe.
    const titel = screen.getByRole('heading', { level: 1, name: 'Max Mustermann' });
    expect(klassenVon(titel)).toEqual(
      expect.arrayContaining([
        'text-accent',
        'text-h2-mobil',
        'sm:text-h2',
        'tracking-display',
        'font-extrabold',
      ]),
    );
    expect(screen.getAllByRole('heading')).toHaveLength(1);

    // Pfeil zurück nur am Telefon, benannt und mit Tooltip.
    const pfeil = screen.getByRole('link', { name: 'Zurück zu den Patient:innen' });
    expect(pfeil).toHaveAttribute('href', '/patienten');
    expect(pfeil).toHaveAttribute('title', 'Zurück zu den Patient:innen');
    expect(klassenVon(pfeil)).toEqual(expect.arrayContaining(['size-10', 'sm:hidden']));

    expect(klassenVon(screen.getByText('geb. 12.03.1961 · 65 Jahre · Tübingen'))).toEqual(
      expect.arrayContaining(['text-ink-muted', 'text-sm']),
    );
    expect(screen.getByText('Nicht in Versorgung')).toBeInTheDocument();
    expect(screen.getByText('Liege mitnehmen')).toBeInTheDocument();

    // Aktionen sind ohne Angabe kompakt (44 px) und teilen sich am Telefon die Breite.
    const termin = screen.getByRole('link', { name: 'Termin anlegen' });
    expect(klassenVon(termin)).toEqual(expect.arrayContaining(['min-h-11', 'text-sm']));
    expect(klassenVon(termin)).not.toContain('h-12');
    expect(klassenVon(termin.parentElement)).toEqual(
      expect.arrayContaining(['w-full', '*:flex-1', 'sm:w-auto', 'sm:*:flex-none']),
    );

    // Die Warnzeile: Zeichen vorn, für Vorlesesoftware ausgeblendet.
    const warnung = screen.getByText('Anmeldebogen fehlt');
    expect(warnung.textContent).toBe('! Anmeldebogen fehlt');
    expect(warnung.querySelector('[aria-hidden="true"]')).toHaveTextContent('!');
    expect(klassenVon(warnung.parentElement)).toEqual(
      expect.arrayContaining(['bg-warnung-soft', 'text-warnung', 'min-h-11']),
    );

    // Die Reiter stehen in derselben Karte, mit einer Linie darüber.
    const reiter = screen.getByRole('navigation', { name: 'Bereiche der Akte' });
    expect(kopf).toContainElement(reiter);
    expect(klassenVon(reiter)).toEqual(expect.arrayContaining(['border-t', 'border-line']));

    await pruefeBarrierefreiheit(container);
  });

  it('setzt ohne Rückweg den Titel ohne Pfeil und lässt leere Bereiche weg', () => {
    const { container } = renderWithProviders(<Objektkopf titel="Lastenrad 1" />);
    expect(screen.queryByRole('link')).toBeNull();
    expect(screen.getByRole('heading', { level: 1 }).parentElement).toHaveClass('min-w-0');
    // Ohne Hinweise kein leerer Bereich mit Abstand, ohne Aktionen kein Behälter.
    expect(container.querySelector('.empty\\:hidden')).toBeNull();
    expect(container.querySelector('.sm\\:w-auto')).toBeNull();
  });

  it('lässt eine ausdrückliche Größe am Knopf gelten', () => {
    renderWithProviders(
      <Objektkopf
        titel="Anna Beispiel"
        aktionen={
          <Button type="button" groesse="normal">
            Groß
          </Button>
        }
      />,
    );
    expect(screen.getByRole('button', { name: 'Groß' })).toHaveClass('h-12');
  });

  it('setzt den Satz unter den Aktionen über die volle Breite', () => {
    renderWithProviders(<Objektkopf titel="Anna Beispiel" fuss="Keine neuen Termine." />);
    expect(klassenVon(screen.getByText('Keine neuen Termine.'))).toEqual(
      expect.arrayContaining(['w-full', 'text-sm', 'text-ink-muted']),
    );
  });

  it('hält einen Hinweisbereich, der leer bleibt, unsichtbar (empty:hidden)', () => {
    const Nichts = () => null;
    const { container } = renderWithProviders(
      <Objektkopf titel="Anna Beispiel" hinweise={<Nichts />} />,
    );
    const bereich = container.querySelector('header > div:nth-child(2)')!;
    expect(bereich).toBeEmptyDOMElement();
    expect(klassenVon(bereich)).toContain('empty:hidden');
  });
});

describe('Reiterleiste (Design-Fundament)', () => {
  it('markiert den offenen Reiter als Seite und setzt ihn auf die Akzentfläche', () => {
    renderWithProviders(
      <Reiterleiste label="Bereiche der Akte" reiter={REITER} />,
      '/patienten/1/doku',
    );
    const doku = screen.getByRole('link', { name: 'Doku' });
    expect(doku).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Termine' })).not.toHaveAttribute('aria-current');
    // Pillen 44 px, 15 px, aktiv Akzentfläche in der Hauptfarbe, 600.
    expect(klassenVon(doku)).toEqual(
      expect.arrayContaining([
        'rounded-pill',
        'min-h-11',
        'text-liste',
        'aria-[current=page]:bg-accent-soft',
        'aria-[current=page]:text-accent',
        'aria-[current=page]:font-semibold',
      ]),
    );
  });

  it('scrollt am Telefon waagerecht und bricht ab 640 px um', () => {
    renderWithProviders(<Reiterleiste label="Teile" reiter={REITER} />, '/patienten/1/termine');
    expect(klassenVon(screen.getByRole('list'))).toEqual(
      expect.arrayContaining(['overflow-x-auto', 'sm:flex-wrap', 'sm:overflow-visible']),
    );
  });

  it('ist ohne end auch auf Unterseiten aktiv, mit end nur auf dem Pfad', () => {
    const { unmount } = renderWithProviders(
      <Reiterleiste label="Teile" reiter={[{ to: '/rad/1', label: 'Rad' }]} />,
      '/rad/1/checkup',
    );
    expect(screen.getByRole('link', { name: 'Rad' })).toHaveAttribute('aria-current', 'page');
    unmount();
    renderWithProviders(
      <Reiterleiste label="Teile" reiter={[{ to: '/rad/1', label: 'Rad', end: true }]} />,
      '/rad/1/checkup',
    );
    expect(screen.getByRole('link', { name: 'Rad' })).not.toHaveAttribute('aria-current');
  });
});
