import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen } from '@testing-library/react';
import {
  MARKENMOMENT_DAUER_MS,
  MARKENMOMENT_MERKER,
  markenmomentFaellig,
  useMarkenmoment,
} from './markenmoment';

/**
 * Markenmoment B (Handoff 2026-10-22, Abschnitt 7; ANN-680): einmal je Tab
 * beim ersten Erscheinen der Übersicht, nie beim Zurückkehren, bei
 * „Bewegung reduzieren“ gar nicht.
 */
function Probe({ bereit = true }: { bereit?: boolean }) {
  const moment = useMarkenmoment(bereit);
  return <output data-testid="moment">{moment ? 'läuft' : 'steht'}</output>;
}

function bewegungReduziert(reduziert: boolean) {
  vi.stubGlobal('matchMedia', (abfrage: string) => ({
    matches: reduziert && abfrage === '(prefers-reduced-motion: reduce)',
    media: abfrage,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
}

beforeEach(() => {
  bewegungReduziert(false);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('Markenmoment B (ANN-680)', () => {
  it('läuft beim ersten Erscheinen und eine Sekunde lang, danach steht alles', () => {
    vi.useFakeTimers();
    render(<Probe />);
    expect(screen.getByTestId('moment')).toHaveTextContent('läuft');
    // Ein Wahrheitswert im Sitzungsspeicher - kein Inhalt, kein localStorage.
    expect(window.sessionStorage.getItem(MARKENMOMENT_MERKER)).toBe('1');
    expect(window.localStorage.getItem(MARKENMOMENT_MERKER)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(MARKENMOMENT_DAUER_MS);
    });
    expect(screen.getByTestId('moment')).toHaveTextContent('steht');
  });

  it('endet erst eine Sekunde, nachdem die Übersicht bereit ist', () => {
    vi.useFakeTimers();
    const { rerender } = render(<Probe bereit={false} />);
    act(() => {
      vi.advanceTimersByTime(3 * MARKENMOMENT_DAUER_MS);
    });
    // Solange die Daten fehlen, läuft er weiter - Abschnitte kommen noch.
    expect(screen.getByTestId('moment')).toHaveTextContent('läuft');
    rerender(<Probe bereit />);
    act(() => {
      vi.advanceTimersByTime(MARKENMOMENT_DAUER_MS);
    });
    expect(screen.getByTestId('moment')).toHaveTextContent('steht');
  });

  it('läuft beim Zurückkehren zur Übersicht nicht noch einmal', () => {
    const { unmount } = render(<Probe />);
    expect(screen.getByTestId('moment')).toHaveTextContent('läuft');
    unmount();
    render(<Probe />);
    expect(screen.getByTestId('moment')).toHaveTextContent('steht');
  });

  it('läuft bei „Bewegung reduzieren“ nicht und gilt danach als gezeigt', () => {
    bewegungReduziert(true);
    render(<Probe />);
    expect(screen.getByTestId('moment')).toHaveTextContent('steht');
    expect(markenmomentFaellig()).toBe(false);
  });

  it('läuft in einem neuen Tab wieder', () => {
    window.sessionStorage.setItem(MARKENMOMENT_MERKER, '1');
    expect(markenmomentFaellig()).toBe(false);
    window.sessionStorage.clear();
    expect(markenmomentFaellig()).toBe(true);
  });
});
