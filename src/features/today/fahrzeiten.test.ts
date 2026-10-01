import { describe, expect, it } from 'vitest';
import type { Coordinate } from '@/lib/location/contract';
import type { Stopp } from '@/features/tours/tagesroute';
import type { DayPlanEntry } from './api';
import { FAHRZEITEN_BEIM_OEFFNEN, anfahrtenAusRoute } from './fahrzeiten';

/**
 * Die Fahrzeiten der Übersicht (ANN-194): Aus der einen Route des Tages wird
 * je Stopp die Anfahrt vom Wegpunkt davor. Geprüft wird die Zuordnung - wer
 * die Route abruft und was dabei hinausgeht, prüfen `route.test.ts` und
 * `tagesroute.test.ts`.
 */

function termin(id: string): DayPlanEntry {
  return {
    id,
    patient_id: `p-${id}`,
    staff_member_id: 's1',
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    starts_at: '2026-09-26T07:00:00.000Z',
    ends_at: '2026-09-26T08:00:00.000Z',
    patient_given_name: 'Test',
    patient_family_name: id,
    location_name: null,
    visit_street: null,
    visit_house_number: null,
    visit_postal_code: null,
    visit_city: null,
    patient_phone: null,
    patient_phone_mobile: null,
    home_visit_access_note: null,
    special_note: null,
    documentation_status: 'none',
    organization_time_zone: 'Europe/Berlin',
  };
}

function stopp(nummer: number, id: string, position: Coordinate | null): Stopp {
  return { nummer, termin: termin(id), position, genauigkeit: position ? 'address' : null };
}

const START: Coordinate = { lat: 48.52, lon: 9.05 };
const A: Coordinate = { lat: 48.521, lon: 9.057 };
const B: Coordinate = { lat: 48.526, lon: 9.064 };
const C: Coordinate = { lat: 48.538, lon: 9.046 };

/** Abschnitte einer Route in Minuten. */
function abschnitte(...minuten: number[]) {
  return minuten.map((m) => ({ durationSeconds: m * 60 }));
}

describe('Anfahrten aus der Tagesroute (ANN-194)', () => {
  it('ruft die Route beim Oeffnen der Uebersicht ab - an einem Schalter', () => {
    // Die eine Stelle, an der die Annahme greift: `false` nimmt Wegbalken,
    // Übergänge und „Anfahrt ≈ …" von der Übersicht, ohne weitere Änderung.
    expect(FAHRZEITEN_BEIM_OEFFNEN).toBe(true);
  });

  it('gibt jedem Stopp den Abschnitt vom Wegpunkt davor - dem ersten den vom Startort', () => {
    const stopps = [stopp(1, 'a', A), stopp(2, 'b', B), stopp(3, 'c', C)];
    const anfahrten = anfahrtenAusRoute(stopps, START, abschnitte(12, 9, 26));

    expect(anfahrten.get('a')).toEqual({ minuten: 12, vorher: null });
    expect(anfahrten.get('b')).toEqual({ minuten: 9, vorher: stopps[0]!.termin });
    expect(anfahrten.get('c')).toEqual({ minuten: 26, vorher: stopps[1]!.termin });
  });

  it('kennt ohne Startort keine Anfahrt zum ersten Stopp', () => {
    const stopps = [stopp(1, 'a', A), stopp(2, 'b', B)];
    const anfahrten = anfahrtenAusRoute(stopps, null, abschnitte(9));

    expect(anfahrten.has('a')).toBe(false);
    expect(anfahrten.get('b')).toEqual({ minuten: 9, vorher: stopps[0]!.termin });
  });

  it('behauptet keine Fahrzeit, wo eine Position oder die Route fehlt', () => {
    const stopps = [stopp(1, 'a', A), stopp(2, 'b', null), stopp(3, 'c', C)];
    // Ohne Position steht b nicht in der Route: zwei Abschnitte, Start → a → c.
    const anfahrten = anfahrtenAusRoute(stopps, START, abschnitte(12, 30));

    expect(anfahrten.get('a')?.minuten).toBe(12);
    // Weder zu b noch von b weg ist etwas bekannt - ungeprüft ist nicht „kurz".
    expect(anfahrten.has('b')).toBe(false);
    expect(anfahrten.has('c')).toBe(false);

    expect(anfahrtenAusRoute([stopp(1, 'a', A)], START, null).size).toBe(0);
    // Eine Route mit zu wenigen Abschnitten trägt nur, was sie hat.
    const kurz = anfahrtenAusRoute([stopp(1, 'a', A), stopp(2, 'b', B)], START, abschnitte(12));
    expect([...kurz.keys()]).toEqual(['a']);
  });

  it('laesst zwei Termine am selben Ort ohne Anfahrt - dazwischen wird nicht gefahren', () => {
    const stopps = [stopp(1, 'a', A), stopp(2, 'b', A), stopp(3, 'c', C)];
    // Gleiche Punkte fallen in der Route zusammen: Start → A → C.
    const anfahrten = anfahrtenAusRoute(stopps, START, abschnitte(12, 20));

    expect(anfahrten.get('a')?.minuten).toBe(12);
    expect(anfahrten.has('b')).toBe(false);
    // Der Weg zu c beginnt am gemeinsamen Ort; davor lag der Termin b.
    expect(anfahrten.get('c')).toEqual({ minuten: 20, vorher: stopps[1]!.termin });

    // Auch der erste Stopp am Startort selbst braucht keine Anfahrt.
    expect(anfahrtenAusRoute([stopp(1, 'a', START)], START, abschnitte()).size).toBe(0);
  });

  it('rundet auf Minuten wie die Tour und laesst unter einer halben Minute weg', () => {
    const stopps = [stopp(1, 'a', A), stopp(2, 'b', B), stopp(3, 'c', C)];
    const anfahrten = anfahrtenAusRoute(stopps, START, [
      { durationSeconds: 689 }, // 11,48 min
      { durationSeconds: 690 }, // 11,5 min
      { durationSeconds: 20 },
    ]);
    expect(anfahrten.get('a')?.minuten).toBe(11);
    expect(anfahrten.get('b')?.minuten).toBe(12);
    expect(anfahrten.has('c')).toBe(false);
  });

  it('kommt mit einem Tag ohne Stopps zurecht', () => {
    expect(anfahrtenAusRoute([], START, abschnitte()).size).toBe(0);
    expect(anfahrtenAusRoute([], null, null).size).toBe(0);
  });
});
