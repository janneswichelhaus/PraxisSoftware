import { beforeEach, describe, expect, it } from 'vitest';
import { gleichzeitig } from './helpers/gleichzeitig';
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

// -----------------------------------------------------------------------------
// TEAM-007: Profilbild (ADR-017 Abschnitt O, ANN-667)
// -----------------------------------------------------------------------------

function segment(marker: number, inhalt: number[]): number[] {
  const laenge = inhalt.length + 2;
  return [0xff, marker, laenge >> 8, laenge & 0xff, ...inhalt];
}

const DQT = segment(0xdb, [0x00, ...Array.from({ length: 64 }, () => 1)]);
const DHT = segment(0xc4, [0x00, 1, ...Array.from({ length: 15 }, () => 0), 0x00]);
// Bilddaten mit Füllung (FF 00) und Rücksetzmarker (FF D0), wie ein Scan sie trägt.
const SCAN = [
  ...segment(0xda, [1, 1, 0x00, 0, 63, 0]),
  ...Array.from({ length: 40 }, (_, i) => (i * 37) % 255),
  0xff,
  0x00,
  0x34,
  0xff,
  0xd0,
  0x56,
];

function sof(breite: number, hoehe: number): number[] {
  return segment(0xc0, [8, hoehe >> 8, hoehe & 0xff, breite >> 8, breite & 0xff, 1, 1, 0x11, 0]);
}

/**
 * Ein synthetisches JPEG: gebaut wie aus dem Kameradialog, ohne dekodierbar
 * zu sein - der Server prüft den Aufbau, nicht das Bild (ADR-017 Punkt 90).
 */
function jpeg(
  optionen: {
    breite?: number;
    hoehe?: number;
    vorne?: number[];
    mitte?: number[];
    hinten?: number[];
  } = {},
): string {
  const { breite = 256, hoehe = 256, vorne = [], mitte = [], hinten = [] } = optionen;
  const bytes = [
    0xff,
    0xd8,
    ...vorne,
    ...DQT,
    ...sof(breite, hoehe),
    ...DHT,
    ...SCAN,
    ...mitte,
    0xff,
    0xd9,
    ...hinten,
  ];
  return Buffer.from(bytes).toString('base64');
}

const SETZEN = 'select public.set_own_profile_picture($1) as id';
const LESEN = 'select public.get_team_profile_picture($1::uuid) as bild';

interface AvatarMitBild extends Avatar {
  picture_id: string | null;
}

async function bildVon(konto: string, staff: string): Promise<string | null> {
  const { rows } = await asUser<AvatarMitBild>(konto, 'select * from public.list_team_avatars()');
  return rows.find((z) => z.staff_member_id === staff)?.picture_id ?? null;
}

async function setzen(konto: string, bild = jpeg()): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, SETZEN, [bild]);
  return rows[0]!.id;
}

