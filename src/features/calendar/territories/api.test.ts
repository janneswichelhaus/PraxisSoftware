import { describe, expect, it } from 'vitest';
import { dayPartsText, parsePostalCodes } from './api';

describe('Gebietstage: Hilfen (PRX-002)', () => {
  it('schreibt die Gebietstage sortiert und lesbar', () => {
    expect(
      dayPartsText([
        { weekday: 3, part: 'day' },
        { weekday: 1, part: 'pm' },
        { weekday: 1, part: 'am' },
      ]),
    ).toBe('Mo vormittags, Mo nachmittags, Mi ganztags');
    expect(dayPartsText([])).toBe('keine Gebietstage');
  });

  it('liest Postleitzahlen aus Komma, Semikolon und Leerraum, ohne Doppelte', () => {
    expect(parsePostalCodes('72072, 72070;72070\n 72074')).toEqual({
      codes: ['72070', '72072', '72074'],
      invalid: [],
    });
    expect(parsePostalCodes('7207, 72070, abcde')).toEqual({
      codes: ['72070'],
      invalid: ['7207', 'abcde'],
    });
    expect(parsePostalCodes('   ')).toEqual({ codes: [], invalid: [] });
  });
});
