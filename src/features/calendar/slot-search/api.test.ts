import { describe, expect, it } from 'vitest';
import { orderByTravel, travelItems, travelMatrixRequest, type Slot } from './api';

function slot(rest: Partial<Slot> = {}): Slot {
  return {
    staff_member_id: 's1',
    staff_name: 'Anna Beispiel',
    slot_date: '2026-10-05',
    start_time: '09:00',
    end_time: '10:00',
    territory_status: 'none',
    prev_appointment_id: null,
    prev_lat: null,
    prev_lon: null,
    next_appointment_id: null,
    next_lat: null,
    next_lon: null,
    target_lat: 48.5,
    target_lon: 9.05,
    ...rest,
  };
}

describe('Terminsuche: Fahrzeit der Vorschläge (PRX-003, ANN-136)', () => {
  it('fragt eine Matrix mit Vorgängern und Ziel als Ursprung, Ziel und Nachfolgern als Ziel', () => {
    const slots = [
      slot({ prev_appointment_id: 'a', prev_lat: 48.1, prev_lon: 9.1 }),
      slot({
        prev_appointment_id: 'a',
        prev_lat: 48.1,
        prev_lon: 9.1,
        next_appointment_id: 'b',
        next_lat: 48.2,
        next_lon: 9.2,
      }),
    ];
    expect(travelMatrixRequest(slots)).toEqual({
      origins: [
        { lat: 48.1, lon: 9.1 },
        { lat: 48.5, lon: 9.05 },
      ],
      destinations: [
        { lat: 48.5, lon: 9.05 },
        { lat: 48.2, lon: 9.2 },
      ],
    });
    expect(travelMatrixRequest([slot({ target_lat: null })])).toBeNull();
  });

  it('liest die Fahrzeiten je Vorschlag aus der Matrix', () => {
    const slots = [
      slot({
        prev_appointment_id: 'a',
        prev_lat: 48.1,
        prev_lon: 9.1,
        next_appointment_id: 'b',
        next_lat: 48.2,
        next_lon: 9.2,
      }),
      slot({ start_time: '13:00', end_time: '14:00' }),
    ];
    const request = travelMatrixRequest(slots);
    // origins: [prev, target]; destinations: [target, next]
    const durations = [
      [600.4, null],
      [0, 420],
    ];
    expect(travelItems(slots, request, durations)).toEqual([
      {
        index: 0,
        staff_member_id: 's1',
        date: '2026-10-05',
        start: '09:00',
        end: '10:00',
        prev_appointment_id: 'a',
        travel_to_seconds: 600,
        next_appointment_id: 'b',
        travel_from_seconds: 420,
      },
      { index: 1, staff_member_id: 's1', date: '2026-10-05', start: '13:00', end: '14:00' },
    ]);
  });

  it('gibt ohne Matrix oder ohne Koordinate des Nachbarn null weiter, nie eine erfundene Zahl', () => {
    const slots = [slot({ prev_appointment_id: 'a' })];
    expect(travelItems(slots, travelMatrixRequest(slots), null)[0]).toMatchObject({
      prev_appointment_id: 'a',
      travel_to_seconds: null,
    });
  });

  it('stellt knappe Wege nach hinten und lässt sonst die Reihenfolge des Servers', () => {
    const ratings = new Map([
      [0, { item_index: 0, status: 'tight' as const, shortfall_minutes: 5 }],
      [1, { item_index: 1, status: 'unknown' as const, shortfall_minutes: 0 }],
    ]);
    expect(orderByTravel(['a', 'b', 'c'], ratings).map((x) => x.slot)).toEqual(['b', 'c', 'a']);
  });
});
