import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { useRef } from 'react';
import { PLAENE_ANKER, SPRUNG_FOLGEN_MS, useSprungmarke } from './sprungmarke';

/**
 * „Plan mitgeben →" führt auf `/patienten/:id/doku#uebungsplaene` (Praxis-
 * Review R2, P5). Der Router rollt nicht von selbst zum Anker; der Haken
 * dafür rollt beim Laden dorthin und folgt, solange die Abschnitte darüber
 * nachladen - bis die Person selbst rollt.
 */

/** Ein ResizeObserver zum Auslösen von Hand - jsdom kennt keinen. */
let melden: (() => void) | null = null;
let getrennt = false;
class BeobachterAttrappe {
  constructor(rueckruf: () => void) {
    melden = rueckruf;
  }
  observe() {}
  disconnect() {
    getrennt = true;
  }
}

function Seite() {
  const ort = useLocation();
  const raster = useRef<HTMLDivElement>(null);
  useSprungmarke(PLAENE_ANKER, ort.hash, raster);
  return (
    <div ref={raster}>
      <div id={PLAENE_ANKER}>Übungspläne</div>
    </div>
  );
}

function rendern(adresse: string) {
  return render(
    <MemoryRouter initialEntries={[adresse]}>
      <Seite />
    </MemoryRouter>,
  );
}

describe('useSprungmarke (Praxis-Review R2, P5)', () => {
  const rollen = vi.fn();

  beforeEach(() => {
    melden = null;
    getrennt = false;
    rollen.mockReset();
    vi.stubGlobal('ResizeObserver', BeobachterAttrappe);
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (
      this: Element,
      ...args: unknown[]
    ) {
      rollen(this.id, ...args);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('rollt beim Laden zu den Übungsplänen, wenn die Adresse die Sprungmarke trägt', () => {
    rendern(`/patienten/p1/doku#${PLAENE_ANKER}`);
    expect(rollen).toHaveBeenCalledWith(PLAENE_ANKER, { block: 'start' });
  });

  it('rollt ohne Sprungmarke nicht', () => {
    rendern('/patienten/p1/doku');
    expect(rollen).not.toHaveBeenCalled();
    expect(melden).toBeNull();
  });

  it('folgt, solange darüber nachgeladen wird - bis die Person selbst rollt', () => {
    rendern(`/patienten/p1/doku#${PLAENE_ANKER}`);
    expect(rollen).toHaveBeenCalledTimes(1);
    // Eine Liste darüber ist fertig und schiebt die Pläne nach unten.
    act(() => melden?.());
    expect(rollen).toHaveBeenCalledTimes(2);
    // Die Person rollt selbst: Ab jetzt bleibt der Blick, wo sie ihn hinführt.
    act(() => {
      window.dispatchEvent(new Event('wheel'));
    });
    expect(getrennt).toBe(true);
  });

  it('hört nach einer Frist von selbst auf zu folgen', () => {
    vi.useFakeTimers();
    rendern(`/patienten/p1/doku#${PLAENE_ANKER}`);
    expect(getrennt).toBe(false);
    act(() => {
      vi.advanceTimersByTime(SPRUNG_FOLGEN_MS);
    });
    expect(getrennt).toBe(true);
  });
});
