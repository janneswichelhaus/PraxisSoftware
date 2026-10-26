import type { Bike, BikeDetail, Fleet, FleetReport, Spot } from './api';
import { CHECK_ITEMS } from './bike3d/zones';

/**
 * Synthetische Radflotte für die Komponententests (FLT-EPIC-001) - dieselben
 * Räder wie der Seed, gekürzt. Keine echten Daten (CLAUDE.md).
 */

export const ANNA = { id: 'staff-anna', name: 'Anna Beispiel' };
export const TIM = { id: 'staff-tim', name: 'Tim Teamleitung' };
export const NINA = { id: 'staff-nina', name: 'Nina Neu' };

export function testRad(overrides: Partial<Bike> = {}): Bike {
  return {
    id: 'rad-1',
    name: 'Lastenrad 1',
    bike_type: 'load60_riemen',
    home_depot_id: 'depot-nord',
    current_depot_id: 'depot-nord',
    special_location: null,
    is_spare: false,
    regular_rider: ANNA,
    planned_weekdays: [1, 2, 4, 5],
    battery: 'Akku 625 Wh',
    note: null,
    updated_at: '2026-10-14T08:00:00+00:00',
    key: null,
    block: null,
    open_spots: 0,
    open_problems: 0,
    last_checkup_at: null,
    ...overrides,
  };
}

export function testFlotte(overrides: Partial<Fleet> = {}): Fleet {
  return {
    can_manage: false,
    can_release: false,
    can_read_reports: false,
    checkup_interval_days: 14,
    my_staff_member_id: ANNA.id,
    depots: [
      { id: 'depot-nord', name: 'Raddepot Nord', note: null },
      { id: 'depot-sued', name: 'Raddepot Süd', note: null },
    ],
    bikes: [
      testRad(),
      testRad({
        id: 'rad-3',
        name: 'Lastenrad 3',
        regular_rider: TIM,
        planned_weekdays: [1, 3, 5],
        block: {
          id: 'sperre-3',
          blocked_at: '2026-10-14T14:20:00+00:00',
          reason: null,
          breakdown_id: 'panne-3',
        },
        open_spots: 3,
        open_problems: 2,
      }),
      testRad({
        id: 'rad-4',
        name: 'Lastenrad 4',
        home_depot_id: 'depot-sued',
        regular_rider: NINA,
        planned_weekdays: [3, 4],
      }),
      testRad({
        id: 'rad-5',
        name: 'Lastenrad 5 (Ersatz)',
        home_depot_id: 'depot-sued',
        current_depot_id: 'depot-sued',
        is_spare: true,
        regular_rider: null,
        planned_weekdays: [],
      }),
    ],
    staff: [ANNA, NINA, TIM],
    unavailable: [],
    ...overrides,
  };
}

export function testStelle(overrides: Partial<Spot> = {}): Spot {
  return {
    id: 'stelle-1',
    number: 1,
    zone: 'bremse-vorne',
    severity: 'problem',
    note: 'Scheibe schleift beim Drehen',
    source: 'checkup',
    source_id: 'checkup-3',
    created_at: '2026-10-13T05:50:00+00:00',
    resolved_at: null,
    ...overrides,
  };
}

export function testDetail(overrides: Partial<BikeDetail> = {}): BikeDetail {
  const flotte = testFlotte();
  return {
    bike: flotte.bikes[1]!,
    spots: [
      testStelle(),
      testStelle({
        id: 'stelle-2',
        number: 2,
        zone: 'reifen-hinten',
        severity: 'beobachten',
        note: 'Profil hinten fast abgefahren',
      }),
      testStelle({
        id: 'stelle-3',
        number: 3,
        zone: 'riemen',
        note: 'Riemen springt über',
        source: 'breakdown',
        source_id: 'panne-3',
        created_at: '2026-10-14T14:20:00+00:00',
      }),
    ],
    checkups: [
      {
        id: 'checkup-3',
        checked_at: '2026-10-13T05:50:00+00:00',
        checked_by_name: 'Tim Teamleitung',
        items: [
          { key: 'bremsen', rating: 'problem', note: null },
          { key: 'reifen', rating: 'beobachten', note: null },
        ],
        note: null,
      },
    ],
    breakdowns: [
      {
        id: 'panne-3',
        reported_at: '2026-10-14T14:20:00+00:00',
        reported_by_name: 'Tim Teamleitung',
        outcome: 'depotAbgestellt',
        blocks: true,
        summary: 'Ins Raddepot gebracht.',
        remark: null,
        location_note: null,
        transport: null,
      },
    ],
    blocks: [
      {
        id: 'sperre-3',
        breakdown_id: 'panne-3',
        reason: null,
        blocked_at: '2026-10-14T14:20:00+00:00',
        blocked_by_name: 'Tim Teamleitung',
        released_at: null,
        released_by_name: null,
      },
    ],
    keys: [],
    ...overrides,
  };
}

/** Ein Check-Up in der Liste für den Arbeitgeber (FLT-008): Werbeflächen und vier Seitenfotos. */
export function testMeldungCheckup(
  overrides: Partial<Extract<FleetReport, { kind: 'checkup' }>> = {},
): Extract<FleetReport, { kind: 'checkup' }> {
  return {
    kind: 'checkup',
    id: 'checkup-neu',
    bike_id: 'rad-1',
    bike_name: 'Lastenrad 1',
    bike_type: 'load60_riemen',
    at: '2026-10-15T06:10:00+00:00',
    by_name: 'Anna Beispiel',
    items: CHECK_ITEMS.map((item) => ({
      key: item.key,
      rating: item.key === 'bremsen' ? ('problem' as const) : ('ok' as const),
      note: item.key === 'bremsen' ? 'Belag schleift' : null,
    })),
    note: null,
    ad_surfaces: 'wiped',
    ad_surfaces_note: null,
    spots: [testStelle({ id: 'stelle-neu', number: null, source_id: 'checkup-neu' })],
    photos: [
      { id: 'foto-l', spot_id: null, side: 'left' },
      { id: 'foto-v', spot_id: null, side: 'front' },
      { id: 'foto-r', spot_id: null, side: 'right' },
      { id: 'foto-h', spot_id: null, side: 'back' },
      { id: 'foto-s', spot_id: 'stelle-neu', side: null },
    ],
    ...overrides,
  };
}

/** Eine Panne in der Liste für den Arbeitgeber (FLT-008). */
export function testMeldungPanne(
  overrides: Partial<Extract<FleetReport, { kind: 'breakdown' }>> = {},
): Extract<FleetReport, { kind: 'breakdown' }> {
  return {
    kind: 'breakdown',
    id: 'panne-3',
    bike_id: 'rad-3',
    bike_name: 'Lastenrad 3',
    bike_type: 'load60_riemen',
    at: '2026-10-14T14:20:00+00:00',
    by_name: 'Tim Teamleitung',
    outcome: 'depotAbgestellt',
    blocks: true,
    summary: 'Ins Raddepot gebracht.',
    remark: null,
    location_note: 'Vor dem Raddepot Nord',
    transport: null,
    spots: [
      testStelle({
        id: 'stelle-3',
        number: null,
        zone: 'riemen',
        note: 'Riemen springt über',
        source: 'breakdown',
        source_id: 'panne-3',
      }),
    ],
    photos: [],
    ...overrides,
  };
}
