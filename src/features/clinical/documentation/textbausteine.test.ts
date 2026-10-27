import { describe, expect, it } from 'vitest';
import { bausteinEinfuegen, bausteinFehler } from './textbausteine';

/**
 * Das Einfügen ist eine reine Textoperation ohne jede Kenntnis der Akte
 * (E-9, erste Stufe: keine Platzhalter, keine Werte aus der Akte). Genau
 * deshalb lässt es sich vollständig hier prüfen.
 */
describe('bausteinEinfuegen', () => {
  it('setzt den Baustein in einen leeren Text unverändert ein', () => {
    expect(bausteinEinfuegen('', 'Hausbesuch durchgeführt.')).toBe('Hausbesuch durchgeführt.');
  });

  it('hängt an bereits Geschriebenes an - der Baustein ergänzt', () => {
    expect(bausteinEinfuegen('Erster Satz.', 'Zweiter Satz.')).toBe(
      'Erster Satz.\n\nZweiter Satz.',
    );
  });

  it('erzeugt genau eine Leerzeile, egal wie der bisherige Text endet', () => {
    expect(bausteinEinfuegen('Text.\n\n\n', 'Baustein.')).toBe('Text.\n\nBaustein.');
    expect(bausteinEinfuegen('Text.   ', 'Baustein.')).toBe('Text.\n\nBaustein.');
  });

  it('behandelt einen Text aus lauter Leerraum wie einen leeren', () => {
    expect(bausteinEinfuegen('   \n  ', 'Baustein.')).toBe('Baustein.');
  });

  it('verändert den Baustein selbst nicht', () => {
    const baustein = '  Mit Leerzeichen vorn und Zeilenumbruch\n';
    expect(bausteinEinfuegen('Text.', baustein)).toBe(`Text.\n\n${baustein}`);
  });
});

describe('bausteinFehler', () => {
  it('verlangt Titel und Text', () => {
    expect(bausteinFehler('  ', '  ')).toEqual({
      title: 'Ein Titel ist erforderlich.',
      body: 'Der Baustein darf nicht leer sein.',
    });
  });

  it('meldet nichts bei gültiger Eingabe', () => {
    expect(bausteinFehler('Titel', 'Text')).toEqual({});
  });

  it('begrenzt die Länge wie die Datenbank', () => {
    expect(bausteinFehler('x'.repeat(81), 'Text').title).toMatch(/Höchstens 80/);
    expect(bausteinFehler('Titel', 'x'.repeat(2001)).body).toMatch(
      /Höchstens 2.000|Höchstens 2000/,
    );
  });
});
