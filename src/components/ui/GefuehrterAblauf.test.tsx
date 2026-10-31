import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { Button } from './Button';
import { GefuehrterAblauf } from './GefuehrterAblauf';
import { beginne, kannZurueck, weiter, zurueck, type Abfolge } from './abfolge';

type Seite = 'geklingelt' | 'angerufen' | 'abschluss';

const FRAGEN: Record<Seite, string> = {
  geklingelt: 'Geklingelt?',
  angerufen: 'Angerufen?',
  abschluss: 'Alles erledigt?',
};

/** Ein kleiner Ablauf mit drei Seiten - die Folge steht im Test, nicht im Baustein. */
function Ablauf({ onSchliessen, onFertig }: { onSchliessen: () => void; onFertig: () => void }) {
  const [abfolge, setAbfolge] = useState<Abfolge<Seite>>(() => beginne<Seite>('geklingelt'));
  const nummer = abfolge.verlauf.length + 1;
  const amEnde = abfolge.seite === 'abschluss';
  return (
    <GefuehrterAblauf
      titel={FRAGEN[abfolge.seite]}
      objekt="Max Mustermann · 9:00"
      schliessen="Ablauf abbrechen"
      onSchliessen={onSchliessen}
      seite={abfolge.seite}
      stand={{ text: `Schritt ${nummer} von 3`, wert: nummer, von: 3 }}
      onZurueck={kannZurueck(abfolge) ? () => setAbfolge(zurueck(abfolge)!) : undefined}
      abschluss={amEnde}
      fuss={
        amEnde ? (
          <Button className="w-full" onClick={onFertig} data-autofocus>
            Vermerken
          </Button>
        ) : (
          <Button
            className="w-full"
            data-autofocus
            onClick={() =>
              setAbfolge(
                weiter(abfolge, abfolge.seite === 'geklingelt' ? 'angerufen' : 'abschluss'),
              )
            }
          >
            Ja
          </Button>
        )
      }
    >
      <p>Inhalt der Seite {abfolge.seite}</p>
    </GefuehrterAblauf>
  );
}

