import { describe, expect, it } from 'vitest';
import { aendern, beginne, imAendern, kannZurueck, schrittText, weiter, zurueck } from './abfolge';

describe('Abfolge eines geführten Ablaufs', () => {
  it('geht weiter und zurück dorthin, woher man kam', () => {
    const a = beginne('eins');
    expect(kannZurueck(a)).toBe(false);
    expect(zurueck(a)).toBeNull();
    const b = weiter(a, 'zwei');
    const c = weiter(b, 'vier'); // verzweigt: „drei“ war nie zu sehen
    expect(c.seite).toBe('vier');
    expect(zurueck(c)!.seite).toBe('zwei');
    expect(zurueck(zurueck(c)!)!.seite).toBe('eins');
  });

  it('kehrt aus dem Ändern zum Abschluss zurück, sobald der Ablauf vollständig ist', () => {
    let a = beginne('art');
    a = weiter(a, 'tag');
    a = weiter(a, 'abschluss');
    const vorher = a;
    a = aendern(a, 'art');
    expect(imAendern(a)).toBe(true);
    // Eine andere Antwort braucht eine Folgefrage: noch nicht vollständig.
    a = weiter(a, 'datum', false);
    expect(a.seite).toBe('datum');
    a = weiter(a, 'tag', true);
    expect(a).toEqual(vorher);
    expect(imAendern(a)).toBe(false);
    // „← Zurück“ aus dem Abschluss geht zur letzten Frage, nicht in das Ändern.
    expect(zurueck(a)!.seite).toBe('tag');
  });

  it('führt mit „← Zurück“ aus dem Ändern zum Abschluss, und das Ändern ist vorbei', () => {
    let a = weiter(weiter(beginne('art'), 'tag'), 'abschluss');
    a = aendern(a, 'art');
    const zurueckZumAbschluss = zurueck(a)!;
    expect(zurueckZumAbschluss.seite).toBe('abschluss');
    expect(imAendern(zurueckZumAbschluss)).toBe(false);
    expect(zurueck(zurueckZumAbschluss)!.seite).toBe('tag');
  });

  it('bleibt im Ändern, solange „← Zurück“ innerhalb der Änderung geht', () => {
    let a = weiter(weiter(beginne('art'), 'tag'), 'abschluss');
    a = aendern(a, 'art');
    a = weiter(a, 'datum');
    const einenZurueck = zurueck(a)!;
    expect(einenZurueck.seite).toBe('art');
    expect(imAendern(einenZurueck)).toBe(true);
    expect(weiter(einenZurueck, 'egal', true).seite).toBe('abschluss');
  });

  it('nennt den Schritt mit und ohne feste Zahl', () => {
    expect(schrittText(2, 4)).toBe('Schritt 2 von 4');
    expect(schrittText(3)).toBe('Schritt 3');
  });
});
