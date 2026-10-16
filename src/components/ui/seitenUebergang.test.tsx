import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef, type MouseEvent } from 'react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ListRow, ListRows } from './ListRow';
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
    render(<Ziel pfad="/patienten" />);
    const { event, preventDefault } = tipp(document.createElement('a'), { metaKey: true });
    zeileOeffnen(event, vi.fn());
    expect(preventDefault).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('überlässt den Wechsel dem Link, wo kein Rahmen die neue Seite meldet - sonst stünde sie still', () => {
    const start = vi.fn();
    Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });
    const { event, preventDefault } = tipp(document.createElement('a'));
    zeileOeffnen(event, vi.fn());
    expect(preventDefault).not.toHaveBeenCalled();
    expect(start).not.toHaveBeenCalled();
  });

  it('überlässt eine Zeile, die auf derselben Seite bleibt, dem Link', () => {
    const start = vi.fn();
    Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });
    render(<Ziel pfad="/betrieb/zeitkonto" />);
    const { event, preventDefault } = tipp(document.createElement('a'));
    zeileOeffnen(event, vi.fn(), true);
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

/** Eine Seite mit Rahmen wie in der Anwendung: Der Inhalt meldet die neue Seite. */
function SeiteMitZeilen({ ziele }: { ziele: string[] }) {
  const inhalt = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  useSeitenziel(inhalt, pathname);
  return (
    <main ref={inhalt}>
      <ListRows>
        {ziele.map((ziel) => (
          <ListRow key={ziel} titel={`Zu ${ziel}`} to={ziel} />
        ))}
      </ListRows>
    </main>
  );
}

describe('Zeile (ListRow) mit Ziel', () => {
  it('öffnet eine andere Seite im Übergang, einen Sprung auf derselben Seite nicht', () => {
    const start = vi.fn();
    Object.defineProperty(document, 'startViewTransition', { value: start, configurable: true });
    render(
      <MemoryRouter initialEntries={['/betrieb/zeitkonto']}>
        <SeiteMitZeilen ziele={['/betrieb/zeitkonto?person=1', '/patienten/1']} />
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole('link', { name: 'Zu /betrieb/zeitkonto?person=1' }));
    expect(start).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('link', { name: 'Zu /patienten/1' }));
    expect(start).toHaveBeenCalledTimes(1);
  });
});
