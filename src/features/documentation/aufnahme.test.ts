// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DIKTAT_HOECHSTBYTES, DIKTAT_HOECHSTDAUER_S } from '@/lib/ki/gateway';
import {
  AUDIO_BITRATE,
  AUFNAHME_HOECHSTBYTES,
  HOECHSTDAUER_S,
  aufnahmeMoeglich,
  aufnahmedauer,
  mikrofonErlaubt,
  useAufnahme,
  waehleFormat,
  type Aufnahme,
  type Aufnahmefehler,
} from './aufnahme';
import { Testrecorder, installiereAufnahme, type Testmikrofon } from './testaufnahme';

/**
 * Die Aufnahme im Browser (KI-EPIC-001, PROJECT_PRINCIPLES.md 6.3): nur auf
 * Tipp, mit Uhr, Stopp per Tipp und nach höchstens fünf Minuten, beim
 * Verbergen der Seite und beim Wegfall des Mikrofons; danach sind die Spuren
 * beendet. Mikrofon und Recorder sind nachgebildet (`testaufnahme.ts`).
 */

let mikrofon: Testmikrofon;
let entfernen: () => void;

function aufnehmen() {
  const fertig: Aufnahme[] = [];
  const fehler: Aufnahmefehler[] = [];
  const hook = renderHook(() =>
    useAufnahme({
      onFertig: (aufnahme) => fertig.push(aufnahme),
      onFehler: (art) => fehler.push(art),
    }),
  );
  return { ...hook, fertig, fehler };
}

async function starten(hook: ReturnType<typeof aufnehmen>) {
  await act(async () => {
    await hook.result.current.starten();
  });
}

function letzterRecorder(): Testrecorder {
  return Testrecorder.alle.at(-1)!;
}

