import { describe, expect, it } from 'vitest';
import {
  ausPausenKennung,
  pausenKennung,
  pausenLuecken,
  pausenProbleme,
  tagMitPausen,
  type Band,
  type Pausenlage,
} from './pause';

const h = (stunde: number, minute = 0) => stunde * 60 + minute;
const band = (von: number, bis: number): Band => ({ vonMinute: von, bisMinute: bis });
/** Der Vollzeittag aus dem Seed: 08-12 und 13-18. */
const PLAN = [band(h(8), h(12)), band(h(13), h(18))];

function lage(von: string, bis: string, plan = '12:00'): Pausenlage {
  return {
    staff_member_id: 'anna',
    on_date: '2026-12-02',
    plan_starts_at: plan,
    starts_at: von,
    ends_at: bis,
  };
}

describe('pausenLuecken', () => {
  it('nimmt Lücken von 15 bis 60 Minuten als Pause', () => {
    expect(pausenLuecken(PLAN)).toEqual([band(h(12), h(13))]);
    expect(pausenLuecken([band(h(8), h(12)), band(h(12, 15), h(16))])).toEqual([
      band(h(12), h(12, 15)),
    ]);
  });

  it('lässt kürzere Unterbrechungen und geteilte Dienste außen vor', () => {
    expect(pausenLuecken([band(h(8), h(12)), band(h(12, 10), h(16))])).toEqual([]);
    expect(pausenLuecken([band(h(8), h(12)), band(h(15), h(18))])).toEqual([]);
    expect(pausenLuecken([band(h(8), h(16))])).toEqual([]);
  });
});

describe('tagMitPausen', () => {
  it('lässt die Pause ohne Lage dort, wo der Plan sie hat', () => {
    expect(tagMitPausen(PLAN, [])).toEqual({
      arbeitszeit: PLAN,
      pausen: [{ ...band(h(12), h(13)), planVonMinute: h(12), verschoben: false }],
    });
  });

  it('legt die Pause an ihre Lage; die alte Lage wird Arbeitszeit', () => {
    expect(tagMitPausen(PLAN, [lage('10:30', '11:30')])).toEqual({
      arbeitszeit: [band(h(8), h(10, 30)), band(h(11, 30), h(18))],
      pausen: [{ ...band(h(10, 30), h(11, 30)), planVonMinute: h(12), verschoben: true }],
    });
  });

  it('übergeht eine Lage, die nicht mehr zum Plan passt - wie der Server', () => {
    // Falsche Dauer, außerhalb der Arbeitszeit, anderer Planbeginn.
    for (const falsch of [
      lage('10:00', '10:30'),
      lage('07:30', '08:30'),
      lage('17:30', '18:30'),
      lage('10:00', '11:00', '12:30'),
    ]) {
      expect(tagMitPausen(PLAN, [falsch]).pausen[0]!.verschoben).toBe(false);
    }
  });
});

describe('pausenProbleme', () => {
  const ohneLage = tagMitPausen(PLAN, []);

  it('ist still, wenn die Pause frei ist und nichts über 6 Stunden geht', () => {
    expect(pausenProbleme(ohneLage.arbeitszeit, ohneLage.pausen, [band(h(9), h(10))])).toEqual([]);
  });

  it('meldet einen Termin in der Pause und was er von ihr übrig lässt', () => {
    // 12:00-12:30 bleibt Pause, aber 9,5 Stunden Arbeit verlangen 45 Minuten.
    expect(
      pausenProbleme(ohneLage.arbeitszeit, ohneLage.pausen, [band(h(12, 30), h(13, 30))]),
    ).toEqual(['ueberlagert', 'zu_kurz']);
    // Bleiben nur 10 Minuten, ist es keine Pause mehr: zu kurz und 10 Stunden am Stück.
    expect(pausenProbleme(ohneLage.arbeitszeit, ohneLage.pausen, [band(h(12), h(12, 50))])).toEqual(
      ['ueberlagert', 'zu_kurz', 'am_stueck'],
    );
  });

  it('meldet mehr als 6 Stunden am Stück aus der Lage der Pause (§ 4 ArbZG)', () => {
    const spaet = tagMitPausen(PLAN, [lage('15:00', '16:00')]);
    expect(pausenProbleme(spaet.arbeitszeit, spaet.pausen, [])).toEqual(['am_stueck']);
    const genau = tagMitPausen(PLAN, [lage('14:00', '15:00')]);
    expect(pausenProbleme(genau.arbeitszeit, genau.pausen, [])).toEqual([]);
  });

  it('zählt Termine nach Feierabend mit', () => {
    const genau = tagMitPausen(PLAN, [lage('14:00', '15:00')]);
    expect(pausenProbleme(genau.arbeitszeit, genau.pausen, [band(h(18), h(21, 30))])).toEqual([
      'am_stueck',
    ]);
  });

  it('meldet nichts an einem Tag ohne verschiebbare Pause', () => {
    expect(pausenProbleme([band(h(8), h(12))], [], [band(h(8), h(12))])).toEqual([]);
  });
});

describe('Kennung im Raster', () => {
  it('trägt Spalte und Planbeginn hin und zurück', () => {
    const kennung = pausenKennung('2026-12-02', h(12));
    expect(ausPausenKennung(kennung)).toEqual({ spalteId: '2026-12-02', planVonMinute: h(12) });
    expect(ausPausenKennung('aaaaaaaa-aaaa-4aaa-8aaa-000000000001')).toBeNull();
  });
});
