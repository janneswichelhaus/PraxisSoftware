import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Pause frei im Kalender (ANN-863). Im Seed arbeitet Anna werktags 08-12 und 13-18;
 * die Stunde dazwischen ist die Pause des Plans, die `set_break_placement` verschiebt.
 */

const { users, organizationId, patients } = SEED;

const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
} as const;

const SETZEN =
  'select public.set_break_placement($1::uuid, $2::date, $3::time, $4::time, $5::boolean) as ergebnis';
const ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, $8::boolean) as id';
const WOCHE = 'select public.set_staff_working_hours($1::uuid, $2::smallint, $3::jsonb) as anzahl';

function naechster(isoWochentag: number, mindestens = 30): string {
  const d = new Date();
  d.setUTCHours(12, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + mindestens);
  while (((d.getUTCDay() + 6) % 7) + 1 !== isoWochentag) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

const MITTWOCH = naechster(3);

function setzen(
  von: string,
  opts: { user?: string; staff?: string; plan?: string; bestaetigt?: boolean } = {},
) {
  return asUserCommitted<{ ergebnis: string }>(opts.user ?? users.therapist, SETZEN, [
    opts.staff ?? STAFF.anna,
    MITTWOCH,
    opts.plan ?? '12:00',
    von,
    opts.bestaetigt ?? false,
  ]);
}

function versuch(
  von: string,
  opts: { user?: string; staff?: string; plan?: string; bestaetigt?: boolean } = {},
) {
  return asUser<{ ergebnis: string }>(opts.user ?? users.therapist, SETZEN, [
    opts.staff ?? STAFF.anna,
    MITTWOCH,
    opts.plan ?? '12:00',
    von,
    opts.bestaetigt ?? false,
  ]);
}

async function bereiche(staff: string = STAFF.anna): Promise<string> {
  const { rows } = await asPostgres<{ r: string }>(
    'select app.working_ranges($1::uuid, $2::uuid, $3::date)::text as r',
    [staff, organizationId, MITTWOCH],
  );
  return rows[0]!.r;
}

function anlegen(von: string, bis: string, bestaetigt = false) {
  return asUserCommitted<{ id: string }>(users.office, ANLEGEN, [
    patients.max,
    STAFF.anna,
    'video',
    MITTWOCH,
    von,
    bis,
    null,
    bestaetigt,
  ]);
}

describe('set_break_placement', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.staff_break_placements');
    await asPostgres(
      `delete from public.appointments where staff_member_id = $1 and starts_at::date = $2::date`,
      [STAFF.anna, MITTWOCH],
    );
  });

  it('lässt die Pause ohne Zeile dort, wo der Plan sie hat', async () => {
    expect(await bereiche()).toBe('{[08:00:00,12:00:00),[13:00:00,18:00:00)}');
  });

  it('legt die eigene Pause an eine andere Stelle; die alte Lage wird Arbeitszeit', async () => {
    const { rows } = await setzen('11:00');
    expect(rows[0]!.ergebnis).toBe('moved');
    expect(await bereiche()).toBe('{[08:00:00,11:00:00),[12:00:00,18:00:00)}');

    // Ein Termin in der alten Pause braucht keine Rückfrage mehr, einer in der neuen schon.
    await expect(anlegen('12:00', '13:00')).resolves.toBeDefined();
    await expect(
      asUser(users.office, ANLEGEN, [
        patients.max,
        STAFF.anna,
        'video',
        MITTWOCH,
        '11:00',
        '11:30',
        null,
        false,
      ]),
    ).rejects.toThrow(/outside_working_hours/);
  });

  it('nimmt die Pause zurück auf den Plan und löscht dabei die Zeile', async () => {
    await setzen('14:00');
    const { rows } = await setzen('12:00');
    expect(rows[0]!.ergebnis).toBe('plan');
    const { rows: zeilen } = await asPostgres('select 1 from public.staff_break_placements');
    expect(zeilen).toHaveLength(0);
    expect(await bereiche()).toBe('{[08:00:00,12:00:00),[13:00:00,18:00:00)}');
  });

  it('ersetzt eine frühere Lage desselben Tages', async () => {
    await setzen('13:00');
    await setzen('14:00');
    const { rows } = await asPostgres<{ starts_at: string; ends_at: string }>(
      'select starts_at::text, ends_at::text from public.staff_break_placements',
    );
    expect(rows).toEqual([{ starts_at: '14:00:00', ends_at: '15:00:00' }]);
  });

  it('verschiebt nicht über einen Termin', async () => {
    await anlegen('13:30', '14:00');
    await expect(versuch('13:30')).rejects.toThrow(/break overlaps appointment/);
    await expect(versuch('13:00')).rejects.toThrow(/break overlaps appointment/);
    await expect(versuch('14:00')).resolves.toBeDefined();
  });

  it('ignoriert einen abgesagten Termin', async () => {
    const { rows } = await anlegen('14:00', '14:30');
    await asPostgres(
      `update public.appointments set status = 'cancelled', cancelled_at = now(), cancelled_by = $2 where id = $1`,
      [rows[0]!.id, users.office],
    );
    await expect(versuch('14:00')).resolves.toBeDefined();
  });

  it('bleibt innerhalb der Arbeitszeit des Tages', async () => {
    await expect(versuch('07:30')).rejects.toThrow(/break outside working time/);
    await expect(versuch('17:30')).rejects.toThrow(/break outside working time/);
    await expect(versuch('23:30')).rejects.toThrow(/break outside working time/);
    await expect(versuch('17:00', { bestaetigt: true })).resolves.toBeDefined();
  });

  it('kennt nur die Pausen des Plans', async () => {
    await expect(versuch('14:00', { plan: '12:30' })).rejects.toThrow(
      /no movable break at this time/,
    );
  });

  it('fragt nach, wenn erst die neue Lage mehr als 6 Stunden am Stück ergibt (§ 4 ArbZG)', async () => {
    // 10-11 lässt 11-18 übrig: 7 Stunden am Stück.
    await expect(versuch('10:00')).rejects.toThrow(/more_than_six_hours_in_a_row/);
    const { rows } = await setzen('10:00', { bestaetigt: true });
    expect(rows[0]!.ergebnis).toBe('moved');
  });

  it('lässt genau 6 Stunden am Stück ohne Rückfrage zu', async () => {
    // 11-12 lässt 12-18 übrig: genau 6 Stunden.
    await expect(versuch('11:00')).resolves.toBeDefined();
  });

  it('gilt nicht mehr, wenn der Plan die Pause nicht mehr hat', async () => {
    await setzen('14:00');
    await asUserCommitted(users.ownerTherapist, WOCHE, [
      STAFF.anna,
      3,
      JSON.stringify([
        { von: '08:00', bis: '12:30' },
        { von: '13:00', bis: '16:30' },
      ]),
    ]);
    expect(await bereiche()).toBe('{[08:00:00,12:30:00),[13:00:00,16:30:00)}');
    await asUserCommitted(users.ownerTherapist, WOCHE, [
      STAFF.anna,
      3,
      JSON.stringify([
        { von: '08:00', bis: '12:00' },
        { von: '13:00', bis: '18:00' },
      ]),
    ]);
  });

  describe('Rechte', () => {
    it('lässt eine Therapeut:in nur die eigene Pause verschieben', async () => {
      await expect(versuch('14:00', { staff: STAFF.jannes })).rejects.toThrow(
        /not allowed to move breaks/,
      );
    });

    it.each([
      ['owner', users.ownerTherapist],
      ['office', users.office],
      ['team_lead', users.teamLead],
    ])('lässt %s jede Pause verschieben', async (_wer, user) => {
      const { rows } = await setzen('14:00', { user });
      expect(rows[0]!.ergebnis).toBe('moved');
    });

    it.each([
      ['Patientenkonto', users.patientMax],
      ['Plattformkonto', users.plattformTina],
      ['Trainingsbetreuung', users.trainer],
    ])('weist %s ab', async (_wer, user) => {
      await expect(versuch('14:00', { user })).rejects.toThrow(/not allowed to move breaks/);
    });

    it('weist einen anonymen Zugriff ab', async () => {
      await expect(asAnon(SETZEN, [STAFF.anna, MITTWOCH, '12:00', '14:00', false])).rejects.toThrow(
        /permission denied|not authenticated/i,
      );
    });

    it('lässt Mitarbeitende die Lage lesen, aber nicht direkt schreiben', async () => {
      await setzen('14:00');
      const { rows } = await asUser(
        users.office,
        'select staff_member_id, on_date::text, starts_at::text from public.staff_break_placements',
      );
      expect(rows).toEqual([
        { staff_member_id: STAFF.anna, on_date: MITTWOCH, starts_at: '14:00:00' },
      ]);
      await expect(
        asUser(users.therapist, 'delete from public.staff_break_placements'),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(
          users.therapist,
          `insert into public.staff_break_placements (organization_id, staff_member_id, on_date, plan_starts_at, starts_at, ends_at)
           values ($1, $2, $3, '12:00', '09:00', '10:00')`,
          [organizationId, STAFF.anna, MITTWOCH],
        ),
      ).rejects.toThrow(/permission denied/);
    });

    it('trennt fremde Praxen in beide Richtungen', async () => {
      const fremd = await fremdeOrganisation();
      await setzen('14:00');
      const { rows } = await asUser(fremd.owner, 'select id from public.staff_break_placements');
      expect(rows).toEqual([]);
      await expect(versuch('13:00', { user: fremd.owner })).rejects.toThrow(
        /staff member not assignable/,
      );
      await expect(
        versuch('13:00', { user: users.ownerTherapist, staff: fremd.staffMember }),
      ).rejects.toThrow(/staff member not assignable/);
    });

    it('zeigt Patienten- und Plattformkonten nichts', async () => {
      await setzen('14:00');
      for (const user of [users.patientMax, users.plattformTina]) {
        const { rows } = await asUser(user, 'select id from public.staff_break_placements');
        expect(rows).toEqual([]);
      }
    });
  });
});
