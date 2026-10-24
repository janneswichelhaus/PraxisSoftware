import { describe, expect, it } from 'vitest';
import type { EigenerPlan } from './api';
import { eigenerPlan } from './testdaten';
import {
  ersteOffeneUebung,
  heuteErledigt,
  lageDesPlans,
  naechsterUebungstag,
  planDerVorschau,
  umfangSatz,
  umfangText,
  wasManBraucht,
} from './vorschau';

/**
 * Die Vorschau der Einheit im Reiter „Übungen“ (Handoff 2026-10-24,
 * Abschnitt 3): Lage, nächster Übungstag, was man braucht, wo es weitergeht.
 * Donnerstag, 8. Oktober 2026, ist „heute“ (ISO-Wochentag 4).
 */
const HEUTE = '2026-10-08';

type Position = EigenerPlan['items'][number];

function position(nummer: number, teil: Partial<Position> = {}): Position {
  return {
    ...eigenerPlan().items[0]!,
    id: `bbbbbbbb-0000-4000-8000-00000000000${nummer}`,
    position: nummer,
    variant_lay_name: `Übung ${nummer}`,
    ...teil,
  };
}

describe('lageDesPlans', () => {
  it('kennt heute Übungstag, anderer Tag und keine Tage', () => {
    expect(lageDesPlans(eigenerPlan({ weekdays: [4] }), HEUTE)).toBe('heute');
    expect(lageDesPlans(eigenerPlan({ weekdays: [1, 3] }), HEUTE)).toBe('anderer-tag');
    expect(lageDesPlans(eigenerPlan({ weekdays: [] }), HEUTE)).toBe('ohne-tage');
  });

  it('nimmt eine offene Einheit vor „heute geübt“', () => {
    const offen = { id: 'cccccccc-0000-4000-8000-000000000001', sets: [] };
    const geuebt = [{ performed_on: HEUTE, finished: true }];
    expect(lageDesPlans(eigenerPlan({ recent_sessions: geuebt }), HEUTE)).toBe('geuebt');
    expect(lageDesPlans(eigenerPlan({ recent_sessions: geuebt, open_session: offen }), HEUTE)).toBe(
      'begonnen',
    );
    // Eine Einheit von gestern zählt nicht als heute geübt, eine nicht beendete auch nicht.
    expect(
      lageDesPlans(
        eigenerPlan({
          weekdays: [4],
          recent_sessions: [
            { performed_on: '2026-10-07', finished: true },
            { performed_on: HEUTE, finished: false },
          ],
        }),
        HEUTE,
      ),
    ).toBe('heute');
  });

  it('kennt einen Plan, der erst beginnt, und die Lesefrist', () => {
    expect(lageDesPlans(eigenerPlan({ runs_from: '2026-10-12', weekdays: [4] }), HEUTE)).toBe('ab');
    expect(lageDesPlans(eigenerPlan({ status: 'ended', ended_on: '2026-10-01' }), HEUTE)).toBe(
      'lesefrist',
    );
  });
});

describe('planDerVorschau', () => {
  it('nimmt den ersten Plan mit heutigem Übungstag, sonst den ersten', () => {
    const a = eigenerPlan({ id: 'aaaaaaaa-0000-4000-8000-00000000000a', weekdays: [1] });
    const b = eigenerPlan({ id: 'aaaaaaaa-0000-4000-8000-00000000000b', weekdays: [4] });
    const c = eigenerPlan({ id: 'aaaaaaaa-0000-4000-8000-00000000000c', weekdays: [4] });
    expect(planDerVorschau([a, b, c], HEUTE)).toBe(b);
    expect(planDerVorschau([a], HEUTE)).toBe(a);
  });
});

