import { describe, expect, it } from 'vitest';
import { SERIE_HOECHSTZAHL, rhythmen, serienTermine } from './serie';

/**
 * Rhythmus einer Terminserie (CAL-007).
 *
 * Die Rechnung muss deterministisch sein (§6.2) und über Monats-, Jahres- und
 * Zeitumstellungsgrenzen dasselbe liefern.
 */
describe('serienTermine', () => {
  it('legt einen wöchentlichen Rhythmus auf denselben Wochentag', () => {
    // 2027-05-12 ist ein Mittwoch.
    expect(serienTermine('2027-05-12', '09:00', 'woechentlich', 4)).toEqual([
      { datum: '2027-05-12', beginn: '09:00' },
      { datum: '2027-05-19', beginn: '09:00' },
      { datum: '2027-05-26', beginn: '09:00' },
      { datum: '2027-06-02', beginn: '09:00' },
    ]);
  });

  it('hält bei zweimal pro Woche zwei feste Wochentage', () => {
    // Montag → Donnerstag → Montag: 3 und 4 Tage im Wechsel, nicht 3,5.
    expect(serienTermine('2027-05-10', '08:00', 'zweimal_woechentlich', 5)).toEqual([
      { datum: '2027-05-10', beginn: '08:00' },
      { datum: '2027-05-13', beginn: '08:00' },
      { datum: '2027-05-17', beginn: '08:00' },
      { datum: '2027-05-20', beginn: '08:00' },
      { datum: '2027-05-24', beginn: '08:00' },
    ]);
  });

  it('rechnet alle zwei Wochen', () => {
    expect(serienTermine('2027-05-12', '09:00', 'zweiwoechentlich', 3).map((t) => t.datum)).toEqual(
      ['2027-05-12', '2027-05-26', '2027-06-09'],
    );
  });

  it('rechnet über den Jahreswechsel und über ein Schaltjahr', () => {
    expect(serienTermine('2027-12-27', '09:00', 'woechentlich', 3).map((t) => t.datum)).toEqual([
      '2027-12-27',
      '2028-01-03',
      '2028-01-10',
    ]);
    expect(serienTermine('2028-02-22', '09:00', 'woechentlich', 2).map((t) => t.datum)).toEqual([
      '2028-02-22',
      '2028-02-29',
    ]);
  });

  it('bleibt über die Zeitumstellung auf demselben Wochentag', () => {
    // 28.03.2027 ist der Umstellungstag. Die Rechnung läuft über UTC und darf
    // deshalb keinen Tag verlieren.
    expect(serienTermine('2027-03-24', '09:00', 'woechentlich', 3).map((t) => t.datum)).toEqual([
      '2027-03-24',
      '2027-03-31',
      '2027-04-07',
    ]);
  });

  it('liefert genau einen Termin bei Anzahl 1', () => {
    expect(serienTermine('2027-05-12', '09:00', 'woechentlich', 1)).toEqual([
      { datum: '2027-05-12', beginn: '09:00' },
    ]);
  });

  it('liefert nichts ohne gültigen ersten Tag oder bei Anzahl 0', () => {
    expect(serienTermine('', '09:00', 'woechentlich', 4)).toEqual([]);
    expect(serienTermine('12.05.2027', '09:00', 'woechentlich', 4)).toEqual([]);
    expect(serienTermine('2027-05-12', '09:00', 'woechentlich', 0)).toEqual([]);
  });

  it('begrenzt die Serie auf die Höchstzahl', () => {
    expect(serienTermine('2027-05-12', '09:00', 'woechentlich', 99)).toHaveLength(
      SERIE_HOECHSTZAHL,
    );
  });

  it('ist deterministisch', () => {
    const a = serienTermine('2027-05-12', '09:00', 'zweimal_woechentlich', 10);
    const b = serienTermine('2027-05-12', '09:00', 'zweimal_woechentlich', 10);
    expect(a).toEqual(b);
  });

  it('beschriftet jeden Rhythmus', () => {
    for (const eintrag of Object.values(rhythmen)) {
      expect(eintrag.label.length).toBeGreaterThan(0);
      expect(eintrag.abstaende.every((tage) => tage > 0)).toBe(true);
    }
  });
});
