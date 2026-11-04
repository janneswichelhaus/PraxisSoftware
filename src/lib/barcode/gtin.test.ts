import { describe, expect, it } from 'vitest';
import {
  getippteGtin,
  gleicheGtin,
  gtinGueltig,
  gtinSchluessel,
  pruefziffer,
  upcEZuUpcA,
} from './gtin';

describe('GTIN', () => {
  it('rechnet die Prüfziffer nach GS1 und prüft vier Längen', () => {
    expect(pruefziffer('400638133393')).toBe(1);
    expect(pruefziffer('9638507')).toBe(4);
    expect(gtinGueltig('4006381333931')).toBe(true);
    expect(gtinGueltig('96385074')).toBe(true);
    expect(gtinGueltig('036000291452')).toBe(true);
    expect(gtinGueltig('04006381333931')).toBe(true);
    expect(gtinGueltig('4006381333932')).toBe(false);
    for (const falsch of ['', '1234567', '40063813339', '400638133393100', '40063813339a']) {
      expect(gtinGueltig(falsch), falsch).toBe(false);
    }
  });

  it('vergleicht ohne führende Nullen wie app.gtin_key', () => {
    expect(gtinSchluessel('0036000291452')).toBe('36000291452');
    expect(gleicheGtin('036000291452', '0036000291452')).toBe(true);
    expect(gleicheGtin('4006381333931', '4006381333932')).toBe(false);
  });

  it('streckt UPC-E zu UPC-A, nur mit gültiger Prüfziffer', () => {
    expect(upcEZuUpcA('04252614')).toBe('042100005264');
    expect(upcEZuUpcA('01234565')).toBe('012345000065');
    expect(upcEZuUpcA('04252615')).toBeNull();
    expect(upcEZuUpcA('24252614')).toBeNull();
  });

  it('nimmt getippte Leerzeichen und Bindestriche heraus', () => {
    expect(getippteGtin(' 4 006381-333931 ')).toBe('4006381333931');
  });
});
