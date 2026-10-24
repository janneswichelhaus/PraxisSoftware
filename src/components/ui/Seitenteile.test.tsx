import { describe, expect, it } from 'vitest';
import { screen } from '@testing-library/react';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Aktionsleiste } from './Aktionsleiste';
import { Button } from './Button';
import { ButtonLink } from './ButtonLink';
import { Formularfuss } from './Formularfuss';
import { Section } from './Section';
import { Zweispalter } from './Zweispalter';
import { Zwischentitel } from './Zwischentitel';

/** Die Klassen eines Elements als Liste - für Zusicherungen ohne Teiltreffer. */
function klassenVon(element: Element | null | undefined): string[] {
  return (element?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);
}

describe('Zwischentitel (Design-Fundament, Lücke 9.2)', () => {
  it('ist eine h3 in 16 px und 600, Tinte, mit 16 px darüber und 8 darunter', async () => {
    const { container } = renderWithProviders(
      <Section titel="Person">
        <Zwischentitel>Kontakt</Zwischentitel>
        <p>Telefon</p>
      </Section>,
    );
    const titel = screen.getByRole('heading', { level: 3, name: 'Kontakt' });
    expect(klassenVon(titel)).toEqual(
      expect.arrayContaining(['text-ink', 'text-base', 'font-semibold']),
    );
    // Keine fremde Größe daneben - genau das war der Wildwuchs.
    expect(titel.className).not.toMatch(/text-(lg|xl|h[1-4])|\[/);
    expect(klassenVon(titel.parentElement)).toEqual(
      expect.arrayContaining(['mt-4', 'mb-2', 'first:mt-0']),
    );
    await pruefeBarrierefreiheit(container);
  });

  it('wählt mit ebene nur das Element, nicht die Größe, und nimmt eine Aktion', () => {
    renderWithProviders(
      <Zwischentitel ebene={4} aktion={<a href="#bearbeiten">Bearbeiten</a>}>
        Adresse
      </Zwischentitel>,
    );
    const titel = screen.getByRole('heading', { level: 4, name: 'Adresse' });
    expect(klassenVon(titel)).toEqual(expect.arrayContaining(['text-base', 'font-semibold']));
    // Mit Aktion steht der Kopf 44 px hoch, die Aktion rechts daneben.
    expect(klassenVon(titel.parentElement)).toEqual(
      expect.arrayContaining(['flex', 'justify-between', 'min-h-11']),
    );
    expect(titel.parentElement).toContainElement(screen.getByRole('link', { name: 'Bearbeiten' }));
  });

  it('steht mit stufe="abschnitt" in der Stufe des Abschnittstitels der Plattform (DRP-017)', () => {
    renderWithProviders(
      <div className="plattform-schrift">
        <Zwischentitel stufe="abschnitt">Nachrichten per E-Mail</Zwischentitel>
      </div>,
    );
    const titel = screen.getByRole('heading', { level: 3, name: 'Nachrichten per E-Mail' });
    expect(klassenVon(titel)).toEqual(['text-ink', 'text-abschnitt']);
    expect(klassenVon(titel.parentElement)).toEqual(
      expect.arrayContaining(['mt-4', 'mb-2', 'first:mt-0']),
    );
  });
});

describe('Formularfuss (Design-Fundament, Lücke 9.5)', () => {
  it('stellt die Knöpfe am Telefon untereinander in voller Breite, ab 640 px nebeneinander', () => {
    renderWithProviders(
      <Formularfuss>
        <Button type="submit">Speichern</Button>
        <ButtonLink to="/zurueck" variant="quiet">
          Abbrechen
        </ButtonLink>
      </Formularfuss>,
    );
    const speichern = screen.getByRole('button', { name: 'Speichern' });
    const reihe = speichern.parentElement!;
    expect(klassenVon(reihe)).toEqual(
      expect.arrayContaining(['flex-col', '*:w-full', 'sm:flex-row', 'sm:*:w-auto', 'gap-3']),
    );
    expect(klassenVon(reihe.parentElement)).toContain('mt-8');
    // Ein Formularfuß ist eine Seitenhandlung: 48 px, nicht kompakt.
    expect(speichern).toHaveClass('h-12');
    // Reihenfolge: der Hauptknopf zuerst.
    expect(reihe.firstElementChild).toBe(speichern);
  });

  it('setzt auf Wunsch eine Linie darüber und einen Satz über die Knöpfe', () => {
    renderWithProviders(
      <Formularfuss trenner zusatz="Schreibt den Bogen fest.">
        <Button type="submit">Festschreiben</Button>
      </Formularfuss>,
    );
    const satz = screen.getByText('Schreibt den Bogen fest.');
    expect(klassenVon(satz)).toEqual(expect.arrayContaining(['text-sm', 'text-ink-muted']));
    expect(klassenVon(satz.parentElement)).toEqual(
      expect.arrayContaining(['border-t', 'border-line', 'pt-6', 'mt-8']),
    );
  });

  it('rückt im festen Fuß eines Fensters dicht an die Zeile darüber (FLT-005)', () => {
    renderWithProviders(
      <Formularfuss dicht>
        <Button type="button">Check-Up speichern</Button>
      </Formularfuss>,
    );
    const fuss = screen.getByRole('button', { name: 'Check-Up speichern' }).parentElement!
      .parentElement;
    expect(klassenVon(fuss)).toContain('mt-2');
    expect(klassenVon(fuss)).not.toContain('mt-8');
  });
});

describe('Aktionsleiste (Design-Fundament, aus der Schreibseite)', () => {
  it('klebt am Telefon über der Tableiste, ab 640 px am Rand, ohne Schatten', () => {
    renderWithProviders(
      <Aktionsleiste oben={<p>Text noch nicht gespeichert.</p>}>
        <Button type="button" variant="quiet">
          Entwurf
        </Button>
        <Button type="submit">Festschreiben</Button>
      </Aktionsleiste>,
    );
    const knopf = screen.getByRole('button', { name: 'Festschreiben' });
    const reihe = knopf.parentElement!;
    const leiste = reihe.parentElement!;
    expect(klassenVon(leiste)).toEqual(
      expect.arrayContaining([
        'sticky',
        'bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))]',
        'sm:bottom-0',
        'bg-surface',
        'z-10',
      ]),
    );
    expect(leiste.className).not.toMatch(/shadow|ring/);
    expect(klassenVon(reihe)).toEqual(expect.arrayContaining(['border-t', 'border-line']));
    // Die Zeile darüber gehört zur Leiste.
    expect(leiste.firstElementChild).toHaveTextContent('Text noch nicht gespeichert.');
    // Knöpfe sind dort ohne Angabe kompakt.
    expect(knopf).toHaveClass('min-h-11');
  });

  it('greift auf einer gewöhnlichen Seite über den Innenabstand hinaus, auf einer Fläche nicht', () => {
    const { unmount } = renderWithProviders(
      <Aktionsleiste>
        <Button type="submit">Speichern</Button>
      </Aktionsleiste>,
    );
    let reihe = screen.getByRole('button').parentElement!;
    expect(klassenVon(reihe.parentElement)).toEqual(
      expect.arrayContaining(['-mx-4', 'sm:-mx-6', 'lg:-mx-8']),
    );
    expect(klassenVon(reihe)).toEqual(expect.arrayContaining(['px-4', 'sm:px-6', 'lg:px-8']));
    unmount();

    renderWithProviders(
      <Aktionsleiste einbettung="flaeche">
        <Button type="submit">Speichern</Button>
      </Aktionsleiste>,
    );
    reihe = screen.getByRole('button').parentElement!;
    expect(klassenVon(reihe.parentElement)).not.toContain('-mx-4');
    expect(klassenVon(reihe)).toContain('px-3');
  });
});

describe('Zweispalter (Design-Fundament, aus der Übersicht)', () => {
  it('stellt ab 900 px Inhaltsbreite die Kontextspalte rechts daneben', () => {
    const { container } = renderWithProviders(
      <Zweispalter kontext={<section>Tagesplan</section>}>
        <p>Mein Tag</p>
      </Zweispalter>,
    );
    expect(container.firstElementChild).toHaveClass('@container');
    const raster = container.firstElementChild!.firstElementChild!;
    expect(klassenVon(raster)).toEqual(
      expect.arrayContaining([
        'grid',
        '@zweispaltig:grid-cols-[minmax(0,1fr)_minmax(300px,380px)]',
        '@zweispaltig:gap-x-8',
        'gap-6',
      ]),
    );
    const kontext = screen.getByRole('complementary');
    expect(kontext).toHaveTextContent('Tagesplan');
    expect(klassenVon(kontext)).toEqual(expect.arrayContaining(['flex-col', 'gap-4']));
  });

  it('kennt eine schmale Kontextspalte für Objektseiten', () => {
    const { container } = renderWithProviders(
      <Zweispalter kontext={<p>Kontakt</p>} kontextBreite="schmal">
        <p>Reiterinhalt</p>
      </Zweispalter>,
    );
    expect(container.firstElementChild!.firstElementChild).toHaveClass(
      '@zweispaltig:grid-cols-[minmax(0,1fr)_minmax(280px,340px)]',
    );
  });

  it('bleibt ohne Kontext eine Spalte, ab 1024 px höchstens 48rem breit', () => {
    const { container } = renderWithProviders(
      <Zweispalter kontext={null} className="print:hidden">
        <p>Plan des Teams</p>
      </Zweispalter>,
    );
    const raster = container.firstElementChild!.firstElementChild!;
    expect(klassenVon(raster)).toEqual(['lg:max-w-spalte', 'print:hidden']);
    expect(screen.queryByRole('complementary')).toBeNull();
  });
});