describe('useAufnahme', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    ({ mikrofon, entfernen } = installiereAufnahme());
  });

  afterEach(() => {
    entfernen();
    vi.useRealTimers();
  });

  it('nimmt nur auf ausdrücklichen Tipp auf - nicht beim Einhängen', () => {
    const hook = aufnehmen();
    expect(hook.result.current.zustand).toBe('bereit');
    expect(mikrofon.anfragen).toEqual([]);
    expect(Testrecorder.alle).toEqual([]);
  });

  it('öffnet nur das Mikrofon, mit 64 kbit/s im ersten Format, das der Browser kann', async () => {
    const hook = aufnehmen();
    await starten(hook);

    expect(mikrofon.anfragen).toEqual([{ audio: true }]);
    expect(hook.result.current.zustand).toBe('laeuft');
    const recorder = letzterRecorder();
    expect(recorder.optionen).toEqual({
      mimeType: 'audio/webm;codecs=opus',
      audioBitsPerSecond: AUDIO_BITRATE,
    });
    expect(recorder.state).toBe('recording');
  });

  it('zählt die Sekunden und übergibt beim Fertig die Aufnahme mit Dauer', async () => {
    const hook = aufnehmen();
    await starten(hook);
    await act(() => vi.advanceTimersByTimeAsync(12_300));
    expect(hook.result.current.sekunden).toBe(12);

    act(() => hook.result.current.beenden());

    expect(hook.result.current.zustand).toBe('bereit');
    expect(hook.fertig).toHaveLength(1);
    expect(hook.fertig[0]!.audio.type).toBe('audio/webm');
    expect(hook.fertig[0]!.audio.size).toBe(64);
    expect(hook.fertig[0]!.dauerS).toBeCloseTo(12.3, 0);
    // Danach ist das Mikrofon wieder frei.
    expect(mikrofon.spuren.every((spur) => spur.beendet)).toBe(true);
  });

  it('verwirft beim Abbrechen und gibt das Mikrofon frei', async () => {
    const hook = aufnehmen();
    await starten(hook);
    act(() => hook.result.current.abbrechen());

    expect(hook.result.current.zustand).toBe('bereit');
    expect(hook.fertig).toEqual([]);
    expect(hook.fehler).toEqual([]);
    expect(mikrofon.spuren[0]!.beendet).toBe(true);
  });

  it('hält nach fünf Minuten von selbst an und übergibt höchstens 300 s', async () => {
    const hook = aufnehmen();
    await starten(hook);
    await act(() => vi.advanceTimersByTimeAsync(HOECHSTDAUER_S * 1000 - 1000));
    expect(hook.result.current.zustand).toBe('laeuft');
    expect(hook.result.current.sekunden).toBe(299);

    await act(() => vi.advanceTimersByTimeAsync(1500));

    expect(hook.result.current.zustand).toBe('bereit');
    expect(hook.fertig).toHaveLength(1);
    expect(hook.fertig[0]!.dauerS).toBe(HOECHSTDAUER_S);
    expect(mikrofon.spuren[0]!.beendet).toBe(true);
  });

  it('hält kurz vor der Größengrenze von selbst an - auch wenn der Browser mehr nimmt', async () => {
    const fertig: Aufnahme[] = [];
    const hook = renderHook(() =>
      useAufnahme({
        onFertig: (aufnahme) => fertig.push(aufnahme),
        onFehler: () => undefined,
        hoechstbytes: 1000,
      }),
    );
    await act(async () => {
      await hook.result.current.starten();
    });
    act(() => letzterRecorder().liefere(600));
    expect(hook.result.current.zustand).toBe('laeuft');

    act(() => letzterRecorder().liefere(600));
    expect(hook.result.current.zustand).toBe('bereit');
    expect(fertig).toHaveLength(1);
    // Das letzte Stück nach dem Stopp kommt noch dazu (64 Bytes).
    expect(fertig[0]!.audio.size).toBe(600 + 600 + 64);
    expect(mikrofon.spuren[0]!.beendet).toBe(true);
  });

  it('hält an, sobald die Seite verborgen wird - keine Aufnahme ohne Anzeige', async () => {
    const hook = aufnehmen();
    await starten(hook);
    const sichtbar = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    try {
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'));
      });
    } finally {
      if (sichtbar) Object.defineProperty(document, 'visibilityState', sichtbar);
      else delete (document as { visibilityState?: unknown }).visibilityState;
    }
    expect(hook.result.current.zustand).toBe('bereit');
    expect(hook.fertig).toHaveLength(1);
    expect(mikrofon.spuren[0]!.beendet).toBe(true);
  });

  it('beginnt nicht, wenn die Seite verborgen wurde, während das Mikrofon öffnete', async () => {
    mikrofon.halteAn();
    const hook = aufnehmen();
    let laeuft: Promise<void> = Promise.resolve();
    act(() => {
      laeuft = hook.result.current.starten();
    });
    const sichtbar = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    try {
      await act(async () => {
        mikrofon.gibFrei();
        await laeuft;
      });
    } finally {
      if (sichtbar) Object.defineProperty(document, 'visibilityState', sichtbar);
      else delete (document as { visibilityState?: unknown }).visibilityState;
    }
    expect(Testrecorder.alle).toEqual([]);
    expect(hook.result.current.zustand).toBe('bereit');
    expect(mikrofon.spuren[0]!.beendet).toBe(true);
    expect(hook.fertig).toEqual([]);
    expect(hook.fehler).toEqual([]);
  });

  it('hält an, wenn das Mikrofon wegfällt', async () => {
    const hook = aufnehmen();
    await starten(hook);
    act(() => mikrofon.spuren[0]!.enden());
    expect(hook.result.current.zustand).toBe('bereit');
    expect(hook.fertig).toHaveLength(1);
  });

  it.each([
    ['NotAllowedError', 'verweigert'],
    ['SecurityError', 'verweigert'],
    ['NotFoundError', 'kein_mikrofon'],
    ['NotReadableError', 'kein_mikrofon'],
    ['AbortError', 'fehler'],
  ] as const)('meldet %s als %s und nimmt nichts auf', async (name, art) => {
    mikrofon.verweigere(name);
    const hook = aufnehmen();
    await starten(hook);
    expect(hook.fehler).toEqual([art]);
    expect(hook.result.current.zustand).toBe('bereit');
    expect(Testrecorder.alle).toEqual([]);
  });

  it('gibt ein Mikrofon, das erst nach dem Abbrechen freigegeben wird, gleich wieder frei', async () => {
    mikrofon.halteAn();
    const hook = aufnehmen();
    let laeuft: Promise<void> = Promise.resolve();
    act(() => {
      laeuft = hook.result.current.starten();
    });
    expect(hook.result.current.zustand).toBe('startet');
    act(() => hook.result.current.abbrechen());
    expect(hook.result.current.zustand).toBe('bereit');

    await act(async () => {
      mikrofon.gibFrei();
      await laeuft;
    });
    expect(Testrecorder.alle).toEqual([]);
    expect(mikrofon.spuren[0]!.beendet).toBe(true);
    expect(hook.fehler).toEqual([]);
  });

  it('verwirft beim Verlassen der Seite und gibt das Mikrofon frei', async () => {
    const hook = aufnehmen();
    await starten(hook);
    hook.unmount();
    expect(mikrofon.spuren[0]!.beendet).toBe(true);
    expect(hook.fertig).toEqual([]);
  });

  it('meldet eine leere Aufnahme', async () => {
    const hook = aufnehmen();
    await starten(hook);
    letzterRecorder().leer = true;
    act(() => hook.result.current.beenden());
    expect(hook.fertig).toEqual([]);
    expect(hook.fehler).toEqual(['leer']);
  });

  it('meldet einen Fehler des Recorders genau einmal', async () => {
    const hook = aufnehmen();
    await starten(hook);
    act(() => letzterRecorder().stoere());
    expect(hook.fertig).toEqual([]);
    expect(hook.fehler).toEqual(['fehler']);
    expect(mikrofon.spuren[0]!.beendet).toBe(true);
  });

  it('startet keine zweite Aufnahme neben der ersten', async () => {
    const hook = aufnehmen();
    await starten(hook);
    await starten(hook);
    expect(mikrofon.anfragen).toHaveLength(1);
  });
});

