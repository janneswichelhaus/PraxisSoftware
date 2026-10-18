import { describe, expect, it } from 'vitest';
import { leseZielwert } from './eingabe';

const ENERGIE = { min: 500, max: 6000, einheit: 'kcal' };
const WASSER = { min: 0.5, max: 8, einheit: 'l', liter: true } as const;

describe('leseZielwert (Zielwerte anpassen, Design- und Praxis-Review ERN-EPIC-001)', () => {
  it('leer heißt berechnet', () => {
    expect(leseZielwert('  ', ENERGIE)).toEqual({ wert: null });
  });

  it('nimmt ganze Zahlen in den Grenzen der Tabelle', () => {
    expect(leseZielwert('1800', ENERGIE)).toEqual({ wert: 1800 });
    expect(leseZielwert('500', ENERGIE)).toEqual({ wert: 500 });
    expect(leseZielwert('6000', ENERGIE)).toEqual({ wert: 6000 });
  });

  it('weist Tausenderpunkt, Komma, Buchstaben und Werte außerhalb ab', () => {
    // „1.500“ wurde vorher als 1,5 gelesen und als 2 kcal geschickt.
    for (const text of ['1.500', '1500,5', 'abc', '499', '6001', '-100']) {
      expect(leseZielwert(text, ENERGIE)).toHaveProperty('fehler');
    }
    expect(leseZielwert('1.500', ENERGIE)).toEqual({
      fehler: 'Bitte als ganze Zahl angeben, 500 bis 6000 kcal - oder leer lassen.',
    });
  });

  it('Wasser in Litern wie in der Anzeige, gespeichert in Millilitern', () => {
    expect(leseZielwert('2,6', WASSER)).toEqual({ wert: 2600 });
    expect(leseZielwert('2.5', WASSER)).toEqual({ wert: 2500 });
    expect(leseZielwert('3', WASSER)).toEqual({ wert: 3000 });
    // Milliliter, wie das Feld vorher hieß, sind kein Liter-Wert.
    expect(leseZielwert('2570', WASSER)).toHaveProperty('fehler');
    expect(leseZielwert('2,55', WASSER)).toHaveProperty('fehler');
    expect(leseZielwert('0,4', WASSER)).toHaveProperty('fehler');
  });
});
