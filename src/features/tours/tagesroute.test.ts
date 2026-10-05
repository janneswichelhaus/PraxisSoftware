import { describe, expect, it } from 'vitest';
import type { DayPlanEntry } from '@/features/today/api';
import {
  fahrzeitZwischen,
  streckeZwischen,
  kartenmarker,
  routenplan,
  stoppsDesTages,
  type Tagesstopp,
} from './tagesroute';

/** MAP-006b: Zusammenführen von Tagesliste und Tagesroute, reine Rechnung. */

function termin(id: string, von: string): DayPlanEntry {
  return {
    id,
    patient_id: 'p',
    staff_member_id: 's',
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: von,
    ends_at: von,
    patient_given_name: 'Erika',
    patient_family_name: 'Beispiel',
    location_name: null,
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_city: 'Tübingen',
    patient_phone: null,
    patient_phone_mobile: null,
    home_visit_access_note: null,
    special_note: null,
    documentation_status: null,
    organization_time_zone: 'Europe/Berlin',
  };
}

function punkt(id: string, von: string, lat: number | null, lon: number | null): Tagesstopp {
  return {
    id,
    kind: 'therapy',
    appointment_type: 'home_visit',
    status: 'confirmed',
    starts_at: von,
    ends_at: von,
    lat,
    lon,
    geocode_precision: lat === null ? null : 'address',
    position_source: 'visit',
  };
}

const A = { lat: 48.5, lon: 9.0 };
const B = { lat: 48.6, lon: 9.1 };
const START = { lat: 48.52, lon: 9.05 };

describe('stoppsDesTages', () => {
  it('nummeriert in Terminreihenfolge und laesst Termine ohne Tagesliste weg', () => {
    const stopps = stoppsDesTages(
      [termin('b', '2026-09-10T10:00:00Z'), termin('a', '2026-09-10T08:00:00Z')],
      [
        punkt('b', '2026-09-10T10:00:00Z', B.lat, B.lon),
        punkt('x', '2026-09-10T09:00:00Z', 1, 1),
        punkt('a', '2026-09-10T08:00:00Z', A.lat, A.lon),
      ],
    );
    expect(stopps.map((s) => [s.nummer, s.termin.id])).toEqual([
      [1, 'a'],
      [2, 'b'],
    ]);
  });

  it('behaelt einen Stopp ohne Position - mit Position null', () => {
    const [stopp] = stoppsDesTages([termin('a', 't')], [punkt('a', 't', null, null)]);
    expect(stopp!.position).toBeNull();
  });
});

describe('kartenmarker', () => {
  it('traegt nur Koordinate und Nummer - kein Name (ANN-096)', () => {
    const stopps = stoppsDesTages([termin('a', 't')], [punkt('a', 't', A.lat, A.lon)]);
    const marker = kartenmarker(START, stopps);
    expect(marker).toEqual([
      { position: START, label: 'S' },
      { position: A, label: '1' },
    ]);
    expect(JSON.stringify(marker)).not.toMatch(/Erika|Beispiel|Testweg/);
  });
});

describe('routenplan und fahrzeitZwischen', () => {
  const stopps = stoppsDesTages(
    [termin('a', '1'), termin('b', '2'), termin('c', '3'), termin('d', '4')],
    [
      punkt('a', '1', A.lat, A.lon),
      punkt('b', '2', A.lat, A.lon),
      punkt('c', '3', null, null),
      punkt('d', '4', B.lat, B.lon),
    ],
  );

  it('fasst gleiche Orte zusammen und laesst Stopps ohne Position aus', () => {
    const plan = routenplan(START, stopps);
    expect(plan.punkte).toEqual([START, A, B]);
    expect(plan.index).toEqual([1, 1, null, 2]);
  });

  it('rechnet die Fahrzeit aus den Abschnitten - 0 am selben Ort, null ohne Position', () => {
    const { index } = routenplan(START, stopps);
    const abschnitte = [{ durationSeconds: 300 }, { durationSeconds: 720 }];
    expect(fahrzeitZwischen(index[0]!, index[1]!, abschnitte)).toBe(0);
    expect(fahrzeitZwischen(index[1]!, index[2]!, abschnitte)).toBeNull();
    expect(fahrzeitZwischen(index[1]!, index[3]!, abschnitte)).toBe(720);
    expect(fahrzeitZwischen(index[1]!, index[3]!, null)).toBeNull();
  });
});

describe('streckeZwischen (UBK-008)', () => {
  const abschnitte = [{ distanceMeters: 1200 }, { distanceMeters: 3400 }];
  it('summiert die Abschnitte zwischen zwei Wegpunkten', () => {
    expect(streckeZwischen(0, 2, abschnitte)).toBe(4600);
    expect(streckeZwischen(1, 2, abschnitte)).toBe(3400);
  });
  it('gibt ohne Position oder Route nichts', () => {
    expect(streckeZwischen(null, 1, abschnitte)).toBeNull();
    expect(streckeZwischen(0, 1, null)).toBeNull();
  });
});

describe('tagesorte und Kartenmarker (UBK-015, ANN-240)', async () => {
  const { tagesorte } = await import('./startort');
  const { kartenmarker } = await import('./tagesroute');
  const PRAXIS = {
    id: 'ort',
    name: 'Praxis',
    street: 'Praxisweg',
    house_number: '1',
    postal_code: '72070',
    city: 'Tuebingen',
    lat: 48.5,
    lon: 9.05,
    geocode_precision: 'address' as const,
  };

  it('beginnt und endet an der Garage, falls gesetzt, sonst an der Praxis', () => {
    expect(tagesorte([PRAXIS])).toEqual({
      start: { lat: 48.5, lon: 9.05 },
      ende: { lat: 48.5, lon: 9.05 },
    });
    expect(tagesorte([{ ...PRAXIS, garage_lat: 48.49, garage_lon: 9.04 }])).toEqual({
      start: { lat: 48.49, lon: 9.04 },
      ende: { lat: 48.49, lon: 9.04 },
    });
    expect(tagesorte([])).toEqual({ start: null, ende: null });
  });

  it('setzt ein eigenes Zeichen nur fuer ein Ende an anderem Ort', () => {
    const start = { lat: 48.49, lon: 9.04 };
    expect(kartenmarker(start, [], start).map((m) => m.label)).toEqual(['S']);
    expect(kartenmarker(start, [], { lat: 48.5, lon: 9.05 }).map((m) => m.label)).toEqual([
      'S',
      'Z',
    ]);
  });
});
