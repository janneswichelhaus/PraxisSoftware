import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useTerminZiehen, type ZiehZustand } from './useTerminZiehen';

/**
 * Der Zieh-Hook über den Ausschnitt hinaus (FIX-018, BEF-014).
 *
 * Geprüft wird die Mechanik, nicht der Kalender: Bildlauf während der Geste,
 * Auto-Scroll am Fensterrand, Blättern am seitlichen Rand und die Regel, dass
 * ein geblätterter Ausschnitt eine Änderung ist. Eine Stunde ist 60 px hoch,
 * das Raster 5 Minuten, eine Spalte „a" von x=0 bis 200.
 */
function Harness({
  onAblegen,
  onBlaettern,
  kontext,
}: {
  onAblegen: (z: ZiehZustand) => void;
  onBlaettern?: (r: -1 | 1) => void;
  kontext: string;
}) {
  const ziehen = useTerminZiehen({
    fensterVon: 7 * 60,
    fensterBis: 19 * 60,
    stundenHoehe: 60,
    raster: 5,
    spalteAn: (x) => (x >= 0 && x <= 200 ? 'a' : null),
    kontext,
    randAn: (x) => (x < 0 ? -1 : x > 200 ? 1 : 0),
    onBlaettern,
    onAblegen,
  });
  return (
    <>
      <button
        type="button"
        onPointerDown={(e) =>
          ziehen.beginnen(e, { id: 't1', spalteId: 'a', startMinute: 9 * 60, dauer: 60 })
        }
      >
        Kachel
      </button>
      <output data-testid="vorschau">
        {ziehen.vorschau ? `${ziehen.vorschau.spalteId}:${ziehen.vorschau.startMinute}` : '-'}
      </output>
    </>
  );
}

function start(x = 100, y = 300) {
  fireEvent.pointerDown(screen.getByRole('button', { name: 'Kachel' }), {
    clientX: x,
    clientY: y,
    button: 0,
    pointerType: 'mouse',
  });
}

describe('useTerminZiehen: über den Ausschnitt hinaus (FIX-018)', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true, configurable: true });
    Object.defineProperty(window, 'innerHeight', {
      value: 800,
      writable: true,
      configurable: true,
    });
    window.scrollBy = vi.fn((_x: number, y: number) => {
      window.scrollY += y;
    }) as unknown as typeof window.scrollBy;
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('bricht ein aktives Ziehen bei einem Bildlauf nicht mehr ab und rechnet ihn mit', () => {
    const onAblegen = vi.fn();
    render(<Harness onAblegen={onAblegen} kontext="2027-05-12" />);
    start();
    // Eine Stunde nach unten: 60 px.
    fireEvent.pointerMove(window, { clientX: 100, clientY: 360, button: 0 });
    expect(screen.getByTestId('vorschau')).toHaveTextContent('a:600');

    // Die Seite scrollt um eine weitere Stunde - der Zeiger bleibt, wo er ist.
    window.scrollY = 60;
    fireEvent.scroll(window);
    expect(screen.getByTestId('vorschau')).toHaveTextContent('a:660');

    fireEvent.pointerUp(window, { clientX: 100, clientY: 360 });
    expect(onAblegen).toHaveBeenCalledWith(
      expect.objectContaining({ terminId: 't1', spalteId: 'a', startMinute: 660 }),
    );
  });

  it('bricht am Finger vor dem langen Druck bei einem Bildlauf weiterhin ab (UX-010)', () => {
    vi.useFakeTimers();
    const onAblegen = vi.fn();
    render(<Harness onAblegen={onAblegen} kontext="2027-05-12" />);
    fireEvent.pointerDown(screen.getByRole('button', { name: 'Kachel' }), {
      clientX: 100,
      clientY: 300,
      button: 0,
      pointerType: 'touch',
    });
    fireEvent.scroll(window);
    act(() => {
      vi.advanceTimersByTime(600);
    });
    expect(screen.getByTestId('vorschau')).toHaveTextContent('-');
    fireEvent.pointerUp(window, { clientX: 100, clientY: 300 });
    expect(onAblegen).not.toHaveBeenCalled();
  });

  it('scrollt am unteren Fensterrand von selbst weiter', () => {
    vi.useFakeTimers();
    render(<Harness onAblegen={vi.fn()} kontext="2027-05-12" />);
    start();
    fireEvent.pointerMove(window, { clientX: 100, clientY: 790, button: 0 });
    act(() => {
      vi.advanceTimersByTime(16 * 6);
    });
    expect(window.scrollBy).toHaveBeenCalled();
    expect(window.scrollY).toBeGreaterThan(0);
    // Zurück in die Mitte: der Bildlauf hört auf.
    const bisher = window.scrollY;
    fireEvent.pointerMove(window, { clientX: 100, clientY: 400, button: 0 });
    act(() => {
      vi.advanceTimersByTime(16 * 6);
    });
    expect(window.scrollY).toBe(bisher);
  });

  it('blaettert, wenn der Zeiger seitlich am Gitter verharrt - und behaelt die Geste', () => {
    vi.useFakeTimers();
    const onBlaettern = vi.fn();
    const onAblegen = vi.fn();
    render(<Harness onAblegen={onAblegen} onBlaettern={onBlaettern} kontext="2027-05-12" />);
    start();
    fireEvent.pointerMove(window, { clientX: 260, clientY: 300, button: 0 });
    act(() => {
      vi.advanceTimersByTime(650);
    });
    expect(onBlaettern).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onBlaettern).toHaveBeenCalledWith(1);
    // Weiter am Rand: das naechste Blatt nach derselben Zeit.
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(onBlaettern).toHaveBeenCalledTimes(2);
    // Die Geste lebt noch: zurueck ins Gitter, eine Stunde tiefer loslassen.
    fireEvent.pointerMove(window, { clientX: 100, clientY: 360, button: 0 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 360 });
    expect(onAblegen).toHaveBeenCalledWith(expect.objectContaining({ startMinute: 600 }));
  });

  it('wertet einen geblaetterten Ausschnitt als Aenderung, auch bei gleicher Spalte und Zeit', () => {
    const onAblegen = vi.fn();
    const { rerender } = render(<Harness onAblegen={onAblegen} kontext="2027-05-12" />);
    start();
    fireEvent.pointerMove(window, { clientX: 100, clientY: 320, button: 0 });
    // Zurueck auf den Ausgangspunkt, aber inzwischen ist geblaettert worden.
    rerender(<Harness onAblegen={onAblegen} kontext="2027-05-13" />);
    fireEvent.pointerMove(window, { clientX: 100, clientY: 300, button: 0 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 300 });
    expect(onAblegen).toHaveBeenCalledWith(
      expect.objectContaining({ spalteId: 'a', startMinute: 540 }),
    );
  });

  it('schreibt ohne Aenderung weiterhin nichts', () => {
    const onAblegen = vi.fn();
    render(<Harness onAblegen={onAblegen} kontext="2027-05-12" />);
    start();
    fireEvent.pointerMove(window, { clientX: 100, clientY: 320, button: 0 });
    fireEvent.pointerMove(window, { clientX: 100, clientY: 300, button: 0 });
    fireEvent.pointerUp(window, { clientX: 100, clientY: 300 });
    expect(onAblegen).not.toHaveBeenCalled();
  });
});
