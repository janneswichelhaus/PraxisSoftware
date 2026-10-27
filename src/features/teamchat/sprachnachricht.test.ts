// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Testrecorder, installiereAufnahme } from '@/lib/testaufnahme';
import {
  SPRACHNACHRICHT_HOECHSTDAUER_S,
  dauerSekunden,
  sprachnachrichtMoeglich,
} from './sprachnachricht';

/**
 * Sprachnachrichten (TEAM-004, ADR-017 Abschnitt N): Wann das Gerät eine
 * aufnehmen kann, und welche Dauer der Server bekommt (ANN-655).
 */

describe('Sprachnachricht: Gerät und Dauer', () => {
  let aufnahme: ReturnType<typeof installiereAufnahme>;
  beforeEach(() => {
    aufnahme = installiereAufnahme();
  });
  afterEach(() => {
    aufnahme.entfernen();
  });

  it('bietet die Aufnahme nur mit WebM oder MP4 an - Formate, die der Server nimmt', () => {
    Testrecorder.unterstuetzt = (typ) => typ.startsWith('audio/webm');
    expect(sprachnachrichtMoeglich()).toBe(true);
    Testrecorder.unterstuetzt = (typ) => typ === 'audio/mp4';
    expect(sprachnachrichtMoeglich()).toBe(true);
    Testrecorder.unterstuetzt = (typ) => typ.startsWith('audio/ogg');
    expect(sprachnachrichtMoeglich()).toBe(false);
    Testrecorder.unterstuetzt = () => false;
    expect(sprachnachrichtMoeglich()).toBe(false);
  });

  it('bietet ohne Aufnahme im Browser nichts an', () => {
    aufnahme.entfernen();
    expect(sprachnachrichtMoeglich()).toBe(false);
  });

  it('meldet ganze Sekunden von 1 bis zur Grenze des Servers', () => {
    expect(SPRACHNACHRICHT_HOECHSTDAUER_S).toBe(120);
    expect(dauerSekunden(0)).toBe(1);
    expect(dauerSekunden(0.4)).toBe(1);
    expect(dauerSekunden(41.6)).toBe(42);
    // Die Aufnahme stoppt bei 120 s - ein Rest danach scheiterte sonst am Server.
    expect(dauerSekunden(120.3)).toBe(120);
    expect(dauerSekunden(130)).toBe(120);
    expect(dauerSekunden(Number.NaN)).toBe(1);
  });
});
