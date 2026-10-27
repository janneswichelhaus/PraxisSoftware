import { describe, expect, it } from 'vitest';
import { zugangMitStockwerk } from './stockwerk';

/**
 * ANN-197: Das Stockwerk kommt vom Anfang des Zugangshinweises, bis es ein
 * eigenes Feld gibt. Die Regel ist bewusst eng - lieber keine Pille als eine,
 * die einen halben Satz trägt.
 */
describe('Stockwerk aus dem Zugangshinweis (ANN-197)', () => {
  it('trennt das Stockwerk vom Anfang ab und laesst den Rest stehen', () => {
    expect(zugangMitStockwerk('2. OG links, Aufzug vorhanden.')).toEqual({
      stockwerk: '2. OG links',
      rest: 'Aufzug vorhanden.',
    });
    expect(
      zugangMitStockwerk('Erdgeschoss, Klingel "Beispiel". Schlüssel bei der Nachbarin.'),
    ).toEqual({
      stockwerk: 'Erdgeschoss',
      rest: 'Klingel "Beispiel". Schlüssel bei der Nachbarin.',
    });
  });

  it.each([
    ['EG', 'EG'],
    ['eg rechts', 'eg rechts'],
    ['Hochparterre', 'Hochparterre'],
    ['Souterrain', 'Souterrain'],
    ['DG', 'DG'],
    ['1. Stock', '1. Stock'],
    ['3. Etage hinten', '3. Etage hinten'],
    ['2.OG', '2.OG'],
    ['12. Obergeschoss Mitte', '12. Obergeschoss Mitte'],
    ['1. UG', '1. UG'],
  ])('erkennt „%s"', (hinweis, stockwerk) => {
    expect(zugangMitStockwerk(hinweis)).toEqual({ stockwerk, rest: null });
  });

  it('nimmt die Angabe, wie sie eingetragen ist - ohne sie umzuschreiben', () => {
    expect(zugangMitStockwerk('  3. og LINKS ; Code 1234')).toEqual({
      stockwerk: '3. og LINKS',
      rest: 'Code 1234',
    });
  });

  it('trennt auch an Zeilenumbruch und Gedankenstrich', () => {
    expect(zugangMitStockwerk('1. OG\nKlingel Muster')).toEqual({
      stockwerk: '1. OG',
      rest: 'Klingel Muster',
    });
    expect(zugangMitStockwerk('EG – Hintereingang')).toEqual({
      stockwerk: 'EG',
      rest: 'Hintereingang',
    });
    expect(zugangMitStockwerk('DG - über den Hof')).toEqual({
      stockwerk: 'DG',
      rest: 'über den Hof',
    });
  });

  it.each([
    // Das Stockwerk steht nicht vorn.
    'Klingel Müller, 2. OG',
    // Mehr als eine Angabe vor dem Komma.
    '2. OG links neben dem Aufzug, Klingel Müller',
    // Eine Zahl-Ebene ohne Zahl ist keine Angabe.
    'OG links',
    'Stock',
    // Kein Stockwerk, auch wenn es so anfängt.
    'Erdgeschosswohnung im Hinterhaus',
    'EGon öffnet',
    '2. Tür links',
    '2 OG',
    // Der Punkt nach „OG" trennt nicht: Er steckt auch in „2.".
    '2. OG links. Klingel Müller',
    'Aufzug vorhanden',
  ])('laesst „%s" ganz im Zugangshinweis', (hinweis) => {
    expect(zugangMitStockwerk(hinweis)).toEqual({ stockwerk: null, rest: hinweis });
  });

  it('kennt keinen Hinweis, wo keiner eingetragen ist', () => {
    for (const leer of [null, undefined, '', '   ', '\n']) {
      expect(zugangMitStockwerk(leer)).toEqual({ stockwerk: null, rest: null });
    }
  });
});
