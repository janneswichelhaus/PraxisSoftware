import { describe, expect, it } from 'vitest';
import { erreichbarkeit } from './erreichbarkeit';

/**
 * Die Erreichbarkeitsregel (MAP-004b, Akzeptanzkriterium 2).
 *
 * Geprüft werden die Grenzfälle, nicht die Mitte: genau passend, eine Sekunde
 * zu wenig, der Puffer als das, was den Ausschlag gibt, und jede Lage, in der
 * die Antwort `unbekannt` heißen muss. Die Regel hat keine Abhängigkeit — was
 * hier steht, ist die ganze Funktion.
 */

const MINUTE = 60;

describe('Erreichbarkeit zwischen zwei Terminen', () => {
  it('sagt erreichbar, wenn die Luecke reicht', () => {
    // 30 Minuten Luecke, 10 Minuten Fahrt, 5 Minuten Puffer.
    expect(erreichbarkeit(0, 30 * MINUTE, 10 * MINUTE, 5 * MINUTE)).toBe('erreichbar');
  });

  it('sagt erreichbar, wenn es genau passt', () => {
    // Wer die Luecke exakt ausfuellt, kommt an - der Sicherheitsabstand ist
    // der Puffer und steckt schon in der Rechnung.
    expect(erreichbarkeit(0, 15 * MINUTE, 10 * MINUTE, 5 * MINUTE)).toBe('erreichbar');
  });

  it('sagt nicht erreichbar, wenn eine einzige Sekunde fehlt', () => {
    expect(erreichbarkeit(0, 15 * MINUTE - 1, 10 * MINUTE, 5 * MINUTE)).toBe('nicht_erreichbar');
  });

  it('laesst den Puffer den Ausschlag geben', () => {
    // Dieselbe Fahrzeit, dieselbe Luecke - einmal mit, einmal ohne Puffer.
    expect(erreichbarkeit(0, 12 * MINUTE, 10 * MINUTE, 0)).toBe('erreichbar');
    expect(erreichbarkeit(0, 12 * MINUTE, 10 * MINUTE, 5 * MINUTE)).toBe('nicht_erreichbar');
  });

  it('sagt nicht erreichbar, wenn der naechste Termin frueher beginnt als der vorige endet', () => {
    expect(erreichbarkeit(60 * MINUTE, 30 * MINUTE, MINUTE, 0)).toBe('nicht_erreichbar');
  });

  it('sagt nicht erreichbar bei Fahrzeit null Sekunden, wenn die Luecke negativ ist', () => {
    // Auch ohne Weg bleibt eine Ueberschneidung eine Ueberschneidung.
    expect(erreichbarkeit(60 * MINUTE, 30 * MINUTE, 0, 0)).toBe('nicht_erreichbar');
  });

  it('sagt erreichbar bei Fahrzeit null Sekunden und passender Luecke', () => {
    expect(erreichbarkeit(0, 0, 0, 0)).toBe('erreichbar');
  });

  it('sagt unbekannt, wenn keine Fahrzeit vorliegt - und nie erreichbar', () => {
    // Der wichtigste Fall: Ohne Fahrzeit ist der Weg nicht geprueft, nicht
    // kurz. Eine grosszuegige Luecke aendert daran nichts.
    expect(erreichbarkeit(0, 10 * 60 * MINUTE, null, 0)).toBe('unbekannt');
  });

  it.each([
    ['unendliche Fahrzeit', [0, 30 * MINUTE, Number.POSITIVE_INFINITY, 0]],
    ['NaN als Fahrzeit', [0, 30 * MINUTE, Number.NaN, 0]],
    ['negative Fahrzeit', [0, 30 * MINUTE, -MINUTE, 0]],
    ['negativen Puffer', [0, 30 * MINUTE, MINUTE, -MINUTE]],
    ['NaN als Puffer', [0, 30 * MINUTE, MINUTE, Number.NaN]],
    ['NaN als Ende', [Number.NaN, 30 * MINUTE, MINUTE, 0]],
    ['unendlichen Beginn', [0, Number.POSITIVE_INFINITY, MINUTE, 0]],
  ])('sagt unbekannt bei %s', (_, [ende, beginn, fahrzeit, puffer]) => {
    expect(erreichbarkeit(ende!, beginn!, fahrzeit!, puffer!)).toBe('unbekannt');
  });

  it('rechnet nur mit Abstaenden, nicht mit absoluten Zeitpunkten', () => {
    // Dieselbe Lage, um ein Jahr verschoben: Die Antwort muss dieselbe sein.
    const jahr = 365 * 24 * 60 * MINUTE;
    expect(erreichbarkeit(jahr, jahr + 15 * MINUTE, 10 * MINUTE, 5 * MINUTE)).toBe('erreichbar');
  });
});
