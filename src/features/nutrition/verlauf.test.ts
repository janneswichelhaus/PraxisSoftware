import { describe, expect, it } from 'vitest';
import {
  energieText,
  gewichtsskala,
  planmarkierungen,
  tageText,
  wochenzeile,
  zeitraumText,
  type Ernaehrungsverlauf,
  type Spanne,
} from './verlauf';

const ZIELE = {
  energy_kcal: 1900,
  protein_g: 80,
  fat_g: 65,
  carbohydrate_g: 230,
  water_ml: 2400,
};

function spanne(zusatz: Partial<Spanne> = {}): Spanne {
  return {
    from: '2026-11-02',
    to: '2026-11-08',
    days: 7,
    food_days: 5,
    water_days: 4,
    energy_kcal: 1650,
    protein_g: 72.5,
    fat_g: 60,
    carbohydrate_g: 210,
    water_ml: 1500,
    ...zusatz,
  };
}

function verlauf(zusatz: Partial<Ernaehrungsverlauf> = {}): Ernaehrungsverlauf {
  return {
    today: '2026-11-07',
    started_on: '2026-10-17',
    ended_on: null,
    last_session_on: null,
    next_session_on: null,
    target_weight_kg: 68,
    targets: ZIELE,
    period: spanne(),
    weeks: [],
    weights: [
      { measured_on: '2026-10-17', weight_kg: 74.6 },
      { measured_on: '2026-10-31', weight_kg: 73.5 },
    ],
    sessions: [],
    plan_events: [],
    ...zusatz,
  };
}

describe('Verlauf der Beratung (ANN-846)', () => {
  it('Mittel neben dem Zielwert, ohne Eintrag kein Mittel', () => {
    expect(energieText(spanne(), ZIELE)).toBe('1650 von 1900 kcal');
    expect(energieText(spanne(), null)).toBe('1650 kcal');
    expect(energieText(spanne({ energy_kcal: null, food_days: 0 }), ZIELE)).toBeNull();
  });

  it('die Woche: Tage, Nährstoffe neben den Zielen, Wasser', () => {
    expect(wochenzeile(spanne(), ZIELE)).toBe(
      'an 5 von 7 Tagen · Eiweiß 72,5 von 80 g · Kohlenhydrate 210 von 230 g · Fett 60 von 65 g · Wasser 1,5 l',
    );
    expect(
      wochenzeile(
        spanne({
          food_days: 0,
          energy_kcal: null,
          protein_g: null,
          fat_g: null,
          carbohydrate_g: null,
        }),
        ZIELE,
      ),
    ).toBe('Nichts eingetragen · Wasser 1,5 l');
    expect(tageText({ food_days: 1, days: 1 })).toBe('an 1 von 1 Tag');
  });

  it('kein Wort der Wertung in den Texten (ADR-027 Punkt 11)', () => {
    const texte = [wochenzeile(spanne(), ZIELE), zeitraumText(verlauf())].join(' ');
    expect(texte).not.toMatch(/gut|schlecht|zu viel|zu wenig|gesund|Trend|Fortschritt/i);
  });

  it('Zeitraum seit der letzten Beratung, sonst seit Beginn', () => {
    expect(zeitraumText(verlauf())).toBe('Seit Beginn am 17.10.2026');
    expect(zeitraumText(verlauf({ last_session_on: '2026-10-31' }))).toBe(
      'Seit der Beratung am 31.10.2026',
    );
  });

  it('Skala fasst Gewicht und Zielgewicht, Planwechsel als Markierungen', () => {
    expect(gewichtsskala(verlauf())).toEqual({ min: 67, max: 76 });
    expect(gewichtsskala(verlauf({ weights: [] }))).toBeNull();
    expect(
      planmarkierungen(
        verlauf({
          plan_events: [
            { occurred_on: '2026-11-06', kind: 'plan_assigned', title: 'Zwei Tage' },
            { occurred_on: '2026-11-07', kind: 'plan_ended', title: 'Zwei Tage' },
          ],
        }),
      ),
    ).toEqual([
      { datum: '2026-11-06', text: 'Plan begonnen · Zwei Tage' },
      { datum: '2026-11-07', text: 'Plan beendet · Zwei Tage' },
    ]);
  });
});