describe('Aufnahme: Hilfen', () => {
  it('erkennt, ob das Gerät aufnehmen kann', () => {
    expect(aufnahmeMoeglich()).toBe(false);
    const { entfernen: weg } = installiereAufnahme();
    try {
      expect(aufnahmeMoeglich()).toBe(true);
    } finally {
      weg();
    }
    expect(aufnahmeMoeglich()).toBe(false);
  });

  it('fragt die Permissions-Policy der Seite, ob das Mikrofon erlaubt ist', () => {
    const setze = (name: 'permissionsPolicy' | 'featurePolicy', wert: unknown) =>
      Object.defineProperty(document, name, { configurable: true, value: wert });
    const weg = () => {
      delete (document as { permissionsPolicy?: unknown }).permissionsPolicy;
      delete (document as { featurePolicy?: unknown }).featurePolicy;
    };
    try {
      // Ohne Schnittstelle (Firefox, Safari, jsdom): Es bleibt beim Browser.
      expect(mikrofonErlaubt()).toBe(true);

      // Eine Policy mit `microphone=()` (bis ADR-017 Fassung 9 die Test-Umgebung).
      setze('featurePolicy', { allowsFeature: (f: string) => f !== 'microphone' });
      expect(mikrofonErlaubt()).toBe(false);

      // Die neuere Schnittstelle geht vor.
      setze('permissionsPolicy', { allowsFeature: () => true });
      expect(mikrofonErlaubt()).toBe(true);

      // Eine Schnittstelle, die wirft, sperrt nichts.
      setze('permissionsPolicy', {
        allowsFeature: () => {
          throw new Error('kaputt');
        },
      });
      expect(mikrofonErlaubt()).toBe(true);
    } finally {
      weg();
    }
  });

  it('wählt WebM vor MP4 vor Ogg - oder keines', () => {
    expect(waehleFormat(() => true)).toBe('audio/webm;codecs=opus');
    expect(waehleFormat((typ) => typ === 'audio/mp4')).toBe('audio/mp4');
    expect(waehleFormat((typ) => typ.startsWith('audio/ogg'))).toBe('audio/ogg;codecs=opus');
    expect(waehleFormat(() => false)).toBeUndefined();
    expect(
      waehleFormat(() => {
        throw new Error('alter Browser');
      }),
    ).toBeUndefined();
  });

  it('bleibt mit fünf Minuten weit unter der Größengrenze des Gateways (ANN-523)', () => {
    expect(HOECHSTDAUER_S).toBe(DIKTAT_HOECHSTDAUER_S);
    // Luft für Browser, die mehr Bitrate nehmen, als sie sollen.
    expect((AUDIO_BITRATE / 8) * HOECHSTDAUER_S).toBeLessThan(DIKTAT_HOECHSTBYTES / 2);
    // Und wer doch mehr nimmt, hält vorher an - mit Platz für das letzte Stück.
    expect(AUFNAHME_HOECHSTBYTES).toBeLessThan(DIKTAT_HOECHSTBYTES);
    expect(AUFNAHME_HOECHSTBYTES).toBeGreaterThan(DIKTAT_HOECHSTBYTES * 0.9);
  });

  it('schreibt die Dauer als Minuten und Sekunden', () => {
    expect(aufnahmedauer(0)).toBe('0:00');
    expect(aufnahmedauer(12.9)).toBe('0:12');
    expect(aufnahmedauer(299)).toBe('4:59');
    expect(aufnahmedauer(300)).toBe('5:00');
  });
});
