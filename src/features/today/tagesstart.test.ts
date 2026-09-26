import { describe, expect, it } from 'vitest';
import type { DayPlanEntry } from './api';
import { besucheDesTages, liegeHeute, liegeText, wegeDesTages } from './tagesstart';

const HEUTE = '2026-09-26';

function eintrag(teil: Partial<DayPlanEntry> & { id: string; um: string }): DayPlanEntry {
  const { um, ...rest } = teil;
  return {
    patient_id: `p-${teil.id}`,
    staff_member_id: 's1',
    appointment_type: 'home_visit',
    kind: 'therapy',
    title: null,
    status: 'confirmed',
    // Sommerzeit: 07:00Z ist 09:00 in Berlin.
    starts_at: `${HEUTE}T${um}:00.000Z`,
    ends_at: `${HEUTE}T${um}:00.000Z`,
    patient_given_name: 'Test',
    patient_family_name: teil.id,
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
    treatment_table_required: false,
    ...rest,
  };
}

describe('Tagesstart (UX-EPIC-003)', () => {
  it('zaehlt Behandlungen ohne Fehlzeit, Training und Absage, in Uhrzeitfolge (ANN-117)', () => {
    const plan = [
      eintrag({ id: 'c', um: '10:00' }),
      eintrag({ id: 'a', um: '06:00', kind: 'internal', patient_id: null }),
      eintrag({ id: 't', um: '06:30', kind: 'training', patient_id: null }),
      eintrag({ id: 'b', um: '07:00' }),
      eintrag({ id: 'x', um: '08:00', status: 'cancelled' }),
    ];
    expect(besucheDesTages(plan).map((t) => t.id)).toEqual(['b', 'c']);
  });

  it('macht einen Trainingstermin nie zum ersten Weg', () => {
    const wege = wegeDesTages([
      eintrag({ id: 't', um: '06:00', kind: 'training', patient_id: null }),
      eintrag({ id: 'a', um: '07:00' }),
    ]);
    expect(wege.erster?.id).toBe('a');
    expect(wege.istErsterDesTages).toBe(true);
  });

  it('zaehlt einen nicht angetroffenen Besuch mit, macht ihn aber nicht zum Weg', () => {
    const wege = wegeDesTages([
      eintrag({ id: 'a', um: '07:00', status: 'no_show' }),
      eintrag({ id: 'b', um: '09:00', treatment_table_required: true }),
    ]);
    expect(wege.erster?.id).toBe('b');
    expect(wege.istErsterDesTages).toBe(false);
    expect(
      liegeHeute([
        eintrag({ id: 'a', um: '07:00', status: 'no_show' }),
        eintrag({ id: 'b', um: '09:00', treatment_table_required: true }),
      ]),
    ).toMatchObject({ noetig: true, besuch: 2 });
  });

  it('nennt den ersten ausstehenden Besuch und den danach', () => {
    const wege = wegeDesTages([
      eintrag({ id: 'b', um: '09:00' }),
      eintrag({ id: 'a', um: '07:00' }),
      eintrag({ id: 'c', um: '11:00' }),
    ]);
    expect(wege.erster?.id).toBe('a');
    expect(wege.istErsterDesTages).toBe(true);
    expect(wege.danach?.id).toBe('b');
  });

  it('spricht nach dem ersten erledigten Besuch vom naechsten Weg', () => {
    const wege = wegeDesTages([
      eintrag({ id: 'a', um: '07:00', status: 'completed' }),
      eintrag({ id: 'b', um: '09:00' }),
    ]);
    expect(wege.erster?.id).toBe('b');
    expect(wege.istErsterDesTages).toBe(false);
    expect(wege.danach).toBeNull();
  });

  it('hat keinen Weg, wenn nichts mehr aussteht', () => {
    const wege = wegeDesTages([eintrag({ id: 'a', um: '07:00', status: 'completed' })]);
    expect(wege.erster).toBeNull();
    expect(wege.danach).toBeNull();
  });

  it('sagt "ja, ab 2. Besuch", wenn erst der zweite die Liege braucht (§9)', () => {
    const liege = liegeHeute([
      eintrag({ id: 'a', um: '07:00' }),
      eintrag({ id: 'b', um: '08:30', treatment_table_required: true }),
      eintrag({ id: 'c', um: '10:00', treatment_table_required: true }),
    ]);
    expect(liege).toMatchObject({ noetig: true, besuch: 2 });
    expect(liegeText(liege)).toBe('ja, ab 2. Besuch (10:30 Uhr)');
  });

  it('zaehlt einen erledigten Besuch mit, braucht fuer ihn aber keine Liege mehr', () => {
    const liege = liegeHeute([
      eintrag({ id: 'a', um: '07:00', status: 'completed', treatment_table_required: true }),
      eintrag({ id: 'b', um: '08:30' }),
      eintrag({ id: 'c', um: '10:00', treatment_table_required: true }),
    ]);
    expect(liege).toMatchObject({ noetig: true, besuch: 3 });
  });

  it('sagt "nein", wenn keine ausstehende Behandlung die Liege braucht', () => {
    expect(liegeText(liegeHeute([eintrag({ id: 'a', um: '07:00' })]))).toBe('nein');
    // Am Training liefert die Tagesliste das Merkmal nicht (ADR-022 Punkt 11).
    expect(
      liegeHeute([
        eintrag({ id: 't', um: '07:00', kind: 'training', treatment_table_required: null }),
      ]),
    ).toEqual({ noetig: false });
    expect(
      liegeHeute([
        eintrag({ id: 'a', um: '07:00', status: 'cancelled', treatment_table_required: true }),
      ]),
    ).toEqual({ noetig: false });
  });
});
