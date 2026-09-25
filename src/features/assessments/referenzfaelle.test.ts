import { describe, expect, it } from 'vitest';
import { bibliothek } from './bibliothek';
import { rechne } from './rechnen';

/**
 * Jede Definition der Bibliothek rechnet ihre eigenen Referenzfälle nach.
 *
 * Das Schema verlangt den Referenzfall, dieser Test prüft ihn: „Grün heißt
 * erst grün, wenn der stimmt" (Arbeitsauftrag §3). Eine neue Datei unter
 * `definitionen/scores/` wird hier von allein geprüft — ohne eine Zeile Code.
 */

describe('Referenzfaelle der Bibliothek', () => {
  const faelle = bibliothek.scores.flatMap((score) =>
    score.referenzfaelle.map((fall) => ({ score, fall })),
  );

  it('hat Referenzfaelle, die nachgerechnet werden', () => {
    // Ohne diese Zeile liefe die Tabelle unten ueber nichts und waere gruen.
    expect(faelle.length).toBeGreaterThan(0);
  });

  it.each(faelle.map(({ score, fall }) => [score.meta.id, fall.bezeichnung, score, fall] as const))(
    '%s: %s',
    (_id, _bezeichnung, score, fall) => {
      const ergebnis = rechne(score, fall.antworten);
      if (fall.erwartet.gesamt !== undefined) {
        if (fall.erwartet.gesamt === null) expect(ergebnis.gesamt).toBeNull();
        else expect(ergebnis.gesamt).toBeCloseTo(fall.erwartet.gesamt, 6);
      }
      for (const [subskala, erwartet] of Object.entries(fall.erwartet.subskalen ?? {})) {
        expect(ergebnis.subskalen[subskala]).toBeCloseTo(erwartet, 6);
      }
    },
  );
});
