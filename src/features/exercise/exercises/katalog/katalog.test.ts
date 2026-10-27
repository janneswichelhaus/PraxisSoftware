import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCHLAGWORT_HOECHSTENS } from '../types';
import { KATALOG, KATALOG_GRUPPEN, katalogeintrag } from '.';
import { katalogeintragSchema, ausruestungVon, katalogvorlageSchema } from './schema';
import { GRUPPEN, HILFSMITTEL, HILFSMITTEL_LABEL, NACH_BEDARF } from './typen';
import { KATALOG_VORLAGEN } from './vorlagen';

/**
 * Der mitgelieferte Übungskatalog (ANN-382): Jeder Eintrag hält die Grenzen
 * der Datenbank, schreibt Deutsch mit Umlauten, nennt keine Diagnose als
 * Auswahl und trägt keine Zeichnung (ANN-539). Der Server prüft beim Übernehmen noch
 * einmal (`supabase/tests/exercise-catalog.test.ts`).
 */

const TEXTFELDER = (e: (typeof KATALOG)[number]) => [
  e.name,
  e.alltagsname,
  ...e.anleitung,
  ...e.fehler,
  ...(e.hinweise_praxis ? [e.hinweise_praxis] : []),
];

/**
 * Umschriften statt Umlaute („Fuesse", „ueber"). Erlaubt bleiben Wörter, in
 * denen ae/oe/ue wirklich so stehen („neue", „dauerhaft", „zuerst", „aktuell").
 */
const UMSCHRIFT = /[A-Za-zÄÖÜäöüß]*(?:ae|oe|ue|Ae|Oe|Ue)[A-Za-zÄÖÜäöüß]*/g;
const ECHT = /(eue|aue|äue|zuerst|zueinander|que|uell|uent|duett|poet|oboe)/i;
const SZ = /\b(Fuss|fuss|Fusse|Gross|gross|Strasse|Mass|massig)\b/;

/** Diagnosen gehören nicht in Namen und Anleitung (ADR-006 Punkt 10). */
const DIAGNOSE =
  /(arthrose|endoprothese|\bTEP\b|schlaganfall|apoplex|parkinson|bandscheib|osteopor|nach (der )?op\b|post-?op)/i;

describe('Übungskatalog', () => {
  it('hat eine Datei je Gruppe, und jeder Eintrag steht in seiner Gruppe', () => {
    const dateien = readdirSync(
      join(process.cwd(), 'src/features/exercise/exercises/katalog/eintraege'),
    )
      .filter((d) => d.endsWith('.ts'))
      .map((d) => d.replace(/\.ts$/, ''))
      .sort();
    expect(dateien).toEqual([...GRUPPEN].sort());
    for (const [gruppe, eintraege] of Object.entries(KATALOG_GRUPPEN)) {
      for (const e of eintraege)
        expect(e.schluessel.startsWith(`${gruppe.toUpperCase()}-`)).toBe(true);
    }
  });

  it('vergibt jeden Schlüssel und jeden Namen nur einmal', () => {
    const schluessel = KATALOG.map((e) => e.schluessel);
    expect(new Set(schluessel).size).toBe(schluessel.length);
    const namen = KATALOG.map((e) => e.name.toLocaleLowerCase('de'));
    expect(new Set(namen).size).toBe(namen.length);
    expect(katalogeintrag('KN-01')?.name).toBe('Kniestreckung im Sitz (Long Arc Quad)');
  });

  it.each(KATALOG.map((e) => [e.schluessel, e] as const))(
    '%s hält Werte und Grenzen der Datenbank',
    (_, e) => {
      const ergebnis = katalogeintragSchema.safeParse(e);
      expect(ergebnis.success, JSON.stringify(ergebnis.error?.issues)).toBe(true);
      for (const wort of ausruestungVon(e)) {
        expect(wort.length).toBeLessThanOrEqual(SCHLAGWORT_HOECHSTENS);
      }
    },
  );

  it.each(KATALOG.map((e) => [e.schluessel, e] as const))(
    '%s schreibt Umlaute und nennt keine Diagnose als Auswahl',
    (_, e) => {
      for (const text of TEXTFELDER(e)) {
        const umschriften = (text.match(UMSCHRIFT) ?? []).filter((w) => !ECHT.test(w));
        expect(umschriften, text).toEqual([]);
        expect(text, text).not.toMatch(SZ);
      }
      for (const text of [e.name, e.alltagsname, ...e.anleitung]) {
        expect(text, text).not.toMatch(DIAGNOSE);
      }
    },
  );

  it('trägt keine Zeichnung - Bilder und Videos dreht die Praxis selbst (ANN-539)', () => {
    for (const e of KATALOG) expect(Object.keys(e), e.schluessel).not.toContain('bild');
  });

  it('kennt eine Bezeichnung für jedes Hilfsmittel, mit „nach Bedarf" höchstens 40 Zeichen', () => {
    for (const h of HILFSMITTEL) {
      expect(`${HILFSMITTEL_LABEL[h]}${NACH_BEDARF}`.length).toBeLessThanOrEqual(
        SCHLAGWORT_HOECHSTENS,
      );
    }
  });

  it('erkennt Umschriften und Diagnosen (Gegenprobe)', () => {
    const umschriften = (t: string) => (t.match(UMSCHRIFT) ?? []).filter((w) => !ECHT.test(w));
    expect(umschriften('Die Fuesse stehen ueber der Kante.')).toEqual(['Fuesse', 'ueber']);
    expect(umschriften('Zuerst die neue Übung, dauerhaft und aktuell.')).toEqual([]);
    expect('Gross und Fuss').toMatch(SZ);
    expect('Knie nach Endoprothese').toMatch(DIAGNOSE);
    expect('Kniestreckung im Sitz').not.toMatch(DIAGNOSE);
  });

  it('verweist in Vorlagen nur auf Einträge des Katalogs, keinen doppelt', () => {
    for (const v of KATALOG_VORLAGEN) {
      expect(katalogvorlageSchema.safeParse(v).success, v.schluessel).toBe(true);
      const schluessel = v.uebungen.map((u) => u.schluessel);
      expect(new Set(schluessel).size, v.schluessel).toBe(schluessel.length);
      for (const s of schluessel) expect(katalogeintrag(s), `${v.schluessel}: ${s}`).toBeDefined();
    }
  });

  it('benennt Vorlagen nach Region und Ziel, nie nach einer Diagnose (ADR-006 Punkt 10)', () => {
    for (const v of KATALOG_VORLAGEN) {
      expect(v.name, v.schluessel).not.toMatch(DIAGNOSE);
      expect(v.ziel, v.schluessel).not.toMatch(DIAGNOSE);
      const umschriften = (`${v.name} ${v.ziel}`.match(UMSCHRIFT) ?? []).filter(
        (w) => !ECHT.test(w),
      );
      expect(umschriften, v.schluessel).toEqual([]);
    }
  });
});
