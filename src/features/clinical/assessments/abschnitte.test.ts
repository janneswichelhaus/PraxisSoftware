import { describe, expect, it } from 'vitest';
import { abschnitte } from './abschnitte';
import { instrumentFuer } from './instrumente';

/**
 * Abschnitte der Erhebungsseite (Design-Rollout B4): nur Darstellung - jede
 * Frage steht genau einmal da, in der Reihenfolge der Definition.
 */
const anamnese = instrumentFuer('anamnese_v8')!;

describe('abschnitte', () => {
  const teile = abschnitte(anamnese.items);

  it('verliert keine Frage und hält die Reihenfolge', () => {
    expect(teile.flatMap((teil) => teil.items.map((item) => item.id))).toEqual(
      anamnese.items.map((item) => item.id),
    );
  });

  it('teilt den Anamnesebogen in sechs Abschnitte mit Titeln aus den Nummern', () => {
    expect(teile.map((teil) => teil.titel)).toEqual([
      'Beruf, Sport/Hobby · Fragen 1–6',
      'Fragen 7–12',
      'Fragen 13–20',
      'Fragen 21–26',
      'Fragen 27–34',
      'Fragen 35–39 · Anmerkungen Therapeut',
    ]);
  });

  it('hält Fragen mit derselben Nummer und einen gemeinsamen Hinweis zusammen', () => {
    for (const teil of teile) {
      const nummern = new Set(teil.items.map((item) => item.nummer));
      const andere = teile.filter((t) => t !== teil).flatMap((t) => t.items);
      for (const nummer of nummern) {
        if (nummer === undefined) continue;
        expect(andere.some((item) => item.nummer === nummer)).toBe(false);
      }
    }
    const mitHinweis = teile.filter((teil) => teil.items.some((item) => item.hinweis));
    expect(mitHinweis).toHaveLength(1);
    expect(mitHinweis[0]!.items.every((item) => item.hinweis)).toBe(true);
  });

  it('lässt einen kurzen Bogen ein Abschnitt', () => {
    const nrs = instrumentFuer('nrs_schmerz')!;
    expect(abschnitte(nrs.items)).toEqual([{ titel: 'Frage 1', items: nrs.items }]);
  });
});
