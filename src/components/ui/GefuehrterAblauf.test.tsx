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
