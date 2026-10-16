import { act, render, screen } from '@testing-library/react';
import { useRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { anzeigerStil, useGleitanzeiger } from './gleitanzeiger';

/**
 * Der gleitende Anzeiger (ANN-567). Wie er sich bewegt, prüft
 * `tests/e2e/bewegung.spec.ts` im Browser; hier steht, was sich mit einem
 * nachgebildeten Layout nachrechnen lässt: der Ruhezustand, das Dehnen, das
 * Ziel des Gleitens.
 */

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function Reihe({ aktiv }: { aktiv: number }) {
  const reihe = useRef<HTMLUListElement>(null);
  const { kasten, phase } = useGleitanzeiger(reihe, aktiv);
  return (
    <ul ref={reihe}>
      {[0, 1, 2].map((nummer) => (
        <li key={nummer}>
          <a href={`#e${nummer}`} aria-current={nummer === aktiv ? 'page' : undefined}>
            Eintrag {nummer}
          </a>
        </li>
      ))}
      {kasten ? (
        <li
          data-testid="anzeiger"
          data-gleitanzeiger=""
          data-phase={phase}
          style={anzeigerStil(kasten, 'unten', 2)}
        />
      ) : null}
    </ul>
  );
}

/**
 * Ein Layout für jsdom: Eintrag n liegt bei n × 100 px, 44 px hoch und so
 * breit, wie `breite` sagt (sonst 80 px); die Reihe ist 400 px breit.
 */
function layoutNachbilden(breite: (nummer: number) => number = () => 80) {
  vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (this: Element) {
    const nummer = /Eintrag (\d)/.exec(this.textContent ?? '')?.[1];
    if (this.tagName !== 'A' || nummer === undefined) {
      return DOMRect.fromRect({ x: 0, y: 0, width: 400, height: 44 });
    }
    return DOMRect.fromRect({
      x: Number(nummer) * 100,
      y: 0,
      width: breite(Number(nummer)),
      height: 44,
    });
  });
}

describe('Gleitanzeiger', () => {
  it('bleibt ohne Layout weg - dann trägt der Eintrag seine Markierung wie bisher', () => {
    render(<Reihe aktiv={0} />);
    expect(screen.queryByTestId('anzeiger')).toBeNull();
  });

  it('liegt in Ruhe genau unter dem aktiven Eintrag, ohne Übergang', () => {
    layoutNachbilden();
    render(<Reihe aktiv={1} />);
    const anzeiger = screen.getByTestId('anzeiger');
    expect(anzeiger).toHaveAttribute('data-phase', 'sofort');
    expect(anzeiger.style.transform).toBe('translate(100px, 42px)');
    expect(anzeiger.style.width).toBe('80px');
  });

  it('dehnt sich beim Wechsel über beide Einträge und gleitet dann auf den neuen', () => {
    vi.useFakeTimers();
    layoutNachbilden();
    const { rerender } = render(<Reihe aktiv={0} />);
    rerender(<Reihe aktiv={2} />);
    const anzeiger = screen.getByTestId('anzeiger');
    expect(anzeiger).toHaveAttribute('data-phase', 'dehnen');
    expect(anzeiger.style.transform).toBe('translate(0px, 42px)');
    expect(anzeiger.style.width).toBe('280px');
    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(anzeiger).toHaveAttribute('data-phase', 'gleiten');
    expect(anzeiger.style.transform).toBe('translate(200px, 42px)');
    expect(anzeiger.style.width).toBe('80px');
  });

  it('springt nicht, wenn sich ein Eintrag beim Dehnen verbreitert, und gleitet auf das neue Maß', () => {
    vi.useFakeTimers();
    let melden: (() => void) | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(rueckruf: () => void) {
          melden = rueckruf;
        }
        observe() {}
        disconnect() {}
      },
    );
    let breiteDesNeuen = 80;
    layoutNachbilden((nummer) => (nummer === 2 ? breiteDesNeuen : 80));
    const { rerender } = render(<Reihe aktiv={0} />);
    rerender(<Reihe aktiv={2} />);
    const anzeiger = screen.getByTestId('anzeiger');

    // Der neue Eintrag wird breiter, während sich der Anzeiger dehnt - etwa
    // weil die Schrift nachkommt.
    breiteDesNeuen = 90;
    act(() => melden?.());
    expect(anzeiger).toHaveAttribute('data-phase', 'dehnen');
    expect(anzeiger.style.width).toBe('280px');

    act(() => {
      vi.advanceTimersByTime(120);
    });
    expect(anzeiger).toHaveAttribute('data-phase', 'gleiten');
    expect(anzeiger.style.transform).toBe('translate(200px, 42px)');
    expect(anzeiger.style.width).toBe('90px');
  });

  it('legt sich in Ruhe ohne Bewegung neu, wenn sich die Breiten ändern', () => {
    let melden: (() => void) | undefined;
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(rueckruf: () => void) {
          melden = rueckruf;
        }
        observe() {}
        disconnect() {}
      },
    );
    let breiteDesAktiven = 80;
    layoutNachbilden((nummer) => (nummer === 1 ? breiteDesAktiven : 80));
    render(<Reihe aktiv={1} />);
    breiteDesAktiven = 96;
    act(() => melden?.());
    const anzeiger = screen.getByTestId('anzeiger');
    expect(anzeiger).toHaveAttribute('data-phase', 'sofort');
    expect(anzeiger.style.width).toBe('96px');
  });
});