describe('Profilbild (TEAM-007)', () => {
  it('setzt das eigene Bild; das Team liest es über seine Kennung, Byte für Byte', async () => {
    const bild = jpeg();
    const id = await setzen(users.therapist, bild);
    expect(await bildVon(users.office, STAFF.anna)).toBe(id);
    expect(await bildVon(users.office, STAFF.olivia)).toBeNull();
    for (const konto of [users.office, users.trainer, users.ownerTherapist, users.therapist]) {
      const { rows } = await asUser<{ bild: string }>(konto, LESEN, [id]);
      expect(rows[0]!.bild, konto).toBe(bild);
    }
  });

  it('ersetzt ein Bild durch eine neue Zeile; das alte fällt mit Löschjournal', async () => {
    const alt = await setzen(users.therapist);
    const neu = await setzen(
      users.therapist,
      jpeg({ vorne: segment(0xee, [0x41, 0x64, 0x6f, 0x62, 0x65, 0, 100, 0, 0, 0, 0, 1]) }),
    );
    expect(neu).not.toBe(alt);
    expect(await bildVon(users.office, STAFF.anna)).toBe(neu);
    expect((await fehler(users.office, LESEN, [alt]))?.code).toBe('P0002');
    const { rows } = await asPostgres<{ retention_class: string; tag: boolean }>(
      `select retention_class, deleted_at = date_trunc('day', deleted_at) as tag
       from public.deletion_journal where target_table = 'staff_profile_pictures' and target_id = $1`,
      [alt],
    );
    expect(rows).toEqual([{ retention_class: 'profilbild', tag: true }]);
    expect(
      await anzahl(
        'select count(*) n from public.staff_profile_pictures where staff_member_id = $1',
        [STAFF.anna],
      ),
    ).toBe(1);
  });

  it('entfernt das eigene Bild mit Löschjournal, auch zweimal ohne Fehler', async () => {
    const id = await setzen(users.therapist);
    const entfernen = 'select public.remove_own_profile_picture() as war';
    expect((await asUserCommitted<{ war: boolean }>(users.therapist, entfernen)).rows[0]!.war).toBe(
      true,
    );
    expect((await asUserCommitted<{ war: boolean }>(users.therapist, entfernen)).rows[0]!.war).toBe(
      false,
    );
    expect(await bildVon(users.office, STAFF.anna)).toBeNull();
    expect(
      await anzahl(
        `select count(*) n from public.deletion_journal
         where target_table = 'staff_profile_pictures' and target_id = $1`,
        [id],
      ),
    ).toBe(1);
  });

  it.each([
    [
      'Aufnahmemetadaten (EXIF)',
      jpeg({ vorne: segment(0xe1, [0x45, 0x78, 0x69, 0x66, 0, 0, 1, 2]) }),
      'metadata',
    ],
    [
      'JFIF mit Vorschaubild',
      jpeg({ vorne: segment(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]) }),
      'metadata',
    ],
    ['Farbprofil (ICC)', jpeg({ vorne: segment(0xe2, [0x49, 0x43, 0x43, 0x5f]) }), 'metadata'],
    ['Kommentar', jpeg({ vorne: segment(0xfe, [0x48, 0x61, 0x6c, 0x6c, 0x6f]) }), 'metadata'],
    [
      'APP14 ohne Adobe',
      jpeg({ vorne: segment(0xee, [0x41, 0x41, 0x41, 0x41, 0x41, 0]) }),
      'metadata',
    ],
    [
      'Metadaten hinter dem ersten Scan',
      jpeg({ mitte: [...segment(0xe1, [1, 2, 3, 4]), ...SCAN] }),
      'metadata',
    ],
    ['Daten hinter dem Bildende', jpeg({ hinten: [0xff, 0xd8, 1, 2, 3] }), 'format'],
    ['unbekannter Marker', jpeg({ vorne: segment(0xc8, [1, 2, 3]) }), 'format'],
    ['falsche Größe', jpeg({ breite: 512, hoehe: 512 }), 'dimensions'],
    ['nicht quadratisch', jpeg({ hoehe: 255 }), 'dimensions'],
    [
      'PNG statt JPEG',
      Buffer.from([0x89, 0x50, 0x4e, 0x47, ...Array.from({ length: 200 }, () => 0)]).toString(
        'base64',
      ),
      'format',
    ],
    ['ohne Bildende', jpeg().slice(0, -4), 'format'],
    ['zu klein', Buffer.from([0xff, 0xd8, 0xff, 0xd9]).toString('base64'), 'size'],
    [
      'zu groß',
      jpeg({
        vorne: Array.from({ length: 3 }, () =>
          segment(
            0xdd,
            Array.from({ length: 30000 }, () => 0),
          ),
        ).flat(),
      }),
      'size',
    ],
    ['kein Base64', '###', 'format'],
    [
      'Adobe-Segment mit Nutzlast',
      jpeg({
        vorne: segment(0xee, [0x41, 0x64, 0x6f, 0x62, 0x65, 0, 100, 0, 0, 0, 0, 1, 0x3c, 0x78]),
      }),
      'metadata',
    ],
    ['zwei Bildrahmen', jpeg({ vorne: sof(2048, 2048) }), 'format'],
    ['DRI mit Nutzlast', jpeg({ vorne: segment(0xdd, [0, 4, 1, 2, 3]) }), 'format'],
  ])('lehnt %s ab und nennt nur den Grund', async (_fall, bild, grund) => {
    const f = await fehler(users.therapist, SETZEN, [bild]);
    expect(f?.code).toBe('22023');
    expect(f?.message).toBe(`profile picture rejected: ${grund}`);
    expect(await bildVon(users.office, STAFF.anna)).toBeNull();
  });

  it('nimmt das Adobe-Segment an: Es sagt dem Dekoder nur, wie die Farben umzurechnen sind', async () => {
    const mitAdobe = jpeg({
      vorne: segment(0xee, [0x41, 0x64, 0x6f, 0x62, 0x65, 0, 100, 0, 0, 0, 0, 1]),
    });
    expect(await setzen(users.therapist, mitAdobe)).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('markiert nur die eigene Zeile', async () => {
    const { rows } = await asUser<AvatarMitBild & { own: boolean }>(
      users.trainer,
      'select * from public.list_team_avatars()',
    );
    expect(rows.filter((z) => z.own).map((z) => z.staff_member_id)).toEqual([STAFF.tom]);
  });

  it('liest und setzt nur in der eigenen Praxis', async () => {
    const id = await setzen(users.therapist);
    const fremd = await fremdeOrganisation();
    expect((await fehler(fremd.owner, LESEN, [id]))?.code).toBe('P0002');
    const dort = await setzen(fremd.owner);
    expect((await fehler(users.therapist, LESEN, [dort]))?.code).toBe('P0002');
    expect(await bildVon(users.therapist, STAFF.anna)).toBe(id);
    expect(await bildVon(fremd.owner, FREMDE_ORGANISATION.staffMember)).toBe(dort);
  });

  it('weist Konten ohne Praxisrolle, Plattformkonten und Aufrufe ohne Sitzung ab', async () => {
    const id = await setzen(users.therapist);
    for (const konto of [users.patientMax, users.plattformTina, users.plattformPaula]) {
      for (const [sql, params] of [
        [SETZEN, [jpeg()]],
        [LESEN, [id]],
        ['select public.remove_own_profile_picture()', []],
      ] as const) {
        expect((await fehler(konto, sql, [...params]))?.code, `${konto} ${sql}`).toBe('42501');
      }
    }
    expect((await fehler(null, LESEN, [id]))?.code).toBe('42501');
    await expect(asAnon(LESEN, [id])).rejects.toThrow(/permission denied/i);
    await expect(asAnon(SETZEN, [jpeg()])).rejects.toThrow(/permission denied/i);
  });

  it('nimmt mit dem Ausscheiden das Bild, mit Löschjournal; Ausgeschiedene setzen keines', async () => {
    const id = await setzen(users.therapist);
    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id = $1`,
      [STAFF.anna],
    );
    expect(await bildVon(users.office, STAFF.anna)).toBeNull();
    expect((await fehler(users.office, LESEN, [id]))?.code).toBe('P0002');
    expect(
      await anzahl('select count(*) n from public.staff_profile_pictures where id = $1', [id]),
    ).toBe(0);
    expect(
      await anzahl(
        `select count(*) n from public.deletion_journal
         where target_table = 'staff_profile_pictures' and target_id = $1`,
        [id],
      ),
    ).toBe(1);
    expect((await fehler(users.therapist, SETZEN, [jpeg()]))?.code).toBe('42501');
  });

  it('setzt kein Bild mehr, wenn die Person währenddessen ausscheidet (Zweitreview)', async () => {
    const fehlerBeimSetzen = await gleichzeitig(
      {
        konto: users.ownerTherapist,
        sql: 'select public.set_staff_employment_status($1::uuid, $2, true)',
        params: [STAFF.anna, 'inactive'],
      },
      { konto: users.therapist, sql: SETZEN, params: [jpeg()] },
    );
    expect(fehlerBeimSetzen?.code).toBe('42501');
    expect(
      await anzahl(
        'select count(*) n from public.staff_profile_pictures where staff_member_id = $1',
        [STAFF.anna],
      ),
    ).toBe(0);
  });

  it('bringt nach einer Wiederherstellung kein entferntes Bild zurück (ADR-008 Punkt 8)', async () => {
    const bild = jpeg();
    const alt = await setzen(users.therapist, bild);
    await asUserCommitted(users.therapist, 'select public.remove_own_profile_picture()');
    const olivia = await setzen(users.office);
    // Wie ein Restore: Annas Bild ist wieder da, Olivia ist inzwischen
    // ausgeschieden, ihr Bild aber aus der Sicherung noch vorhanden.
    await asPostgres(
      `insert into public.staff_profile_pictures (id, organization_id, staff_member_id, image)
       values ($1, $2, $3, decode($4, 'base64'))`,
      [alt, organizationId, STAFF.anna, bild],
    );
    await asPostgres(
      `alter table public.staff_members disable trigger staff_members_profile_picture_on_leave`,
    );
    await asPostgres(
      `update public.staff_members set employment_status = 'inactive' where id = $1`,
      [STAFF.olivia],
    );
    await asPostgres(
      `alter table public.staff_members enable trigger staff_members_profile_picture_on_leave`,
    );
    expect(await anzahl('select count(*) n from public.staff_profile_pictures')).toBe(2);

    await asPostgres('select public.reapply_deletion_journal()');
    expect(await anzahl('select count(*) n from public.staff_profile_pictures')).toBe(0);
    // Auch das Bild der Ausgeschiedenen fällt mit Eintrag im Löschjournal.
    expect(
      await anzahl(
        `select count(*) n from public.deletion_journal
         where target_table = 'staff_profile_pictures' and target_id = $1`,
        [olivia],
      ),
    ).toBe(1);
    expect(
      await anzahl(
        `select count(*) n from public.deletion_journal
         where target_id = $1 and reapplied_at is not null`,
        [alt],
      ),
    ).toBe(1);
  });

  it('hält ein Bild unveränderlich und gibt der Tabelle kein Recht', async () => {
    await setzen(users.therapist);
    await expect(
      asPostgres(`update public.staff_profile_pictures set image = image || '\\x00'::bytea`),
    ).rejects.toThrow(/immutable/);
    for (const sql of [
      'select * from public.staff_profile_pictures',
      `insert into public.staff_profile_pictures (organization_id, staff_member_id, image)
       values ('${organizationId}', '${STAFF.olivia}', '\\xffd8'::bytea)`,
      'update public.staff_profile_pictures set created_at = now()',
      'delete from public.staff_profile_pictures',
    ]) {
      expect((await fehler(users.ownerTherapist, sql))?.code, sql).toBe('42501');
    }
    const { rows } = await asPostgres<{ name: string }>(
      `select distinct p.proname as name
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
            unnest(array['anon', 'authenticated']) r
       where n.nspname = 'app' and p.proname like '%profile_picture%'
         and has_function_privilege(r, p.oid, 'EXECUTE')`,
    );
    expect(rows).toEqual([]);
    const { rows: definer } = await asPostgres<{ proname: string; proconfig: string[] | null }>(
      `select p.proname, p.proconfig from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where p.prosecdef and p.proname in ('set_own_profile_picture', 'remove_own_profile_picture',
         'get_team_profile_picture', 'list_team_avatars', 'forget_profile_picture',
         'staff_profile_picture_on_leave')`,
    );
    expect(definer).toHaveLength(6);
    for (const fn of definer) expect(fn.proconfig, fn.proname).toContain('search_path=""');
  });

  it('steht im Retention Schedule und fällt mit dem Mitarbeiterdatensatz', async () => {
    const { rows } = await asPostgres<{ class_key: string; deletion_mode: string; anchor: string }>(
      `select a.class_key, a.deletion_mode, c.anchor from public.retention_assignments a
       join public.retention_classes c on c.key = a.class_key
       where a.table_name = 'staff_profile_pictures'`,
    );
    expect(rows).toEqual([
      { class_key: 'profilbild', deletion_mode: 'automatisch', anchor: 'none' },
    ]);
    const neu = await neuePerson(6);
    await asPostgres(
      `insert into public.staff_profile_pictures (organization_id, staff_member_id, image)
       values ($1, $2, decode($3, 'base64'))`,
      [organizationId, neu, jpeg()],
    );
    await asPostgres('delete from public.staff_members where id = $1', [neu]);
    expect(
      await anzahl(
        'select count(*) n from public.staff_profile_pictures where staff_member_id = $1',
        [neu],
      ),
    ).toBe(0);
  });

  it('schreibt keinen Auditeintrag (ADR-010 Punkt 17)', async () => {
    const vorher = await anzahl('select count(*) n from public.audit_log');
    const id = await setzen(users.therapist);
    await asUser(users.office, LESEN, [id]);
    await asUserCommitted(users.therapist, 'select public.remove_own_profile_picture()');
    expect(await anzahl('select count(*) n from public.audit_log')).toBe(vorher);
  });
});

describe('Bilder in den Listen (TEAM-008)', () => {
  const SENDEN =
    'select public.post_team_message($1::uuid, $2::uuid, $3, $4::uuid[], null, false, false, null) as id';
  const LISTEN = {
    aktivitaet: 'select * from public.list_team_activity()',
    threads: 'select * from public.list_team_threads()',
    suche: 'select * from public.search_team_messages($1)',
    angeheftet: 'select * from public.list_team_pins($1)',
    gemerkt: 'select * from public.list_team_saved()',
  };

  interface Eintrag {
    id: string;
    author_staff_member_id: string | null;
    author_name: string | null;
  }

  async function allgemein(): Promise<string> {
    const { rows } = await asUser<{ id: string; name: string | null }>(
      users.therapist,
      'select * from public.list_team_channels()',
    );
    return rows.find((k) => k.name === 'Allgemein')!.id;
  }

  async function senden(
    konto: string,
    kanalId: string,
    text: string,
    parent: string | null = null,
    erwaehnt: string[] = [],
  ): Promise<string> {
    const { rows } = await asUserCommitted<{ id: string }>(konto, SENDEN, [
      kanalId,
      parent,
      text,
      erwaehnt,
    ]);
    return rows[0]!.id;
  }

  async function eintrag(konto: string, sql: string, id: string, params: unknown[] = []) {
    const { rows } = await asUser<Eintrag>(konto, sql, params);
    const treffer = rows.find((z) => z.id === id);
    if (!treffer) throw new Error(`${sql}: ${id} fehlt`);
    return { kennung: treffer.author_staff_member_id, name: treffer.author_name };
  }

  it('nennt in allen fünf Listen die Verfasser:in neben dem Namen', async () => {
    const kanalId = await allgemein();
    const frage = await senden(users.office, kanalId, 'Wer hat den Schlüssel?', null, [STAFF.anna]);
    const antwort = await senden(users.therapist, kanalId, 'Liegt im Fach', frage);
    await asUserCommitted(users.therapist, 'select public.set_team_message_pinned($1, true)', [
      frage,
    ]);
    await asUserCommitted(users.therapist, 'select public.save_team_message($1, null)', [frage]);

    const olivia = { kennung: STAFF.olivia, name: 'Olivia Office' };
    const anna = { kennung: STAFF.anna, name: 'Anna Beispiel' };
    expect(await eintrag(users.therapist, LISTEN.aktivitaet, frage)).toEqual(olivia);
    expect(await eintrag(users.office, LISTEN.aktivitaet, antwort)).toEqual(anna);
    expect(await eintrag(users.office, LISTEN.threads, frage)).toEqual(olivia);
    expect(await eintrag(users.therapist, LISTEN.suche, frage, ['Schlüssel'])).toEqual(olivia);
    expect(await eintrag(users.therapist, LISTEN.angeheftet, frage, [kanalId])).toEqual(olivia);
    expect(await eintrag(users.therapist, LISTEN.gemerkt, frage)).toEqual(olivia);
  });

  it('nennt an einer entfernten Ausgangsnachricht niemanden', async () => {
    const kanalId = await allgemein();
    const frage = await senden(users.office, kanalId, 'Versehentlich ein Name');
    await senden(users.therapist, kanalId, 'Antwort', frage);
    await asUserCommitted(users.ownerTherapist, 'select public.delete_team_message($1)', [frage]);
    expect(await eintrag(users.office, LISTEN.threads, frage)).toEqual({
      kennung: null,
      name: null,
    });
  });

  it('lässt die Rechte der fünf Listen, wie sie waren', async () => {
    const kanalId = await allgemein();
    await senden(users.office, kanalId, 'Nur für die Praxis');
    await fremdeOrganisation();
    for (const konto of [users.patientMax, users.plattformTina, null]) {
      expect((await fehler(konto, LISTEN.aktivitaet))?.code).toBe('42501');
      expect((await fehler(konto, LISTEN.suche, ['Praxis']))?.code).toBe('42501');
    }
    expect((await asUser(FREMDE_ORGANISATION.owner, LISTEN.suche, ['Praxis'])).rows).toEqual([]);
    expect((await fehler(FREMDE_ORGANISATION.owner, LISTEN.angeheftet, [kanalId]))?.code).toBe(
      'P0002',
    );
    await expect(asAnon(LISTEN.aktivitaet)).rejects.toThrow(/permission denied/i);
    const { rows } = await asPostgres<{ name: string; anon: boolean; angemeldet: boolean }>(
      `select p.proname as name, has_function_privilege('anon', p.oid, 'EXECUTE') as anon,
              has_function_privilege('authenticated', p.oid, 'EXECUTE') as angemeldet
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.prosecdef and 'search_path=""' = any (p.proconfig)
         and p.proname in ('search_team_messages', 'list_team_activity', 'list_team_threads',
                           'list_team_pins', 'list_team_saved')
       order by 1`,
    );
    expect(rows).toEqual(
      [
        'list_team_activity',
        'list_team_pins',
        'list_team_saved',
        'list_team_threads',
        'search_team_messages',
      ].map((name) => ({ name, anon: false, angemeldet: true })),
    );
  });
});