describe('GefuehrterAblauf', () => {
  it('heißt nach der Frage, nennt das Objekt und den Schritt, ohne „Zurück“ auf der ersten Seite', async () => {
    render(<Ablauf onSchliessen={vi.fn()} onFertig={vi.fn()} />);
    const fenster = screen.getByRole('dialog', { name: 'Geklingelt?' });
    expect(within(fenster).getByRole('heading', { name: 'Geklingelt?' })).toBeInTheDocument();
    expect(within(fenster).getByText('Max Mustermann · 9:00')).toBeInTheDocument();
    expect(within(fenster).getByText('Schritt 1 von 3')).toBeInTheDocument();
    expect(within(fenster).queryByRole('button', { name: '← Zurück' })).toBeNull();
    expect(within(fenster).getByRole('button', { name: 'Ablauf abbrechen' })).toBeInTheDocument();
    // Der Fokus steht auf der Antwort, nicht im Kopf.
    expect(within(fenster).getByRole('button', { name: 'Ja' })).toHaveFocus();
    await pruefeBarrierefreiheit(document.body);
  });

  it('geht weiter, sagt den Wechsel an und nimmt kurz keinen Tipp an', async () => {
    const nutzer = userEvent.setup();
    render(<Ablauf onSchliessen={vi.fn()} onFertig={vi.fn()} />);
    await nutzer.click(screen.getByRole('button', { name: 'Ja' }));
    const fenster = screen.getByRole('dialog', { name: 'Angerufen?' });
    expect(within(fenster).getByText('Schritt 2 von 3: Angerufen?')).toHaveClass('sr-only');
    const ja = within(fenster).getByRole('button', { name: 'Ja' });
    expect(ja.closest('.pointer-events-none')).not.toBeNull();
    await waitFor(() => expect(ja.closest('.pointer-events-none')).toBeNull(), { timeout: 2000 });
    expect(ja).toHaveFocus();
  });

  it('führt mit „← Zurück“ dorthin, woher man kam, und zeigt den Abschluss mit festem Fuß', async () => {
    const nutzer = userEvent.setup();
    const onFertig = vi.fn();
    render(<Ablauf onSchliessen={vi.fn()} onFertig={onFertig} />);
    await nutzer.click(screen.getByRole('button', { name: 'Ja' }));
    await nutzer.click(
      within(screen.getByRole('dialog', { name: 'Angerufen?' })).getByRole('button', {
        name: '← Zurück',
      }),
    );
    expect(screen.getByRole('dialog', { name: 'Geklingelt?' })).toBeInTheDocument();

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ja' }).closest('.pointer-events-none')).toBeNull(),
    );
    await nutzer.click(screen.getByRole('button', { name: 'Ja' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Ja' }).closest('.pointer-events-none')).toBeNull(),
    );
    await nutzer.click(screen.getByRole('button', { name: 'Ja' }));
    const abschluss = screen.getByRole('dialog', { name: 'Alles erledigt?' });
    const vermerken = within(abschluss).getByRole('button', { name: 'Vermerken' });
    // Der Fuß des Abschlusses steht mit Linie unter dem rollenden Inhalt.
    expect(vermerken.closest('.border-t')).not.toBeNull();
    await waitFor(() => expect(vermerken.closest('.pointer-events-none')).toBeNull());
    await nutzer.click(vermerken);
    expect(onFertig).toHaveBeenCalledTimes(1);
  });

  it('macht die rollende Fläche per Tastatur erreichbar, auch ohne Bedienelement darin (BEF-175)', async () => {
    render(
      <GefuehrterAblauf
        titel="Gemeldet"
        schliessen="Ablauf schließen"
        onSchliessen={vi.fn()}
        seite="ende"
        abschluss
        fuss={<Button className="w-full">Fertig</Button>}
      >
        <p>Nur Text, kein Feld.</p>
      </GefuehrterAblauf>,
    );
    const flaeche = screen.getByText('Nur Text, kein Feld.').closest('[tabindex="0"]');
    expect(flaeche).toHaveClass('overflow-y-auto');
    // Kein zweiter Name neben dem des Fensters: Er träfe die Suche nach einem
    // Feld, dessen Beschriftung in der Frage steht.
    expect(flaeche).not.toHaveAttribute('aria-label');
    expect(screen.queryByRole('region')).toBeNull();
    await pruefeBarrierefreiheit(document.body);
  });

  it('zeigt den Balken nur mit fester Schrittzahl', () => {
    const { rerender } = render(
      <GefuehrterAblauf
        titel="Ist die Weiterfahrt gehindert?"
        schliessen="Panne abbrechen"
        onSchliessen={vi.fn()}
        seite="weiterfahrt"
        stand={{ text: 'Schritt 2' }}
      >
        <p>Ohne Gesamtzahl</p>
      </GefuehrterAblauf>,
    );
    expect(document.querySelector('[data-fortschritt]')).toBeNull();
    rerender(
      <GefuehrterAblauf
        titel="Ist die Weiterfahrt gehindert?"
        schliessen="Panne abbrechen"
        onSchliessen={vi.fn()}
        seite="weiterfahrt"
        stand={{ text: 'Schritt 2 von 4', wert: 2, von: 4 }}
      >
        <p>Mit Gesamtzahl</p>
      </GefuehrterAblauf>,
    );
    expect(document.querySelector('[data-fortschritt]')).toHaveStyle({ width: '50%' });
  });

  it('schließt über das ✕ mit eigenem Namen', async () => {
    const nutzer = userEvent.setup();
    const onSchliessen = vi.fn();
    render(<Ablauf onSchliessen={onSchliessen} onFertig={vi.fn()} />);
    await nutzer.click(screen.getByRole('button', { name: 'Ablauf abbrechen' }));
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });
});

describe('GefuehrterAblauf wechselt die Seiten waagerecht (ANN-663)', () => {
  it('rückt die nächste Seite von rechts nach, nach „← Zurück“ von links', async () => {
    const animate = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
    try {
      const nutzer = userEvent.setup();
      render(<Ablauf onSchliessen={vi.fn()} onFertig={vi.fn()} />);
      // Die erste Seite rückt nicht; sie kommt mit dem Fenster.
      expect(animate).not.toHaveBeenCalled();
      await nutzer.click(screen.getByRole('button', { name: 'Ja' }));
      expect(animate).toHaveBeenLastCalledWith(
        [{ translate: '3rem 0' }, { translate: '0 0' }],
        expect.objectContaining({ duration: 320 }),
      );
      await nutzer.click(screen.getByRole('button', { name: '← Zurück' }));
      expect(animate).toHaveBeenLastCalledWith(
        [{ translate: '-3rem 0' }, { translate: '0 0' }],
        expect.anything(),
      );
      await waitFor(() =>
        expect(
          screen.getByRole('button', { name: 'Ja' }).closest('.pointer-events-none'),
        ).toBeNull(),
      );
      await nutzer.click(screen.getByRole('button', { name: 'Ja' }));
      expect(animate).toHaveBeenLastCalledWith(
        [{ translate: '3rem 0' }, { translate: '0 0' }],
        expect.anything(),
      );
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'animate');
    }
  });

  it('springt bei reduzierter Bewegung', async () => {
    const animate = vi.fn();
    Object.defineProperty(HTMLElement.prototype, 'animate', { value: animate, configurable: true });
    const matchMedia = vi.fn(() => ({ matches: true }));
    Object.defineProperty(window, 'matchMedia', { value: matchMedia, configurable: true });
    try {
      const nutzer = userEvent.setup();
      render(<Ablauf onSchliessen={vi.fn()} onFertig={vi.fn()} />);
      await nutzer.click(screen.getByRole('button', { name: 'Ja' }));
      expect(screen.getByRole('dialog', { name: 'Angerufen?' })).toBeInTheDocument();
      expect(animate).not.toHaveBeenCalled();
    } finally {
      Reflect.deleteProperty(HTMLElement.prototype, 'animate');
      Reflect.deleteProperty(window, 'matchMedia');
    }
  });
});

