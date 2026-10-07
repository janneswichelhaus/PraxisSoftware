import { describe, expect, it } from 'vitest';
import type { Uebung, Variante } from './api';
import { KEIN_FILTER, OHNE_AUSRUESTUNG, ausruestungen, filtere, gesetzteFilter } from './suche';

function variante(id: string, name: string, laie: string, ausruestung: string[] = []): Variante {
  return {
    id,
    name,
    lay_name: laie,
    instruction: null,
    equipment: ausruestung,
    common_faults: null,
    practice_notes: null,
    archived: false,
  };
}

const KNIEBEUGE: Uebung = {
  id: 'u1',
  name: 'Kniebeuge',
  lay_name: 'In die Hocke gehen',
  body_region: 'knie',
  archived: false,
  variants: [
    variante('v1', 'Kniebeuge am Geländer', 'Am Geländer in die Hocke', ['Geländer']),
    variante('v2', 'Kniebeuge freistehend', 'Frei in die Hocke'),
    { ...variante('v3', 'Kniebeuge mit Hantel', 'Mit Gewicht', ['Kurzhantel']), archived: true },
  ],
};

const BRUECKE: Uebung = {
  id: 'u2',
  name: 'Brücke',
  lay_name: 'Becken heben',
  body_region: 'lws',
  archived: false,
  variants: [variante('v4', 'Brücke beidbeinig', 'Becken anheben', ['Matte', 'theraband gelb'])],
};

const RUDERN: Uebung = {
  id: 'u3',
  name: 'Rudern',
  lay_name: 'Arme heranziehen',
  body_region: 'bws',
  archived: false,
  variants: [variante('v5', 'Rudern mit Band', 'Band heranziehen', ['Theraband gelb'])],
};

const ALLE = [BRUECKE, KNIEBEUGE, RUDERN];
const ids = (treffer: ReturnType<typeof filtere>) => treffer.map((t) => t.uebung.id);

describe('Suche und Filter der Übungsbibliothek (UEB-003)', () => {
  it('zeigt ohne Filter alles in der Reihenfolge der Bibliothek', () => {
    expect(ids(filtere(ALLE, KEIN_FILTER))).toEqual(['u2', 'u1', 'u3']);
  });

  it('sucht in der Alltagssprache wie in der Fachsprache (IDEA-QSN-002)', () => {
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, text: 'becken' }))).toEqual(['u2']);
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, text: 'BRÜCKE' }))).toEqual(['u2']);
  });

  it('findet eine Übung über ihre Variante und nennt die Variante', () => {
    const treffer = filtere(ALLE, { ...KEIN_FILTER, text: 'frei in' });
    expect(ids(treffer)).toEqual(['u1']);
    expect(treffer[0]!.variantenTreffer).toEqual(['Kniebeuge freistehend']);
  });

  it('übergeht archivierte Varianten', () => {
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, text: 'hantel' }))).toEqual([]);
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, ausruestung: 'Kurzhantel' }))).toEqual([]);
  });

  it('filtert nach Körperregion', () => {
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, region: 'knie' }))).toEqual(['u1']);
  });

  it('filtert nach Ausrüstung, groß und klein gleich, und nach „ohne“', () => {
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, ausruestung: 'Theraband gelb' }))).toEqual([
      'u2',
      'u3',
    ]);
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, ausruestung: OHNE_AUSRUESTUNG }))).toEqual(['u1']);
  });

  it('verbindet Filter und Suche', () => {
    expect(
      ids(filtere(ALLE, { text: 'band', region: 'bws', ausruestung: 'Theraband gelb' })),
    ).toEqual(['u3']);
    expect(gesetzteFilter({ text: 'x', region: 'bws', ausruestung: '' })).toBe(1);
  });

  it('bietet jede Ausrüstung einmal an, sortiert, ohne archivierte', () => {
    expect(ausruestungen(ALLE)).toEqual(['Geländer', 'Matte', 'theraband gelb']);
  });
});