describe('naechsterUebungstag', () => {
  it('sucht den nächsten gewählten Tag nach heute, auch in der nächsten Woche', () => {
    // Donnerstag: Montag der nächsten Woche, nicht heute.
    expect(naechsterUebungstag(eigenerPlan({ weekdays: [1, 4] }), HEUTE)).toBe('2026-10-12');
    expect(naechsterUebungstag(eigenerPlan({ weekdays: [6] }), HEUTE)).toBe('2026-10-10');
    expect(naechsterUebungstag(eigenerPlan({ weekdays: [4] }), HEUTE)).toBe('2026-10-15');
  });

  it('nennt keinen Tag ohne Wahl, nach dem Ende oder in der Lesefrist', () => {
    expect(naechsterUebungstag(eigenerPlan({ weekdays: [] }), HEUTE)).toBeNull();
    expect(
      naechsterUebungstag(eigenerPlan({ weekdays: [1], runs_until: '2026-10-10' }), HEUTE),
    ).toBeNull();
    expect(naechsterUebungstag(eigenerPlan({ weekdays: [1], status: 'ended' }), HEUTE)).toBeNull();
  });

  it('beginnt bei einem künftigen Plan mit dessen erstem Tag', () => {
    expect(
      naechsterUebungstag(eigenerPlan({ weekdays: [3], runs_from: '2026-10-20' }), HEUTE),
    ).toBe('2026-10-21');
  });
});

describe('wasManBraucht', () => {
  it('sammelt Hilfsmittel und Lasten in Planreihenfolge, ohne Doppelte', () => {
    expect(
      wasManBraucht([
        position(2, { equipment: ['Theraband gelb'], load: 'Theraband gelb' }),
        position(1, { equipment: ['Geländer', 'Stuhl'], load: null }),
        position(3, { equipment: ['stuhl'], load: 'Rucksack 3 kg' }),
      ]),
    ).toEqual(['Geländer', 'Stuhl', 'Theraband gelb', 'Rucksack 3 kg']);
    expect(wasManBraucht([position(1, { equipment: [], load: null })])).toEqual([]);
  });
});

describe('umfangText', () => {
  it('nennt Übungen und die geschätzte Dauer (ANN-704)', () => {
    // 3 × 12 × 4 s + 2 × 30 s + 30 s = 234 s je Übung; drei Übungen 11,7 Minuten.
    expect(umfangText([position(1), position(2), position(3)])).toBe(
      '3\u00a0Übungen · etwa 10 Minuten',
    );
    expect(umfangText([position(1)])).toBe('Eine Übung · etwa 5 Minuten');
  });

  it('nennt ohne Schätzung nur die Zahl der Übungen', () => {
    expect(umfangText([position(1), position(2, { reps_min: null, reps_max: null })])).toBe(
      '2\u00a0Übungen',
    );
    expect(umfangSatz(4, null)).toBe('4\u00a0Übungen');
    expect(umfangSatz(4, 15)).toBe('4\u00a0Übungen · etwa 15 Minuten');
  });
});

describe('ersteOffeneUebung und heuteErledigt', () => {
  const plan = {
    items: [position(2, { sets: 2 }), position(1, { sets: 2 }), position(3, { sets: 1 })],
    open_session: {
      id: 'cccccccc-0000-4000-8000-000000000001',
      sets: [
        { item_id: 'bbbbbbbb-0000-4000-8000-000000000001', set_number: 1 },
        { item_id: 'bbbbbbbb-0000-4000-8000-000000000001', set_number: 2 },
        { item_id: 'bbbbbbbb-0000-4000-8000-000000000002', set_number: 1 },
      ],
    },
  };

  it('setzt „Weiter üben“ auf die erste Übung mit offenem Durchgang', () => {
    expect(ersteOffeneUebung(plan)?.position).toBe(2);
    expect(ersteOffeneUebung({ ...plan, open_session: null })).toBeNull();
  });

  it('nennt eine Übung erledigt, wenn alle ihre Durchgänge gehakt sind', () => {
    expect(heuteErledigt(plan.items[1]!, plan.open_session)).toBe(true);
    expect(heuteErledigt(plan.items[0]!, plan.open_session)).toBe(false);
    expect(heuteErledigt(plan.items[1]!, null)).toBe(false);
  });

  it('kennt keine offene Übung, wenn alles gehakt ist', () => {
    const fertig = {
      items: [position(1, { sets: 1 })],
      open_session: {
        id: 'cccccccc-0000-4000-8000-000000000001',
        sets: [{ item_id: 'bbbbbbbb-0000-4000-8000-000000000001', set_number: 1 }],
      },
    };
    expect(ersteOffeneUebung(fertig)).toBeNull();
  });
});
