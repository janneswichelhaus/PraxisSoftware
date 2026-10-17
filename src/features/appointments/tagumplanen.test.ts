import { describe, expect, it } from 'vitest';
import {
  ersteAnrufseite,
  leseAbgesagt,
  leseAnrufstand,
  leseZeiten,
  liegtInZeiten,
  mitAnrufstand,
  naechsterAnruf,
  seitenKennung,
  terminDativ,
  terminWort,
  umplanStand,
  zeitenText,
} from './tagumplanen';

describe('Tag umplanen - die Folge (G2, ANN-574)', () => {
  it('liest die abgesagten Kennungen nur in ihrer Form, ohne Namen', () => {
    expect(leseAbgesagt(new URLSearchParams(''))).toBeNull();
    expect(leseAbgesagt(new URLSearchParams('abgesagt='))).toEqual([]);
    expect(leseAbgesagt(new URLSearchParams('abgesagt=a,b,<x>,c'))).toEqual(['a', 'b', 'c']);
  });

  it('liest die Arbeitszeit nach einer Teiländerung nur in ihrer Form (Praxis-Review Überholung 9)', () => {
    expect(leseZeiten(new URLSearchParams(''))).toBeNull();
    expect(leseZeiten(new URLSearchParams('zeiten='))).toEqual([]);
    const zeiten = leseZeiten(new URLSearchParams('zeiten=08:00-12:00,13:00-16:00'));
    expect(zeiten).toEqual([
      { von: '08:00', bis: '12:00' },
      { von: '13:00', bis: '16:00' },
    ]);
    expect(zeitenText(zeiten!)).toBe('08:00-12:00,13:00-16:00');
    // Eine ungültige Angabe gilt als keine: der ganze Tag wie bisher.
    expect(leseZeiten(new URLSearchParams('zeiten=8-12'))).toBeNull();
    expect(leseZeiten(new URLSearchParams('zeiten=08:00-12:00,<x>'))).toBeNull();
  });

  it('nennt einen Termin in der Arbeitszeit nur, wenn er ganz darin liegt', () => {
    const zeiten = [
      { von: '08:00', bis: '12:00' },
      { von: '13:00', bis: '16:00' },
    ];
    expect(liegtInZeiten('09:00', '10:00', zeiten)).toBe(true);
    expect(liegtInZeiten('13:00', '16:00', zeiten)).toBe(true);
    expect(liegtInZeiten('15:30', '16:30', zeiten)).toBe(false);
    expect(liegtInZeiten('16:30', '17:30', zeiten)).toBe(false);
    expect(liegtInZeiten('09:00', '10:00', [])).toBe(false);
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
