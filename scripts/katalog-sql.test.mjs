import { describe, expect, it } from 'vitest';
import { KATALOG } from '../src/features/exercise/exercises/katalog';
import { GRUPPEN as TS_GRUPPEN } from '../src/features/exercise/exercises/katalog/typen';
import {
  ANFANG,
  ENDE,
  GRUPPEN,
  abschnitt,
  ersetze,
  pruefen,
  sammleKatalog,
} from './katalog-sql.mjs';

/**
 * Der Übungskatalog im Seed (UEB-012, ANN-382): Der Abschnitt in
 * supabase/seed.sql entsteht aus denselben Dateien wie die Anwendung und ist
 * nie veraltet.
 */
describe('katalog-sql', () => {
  it('findet den Abschnitt im Seed aktuell', async () => {
    const { aktuell } = await pruefen();
    expect(aktuell).toBe(true);
  });

  it('liest dieselben Einträge wie die Anwendung, in derselben Reihenfolge', async () => {
    expect(GRUPPEN).toEqual([...TS_GRUPPEN]);
    const eintraege = await sammleKatalog();
    expect(eintraege.map((e) => e.schluessel)).toEqual(KATALOG.map((e) => e.schluessel));
  });

  it('schreibt je Eintrag eine Zeile JSON zwischen die Markierungen', () => {
    const text = abschnitt([{ schluessel: 'KN-01' }, { schluessel: 'KN-02', name: "Patient's" }]);
    expect(text.startsWith(ANFANG)).toBe(true);
    expect(text.endsWith(ENDE)).toBe(true);
    expect(text).toContain('{"schluessel":"KN-01"},\n{"schluessel":"KN-02","name":"Patient\'s"}');
    expect(text).toContain('app.import_exercise_catalog_for(');
  });

  it('ersetzt nur den Abschnitt und verlangt die Markierungen', () => {
    const seed = `vorher\n${ANFANG}\nalt\n${ENDE}\nnachher\n`;
    expect(ersetze(seed, 'neu')).toBe('vorher\nneu\nnachher\n');
    expect(() => ersetze('ohne', 'neu')).toThrow(/keinen Abschnitt/);
  });
});
