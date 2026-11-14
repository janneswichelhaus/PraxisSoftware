import { describe, expect, it } from 'vitest';
import { landung, nachBildlauf } from './endlosBildlauf';

describe('nachBildlauf', () => {
  const lage = { max: 600, streifen: 60 };

  it('lässt den Bildlauf zwischen den Streifen in Ruhe', () => {
    expect(nachBildlauf({ ...lage, links: 60 })).toBeNull();
    expect(nachBildlauf({ ...lage, links: 300 })).toBeNull();
    expect(nachBildlauf({ ...lage, links: 540 })).toBeNull();
  });

  it('blättert zurück, wenn der linke Streifen zu zwei Dritteln zu sehen ist', () => {
    expect(nachBildlauf({ ...lage, links: 20 })).toBe(-1);
    expect(nachBildlauf({ ...lage, links: 0 })).toBe(-1);
  });

  it('blättert vor, wenn der rechte Streifen zu zwei Dritteln zu sehen ist', () => {
    expect(nachBildlauf({ ...lage, links: 580 })).toBe(1);
    expect(nachBildlauf({ ...lage, links: 600 })).toBe(1);
  });

  it('federt zurück, wenn ein Streifen nur angezogen wurde', () => {
    expect(nachBildlauf({ ...lage, links: 21 })).toBe('links');
    expect(nachBildlauf({ ...lage, links: 59 })).toBe('links');
    expect(nachBildlauf({ ...lage, links: 541 })).toBe('rechts');
    expect(nachBildlauf({ ...lage, links: 579 })).toBe('rechts');
  });

  it('tut nichts ohne Streifen oder solange das Gitter noch nicht breit genug ist', () => {
    expect(nachBildlauf({ links: 0, max: 600, streifen: 0 })).toBeNull();
    expect(nachBildlauf({ links: 0, max: 0, streifen: 60 })).toBeNull();
  });
});

describe('landung', () => {
  const lage = { max: 600, streifen: 60 };

  it('beginnt vorwärts am Anfang und rückwärts am Ende der Spalten', () => {
    expect(landung({ ...lage, richtung: 1, links: 600 })).toBe(60);
    expect(landung({ ...lage, richtung: -1, links: 0 })).toBe(540);
  });

  it('bleibt ohne Richtung stehen, nur nicht in einem Streifen', () => {
    expect(landung({ ...lage, richtung: null, links: 300 })).toBe(300);
    expect(landung({ ...lage, richtung: null, links: 0 })).toBe(60);
    expect(landung({ ...lage, richtung: null, links: 600 })).toBe(540);
  });
});
