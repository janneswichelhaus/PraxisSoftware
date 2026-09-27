import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Button } from './Button';
import { Dialogfenster, Hinweisfenster } from './Dialogfenster';

/**
 * Das Fenster über dem Inhalt (FIX-016, ANN-058): Es darf niemandem etwas
 * wegnehmen - Fokus hinein, Fokus im Kreis, Escape und Klick daneben sind
 * Abbrechen, Fokus zurück.
 */
function Seite({ onSchliessen }: { onSchliessen: () => void }) {
  return (
    <>
      <Button type="button">Davor</Button>
      <Dialogfenster titel="Frage" onSchliessen={onSchliessen}>
        <p>Text</p>
        <Button type="button" data-autofocus>
          Ja
        </Button>
        <Button type="button" onClick={onSchliessen}>
          Nein
        </Button>
      </Dialogfenster>
    </>
  );
}

describe('Dialogfenster', () => {
  it('ist ein benannter, modaler Dialog und setzt den Fokus hinein', () => {
    render(<Seite onSchliessen={() => undefined} />);
    const fenster = screen.getByRole('dialog', { name: 'Frage' });
    expect(fenster).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('button', { name: 'Ja' })).toHaveFocus();
  });

  it('haelt den Fokus im Kreis', async () => {
    const user = userEvent.setup();
    render(<Seite onSchliessen={() => undefined} />);

    await user.tab();
    expect(screen.getByRole('button', { name: 'Nein' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Ja' })).toHaveFocus();
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Nein' })).toHaveFocus();
  });

  it('behaelt Fokus und Escape auch nach einem Klick auf Text im Fenster', async () => {
    const onSchliessen = vi.fn();
    const user = userEvent.setup();
    render(<Seite onSchliessen={onSchliessen} />);

    await user.click(screen.getByText('Text'));
    // Der Fokus liegt auf dem Fenster, nicht auf der Seite darunter.
    expect(screen.getByRole('dialog')).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Ja' })).toHaveFocus();
    await user.click(screen.getByText('Text'));
    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Nein' })).toHaveFocus();
    await user.click(screen.getByText('Text'));
    await user.keyboard('{Escape}');
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });

  it('schliesst mit Escape - das ist Abbrechen, nie Bestaetigen', async () => {
    const onSchliessen = vi.fn();
    const user = userEvent.setup();
    render(<Seite onSchliessen={onSchliessen} />);

    await user.keyboard('{Escape}');
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });

  it('schliesst mit einem Klick neben das Fenster', async () => {
    const onSchliessen = vi.fn();
    const user = userEvent.setup();
    render(<Seite onSchliessen={onSchliessen} />);

    const schleier = screen.getByRole('dialog').parentElement!;
    await user.click(schleier);
    expect(onSchliessen).toHaveBeenCalledTimes(1);

    // Ein Klick IM Fenster schliesst nicht.
    await user.click(screen.getByText('Text'));
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });

  it('gibt den Fokus zurueck, wo er herkam', async () => {
    const user = userEvent.setup();
    function Umschalter() {
      const [offen, setOffen] = useState(false);
      return (
        <>
          <Button type="button" onClick={() => setOffen(true)}>
            Öffnen
          </Button>
          {offen ? (
            <Dialogfenster titel="Frage" onSchliessen={() => setOffen(false)}>
              <Button type="button" onClick={() => setOffen(false)}>
                Nein
              </Button>
            </Dialogfenster>
          ) : null}
        </>
      );
    }
    render(<Umschalter />);
    const oeffnen = screen.getByRole('button', { name: 'Öffnen' });
    await user.click(oeffnen);
    expect(screen.getByRole('button', { name: 'Nein' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Nein' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(oeffnen).toHaveFocus();
  });

  /**
   * UIK-09, DAT-11: Im Kameradialog verschwindet „Auslösen" mit dem Tipp
   * darauf. Der Fokus fiel auf den body, Escape und Tab liefen ins Leere.
   */
  it('holt den Fokus zurueck, wenn das fokussierte Element verschwindet', async () => {
    const onSchliessen = vi.fn();
    const user = userEvent.setup();
    function Kamera() {
      const [aufgenommen, setAufgenommen] = useState(false);
      return (
        <Dialogfenster titel="Foto aufnehmen" onSchliessen={onSchliessen}>
          {/* Eigene Schlüssel: Sonst übernähme React denselben <button>, und
              der Fokus bliebe einfach, wo er ist - der Fall wäre nicht
              geprüft. */}
          {aufgenommen ? (
            <Button key="verwenden" type="button" data-autofocus>
              Foto verwenden
            </Button>
          ) : (
            <Button
              key="ausloesen"
              type="button"
              data-autofocus
              onClick={() => setAufgenommen(true)}
            >
              Auslösen
            </Button>
          )}
          <Button type="button">Abbrechen</Button>
        </Dialogfenster>
      );
    }
    render(<Kamera />);
    expect(screen.getByRole('button', { name: 'Auslösen' })).toHaveFocus();

    await user.keyboard('{Enter}');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Foto verwenden' })).toHaveFocus(),
    );
    // Und damit wirken Escape und der Fokuskreis wieder.
    await user.keyboard('{Escape}');
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });

  it('holt den Fokus zurueck, wenn er das Fenster verlaesst', () => {
    render(<Seite onSchliessen={() => undefined} />);
    const ja = screen.getByRole('button', { name: 'Ja' });
    expect(ja).toHaveFocus();

    // Etwa ein Skript der Seite darunter, das ein Feld fokussiert.
    act(() => screen.getByRole('button', { name: 'Davor' }).focus());
    expect(ja).toHaveFocus();
  });

  it('sperrt die Seite darunter mit inert und gibt sie beim Schliessen frei', async () => {
    const user = userEvent.setup();
    function Umschalter() {
      const [offen, setOffen] = useState(false);
      return (
        <>
          <Button type="button" onClick={() => setOffen(true)}>
            Öffnen
          </Button>
          {offen ? (
            <Dialogfenster titel="Frage" onSchliessen={() => setOffen(false)}>
              <Button type="button" onClick={() => setOffen(false)}>
                Nein
              </Button>
            </Dialogfenster>
          ) : null}
        </>
      );
    }
    const { container } = render(<Umschalter />);
    await user.click(screen.getByRole('button', { name: 'Öffnen' }));

    // Die Anwendung liegt neben dem Schleier am body und ist gesperrt; das
    // Fenster selbst nicht.
    expect(container).toHaveAttribute('inert');
    const schleier = screen.getByRole('dialog').parentElement!;
    expect(schleier.parentElement).toBe(document.body);
    expect(schleier).not.toHaveAttribute('inert');

    await user.click(screen.getByRole('button', { name: 'Nein' }));
    expect(container).not.toHaveAttribute('inert');
    expect(screen.getByRole('button', { name: 'Öffnen' })).toHaveFocus();
  });

  it('laesst einem zweiten Fenster, das darueber aufgeht, den Fokus', () => {
    // Zwei Fenster, die einander den Fokus abnehmen, liefen im Kreis; und das
    // obere darf nicht unter dem `inert` des unteren liegen.
    render(
      <>
        <Dialogfenster titel="Unten" onSchliessen={() => undefined}>
          <Button type="button">Unten bleiben</Button>
        </Dialogfenster>
        <Dialogfenster titel="Oben" onSchliessen={() => undefined}>
          <Button type="button">Oben bleiben</Button>
        </Dialogfenster>
      </>,
    );
    expect(screen.getByRole('button', { name: 'Oben bleiben' })).toHaveFocus();
    const unten = screen.getByRole('dialog', { name: 'Unten' }).parentElement!;
    const oben = screen.getByRole('dialog', { name: 'Oben' }).parentElement!;
    expect(unten).toHaveAttribute('inert');
    expect(oben).not.toHaveAttribute('inert');
  });

  it('setzt den Titel nach Handoff, am Telefon eine Stufe kleiner (UIK-22)', () => {
    render(<Seite onSchliessen={() => undefined} />);
    const titel = screen.getByRole('heading', { name: 'Frage' });
    expect(titel).toHaveClass('text-h4', 'sm:text-h3', 'font-bold');
  });
});

describe('Hinweisfenster', () => {
  it('liest den Hinweis als alert vor und schliesst ueber die eine Schaltflaeche', async () => {
    const onSchliessen = vi.fn();
    const user = userEvent.setup();
    render(
      <Hinweisfenster titel="Das ging nicht." onSchliessen={onSchliessen}>
        Grund.
      </Hinweisfenster>,
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Grund.');
    const zurueck = screen.getByRole('button', { name: 'Zurück zum Formular' });
    expect(zurueck).toHaveFocus();
    await user.click(zurueck);
    expect(onSchliessen).toHaveBeenCalledTimes(1);
  });
});
