import { describe, expect, it } from 'vitest';
import {
  energieDerMenge,
  FREIE_MENGE,
  grammVon,
  mengePruefen,
  mengeText,
  nochUebrig,
  vorbelegung,
  wasserText,
} from './tagebuch';

const HAFER = {
  base_unit: 'g' as const,
  portions: [
    { label: '1 Esslöffel', amount: 10 },
    { label: '1 Portion', amount: 50 },
  ],
  per_100: {
    energy_kcal: 370,
    protein_g: 13.5,
    fat_g: 7,
    carbohydrate_g: 58.7,
    sugar_g: null,
    fibre_g: null,
    saturated_fat_g: null,
    salt_g: null,
  },
};

describe('Tagebuch (ERN-007)', () => {
  it('nennt „noch übrig“ und eine Überschreitung als solche', () => {
    expect(nochUebrig(1800, 1234)).toEqual({ wert: '566 kcal', ueber: false });
    expect(nochUebrig(1800, 1800)).toEqual({ wert: '0 kcal', ueber: false });
    expect(nochUebrig(1800, 2010)).toEqual({ wert: '210 kcal über dem Ziel', ueber: true });
  });

  it('schreibt Mengen, Portionen, Gramm und Wasser', () => {
    expect(
      mengeText({ amount: 50, base_unit: 'g', portion_label: '1 Portion', portion_count: 1 }),
    ).toBe('1 Portion · 50 g');
    expect(
      mengeText({ amount: 90, base_unit: 'g', portion_label: '1 Scheibe', portion_count: 2 }),
    ).toBe('2 × 1 Scheibe · 90 g');
    expect(
      mengeText({ amount: 120.5, base_unit: 'ml', portion_label: null, portion_count: null }),
    ).toBe('120,5 ml');
    expect(grammVon(12.5, 80)).toBe('12,5 von 80 g');
    expect(grammVon(40, 80)).toBe('40 von 80 g');
    expect(wasserText(250)).toBe('250 ml');
    expect(wasserText(1500)).toBe('1,5 l');
    expect(wasserText(2000)).toBe('2 l');
    expect(wasserText(1250)).toBe('1,25 l');
  });

  it('belegt mit der ersten Portion vor, sonst mit 100 g', () => {
    expect(vorbelegung(HAFER)).toEqual({ einheit: '1 Esslöffel', wert: '1' });
    expect(vorbelegung({ portions: [] })).toEqual({ einheit: FREIE_MENGE, wert: '100' });
  });

  it('prüft die Menge wie der Server und rechnet die Energie', () => {
    expect(mengePruefen(HAFER, '1 Portion', '1,5')).toEqual({
      angabe: { art: 'portion', label: '1 Portion', anzahl: 1.5 },
      menge: 75,
    });
    expect(mengePruefen(HAFER, FREIE_MENGE, '40')).toEqual({
      angabe: { art: 'menge', menge: 40 },
      menge: 40,
    });
    expect(mengePruefen(HAFER, '1 Portion', '0')).toHaveProperty('fehler');
    expect(mengePruefen(HAFER, '1 Portion', '21')).toHaveProperty('fehler');
    expect(mengePruefen(HAFER, '1 Eimer', '1')).toHaveProperty('fehler');
    expect(mengePruefen(HAFER, FREIE_MENGE, '6000')).toHaveProperty('fehler');
    expect(energieDerMenge(HAFER, 50)).toBe(185);
  });
});
