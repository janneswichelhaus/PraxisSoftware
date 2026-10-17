import { describe, expect, it } from 'vitest';
import {
  ersteAnrufseite,
  leseAbgesagt,
  leseAnrufstand,
  mitAnrufstand,
  naechsterAnruf,
  seitenKennung,
  terminDativ,
  terminWort,
  umplanStand,
} from './tagumplanen';

describe('Tag umplanen - die Folge (G2, ANN-574)', () => {
  it('liest die abgesagten Kennungen nur in ihrer Form, ohne Namen', () => {
    expect(leseAbgesagt(new URLSearchParams(''))).toBeNull();
    expect(leseAbgesagt(new URLSearchParams('abgesagt='))).toEqual([]);
    expect(leseAbgesagt(new URLSearchParams('abgesagt=a,b,<x>,c'))).toEqual(['a', 'b', 'c']);
  });

  it('hält den Anrufstand in der Adresse und lässt den Rest stehen', () => {
    const suche = new URLSearchParams('person=p&datum=2027-05-12&abgesagt=a,b,c');
    const neu = mitAnrufstand(suche, { a: 'erreicht', b: 'nicht' });
    expect(neu.get('person')).toBe('p');
    expect(neu.get('abgesagt')).toBe('a,b,c');
    expect(neu.get('erreicht')).toBe('a');
    expect(neu.get('nicht')).toBe('b');
    expect(leseAnrufstand(neu)).toEqual({ a: 'erreicht', b: 'nicht' });
    // Ohne Ergebnis fallen die Parameter weg.
    expect(mitAnrufstand(neu, {}).has('erreicht')).toBe(false);
  });

  it('führt der Reihe nach zur nächsten Person ohne Ergebnis, am Ende zum Abschluss', () => {
    const reihe = ['a', 'b', 'c'];
    expect(naechsterAnruf(reihe, {})).toBe('a');
    expect(naechsterAnruf(reihe, { a: 'erreicht' }, 'a')).toBe('b');
    // Wer zurückging und eine frühere Antwort änderte, landet bei der offenen.
    expect(naechsterAnruf(reihe, { a: 'nicht', c: 'erreicht' }, 'a')).toBe('b');
    expect(naechsterAnruf(reihe, { b: 'nicht', c: 'nicht' }, 'c')).toBe('a');
    expect(ersteAnrufseite(reihe, { a: 'nicht', b: 'erreicht', c: 'nicht' })).toEqual({
      art: 'fertig',
    });
    expect(ersteAnrufseite(reihe, { a: 'nicht' })).toEqual({ art: 'anruf', id: 'b' });
  });

  it('zählt beim Absagen drei Schritte und beim Anrufen je Person', () => {
    expect(umplanStand({ art: 'termine' }, [])).toEqual({
      text: 'Schritt 2 von 3',
      wert: 2,
      von: 3,
    });
    expect(umplanStand({ art: 'anruf', id: 'b' }, ['a', 'b', 'c'])).toEqual({
      text: 'Anruf 2 von 3',
      wert: 2,
      von: 3,
    });
    expect(umplanStand({ art: 'fertig' }, ['a'])).toBeUndefined();
    expect(seitenKennung({ art: 'anruf', id: 'b' })).toBe('anruf-b');
    expect(terminWort(1)).toBe('Termin');
    expect(terminWort(3)).toBe('Termine');
    expect(terminDativ(1)).toBe('Termin');
    expect(terminDativ(0)).toBe('Terminen');
  });
});
