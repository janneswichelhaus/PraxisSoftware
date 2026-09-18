import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useSpanneAufziehen, type Spanne } from './useSpanneAufziehen';

/**
 * Die Spanne auf der freien Fläche (CAL-019).
 *
 * Geprüft wird die Mechanik, nicht der Kalender: Eine Stunde ist 60 px hoch,
 * das Gitter beginnt bei y = 0 und zeigt 7 bis 19 Uhr, das Raster ist 5
 * Minuten. y = 120 sind damit 9:00 Uhr.
 */
function Harness({ onAuswahl }: { onAuswahl: (s: Spanne) => void }) {
  const spanne = useSpanneAufziehen({
    fensterVon: 7 * 60,
    fensterBis: 19 * 60,
    stundenHoehe: 60,
    raster: 5,
    spalteAn: (x) => (x >= 0 && x <= 200 ? 'a' : null),
    obenAn: () => 0,
    onAuswahl,
  });
  return (
    <>
      <button type="button" onPointerDown={(e) => spanne.beginnen(e, 'a')}>
        Freie Flaeche
      </button>
      <output data-testid="vorschau">
        {spanne.vorschau
          ? `${spanne.vorschau.spalteId}:${spanne.vorschau.vonMinute}-${spanne.vorschau.bisMinute}`
          : '-'}
      </output>
    </>
  );
}

function start(y = 120, pointerType = 'mouse') {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Freie Flaeche' }), {
    clientX: 100,
    clientY: y,
    button: 0,
    pointerType,
  });
}

describe('useSpanneAufziehen', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('zieht eine Spanne von oben nach unten auf und rastet sie ein', () => {
    const onAuswahl = vi.fn();
    render(<Harness onAuswahl={onAuswahl} />);

    start(120);
    // 46 px tiefer: 9:46 Uhr, gerastet auf 9:45.
    fireEvent.pointerMove(window, { clientX: 100, clientY: 166, button: 0 });
    expect(screen.getByTestId('vorschau')).toHaveTextContent('a:540-585');

    fireEvent.pointerUp(window, { clientX: 100, clientY: 166 });
    expect(onAuswahl).toHaveBeenCalledWith({ spalteId: 'a', vonMinute: 540, bisMinute: 585 });
  });

  it('zieht auch nach oben auf - Beginn bleibt der frühere Rasterpunkt', () => {
    const onAuswahl = vi.fn();
    render(<Harness onAuswahl={onAuswahl} />);

    start(180);
    fireEvent.pointerMove(window, { clientX: 100, clientY: 120, button: 0 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 120 });

    expect(onAuswahl).toHaveBeenCalledWith({ spalteId: 'a', vonMinute: 540, bisMinute: 600 });
  });

  it('bleibt in der Spalte des Aufsetzpunkts', () => {
    const onAuswahl = vi.fn();
    render(<Harness onAuswahl={onAuswahl} />);

    start(120);
    // Weit nach rechts aus der Spalte heraus und zugleich nach unten.
    fireEvent.pointerMove(window, { clientX: 400, clientY: 180, button: 0 });
    fireEvent.pointerUp(window, { clientX: 400, clientY: 180 });

    expect(onAuswahl).toHaveBeenCalledWith({ spalteId: 'a', vonMinute: 540, bisMinute: 600 });
  });

  it('meldet ohne Bewegung nichts - der Tap bleibt ein Klick', () => {
    const onAuswahl = vi.fn();
    render(<Harness onAuswahl={onAuswahl} />);

    start(120);
    fireEvent.pointerUp(window, { clientX: 100, clientY: 120 });

    expect(onAuswahl).not.toHaveBeenCalled();
  });

  it('wird am Zeigegeraet erst jenseits der Schwelle zur Geste', () => {
    const onAuswahl = vi.fn();
    render(<Harness onAuswahl={onAuswahl} />);

    start(120);
    // Drei Pixel sind ein Wackeln, kein Aufziehen.
    fireEvent.pointerMove(window, { clientX: 100, clientY: 123, button: 0 });
    expect(screen.getByTestId('vorschau')).toHaveTextContent('-');
    fireEvent.pointerUp(window, { clientX: 100, clientY: 123 });
    expect(onAuswahl).not.toHaveBeenCalled();
  });

  /**
   * Am Finger heißt dieselbe Bewegung zuerst einmal „scrollen" (UX-010).
   * Erst der lange Druck macht daraus ein Aufziehen.
   */
  it('beginnt am Finger erst nach dem langen Druck', () => {
    vi.useFakeTimers();
    const onAuswahl = vi.fn();
    render(<Harness onAuswahl={onAuswahl} />);

    start(120, 'touch');
    fireEvent.pointerMove(window, { clientX: 100, clientY: 180, button: 0 });
    expect(screen.getByTestId('vorschau')).toHaveTextContent('-');
    fireEvent.pointerUp(window, { clientX: 100, clientY: 180 });
    expect(onAuswahl).not.toHaveBeenCalled();
  });

  it('zieht am Finger nach dem langen Druck auf', () => {
    vi.useFakeTimers();
    const onAuswahl = vi.fn();
    render(<Harness onAuswahl={onAuswahl} />);

    start(120, 'touch');
    act(() => {
      vi.advanceTimersByTime(500);
    });
    // Der lange Druck zeigt sofort den Aufsetzpunkt.
    expect(screen.getByTestId('vorschau')).toHaveTextContent('a:540-540');

    fireEvent.pointerMove(window, { clientX: 100, clientY: 210, button: 0 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 210 });
    expect(onAuswahl).toHaveBeenCalledWith({ spalteId: 'a', vonMinute: 540, bisMinute: 630 });
  });

  it('haelt die Auswahl im dargestellten Fenster', () => {
    const onAuswahl = vi.fn();
    render(<Harness onAuswahl={onAuswahl} />);

    start(120);
    // Weit unter das Fensterende hinaus gezogen.
    fireEvent.pointerMove(window, { clientX: 100, clientY: 2000, button: 0 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 2000 });

    expect(onAuswahl).toHaveBeenCalledWith({ spalteId: 'a', vonMinute: 540, bisMinute: 19 * 60 });
  });

  it('bricht mit Escape ab', () => {
    const onAuswahl = vi.fn();
    render(<Harness onAuswahl={onAuswahl} />);

    start(120);
    fireEvent.pointerMove(window, { clientX: 100, clientY: 180, button: 0 });
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.getByTestId('vorschau')).toHaveTextContent('-');

    fireEvent.pointerUp(window, { clientX: 100, clientY: 180 });
    expect(onAuswahl).not.toHaveBeenCalled();
  });
});
