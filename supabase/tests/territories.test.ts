import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Gebietstage für die Terminvergabe (PRX-002, ANN-135).
 *
 * Geprüft werden die Regel an genau einer Stelle (Postleitzahl, Wochentag,
 * Tageshälfte), die Eindeutigkeit einer Postleitzahl, Rollen, Stand-Prüfung,
 * Mandantengrenze und das Auditlog ohne Inhalt. Die Regel warnt nur: Ein
 * Termin außerhalb bleibt anlegbar.
 */

const { users } = SEED;

// 2026-10-05 ist ein Montag, 2026-10-06 ein Dienstag.
const MONTAG = '2026-10-05';
const DIENSTAG = '2026-10-06';

const SPEICHERN = `select public.save_territory($1::uuid, $2::timestamptz, $3, $4::text[], $5::jsonb) as id`;
const LISTE = `select id, name, day_parts, postal_codes,
                      to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') as updated_at
                 from public.list_territories()`;
const PRUEFEN = `select slot_index, status, territory_name
                   from public.check_territory_days($1, $2::jsonb) order by slot_index`;

const NORD_TAGE = [
  { weekday: 1, part: 'am' },
  { weekday: 3, part: 'day' },
];

async function nordAnlegen(konto: string = users.office): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, SPEICHERN, [
    null,
    null,
    'Nord',
    ['72070', '72072'],
    JSON.stringify(NORD_TAGE),
  ]);
  return rows[0]!.id;
}

async function fehler(konto: string | null, sql: string, params: unknown[]) {
  try {
    await asUser(konto, sql, params);
    return null;
  } catch (f) {
    return f as { code?: string; message: string };
  }
}

async function pruefen(plz: string | null, slots: { datum: string; beginn: string }[]) {
  const { rows } = await asUser<{
    slot_index: number;
    status: string;
    territory_name: string | null;
  }>(users.therapist, PRUEFEN, [plz, JSON.stringify(slots)]);
  return rows;
}

