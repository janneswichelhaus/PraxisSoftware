import { beforeEach, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Farbe je Person im Teamchat (TEAM-006, ANN-666).
 *
 * Geprüft werden die Vergabe mit dem Mitarbeiterdatensatz, das Lesen für alle,
 * die am Teamchat teilnehmen, und das Wählen nur für sich selbst - jeweils mit
 * den Rechten (ADR-013 Punkt 9 Nr. 1: andere Organisation, Konto ohne
 * Praxisrolle, Plattformkonto, ohne Sitzung, Tabellenrechte), ohne
 * Auditeintrag (ADR-010 Punkt 17) und mit dem Löschpfad (ADR-008).
 */

const { users, organizationId } = SEED;

const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  olivia: '55555555-5555-4555-8555-000000000003',
  tim: '55555555-5555-4555-8555-000000000004',
  nina: '55555555-5555-4555-8555-000000000005',
  tom: '55555555-5555-4555-8555-000000000006',
} as const;

const REIHE = ['tanne', 'ozean', 'pflaume', 'moos', 'veilchen', 'petrol', 'schiefer', 'nacht'];

interface Avatar {
  staff_member_id: string;
  color: string;
}

interface Fehler {
  code?: string;
  message: string;
}

async function fehler(
  konto: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<Fehler | null> {
  try {
    await asUser(konto, sql, params);
    return null;
  } catch (cause) {
    return cause as Fehler;
  }
}

async function anzahl(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await asPostgres<{ n: string }>(sql, params);
  return Number(rows[0]?.n ?? 0);
}

async function avatare(konto: string): Promise<Map<string, Avatar>> {
  const { rows } = await asUser<Avatar>(konto, 'select * from public.list_team_avatars()');
  return new Map(rows.map((z) => [z.staff_member_id, z]));
}

/** Legt eine weitere Person der Praxis an - ohne Konto, wie eine Einladung vorher. */
async function neuePerson(nummer: number): Promise<string> {
  const person = `44444444-4444-4444-8444-0000000009${String(nummer).padStart(2, '0')}`;
  const staff = `55555555-5555-4555-8555-0000000009${String(nummer).padStart(2, '0')}`;
  await asPostgres(
    `insert into public.persons (id, organization_id, given_name, family_name)
     values ($1, $2, 'Neu', $3)`,
    [person, organizationId, `Person ${nummer}`],
  );
  await asPostgres(
    'insert into public.staff_members (id, organization_id, person_id) values ($1, $2, $3)',
    [staff, organizationId, person],
  );
  return staff;
}

beforeEach(async () => {
  await resetDatabase();
});

describe('Farbe je Person (TEAM-006)', () => {
  it('vergibt jeder Person der Praxis eine Farbe, in der Reihe und verschieden', async () => {
    const farben = await avatare(users.therapist);
    // Alle Mitarbeiterdatensätze der Praxis, auch ohne Zugang (Nina).
    expect([...farben.keys()].sort()).toEqual(Object.values(STAFF).sort());
    const reihe = Object.values(STAFF).map((id) => farben.get(id)?.color);
    expect(reihe).toEqual(REIHE.slice(0, 6));
    expect(new Set(reihe).size).toBe(6);
  });

  it('vergibt einer neuen Person die erste freie Farbe, Ausgeschiedene halten keine fest', async () => {
    // Anna scheidet aus: ihre Farbe wird frei, sie selbst behält sie.
    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id = $1`,
      [STAFF.anna],
    );
    const neu = await neuePerson(1);
    const farben = await avatare(users.ownerTherapist);
    expect(farben.get(neu)?.color).toBe('ozean');
    expect(farben.get(STAFF.anna)?.color).toBe('ozean');

    // Sind alle acht vergeben, die seltenste - bei Gleichstand die frühere.
    const zwei = await neuePerson(2);
    const drei = await neuePerson(3);
    const vier = await neuePerson(4);
    const danach = await avatare(users.ownerTherapist);
    expect(danach.get(zwei)?.color).toBe('schiefer');
    expect(danach.get(drei)?.color).toBe('nacht');
    expect(danach.get(vier)?.color).toBe('tanne');
  });

  it('lässt die Person ihre eigene Farbe wählen, nur aus der Reihe und nur für sich', async () => {
    await asUserCommitted(users.therapist, 'select public.set_own_team_color($1)', ['nacht']);
    const farben = await avatare(users.office);
    expect(farben.get(STAFF.anna)?.color).toBe('nacht');
    expect(farben.get(STAFF.olivia)?.color).toBe('pflaume');

    // Doppelt ist erlaubt: Die Farbe hilft, sie unterscheidet nicht allein.
    await asUserCommitted(users.office, 'select public.set_own_team_color($1)', ['nacht']);
    expect((await avatare(users.therapist)).get(STAFF.olivia)?.color).toBe('nacht');

    for (const falsch of ['rot', '', 'Tanne', '#ff0000']) {
      expect(
        (await fehler(users.therapist, 'select public.set_own_team_color($1)', [falsch]))?.code,
        falsch,
      ).toBe('22023');
    }
    expect((await fehler(users.therapist, 'select public.set_own_team_color(null)'))?.code).toBe(
      '22023',
    );
    // Keine Funktion nimmt eine fremde Person an.
    expect(
      await anzahl(
        `select count(*) n from pg_proc p join pg_namespace n on n.oid = p.pronamespace
         where n.nspname = 'public' and p.proname = 'set_own_team_color' and p.pronargs = 1`,
      ),
    ).toBe(1);
  });

  it('liest und wählt nur in der eigenen Praxis', async () => {
    const fremd = await fremdeOrganisation();
    const dort = await avatare(fremd.owner);
    expect([...dort.keys()]).toEqual([FREMDE_ORGANISATION.staffMember]);
    expect(dort.get(FREMDE_ORGANISATION.staffMember)?.color).toBe('tanne');
    expect((await avatare(users.therapist)).has(FREMDE_ORGANISATION.staffMember)).toBe(false);

    await asUserCommitted(fremd.owner, 'select public.set_own_team_color($1)', ['ozean']);
    expect((await avatare(users.ownerTherapist)).get(STAFF.jannes)?.color).toBe('tanne');
  });

  it('weist Konten ohne Praxisrolle, Plattformkonten und Aufrufe ohne Sitzung ab', async () => {
    for (const konto of [users.patientMax, users.plattformTina, users.plattformErika]) {
      expect((await fehler(konto, 'select * from public.list_team_avatars()'))?.code, konto).toBe(
        '42501',
      );
      expect(
        (await fehler(konto, 'select public.set_own_team_color($1)', ['ozean']))?.code,
        konto,
      ).toBe('42501');
    }
    expect((await fehler(null, 'select * from public.list_team_avatars()'))?.code).toBe('42501');
    await expect(asAnon('select * from public.list_team_avatars()')).rejects.toThrow(
      /permission denied/i,
    );
    await expect(asAnon(`select public.set_own_team_color('ozean')`)).rejects.toThrow(
      /permission denied/i,
    );
  });

  it('weist Ausgeschiedene ab', async () => {
    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id = $1`,
      [STAFF.anna],
    );
    expect(
      (await fehler(users.therapist, 'select public.set_own_team_color($1)', ['nacht']))?.code,
    ).toBe('42501');
    expect((await avatare(users.office)).get(STAFF.anna)?.color).toBe('ozean');
  });

  it('gibt der Tabelle kein Recht und den Helfern keine Ausführung', async () => {
    for (const sql of [
      'select * from public.staff_colors',
      `insert into public.staff_colors values ('${STAFF.anna}', '${organizationId}', 'nacht')`,
      `update public.staff_colors set color = 'nacht'`,
      'delete from public.staff_colors',
    ]) {
      expect((await fehler(users.ownerTherapist, sql))?.code, sql).toBe('42501');
    }
    const { rows } = await asPostgres<{ name: string }>(
      `select distinct p.proname as name
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
            unnest(array['anon', 'authenticated']) r
       where n.nspname = 'app'
         and p.proname in ('staff_color_palette', 'next_staff_color', 'staff_colors_assign')
         and has_function_privilege(r, p.oid, 'EXECUTE')`,
    );
    expect(rows).toEqual([]);
    const { rows: definer } = await asPostgres<{ proname: string; proconfig: string[] | null }>(
      `select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef and p.proname in
         ('list_team_avatars', 'set_own_team_color', 'next_staff_color', 'staff_colors_assign')`,
    );
    expect(definer).toHaveLength(4);
    for (const fn of definer) expect(fn.proconfig, fn.proname).toContain('search_path=""');
  });

  it('fällt mit dem Mitarbeiterdatensatz und steht im Retention Schedule', async () => {
    const neu = await neuePerson(5);
    expect(
      await anzahl('select count(*) n from public.staff_colors where staff_member_id = $1', [neu]),
    ).toBe(1);
    await asPostgres('delete from public.staff_members where id = $1', [neu]);
    expect(
      await anzahl('select count(*) n from public.staff_colors where staff_member_id = $1', [neu]),
    ).toBe(0);
    const { rows } = await asPostgres<{ class_key: string; deletion_mode: string }>(
      `select class_key, deletion_mode from public.retention_assignments
       where table_name = 'staff_colors'`,
    );
    expect(rows).toEqual([
      { class_key: 'beschaeftigtendaten', deletion_mode: 'ueber_elterndatensatz' },
    ]);
  });

  it('schreibt keinen Auditeintrag (ADR-010 Punkt 17)', async () => {
    const vorher = await anzahl('select count(*) n from public.audit_log');
    await avatare(users.therapist);
    await asUserCommitted(users.therapist, 'select public.set_own_team_color($1)', ['nacht']);
    expect(await anzahl('select count(*) n from public.audit_log')).toBe(vorher);
  });
});
