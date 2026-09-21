import { describe, expect, it } from 'vitest';
import { formatiereFahrzeit, formatiereStrecke } from './strecke';

describe('Strecke', () => {
  it.each([
    [0, '0 m'],
    [94, '90 m'],
    [95, '100 m'],
    [850, '850 m'],
    [999, '1000 m'],
    [1000, '1,0 km'],
    [3150, '3,2 km'],
    [12_449, '12,4 km'],
  ])('schreibt %i Meter als %s', (meter, text) => {
    expect(formatiereStrecke(meter)).toBe(text);
  });

  it('sagt bei einer unmoeglichen Zahl nichts statt irgendetwas', () => {
    expect(formatiereStrecke(Number.NaN)).toBe('—');
    expect(formatiereStrecke(-1)).toBe('—');
  });
});

describe('Fahrzeit', () => {
  it.each([
    [0, 'unter 1 Min.'],
    [29, 'unter 1 Min.'],
    [30, '1 Min.'],
    [762, '13 Min.'],
    [3540, '59 Min.'],
    [3600, '1 Std.'],
    [4500, '1 Std. 15 Min.'],
    [7260, '2 Std. 1 Min.'],
  ])('schreibt %i Sekunden als %s', (sekunden, text) => {
    expect(formatiereFahrzeit(sekunden)).toBe(text);
  });

  it('sagt bei einer unmoeglichen Zahl nichts statt irgendetwas', () => {
    expect(formatiereFahrzeit(Number.NaN)).toBe('—');
    expect(formatiereFahrzeit(-60)).toBe('—');
  });
});
