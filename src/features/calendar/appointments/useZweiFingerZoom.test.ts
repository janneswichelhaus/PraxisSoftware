import { describe, expect, it } from 'vitest';
import { PINCH_SCHWELLE, pinchSchritt } from './useZweiFingerZoom';

/** Die Stufenlogik des Zoomens mit zwei Fingern (BEF-038). */
describe('pinchSchritt', () => {
  it('bleibt bei kleinen Bewegungen auf der Stufe', () => {
    expect(pinchSchritt(1)).toBe(0);
    expect(pinchSchritt(1.2)).toBe(0);
    expect(pinchSchritt(0.85)).toBe(0);
  });

  it('vergroessert, wenn die Finger auseinandergehen', () => {
    expect(pinchSchritt(PINCH_SCHWELLE)).toBe(1);
    expect(pinchSchritt(2)).toBe(1);
  });

  it('verkleinert, wenn die Finger zusammengehen', () => {
    expect(pinchSchritt(1 / PINCH_SCHWELLE)).toBe(-1);
    expect(pinchSchritt(0.5)).toBe(-1);
  });

  it('tut bei unbrauchbaren Werten nichts', () => {
    expect(pinchSchritt(0)).toBe(0);
    expect(pinchSchritt(Number.NaN)).toBe(0);
    expect(pinchSchritt(Number.POSITIVE_INFINITY)).toBe(0);
  });
});
