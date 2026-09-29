import { describe, expect, it } from 'vitest';
import {
  REIHEN,
  REIHE_REST,
  euroKurz,
  letzteMonate,
  personenReihen,
  rasterschritte,
  umsatzReihen,
} from './diagramme';
import { beispielMonate } from './testdaten';

describe('Grafikdaten (STA-007)', () => {
  it('waehlt gut lesbare Rasterschritte, die das Maximum einschliessen', () => {
    expect(rasterschritte(1_234_500)).toEqual([0, 500_000, 1_000_000, 1_500_000]);
    expect(rasterschritte(90)).toEqual([0, 25, 50, 75, 100]);
    expect(rasterschritte(0)).toEqual([0]);
  });

  it('zaehlt die letzten Monate ueber den Jahreswechsel', () => {
    expect(letzteMonate('2026-02-10', 3)).toEqual(['2025-12-01', '2026-01-01', '2026-02-01']);
  });

  it('haelt Umsatz und Zahlungseingang als zwei Reihen, nie verrechnet (ANN-151)', () => {
    const { kategorien, reihen } = umsatzReihen(beispielMonate());
    expect(kategorien).toHaveLength(12);
    expect(reihen.map((r) => [r.name, r.art ?? 'saeule'])).toEqual([
      ['Umsatz (Rechnungsstellung)', 'saeule'],
      ['Zahlungseingang', 'punkt'],
    ]);
  });

  it('gibt jeder Person ihre Farbe nach Name, nicht nach Rang', () => {
    const monate = ['2026-08-01', '2026-09-01'];
    const zeilen = [
      { month: '2026-09-01', staff_member_id: 'b', staff_name: 'Tim', revenue_cents: 900 },
      { month: '2026-09-01', staff_member_id: 'a', staff_name: 'Anna', revenue_cents: 100 },
      { month: '2026-08-01', staff_member_id: 'a', staff_name: 'Anna', revenue_cents: 50 },
    ];
    const { reihen } = personenReihen(zeilen, monate);
    expect(reihen.map((r) => [r.name, r.farbe, r.werte])).toEqual([
      ['Anna', REIHEN[0], [50, 100]],
      ['Tim', REIHEN[1], [0, 900]],
    ]);
  });

  it('nennt den Rest "Ohne Zuordnung", wenn keine Person darin steht', () => {
    const { reihen } = personenReihen(
      [
        { month: '2026-09-01', staff_member_id: 'a', staff_name: 'Anna', revenue_cents: 100 },
        { month: '2026-09-01', staff_member_id: null, staff_name: null, revenue_cents: 30 },
      ],
      ['2026-09-01'],
    );
    expect(reihen.at(-1)).toMatchObject({ name: 'Ohne Zuordnung', werte: [30] });
  });

  it('fasst ohne Zuordnung und ab der siebten Person unter "Weitere" zusammen', () => {
    const zeilen = [
      ...Array.from({ length: 7 }, (_, i) => ({
        month: '2026-09-01',
        staff_member_id: `p${i}`,
        staff_name: `Person ${i}`,
        revenue_cents: 100,
      })),
      { month: '2026-09-01', staff_member_id: null, staff_name: null, revenue_cents: 40 },
    ];
    const { reihen } = personenReihen(zeilen, ['2026-09-01']);
    expect(reihen).toHaveLength(7);
    expect(reihen.at(-1)).toMatchObject({ name: 'Weitere', farbe: REIHE_REST, werte: [140] });
  });

  it('schreibt Achsenbetraege ohne Cent', () => {
    expect(euroKurz(1_500_000)).toMatch(/^15\.000\s€$/);
  });
});
