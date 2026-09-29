import { describe, expect, it } from 'vitest';
import { kachelZeilen } from './CalendarGrid';

describe('kachelZeilen (BEF-072)', () => {
  it('zeigt nur ganze Zeilen und mindestens den Namen', () => {
    expect(kachelZeilen(28)).toBe(1);
    expect(kachelZeilen(42)).toBe(2);
    // Ein 30-Minuten-Termin bei 96 px je Stunde: Name, Zeit - der Ort entfällt
    // statt halb angeschnitten zu stehen.
    expect(kachelZeilen(48)).toBe(2);
    expect(kachelZeilen(58)).toBe(3);
  });
});
