import { describe, expect, it } from 'vitest';
import type { Uebung, Variante } from './api';
import { OHNE_KATALOG } from './testdaten';
import {
  KEIN_FILTER,
  OHNE_AUSRUESTUNG,
  facetten,
  filtere,
  gesetzteFilter,
  ohneFilter,
  ordnungZeile,
  ungeprueft,
} from './suche';

function variante(
  id: string,
  name: string,
  laie: string,
  ausruestung: string[] = [],
  zusatz: Partial<Variante> = {},
): Variante {
  return {
    id,
    name,
    lay_name: laie,
    instruction: null,
    equipment: ausruestung,
    common_faults: null,
    practice_notes: null,
    archived: false,
    ...OHNE_KATALOG,
    ...zusatz,
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

/** Eine Übung aus dem Katalog (ANN-382): Ziel, Stellung, Niveau, Hilfsmittel als Bezeichnung. */
const KNIESTRECKUNG: Uebung = {
  id: 'u4',
  name: 'Kniestreckung im Sitz',
  lay_name: 'Im Sitz das Knie strecken',
  body_region: 'knie',
  archived: false,
  variants: [
    variante(
      'v6',
      'Kniestreckung im Sitz',
      'Im Sitz das Knie strecken',
      ['Stuhl', 'Gewichtsmanschette (nach Bedarf)'],
      {
        catalog_key: 'KN-01',
        catalog_version: '1.0.0',
        goal: 'kraft',
        starting_position: 'sitz',
        level: 1,
      },
    ),
  ],
};

const ALLE = [BRUECKE, KNIEBEUGE, RUDERN];
const ids = (treffer: ReturnType<typeof filtere>) => treffer.map((t) => t.uebung.id);

describe('Suche und Filter der Übungsbibliothek (UEB-003, Welle B)', () => {
  it('zeigt ohne Filter alles in der Reihenfolge der Bibliothek', () => {
    expect(ids(filtere(ALLE, KEIN_FILTER))).toEqual(['u2', 'u1', 'u3']);
  });

  it('sucht in der Alltagssprache wie in der Fachsprache (IDEA-QSN-002)', () => {
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, text: 'becken' }))).toEqual(['u2']);
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, text: 'BRÜCKE' }))).toEqual(['u2']);
  });

  it('findet auch ohne Umlaute - „Bruecke“ und „Brucke“ wie „Brücke“', () => {
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, text: 'Bruecke' }))).toEqual(['u2']);
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, text: 'brucke' }))).toEqual(['u2']);
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, text: 'gelaender' }))).toEqual(['u1']);
  });

  it('findet eine Übung über ihre Variante und nennt die Variante', () => {
    const treffer = filtere(ALLE, { ...KEIN_FILTER, text: 'frei in' });
    expect(ids(treffer)).toEqual(['u1']);
    expect(treffer[0]!.variantenTreffer).toEqual(['Kniebeuge freistehend']);
    expect(treffer[0]!.varianten.map((v) => v.id)).toEqual(['v2']);
  });

  it('übergeht archivierte Varianten', () => {
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, text: 'hantel' }))).toEqual([]);
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, hilfsmittel: ['Kurzhantel'] }))).toEqual([]);
  });

  it('filtert nach Körperregion - mehrere gewählte Werte genügen einzeln', () => {
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, regionen: ['knie'] }))).toEqual(['u1']);
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, regionen: ['knie', 'lws'] }))).toEqual(['u2', 'u1']);
  });

  it('filtert nach Hilfsmitteln, groß und klein gleich, „nach Bedarf“ zählt mit, und nach „ohne“', () => {
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, hilfsmittel: ['Theraband gelb'] }))).toEqual([
      'u2',
      'u3',
    ]);
    expect(ids(filtere(ALLE, { ...KEIN_FILTER, hilfsmittel: [OHNE_AUSRUESTUNG] }))).toEqual(['u1']);
    expect(
      ids(filtere([KNIESTRECKUNG], { ...KEIN_FILTER, hilfsmittel: ['Gewichtsmanschette'] })),
    ).toEqual(['u4']);
  });

  it('filtert nach Ziel, Ausgangsstellung und Niveau an der Variante', () => {
    const mit = [...ALLE, KNIESTRECKUNG];
    expect(ids(filtere(mit, { ...KEIN_FILTER, ziele: ['kraft'] }))).toEqual(['u4']);
    expect(ids(filtere(mit, { ...KEIN_FILTER, stellungen: ['sitz'] }))).toEqual(['u4']);
    expect(ids(filtere(mit, { ...KEIN_FILTER, niveaus: ['1'] }))).toEqual(['u4']);
    expect(ids(filtere(mit, { ...KEIN_FILTER, niveaus: ['3'] }))).toEqual([]);
  });

  it('verbindet Filter und Suche und zählt die gesetzten Filter', () => {
    const filter = {
      ...KEIN_FILTER,
      text: 'band',
      regionen: ['bws'] as const,
      hilfsmittel: ['Theraband gelb'],
    };
    expect(ids(filtere(ALLE, filter))).toEqual(['u3']);
    expect(gesetzteFilter(filter)).toBe(2);
    expect(ohneFilter(filter)).toEqual({ ...KEIN_FILTER, text: 'band' });
  });

  it('bietet nur Filterwerte an, die vorkommen - Hilfsmittel einmal, ohne „nach Bedarf“', () => {
    const werte = facetten([...ALLE, KNIESTRECKUNG]);
    expect(werte.regionen.map((w) => w.text)).toEqual([
      'Brustwirbelsäule',
      'Lendenwirbelsäule',
      'Knie',
    ]);
    expect(werte.ziele).toEqual([{ wert: 'kraft', text: 'Kraft' }]);
    expect(werte.stellungen).toEqual([{ wert: 'sitz', text: 'Sitz' }]);
    expect(werte.niveaus).toEqual([{ wert: '1', text: 'Leicht, mit Halt' }]);
    expect(werte.hilfsmittel.map((w) => w.text)).toEqual([
      'Ohne Hilfsmittel',
      'Geländer',
      'Gewichtsmanschette',
      'Matte',
      'Stuhl',
      'theraband gelb',
    ]);
  });

  it('schreibt Region, Ziel und Niveau als Zeile und erkennt ungeprüfte Katalogübungen (ANN-386)', () => {
    expect(ordnungZeile(KNIESTRECKUNG, KNIESTRECKUNG.variants[0])).toBe(
      'Knie · Kraft · Leicht, mit Halt',
    );
    expect(ordnungZeile(BRUECKE, BRUECKE.variants[0])).toBe('Lendenwirbelsäule');
    expect(ungeprueft(KNIESTRECKUNG.variants[0]!)).toBe(true);
    expect(ungeprueft({ ...KNIESTRECKUNG.variants[0]!, reviewed_at: '2026-10-13T08:00:00Z' })).toBe(
      false,
    );
    expect(ungeprueft(BRUECKE.variants[0]!)).toBe(false);
  });
});
