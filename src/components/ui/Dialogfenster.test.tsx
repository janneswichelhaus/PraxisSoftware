import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
