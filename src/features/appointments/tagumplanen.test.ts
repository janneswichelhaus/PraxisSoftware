// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { tabstandLegen } from '@/lib/tabstand';
import {
  ersteAnrufseite,
  leseAnrufliste,
  leseZeiten,
  liegtInZeiten,
  merkeAnrufliste,
  mitAnruflistenKennung,
  naechsterAnruf,
  seitenKennung,
  terminDativ,
  terminWort,
  umplanStand,
  zeitenText,
} from './tagumplanen';

describe('Tag umplanen - die Folge (G2, ANN-574)', () => {
  const ANNA = '55555555-5555-4555-8555-000000000002';
  const TAG = '2027-05-12';

  it('liest die Anrufliste aus dem Tab, nur in ihrer Form und nur für ihr Konto', () => {
    merkeAnrufliste('konto-a', 'v1', ANNA, TAG, { abgesagt: ['a', 'b'], stand: { a: 'nicht' } });
    const suche = new URLSearchParams(`person=${ANNA}&datum=${TAG}&anrufliste=v1`);
    expect(leseAnrufliste(suche, 'konto-a', ANNA, TAG)).toEqual({
      kennung: 'v1',
      liste: { abgesagt: ['a', 'b'], stand: { a: 'nicht' } },
    });
    expect(leseAnrufliste(suche, 'konto-b', ANNA, TAG)).toBeNull();
    expect(leseAnrufliste(new URLSearchParams(''), 'konto-a', ANNA, TAG)).toBeNull();
    expect(leseAnrufliste(new URLSearchParams('anrufliste=<x>'), 'konto-a', ANNA, TAG)).toBeNull();
  });

  it('behält je Tab nur die jüngste Liste', () => {
    merkeAnrufliste('konto-a', 'v1', ANNA, TAG, { abgesagt: ['a'], stand: {} });
    merkeAnrufliste('konto-a', 'v2', ANNA, TAG, { abgesagt: ['b'], stand: {} });
    const lies = (kennung: string) =>
      leseAnrufliste(new URLSearchParams(`anrufliste=${kennung}`), 'konto-a', ANNA, TAG);
    expect(lies('v1')).toBeNull();
    expect(lies('v2')?.liste.abgesagt).toEqual(['b']);
  });

  it('nimmt eine Liste nur für die Person und den Tag, für die sie angelegt wurde', () => {
    merkeAnrufliste('konto-a', 'v1', ANNA, TAG, { abgesagt: ['a'], stand: {} });
    const suche = new URLSearchParams('anrufliste=v1');
    expect(leseAnrufliste(suche, 'konto-a', ANNA, '2027-05-13')).toBeNull();
    expect(leseAnrufliste(suche, 'konto-a', 'andere-person', TAG)).toBeNull();
  });

  it('lässt fremde Kennungen und Antworten aus einer verstellten Ablage weg', () => {
    tabstandLegen('konto-a', 'v1', {
      person: ANNA,
      datum: TAG,
      abgesagt: ['a', '<x>', 7, 'b'],
      stand: { a: 'erreicht', b: 'vielleicht', fremd: 'nicht' },
    });
    expect(leseAnrufliste(new URLSearchParams('anrufliste=v1'), 'konto-a', ANNA, TAG)).toEqual({
      kennung: 'v1',
      liste: { abgesagt: ['a', 'b'], stand: { a: 'erreicht' } },
    });
    tabstandLegen('konto-a', 'v2', 'kein Objekt');
    expect(leseAnrufliste(new URLSearchParams('anrufliste=v2'), 'konto-a', ANNA, TAG)).toBeNull();
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

  it('schreibt nur die Kennung in die Adresse, gleich lang für jede Liste', () => {
    const davor = new URLSearchParams(`person=${ANNA}&datum=${TAG}`);
    const neu = mitAnruflistenKennung(davor, 'v1');
    expect(neu.get('person')).toBe(ANNA);
    expect(neu.get('anrufliste')).toBe('v1');
    expect(davor.has('anrufliste')).toBe(false);
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
