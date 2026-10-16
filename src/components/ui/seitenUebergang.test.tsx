import { act, render, screen } from '@testing-library/react';
import { useRef, type MouseEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useSeitenziel, zeileOeffnen } from './seitenUebergang';

/**
 * „Zeile öffnet sich zur Seite“ (ANN-567). Ob der Übergang im Browser läuft,
 * prüft `tests/e2e/bewegung.spec.ts`; hier steht, was ohne View Transitions
 * nachprüfbar ist: wann der Link übernimmt, wer den Namen trägt und wann der
 * Übergang die neue Seite freigibt.
 */

afterEach(() => {
  Reflect.deleteProperty(document, 'startViewTransition');
  vi.useRealTimers();
});

function Ziel({ pfad }: { pfad: string }) {
  const inhalt = useRef<HTMLElement>(null);
  useSeitenziel(inhalt, pfad);
  return <main ref={inhalt}>Seite {pfad}</main>;
}

function tipp(zeile: HTMLAnchorElement, zusatz: Partial<MouseEvent> = {}) {
  const preventDefault = vi.fn();
  const event = {
    defaultPrevented: false,
    button: 0,
    metaKey: false,
    altKey: false,
    ctrlKey: false,
    shiftKey: false,
    currentTarget: zeile,
    preventDefault,
    ...zusatz,
  } as unknown as MouseEvent<HTMLAnchorElement>;
  return { event, preventDefault };
}

describe('Zeile öffnet sich zur Seite', () => {
  it('überlässt den Wechsel dem Link, wo der Browser keine View Transitions kennt', () => {
    const weiter = vi.fn();
    const { event, preventDefault } = tipp(document.createElement('a'));
    zeileOeffnen(event, weiter);
    expect(preventDefault).not.toHaveBeenCalled();
    expect(weiter).not.toHaveBeenCalled();
  });

  it('überlässt einen Tipp mit Zusatztaste dem Browser (neuer Tab)', () => {
    const start = vi.fn();
    Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });
    const { event, preventDefault } = tipp(document.createElement('a'), { metaKey: true });
    zeileOeffnen(event, vi.fn());
    expect(preventDefault).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('benennt die Zeile, wechselt im Übergang die Seite und gibt ihn frei, sobald sie steht', async () => {
    let rueckruf: (() => Promise<void> | void) | undefined;
    Object.defineProperty(document, 'startViewTransition', {
      value: vi.fn((aufruf: () => Promise<void> | void) => {
        rueckruf = aufruf;
      }),
      configurable: true,
    });
    const zeile = document.createElement('a');
    const weiter = vi.fn();
    const { rerender } = render(<Ziel pfad="/patienten" />);
    const { event, preventDefault } = tipp(zeile);

    zeileOeffnen(event, weiter);
    expect(preventDefault).toHaveBeenCalled();
    expect(zeile.style.getPropertyValue('view-transition-name')).toBe('zeile-zur-seite');

    const gezeichnet = rueckruf?.();
    expect(weiter).toHaveBeenCalledTimes(1);
    let frei = false;
    void Promise.resolve(gezeichnet).then(() => {
      frei = true;
    });
    await Promise.resolve();
    expect(frei).toBe(false);

    rerender(<Ziel pfad="/patienten/1" />);
    await gezeichnet;
    expect(frei).toBe(true);
    expect(screen.getByRole('main').style.getPropertyValue('view-transition-name')).toBe(
      'zeile-zur-seite',
    );
  });

  it('nimmt der Seite den Namen nach einer Sekunde wieder, damit er nie doppelt steht', () => {
    vi.useFakeTimers();
    render(<Ziel pfad="/kalender" />);
    const seite = screen.getByRole('main');
    expect(seite.style.getPropertyValue('view-transition-name')).toBe('zeile-zur-seite');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(seite.style.getPropertyValue('view-transition-name')).toBe('');
  });
});
