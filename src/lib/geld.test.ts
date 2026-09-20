import { describe, expect, it } from 'vitest';
import { centZuEingabe, formatEuro, parseEuroZuCent } from './geld';

/**
 * Die drei Geldfunktionen der Anwendung — bis R3-018 ohne einen einzigen Test.
 *
 * Sie stehen zwischen Eingabefeld und Datenbank: Was hier durchrutscht, wird
 * als ganze Cent gespeichert und steht später auf einer Rechnung. Geprüft
 * wird deshalb nicht nur, was angenommen wird, sondern vor allem, **was
 * nicht** — jede abgelehnte Schreibweise ist eine, die sonst als falsche Zahl
 * durchginge.
 */

describe('parseEuroZuCent', () => {
  it.each([
    ['45', 4500],
    ['45,5', 4550],
    ['45,50', 4550],
    ['45.50', 4550],
    ['0,29', 29],
    ['0', 0],
    [' 45,50 ', 4550],
    ['1000000', 100_000_000],
  ])('nimmt %s an und macht %i Cent daraus', (eingabe, cent) => {
    expect(parseEuroZuCent(eingabe)).toBe(cent);
  });

  it.each([
    // Tausenderpunkt: mehrdeutig - 1.234 kann 1234 oder 1,234 heissen.
    ['1.234,56'],
    ['1,234.56'],
    // Negativ: ein Minusbetrag ist keine Eingabe, sondern eine Richtung.
    ['-5'],
    ['-0,01'],
    // Mehr als zwei Nachkommastellen: ein Bruchteil eines Cents.
    ['0,005'],
    ['1,005'],
    // Wissenschaftliche Schreibweise: Number() nimmt sie, ein Formular nicht.
    ['1e3'],
    ['0x10'],
    // Unvollstaendig oder gar keine Zahl.
    ['45,'],
    [','],
    [''],
    ['   '],
    ['viel'],
    ['45 €'],
  ])('weist %s ab', (eingabe) => {
    expect(parseEuroZuCent(eingabe)).toBeNull();
  });
});

describe('centZuEingabe', () => {
  it.each([
    [4500, '45,00'],
    [4550, '45,50'],
    [29, '0,29'],
    [0, '0,00'],
  ])('macht aus %i Cent die Eingabe %s', (cent, eingabe) => {
    expect(centZuEingabe(cent)).toBe(eingabe);
  });

  it('bleibt mit parseEuroZuCent im Kreis', () => {
    for (const cent of [0, 1, 29, 4500, 4550, 100_000]) {
      expect(parseEuroZuCent(centZuEingabe(cent))).toBe(cent);
    }
  });
});

describe('formatEuro', () => {
  it('schreibt Betraege deutsch mit Waehrungszeichen', () => {
    // Das Leerzeichen vor dem Zeichen ist ein schmales geschuetztes (U+202F),
    // wie Intl es liefert - deshalb wird auf den Zahlteil geprueft.
    expect(formatEuro(4550)).toMatch(/^45,50\s?€$/u);
    expect(formatEuro(0)).toMatch(/^0,00\s?€$/u);
  });

  it('nimmt eine andere Waehrung entgegen, statt Euro anzunehmen', () => {
    expect(formatEuro(4550, 'CHF')).toMatch(/45,50/);
    expect(formatEuro(4550, 'CHF')).not.toMatch(/€/);
  });
});