describe('Gebietstage (PRX-002)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('legt ein Gebiet an und liefert es mit sortierten Postleitzahlen', async () => {
    await nordAnlegen();
    const { rows } = await asUser(users.therapist, LISTE);
    expect(rows).toEqual([
      expect.objectContaining({
        name: 'Nord',
        postal_codes: ['72070', '72072'],
        day_parts: NORD_TAGE,
      }),
    ]);
  });

  it('rechnet Gebietstag und Tageshälfte an einer Stelle', async () => {
    await nordAnlegen();
    const ergebnis = await pruefen('72070', [
      { datum: MONTAG, beginn: '08:00' }, // Montag Vormittag: im Gebietstag
      { datum: MONTAG, beginn: '11:55' }, // noch Vormittag
      { datum: MONTAG, beginn: '12:00' }, // Nachmittag: außerhalb
      { datum: DIENSTAG, beginn: '09:00' }, // anderer Tag
      { datum: '2026-10-07', beginn: '16:00' }, // Mittwoch ganztags
      { datum: 'kein Tag', beginn: '09:00' },
    ]);
    expect(ergebnis.map((z) => z.status)).toEqual([
      'match',
      'match',
      'outside',
      'outside',
      'match',
      'invalid',
    ]);
    expect(ergebnis[2]!.territory_name).toBe('Nord');
  });

  it('sagt nichts zu einer Postleitzahl ohne Gebiet oder einem Gebiet ohne Tage', async () => {
    await nordAnlegen();
    await asUserCommitted(users.office, SPEICHERN, [null, null, 'Süd', ['72074'], '[]']);
    expect((await pruefen('72108', [{ datum: MONTAG, beginn: '15:00' }]))[0]).toMatchObject({
      status: 'none',
      territory_name: null,
    });
    expect((await pruefen('72074', [{ datum: MONTAG, beginn: '15:00' }]))[0]!.status).toBe('none');
    expect((await pruefen(null, [{ datum: MONTAG, beginn: '15:00' }]))[0]!.status).toBe('none');
  });

  it('gibt eine Postleitzahl hoechstens einem Gebiet und nennt die belegte', async () => {
    await nordAnlegen();
    const f = await fehler(users.office, SPEICHERN, [null, null, 'Ost', ['72076', '72072'], '[]']);
    expect(f?.code).toBe('23505');
    expect(f?.message).toMatch(/72072/);
    // Auch am Schreibweg vorbei haelt der Index.
    await expect(
      asPostgres(
        `insert into public.territory_postal_codes (organization_id, territory_id, postal_code)
         select organization_id, id, '72070' from public.territories limit 1`,
      ),
    ).rejects.toThrow(/territory_postal_codes_unique/);
  });

  it('weist ungueltige Postleitzahlen, Tage und Namen ab', async () => {
    for (const [name, codes, tage] of [
      ['Nord', ['7207'], '[]'],
      ['Nord', ['72070a'], '[]'],
      ['Nord', [], JSON.stringify([{ weekday: 8, part: 'am' }])],
      ['Nord', [], JSON.stringify([{ weekday: 1, part: 'abends' }])],
      ['', [], '[]'],
    ] as const) {
      expect((await fehler(users.office, SPEICHERN, [null, null, name, codes, tage]))?.code).toBe(
        '22023',
      );
    }
  });

  it('ersetzt ein Gebiet mit Stand-Pruefung und gibt frei gewordene Postleitzahlen frei', async () => {
    const id = await nordAnlegen();
    const { rows } = await asUser<{ updated_at: string }>(users.office, LISTE);
    const stand = rows[0]!.updated_at;

    await asUserCommitted(users.teamLead, SPEICHERN, [id, stand, 'Nord', ['72070'], '[]']);
    // 72072 ist frei geworden.
    expect(await fehler(users.office, SPEICHERN, [null, null, 'Ost', ['72072'], '[]'])).toBeNull();
    // Der alte Stand ist ueberholt.
    expect((await fehler(users.office, SPEICHERN, [id, stand, 'Nord', [], '[]']))?.code).toBe(
      '40001',
    );
  });

  it('laesst nur owner, team_lead und office pflegen', async () => {
    for (const konto of [users.therapist, users.trainer, users.patientMax]) {
      expect((await fehler(konto, SPEICHERN, [null, null, 'Nord', [], '[]']))?.code, konto).toBe(
        '42501',
      );
    }
    const id = await nordAnlegen(users.ownerTherapist);
    expect(
      (await fehler(users.therapist, 'select public.remove_territory($1::uuid)', [id]))?.code,
    ).toBe('42501');
  });

  it('gibt Trainingsbetreuung und Patientenkonto weder Liste noch Pruefung', async () => {
    await nordAnlegen();
    for (const konto of [users.trainer, users.patientMax]) {
      expect((await fehler(konto, LISTE, []))?.code).toBe('42501');
      expect((await fehler(konto, PRUEFEN, ['72070', '[]']))?.code).toBe('42501');
    }
  });

  it('haelt die Mandantengrenze', async () => {
    const id = await nordAnlegen();
    const fremd = await fremdeOrganisation();
    expect((await asUser(fremd.owner, LISTE)).rows).toEqual([]);
    const { rows } = await asUser<{ status: string }>(fremd.owner, PRUEFEN, [
      '72070',
      JSON.stringify([{ datum: MONTAG, beginn: '15:00' }]),
    ]);
    expect(rows[0]!.status).toBe('none');
    expect(
      (await fehler(fremd.owner, 'select public.remove_territory($1::uuid)', [id]))?.code,
    ).toBe('P0002');
    // Dieselbe Postleitzahl ist in einer anderen Praxis frei.
    expect(await fehler(fremd.owner, SPEICHERN, [null, null, 'Nord', ['72070'], '[]'])).toBeNull();
  });

  it('protokolliert Speichern und Entfernen nur mit Zahlen', async () => {
    const id = await nordAnlegen();
    await asUserCommitted(users.office, 'select public.remove_territory($1::uuid)', [id]);
    const { rows } = await asPostgres<{ action: string; context: Record<string, unknown> }>(
      `select action, context from public.audit_log where subject_id = $1 order by occurred_at`,
      [id],
    );
    expect(rows.map((r) => r.action)).toEqual(['territory.saved', 'territory.removed']);
    expect(rows[0]!.context).toMatchObject({ created: true, postal_codes: 2, day_parts: 2 });
    expect(JSON.stringify(rows)).not.toContain('72070');
    expect((await asPostgres('select 1 from public.territory_postal_codes')).rows).toEqual([]);
  });
});