/**
 * Zusätzlich und abschaltbar für die Plattform (Handoff 2026-10-22, Abschnitt
 * 5.3; der Einstieg): „Später“ statt der Zeile mit ✕, ein Balken je Schritt,
 * die Frage in einer Stufe der Plattform, etwas über der Frage und der Fuß im
 * Fluss unter 23rem.
 */
describe('GefuehrterAblauf mit „Später“ und Balken je Schritt (5.3)', () => {
  function Einstieg({
    seite,
    onSchliessen,
    onZurueck,
    abschluss = false,
    fussFest = false,
  }: {
    seite: 1 | 2 | 3;
    onSchliessen: () => void;
    onZurueck?: () => void;
    abschluss?: boolean;
    fussFest?: boolean;
  }) {
    return (
      <GefuehrterAblauf
        titel={seite === 1 ? 'Willkommen,\nErika Beispiel' : 'Zwei Fragen zu Ihren Daten'}
        schliessen="Einstieg schließen"
        onSchliessen={onSchliessen}
        seite={`seite-${seite}`}
        stand={{ text: `Schritt ${seite} von 3`, wert: seite, von: 3 }}
        onZurueck={onZurueck}
        spaeter
        balkenJeSchritt
        titelStufe={seite === 1 ? 'gruss' : 'seite'}
        vorDemTitel={<p>Bild der Praxis</p>}
        plattform
        abschluss={abschluss}
        fussFest={fussFest}
        fuss={
          <Button className="w-full" data-autofocus>
            Weiter
          </Button>
        }
      >
        <p>Inhalt</p>
      </GefuehrterAblauf>
    );
  }

  it('trägt „Später“ statt ✕, beide 48 hoch, und schließt damit', async () => {
    const nutzer = userEvent.setup();
    const onSchliessen = vi.fn();
    render(<Einstieg seite={2} onSchliessen={onSchliessen} onZurueck={vi.fn()} />);
    const fenster = screen.getByRole('dialog', { name: 'Zwei Fragen zu Ihren Daten' });
    expect(within(fenster).queryByRole('button', { name: 'Einstieg schließen' })).toBeNull();
    const spaeter = within(fenster).getByRole('button', { name: 'Später' });
    const zurueck = within(fenster).getByRole('button', { name: '← Zurück' });
    // Normale Größe (48), nicht kompakt (44): „Zurück“ und „Später“ sind Ziele von 48.
    expect(spaeter).toHaveClass('h-12');
    expect(zurueck).toHaveClass('h-12');
    await nutzer.click(spaeter);
    expect(onSchliessen).toHaveBeenCalledTimes(1);
    await pruefeBarrierefreiheit(document.body);
  });

  it('zeigt einen Balken je Schritt, erreicht bis zum aktuellen, und den Schritt als Text', () => {
    render(<Einstieg seite={2} onSchliessen={vi.fn()} />);
    const schritte = Array.from(document.querySelectorAll('[data-schritt]'));
    expect(schritte.map((s) => s.getAttribute('data-schritt'))).toEqual([
      'erreicht',
      'erreicht',
      'offen',
    ]);
    expect(schritte[0]).toHaveClass('bg-accent', 'h-1');
    expect(schritte[2]).toHaveClass('bg-spur');
    expect(schritte[0]!.closest('[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText('Schritt 2 von 3')).toBeVisible();
    // Kein durchgehender Balken daneben.
    expect(document.querySelector('[data-fortschritt]')).toBeNull();
  });

  it('setzt die Frage in die Stufe der Plattform, mit dem Namen in eigener Zeile, darüber das Bild', () => {
    render(<Einstieg seite={1} onSchliessen={vi.fn()} />);
    // Der Name steht in eigener Zeile; vorgelesen wird „Willkommen, Erika Beispiel“.
    const titel = screen.getByRole('heading', { name: /^Willkommen,\s+Erika Beispiel$/ });
    expect(titel).toHaveClass('text-gruss', 'text-accent', 'whitespace-pre-line');
    expect(
      screen.getByRole('dialog', { name: /^Willkommen,\s+Erika Beispiel$/ }),
    ).toBeInTheDocument();
    const bild = screen.getByText('Bild der Praxis');
    expect(bild.compareDocumentPosition(titel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // Auf der ersten Seite kein „Zurück“.
    expect(screen.queryByRole('button', { name: '← Zurück' })).toBeNull();
  });

  it('hat den Rand der Plattform (20) und lässt unter 23rem alles rollen, mit 12 px Rand (ANN-682)', () => {
    render(<Einstieg seite={2} onSchliessen={vi.fn()} onZurueck={vi.fn()} />);
    const inhalt = screen.getByText('Inhalt').closest('[tabindex="0"]');
    expect(inhalt).toHaveClass(
      'px-5',
      'max-[23rem]:overflow-visible',
      'max-[23rem]:flex-none',
      'max-[23rem]:px-3',
    );
    expect(inhalt!.parentElement).toHaveClass('max-[23rem]:flex-none');
    // Kopf, Inhalt und Fuß in einer Rollfläche: „Später“ und „Weiter“ rollen mit.
    const rollt = inhalt!.parentElement!.parentElement!;
    expect(rollt).toHaveClass('max-[23rem]:overflow-y-auto');
    expect(rollt).toContainElement(screen.getByRole('button', { name: 'Später' }));
    expect(rollt).toContainElement(screen.getByRole('button', { name: 'Weiter' }));
    // Rückt „Später“ in eine eigene Reihe, liegen 8 px zwischen den Zielen.
    expect(screen.getByRole('button', { name: 'Später' }).parentElement).toHaveClass(
      'flex-wrap',
      'gap-y-2',
    );
  });

  it('lässt bei „Sehr groß“ Inhalt und Fuß zusammen rollen, auch ohne Linie (ANN-816)', () => {
    render(<Einstieg seite={2} onSchliessen={vi.fn()} onZurueck={vi.fn()} />);
    const inhalt = screen.getByText('Inhalt').closest('[tabindex="0"]');
    // Der Inhalt wächst mit, statt zu schrumpfen; passt alles, steht der Fuß trotzdem unten.
    expect(inhalt).toHaveClass(
      '[[data-schrift=sehr-gross]_&]:shrink-0',
      '[[data-schrift=sehr-gross]_&]:basis-auto',
      '[[data-schrift=sehr-gross]_&]:overflow-visible',
      'flex-1',
    );
    const seite = inhalt!.parentElement!;
    expect(seite).toHaveClass('[[data-schrift=sehr-gross]_&]:overflow-y-auto');
    expect(seite).toContainElement(screen.getByRole('button', { name: 'Weiter' }));
  });

  it('hält auf einer Seite ohne Auswahl den Fuß auch bei „Sehr groß“ fest (ANN-819)', () => {
    render(<Einstieg seite={1} onSchliessen={vi.fn()} fussFest />);
    const inhalt = screen.getByText('Inhalt').closest('[tabindex="0"]');
    // Nur der Inhalt rollt; unter 23rem rollt trotzdem alles zusammen (ANN-682).
    expect(inhalt).toHaveClass('flex-1', 'overflow-y-auto', 'max-[23rem]:overflow-visible');
    expect(inhalt!.className).not.toContain('sehr-gross');
    const seite = inhalt!.parentElement!;
    expect(seite.className).not.toContain('sehr-gross');
    expect(seite).toHaveClass('max-[23rem]:flex-none');
    expect(inhalt).not.toContainElement(screen.getByRole('button', { name: 'Weiter' }));
  });

  it('beginnt unter 23rem jede neue Seite oben, obwohl die Fläche bleibt', () => {
    const { rerender } = render(<Einstieg seite={1} onSchliessen={vi.fn()} />);
    const rollt = screen.getByText('Inhalt').closest('[tabindex="0"]')!.parentElement!
      .parentElement!;
    expect(rollt).toHaveClass('max-[23rem]:overflow-y-auto');
    // Unten auf „Weiter“ getippt: Die Fläche steht weit unten.
    rollt.scrollTop = 400;
    rerender(<Einstieg seite={2} onSchliessen={vi.fn()} onZurueck={vi.fn()} />);
    expect(screen.getByText('Inhalt').closest('[tabindex="0"]')!.parentElement!.parentElement).toBe(
      rollt,
    );
    expect(rollt.scrollTop).toBe(0);
  });

  it('setzt unter 23rem einen Titel mit langem Wort in 22, damit kein Name bricht (ANN-696)', () => {
    function Titel({ titel, stufe }: { titel: string; stufe: 'gruss' | 'seite' }) {
      return (
        <GefuehrterAblauf
          titel={titel}
          schliessen="Einstieg schließen"
          onSchliessen={vi.fn()}
          seite={titel}
          spaeter
          titelStufe={stufe}
          plattform
        >
          <p>Inhalt</p>
        </GefuehrterAblauf>
      );
    }
    const { rerender } = render(<Titel titel={'Willkommen,\nErika Beispiel'} stufe="gruss" />);
    // Elf Zeichen passen in 28: „Willkommen,“ bleibt im Gruß unter 23rem in 28.
    expect(screen.getByRole('heading')).toHaveClass('max-[23rem]:text-plattform-titel');
    expect(screen.getByRole('heading')).not.toHaveClass('max-[23rem]:text-hero-schmal');
    rerender(<Titel titel={'Willkommen,\nPaula Mustermann-Langenscheidt'} stufe="gruss" />);
    expect(screen.getByRole('heading')).toHaveClass('max-[23rem]:text-hero-schmal');
    // Bei „Sehr groß“ ebenso, sonst stand „Weiter“ nicht mehr im ersten Bild (ANN-816).
    expect(screen.getByRole('heading')).toHaveClass(
      '[[data-schrift=sehr-gross]_&]:text-hero-schmal',
    );
    expect(screen.getByRole('heading')).not.toHaveClass('max-[23rem]:text-plattform-titel');
    // Am Bindestrich darf der Name brechen: „Mustermann-“ zählt für sich.
    rerender(<Titel titel="Zwei Fragen zu den Daten von Max Mustermann-Beispiel" stufe="seite" />);
    expect(screen.getByRole('heading').className).not.toContain('23rem');
    rerender(<Titel titel="Zwei Fragen zu den Daten von Max Langenscheidt" stufe="seite" />);
    expect(screen.getByRole('heading')).toHaveClass('max-[23rem]:text-hero-schmal');
  });

  it('zeigt auf dem Abschluss kein „Später“ - sein Fuß führt hinaus', () => {
    render(<Einstieg seite={3} onSchliessen={vi.fn()} onZurueck={vi.fn()} abschluss />);
    expect(screen.queryByRole('button', { name: 'Später' })).toBeNull();
    expect(screen.getByRole('button', { name: '← Zurück' })).toBeInTheDocument();
  });

  it('bleibt ohne die Angaben, wie er war: Zeile mit ✕, durchgehender Balken, Titel des Fensters', () => {
    render(<Ablauf onSchliessen={vi.fn()} onFertig={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Ablauf abbrechen' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Später' })).toBeNull();
    expect(document.querySelector('[data-schritt]')).toBeNull();
    expect(document.querySelector('[data-fortschritt]')).not.toBeNull();
    expect(screen.getByRole('heading', { name: 'Geklingelt?' })).toHaveClass('text-h3');
    const inhalt = screen.getByText('Inhalt der Seite geklingelt').closest('[tabindex="0"]');
    expect(inhalt!.className).not.toContain('23rem');
  });
});

describe('GefuehrterAblauf mit Namen im Kopf (Selbstauskunft)', () => {
  function Checkin({ seite, onSchliessen }: { seite: 1 | 2; onSchliessen: () => void }) {
    return (
      <GefuehrterAblauf
        titel="Wie stark sind Ihre Schmerzen in Ruhe?"
        objekt="Check-in"
        schliessen="Später"
        onSchliessen={onSchliessen}
        seite={`frage-${seite}`}
        stand={{ text: `Frage ${seite} von 3`, wert: seite, von: 3 }}
        onZurueck={seite > 1 ? vi.fn() : undefined}
        spaeter
        balkenJeSchritt
        plattform
        fussLinie
        breit
        unterDemKopf={<p>Keine Verbindung.</p>}
        fuss={<Button className="w-full">Weiter</Button>}
      >
        <p>Skala</p>
      </GefuehrterAblauf>
    );
  }

  it('zeigt den Namen mit „Später“ in der ersten Reihe, darunter Zurück und den Stand', async () => {
    const nutzer = userEvent.setup();
    const onSchliessen = vi.fn();
    render(<Checkin seite={2} onSchliessen={onSchliessen} />);
    const fenster = screen.getByRole('dialog', { name: 'Wie stark sind Ihre Schmerzen in Ruhe?' });
    const name = within(fenster).getByText('Check-in');
    const reihe = name.parentElement!;
    // Die Reihe steht in der Spalte; die Linie reicht am Telefon über die ganze Breite.
    expect(reihe).toHaveClass(
      'min-h-15',
      'flex-wrap',
      '[.plattform-schrift[data-rechner]_&]:max-w-spalte',
    );
    expect(reihe.parentElement).toHaveClass('border-b');
    expect(within(reihe).getByRole('button', { name: 'Später' })).toBeInTheDocument();
    // Die Zeile unter dem Kopf steht zwischen erster und zweiter Reihe.
    expect(reihe.parentElement!.nextElementSibling).toHaveTextContent('Keine Verbindung.');
    expect(within(fenster).getByRole('button', { name: '← Zurück' })).toBeInTheDocument();
    expect(within(fenster).getByText('Frage 2 von 3')).toBeInTheDocument();
    // Fuß mit Linie, Spalte am Rechner 48rem.
    // Der Rand liegt außen: Knopf und Inhalt stehen an derselben Kante der Spalte.
    const weiter = within(fenster).getByRole('button', { name: 'Weiter' });
    expect(weiter.parentElement!.className).toContain(
      '[.plattform-schrift[data-rechner]_&]:max-w-spalte',
    );
    expect(weiter.parentElement!.parentElement).toHaveClass('border-t', 'px-5');
    await nutzer.click(within(reihe).getByRole('button', { name: 'Später' }));
    expect(onSchliessen).toHaveBeenCalledTimes(1);
    await pruefeBarrierefreiheit(document.body);
  });
});
