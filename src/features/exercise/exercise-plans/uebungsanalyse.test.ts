import { describe, expect, it } from 'vitest';
import { ausfuehrung, uebungsanalyse } from './uebungsanalyse';

type Sitzung = Parameters<typeof uebungsanalyse>[0]['sessions'][number];

function einheit(tag: string, saetze: Record<string, number>, beendet = true): Sitzung {
  return {
    id: tag,
    performed_on: tag,
    started_at: `${tag}T08:00:00Z`,
    finished_at: beendet ? `${tag}T08:30:00Z` : null,
    sets_done: Object.values(saetze).reduce((a, b) => a + b, 0),
    sets_total: 6,
    sets_by_item: saetze,
    difficulty_note: null,
    values: {},
    recorded_by_kind: 'self',
    finished_by_kind: 'self',
  };
}

describe('Übungsanalyse (OUT-003, ANN-366)', () => {
  it('ordnet eine Einheit nach abgehakten Sätzen: alle, ein Teil, keiner', () => {
    expect(ausfuehrung(3, 3)).toBe('ganz');
    expect(ausfuehrung(4, 3)).toBe('ganz');
    expect(ausfuehrung(1, 3)).toBe('teilweise');
    expect(ausfuehrung(0, 3)).toBe('ausgelassen');
  });

  it('zählt je Übung über die beendeten Einheiten, jüngste zuerst', () => {
    const items = [
      { id: 'kniebeuge', sets: 3 },
      { id: 'rudern', sets: 3 },
    ] as never;
    const zeilen = uebungsanalyse({
      items,
      sessions: [
        einheit('2026-10-12', { kniebeuge: 3 }),
        einheit('2026-10-11', { kniebeuge: 1, rudern: 1 }, false),
        einheit('2026-10-10', { kniebeuge: 3, rudern: 2 }),
        einheit('2026-10-08', { kniebeuge: 2 }),
      ],
    });
    expect(zeilen).toEqual([
      {
        itemId: 'kniebeuge',
        ganz: 2,
        teilweise: 1,
        ausgelassen: 0,
        zuletzt: [
          { tag: '2026-10-12', ausfuehrung: 'ganz' },
          { tag: '2026-10-10', ausfuehrung: 'ganz' },
          { tag: '2026-10-08', ausfuehrung: 'teilweise' },
        ],
      },
      {
        itemId: 'rudern',
        ganz: 0,
        teilweise: 1,
        ausgelassen: 2,
        zuletzt: [
          { tag: '2026-10-12', ausfuehrung: 'ausgelassen' },
          { tag: '2026-10-10', ausfuehrung: 'teilweise' },
          { tag: '2026-10-08', ausfuehrung: 'ausgelassen' },
        ],
      },
    ]);
  });

  it('ohne beendete Einheit nur Nullen', () => {
    const zeilen = uebungsanalyse({
      items: [{ id: 'a', sets: 2 }] as never,
      sessions: [einheit('2026-10-12', { a: 1 }, false)],
    });
    expect(zeilen[0]).toMatchObject({ ganz: 0, teilweise: 0, ausgelassen: 0, zuletzt: [] });
  });
});
