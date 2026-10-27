import { describe, expect, it } from 'vitest';
import type { WartendeEinheit } from './ablage';
import type { EigenerPlan } from './api';
import { heutigeEinheit, uebungErledigt } from './haken';
import { eigenerPlan } from './testdaten';
import {
  lageDesPlans,
  planDerVorschau,
  umfangSatz,
  umfangText,
  wasManBraucht,
  weiterBei,
} from './vorschau';

/**
 * Die Vorschau der Einheit im Reiter „Übungen“ (Handoff 2026-10-24,
 * Abschnitt 3): Lage, was man braucht, wo es weitergeht.
 * Donnerstag, 8. Oktober 2026, ist „heute“ (ISO-Wochentag 4).
 */
const HEUTE = '2026-10-08';

const ZUGANG = 'cafecafe-cafe-4afe-8afe-000000000002';

type Position = EigenerPlan['items'][number];

/** Die Lage wie im Reiter: mit der heutigen Einheit aus Server und Gerät (ANN-730). */
function lage(plan: EigenerPlan, wartend: WartendeEinheit[] = []) {
  return lageDesPlans(plan, HEUTE, heutigeEinheit(plan, ZUGANG, wartend, HEUTE));
}

/** Eine Einheit auf dem Gerät mit Haken und auf Wunsch mit Ende. */
function aufDemGeraet(
  plan: EigenerPlan,
  id: string,
  haken: [string, number][],
  beendet = false,
): WartendeEinheit {
  return {
    id,
    zugangId: ZUGANG,
    planId: plan.id,
    tag: HEUTE,
    begonnenAm: `${HEUTE}T08:00:00.000Z`,
    ereignisse: [
      ...haken.map(([item_id, set_number], i) => ({
        id: `${id}-satz-${i}`,
        kind: 'set' as const,
        at: `${HEUTE}T08:0${i}:00.000Z`,
        item_id,
        set_number,
        done: true,
      })),
      ...(beendet
        ? [
            {
              id: `${id}-ende`,
              kind: 'finish' as const,
              at: `${HEUTE}T08:30:00.000Z`,
              note: '',
              values: {},
            },
          ]
        : []),
    ],
  };
}

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
    expect(lage(eigenerPlan({ weekdays: [4] }))).toBe('heute');
    expect(lage(eigenerPlan({ weekdays: [1, 3] }))).toBe('anderer-tag');
    expect(lage(eigenerPlan({ weekdays: [] }))).toBe('ohne-tage');
  });

  it('nimmt eine offene Einheit vor „heute geübt“', () => {
    const offen = { id: 'cccccccc-0000-4000-8000-000000000001', sets: [] };
    const geuebt = [{ performed_on: HEUTE, finished: true }];
    expect(lage(eigenerPlan({ recent_sessions: geuebt }))).toBe('geuebt');
    expect(lage(eigenerPlan({ recent_sessions: geuebt, open_session: offen }))).toBe('begonnen');
    // Eine Einheit von gestern zählt nicht als heute geübt, eine nicht beendete auch nicht.
    expect(
      lage(
        eigenerPlan({
          weekdays: [4],
          recent_sessions: [
            { performed_on: '2026-10-07', finished: true },
            { performed_on: HEUTE, finished: false },
          ],
        }),
      ),
    ).toBe('heute');
  });

  it('kennt die Einheit auf dem Gerät wie die Durchführung (BEF-218)', () => {
    const offen = { id: 'cccccccc-0000-4000-8000-000000000001', sets: [] };
    const plan = eigenerPlan({ weekdays: [4], open_session: offen });
    const erste = plan.items[0]!.id;
    // Ohne Netz beendet: Der Server kennt die Einheit noch offen, das Gerät
    // hat ihr Ende - „Heute geübt“, nicht „Heute begonnen“.
    expect(lage(plan, [aufDemGeraet(plan, offen.id, [[erste, 1]], true)])).toBe('geuebt');
    // Haken nur auf dem Gerät: „Heute begonnen“, nicht „Übungen beginnen“.
    const ohneServer = eigenerPlan({ weekdays: [4] });
    expect(
      lage(ohneServer, [
        aufDemGeraet(ohneServer, 'dddddddd-0000-4000-8000-000000000001', [[erste, 1]]),
      ]),
    ).toBe('begonnen');
    // Nach einer beendeten Einheit eine zweite begonnen: Die offene geht vor.
    expect(
      lage(ohneServer, [
        aufDemGeraet(ohneServer, 'dddddddd-0000-4000-8000-000000000001', [[erste, 1]], true),
        aufDemGeraet(ohneServer, 'dddddddd-0000-4000-8000-000000000002', [[erste, 1]]),
      ]),
    ).toBe('begonnen');
    // Eine Einheit von gestern auf dem Gerät zählt heute nicht.
    expect(
      lage(ohneServer, [
        {
          ...aufDemGeraet(ohneServer, 'dddddddd-0000-4000-8000-000000000003', [[erste, 1]], true),
          tag: '2026-10-07',
        },
      ]),
    ).toBe('heute');
  });

  it('kennt einen Plan, der erst beginnt, und die Lesefrist', () => {
    expect(lage(eigenerPlan({ runs_from: '2026-10-12', weekdays: [4] }))).toBe('ab');
    expect(lage(eigenerPlan({ status: 'ended', ended_on: '2026-10-01' }))).toBe('lesefrist');
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
      '3\u00a0Übungen · etwa 10\u00a0Minuten',
    );
    expect(umfangText([position(1)])).toBe('Eine Übung · etwa 5\u00a0Minuten');
  });

  it('nennt ohne Schätzung nur die Zahl der Übungen', () => {
    expect(umfangText([position(1), position(2, { reps_min: null, reps_max: null })])).toBe(
      '2\u00a0Übungen',
    );
    expect(umfangSatz(4, null)).toBe('4\u00a0Übungen');
    expect(umfangSatz(4, 15)).toBe('4\u00a0Übungen · etwa 15\u00a0Minuten');
  });
});

