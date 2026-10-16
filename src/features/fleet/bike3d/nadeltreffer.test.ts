import { describe, expect, it } from 'vitest';
import { NADEL_TREFFERRADIUS, kopfUeberSpitze, naechsteNadel } from './nadeltreffer';

describe('Trefferfläche der Nadeln (DESIGN.md Grundsatz 3, Handoff AC 9)', () => {
  const koepfe = [
    { x: 100, y: 100, nadel: 's1' },
    { x: 130, y: 100, nadel: 's2' },
  ];

  it('trifft eine Nadel im Umkreis von 22 px um den Kopf - 44 px wie jedes Ziel', () => {
    expect(NADEL_TREFFERRADIUS * 2).toBeGreaterThanOrEqual(44);
    expect(naechsteNadel(100, 121, koepfe)).toBe('s1');
    expect(naechsteNadel(100, 123, koepfe)).toBeNull();
  });

  it('nimmt bei zwei nahen Nadeln die nähere', () => {
    expect(naechsteNadel(112, 100, koepfe)).toBe('s1');
    expect(naechsteNadel(118, 100, koepfe)).toBe('s2');
  });

  it('findet ohne Nadeln nichts', () => {
    expect(naechsteNadel(100, 100, [])).toBeNull();
  });

  it('setzt den Kopf über die Spitze, wie das Bild der Nadel ihn zeichnet', () => {
    // 32 px breit, 40 px hoch: Die Mitte des Kopfs liegt 24,5 px über der Spitze.
    expect(kopfUeberSpitze(40)).toBeCloseTo(24.5);
  });
});
