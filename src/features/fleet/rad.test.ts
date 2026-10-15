import { describe, expect, it } from 'vitest';
import {
  ausserhalbDesStammdepots,
  belegung,
  ersatzradName,
  istMeinRad,
  radMitStandort,
  radzustand,
  standort,
} from './rad';
import { ANNA, TIM, testFlotte, testRad } from './testdaten';

describe('Zustand eines Rads (ANN-557)', () => {
  it('leitet ihn aus Sperre und Schlüssel ab, die Sperre geht vor', () => {
    expect(radzustand(testRad())).toBe('verfuegbar');
    const schluessel = { holder_staff_id: ANNA.id, holder_name: ANNA.name, taken_at: '' };
    expect(radzustand(testRad({ key: schluessel }))).toBe('einsatz');
    const sperre = { id: 's', blocked_at: '', reason: 'Inspektion', breakdown_id: null };
    expect(radzustand(testRad({ key: schluessel, block: sperre }))).toBe('reparatur');
  });
});

describe('Belegung in der Woche', () => {
  const rad = testRad({ planned_weekdays: [1, 2, 4, 5] });

  it('ist an den Tagen der Stammnutzer:in belegt, sonst frei', () => {
    expect(belegung(rad, 1, '2026-10-12', [])).toEqual({ belegt: true, wegenAbwesenheit: false });
    expect(belegung(rad, 3, '2026-10-14', [])).toEqual({ belegt: false, wegenAbwesenheit: false });
  });

  it('ist frei, wenn die Stammnutzer:in an dem Tag ganztägig abwesend ist', () => {
    const abwesend = [{ staff_member_id: ANNA.id, on_date: '2026-10-15' }];
    expect(belegung(rad, 4, '2026-10-15', abwesend)).toEqual({
      belegt: false,
      wegenAbwesenheit: true,
    });
    // Eine andere Person oder ein anderer Tag ändert nichts.
    expect(
      belegung(rad, 4, '2026-10-15', [{ staff_member_id: TIM.id, on_date: '2026-10-15' }]).belegt,
    ).toBe(true);
    expect(belegung(rad, 5, '2026-10-16', abwesend).belegt).toBe(true);
  });

  it('kennt beim Ersatzrad keinen Wochenplan', () => {
    const ersatz = testRad({ is_spare: true, regular_rider: null, planned_weekdays: [1] });
    expect(belegung(ersatz, 1, '2026-10-12', []).belegt).toBe(false);
  });
});

describe('Standort, eigenes Rad und Ersatzrad', () => {
  const flotte = testFlotte();

  it('nennt das Depot oder den benannten Ort', () => {
    expect(standort(testRad(), flotte.depots)).toBe('Raddepot Nord');
    expect(
      standort(
        testRad({ current_depot_id: null, special_location: 'Vertragswerkstatt' }),
        flotte.depots,
      ),
    ).toBe('Vertragswerkstatt');
  });

  it('erkennt ein Rad außerhalb seines Stammdepots, auch an einem anderen Ort', () => {
    expect(ausserhalbDesStammdepots(testRad())).toBe(false);
    expect(ausserhalbDesStammdepots(testRad({ home_depot_id: 'depot-sued' }))).toBe(true);
    expect(
      ausserhalbDesStammdepots(testRad({ current_depot_id: null, special_location: 'Werkstatt' })),
    ).toBe(true);
  });

  it('nennt ein gesperrtes Rad in der Auswahl als Ausnahme', () => {
    expect(radMitStandort(flotte.bikes[0]!, flotte)).toBe('Lastenrad 1 · Raddepot Nord');
    expect(radMitStandort(flotte.bikes[1]!, flotte)).toBe(
      'Lastenrad 3 · Raddepot Nord · In Reparatur',
    );
  });

  it('ist mein Rad als Stammrad oder mit meinem Schlüssel', () => {
    expect(istMeinRad(testRad(), ANNA.id)).toBe(true);
    expect(istMeinRad(testRad(), TIM.id)).toBe(false);
    const beiTim = { holder_staff_id: TIM.id, holder_name: TIM.name, taken_at: '' };
    expect(istMeinRad(testRad({ key: beiTim }), TIM.id)).toBe(true);
    expect(istMeinRad(testRad(), null)).toBe(false);
  });

  it('nennt das Ersatzrad der Flotte, sonst „das Ersatzrad“', () => {
    expect(ersatzradName(flotte)).toBe('Lastenrad 5 (Ersatz)');
    expect(ersatzradName({ bikes: [] })).toBe('das Ersatzrad');
  });
});