describe('weiterBei und uebungErledigt (Server und Gerät, ANN-730)', () => {
  const items = [position(2, { sets: 2 }), position(1, { sets: 2 }), position(3, { sets: 1 })];
  const plan = eigenerPlan({
    items,
    open_session: {
      id: 'cccccccc-0000-4000-8000-000000000001',
      sets: [
        { item_id: 'bbbbbbbb-0000-4000-8000-000000000001', set_number: 1 },
        { item_id: 'bbbbbbbb-0000-4000-8000-000000000001', set_number: 2 },
        { item_id: 'bbbbbbbb-0000-4000-8000-000000000002', set_number: 1 },
      ],
    },
  });
  const einheit = (wartend: WartendeEinheit[] = []) => heutigeEinheit(plan, ZUGANG, wartend, HEUTE);

  it('setzt „Weiter üben“ auf die erste Übung mit offenem Durchgang', () => {
    expect(weiterBei(items, einheit())?.position).toBe(2);
    expect(
      weiterBei(items, heutigeEinheit({ ...plan, open_session: null }, ZUGANG, [], HEUTE)),
    ).toBeNull();
  });

  it('nennt eine Übung erledigt, wenn alle ihre Durchgänge gehakt sind', () => {
    expect(uebungErledigt(items[1]!, einheit().haken)).toBe(true);
    expect(uebungErledigt(items[0]!, einheit().haken)).toBe(false);
    expect(uebungErledigt(items[1]!, new Set())).toBe(false);
  });

  it('nimmt die Haken des Geräts dazu (BEF-218)', () => {
    // Der zweite Durchgang von Übung 2 liegt nur auf dem Gerät.
    const geraet = aufDemGeraet(plan, 'cccccccc-0000-4000-8000-000000000001', [
      ['bbbbbbbb-0000-4000-8000-000000000002', 2],
    ]);
    expect(uebungErledigt(items[0]!, einheit([geraet]).haken)).toBe(true);
    expect(weiterBei(items, einheit([geraet]))?.position).toBe(3);
  });

  it('kennt keine offene Übung, wenn alles gehakt ist', () => {
    const fertig = eigenerPlan({
      items: [position(1, { sets: 1 })],
      open_session: {
        id: 'cccccccc-0000-4000-8000-000000000001',
        sets: [{ item_id: 'bbbbbbbb-0000-4000-8000-000000000001', set_number: 1 }],
      },
    });
    expect(weiterBei(fertig.items, heutigeEinheit(fertig, ZUGANG, [], HEUTE))).toBeNull();
  });
});
