import { beforeEach, describe, expect, it } from 'vitest';
import { BIKE_ZONES, CHECK_ITEMS, ZONE_KEYS } from '@/features/fleet/bike3d/zones';
import { ABSCHLUSSARTEN } from '@/features/fleet/pannenablauf';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Radflotte: Rollen samt Negativfällen (ANN-550, ADR-013 Punkt 9 Nr. 1), geschlossene Tabellen,
 * Eingabeprüfung, „eine Stelle hebt ihren Prüfpunkt an, nie ab“ (ANN-555), Sperre und Freigabe,
 * die Unterlage für die Werkstatt ohne Namen und Ort und der Löschlauf mit Journal (ANN-551).
 */

const { users, organizationId } = SEED;

/** Feste Kennungen aus der Radflotte in supabase/seed.sql. */
const FLOTTE = {
  depotNord: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000001',
  depotSued: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000002',
  rad1: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000011', // Schlüssel bei Anna
  rad2: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000012', // Stammnutzer Jannes
  rad3: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000013', // nach Panne gesperrt, drei Stellen
  rad4: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000014', // nicht im Stammdepot
  rad5: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000015', // Ersatzrad
  rad6: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000016', // von Hand gesperrt
} as const;

const STAFF = {
  jannes: '55555555-5555-4555-8555-000000000001',
  anna: '55555555-5555-4555-8555-000000000002',
  olivia: '55555555-5555-4555-8555-000000000003',
  tim: '55555555-5555-4555-8555-000000000004',
} as const;

const LISTE = `select public.list_fleet($1::date) as daten`;
const RAD = `select public.get_fleet_bike($1::uuid) as daten`;
const WERKSTATT = `select public.get_fleet_workshop_sheet($1::uuid) as daten`;
const RAD_SPEICHERN = `select public.save_fleet_bike($1::uuid, $2, $3, $4::uuid, $5::uuid, $6, $7::boolean,
  $8::uuid, $9::smallint[], $10, $11, $12::timestamptz) as id`;
const CHECKUP = `select public.record_fleet_checkup($1::uuid, $2::jsonb, $3, $4::jsonb, $5::boolean, 'wiped', null) as daten`;
const PANNE = `select public.record_fleet_breakdown($1::uuid, $2, $3, $4, $5, $6, $7::jsonb) as daten`;
const UEBERGEBEN = `select public.hand_over_fleet_key($1::uuid, $2::uuid)`;

interface Fehler {
  code?: string;
  message: string;
}

async function fehler(konto: string | null, sql: string, params: unknown[] = []) {
  try {
    await asUser(konto, sql, params);
    return null;
  } catch (f) {
    return f as Fehler;
  }
}

async function daten<T>(konto: string, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await asUser<{ daten: T }>(konto, sql, params);
  return rows[0]!.daten;
}

async function datenCommitted<T>(konto: string, sql: string, params: unknown[] = []): Promise<T> {
  const { rows } = await asUserCommitted<{ daten: T }>(konto, sql, params);
  return rows[0]!.daten;
}

/** Alle zwölf Prüfpunkte „In Ordnung“, einzelne überschrieben. */
function punkte(abweichend: Record<string, 'ok' | 'beobachten' | 'problem'> = {}) {
  return JSON.stringify(
    CHECK_ITEMS.map((item) => ({
      key: item.key,
      rating: abweichend[item.key] ?? 'ok',
      note: null,
    })),
  );
}

interface Rad {
  id: string;
  name: string;
  key: { holder_staff_id: string; holder_name: string } | null;
  block: { id: string; reason: string | null; breakdown_id: string | null } | null;
  open_spots: number;
  open_problems: number;
  regular_rider: { id: string; name: string } | null;
  planned_weekdays: number[];
}

interface Flotte {
  can_manage: boolean;
  can_release: boolean;
  my_staff_member_id: string | null;
  depots: { id: string; name: string }[];
  bikes: Rad[];
  staff: { id: string; name: string }[];
  unavailable: { staff_member_id: string; on_date: string }[];
}

interface Stelle {
  id: string;
  number: number | null;
  zone: string;
  severity: string;
  resolved_at: string | null;
}

describe('Radflotte (FLT-001)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  describe('Lesen', () => {
    it('liefert Depots, Räder mit Schlüssel, Sperre und offenen Stellen und die Rechte', async () => {
      const flotte = await daten<Flotte>(users.therapist, LISTE, [null]);
      expect(flotte.depots.map((d) => d.name)).toEqual(['Raddepot Nord', 'Raddepot Süd']);
      expect(flotte.bikes.map((b) => b.name)).toEqual([
        'Lastenrad 1',
        'Lastenrad 2',
        'Lastenrad 3',
        'Lastenrad 4',
        'Lastenrad 5 (Ersatz)',
        'Lastenrad 6',
      ]);
      const rad1 = flotte.bikes.find((b) => b.id === FLOTTE.rad1)!;
      expect(rad1.key).toMatchObject({ holder_staff_id: STAFF.anna, holder_name: 'Anna Beispiel' });
      const rad3 = flotte.bikes.find((b) => b.id === FLOTTE.rad3)!;
      expect(rad3.block).not.toBeNull();
      expect(rad3).toMatchObject({ open_spots: 3, open_problems: 2 });
      expect(flotte).toMatchObject({
        can_manage: false,
        can_release: false,
        my_staff_member_id: STAFF.anna,
      });
    });

    it('nennt die Rechte je Rolle (BEF-066, ANN-550)', async () => {
      const owner = await daten<Flotte>(users.ownerTherapist, LISTE, [null]);
      const leitung = await daten<Flotte>(users.teamLead, LISTE, [null]);
      const buero = await daten<Flotte>(users.office, LISTE, [null]);
      expect([owner.can_manage, owner.can_release]).toEqual([true, true]);
      expect([leitung.can_manage, leitung.can_release]).toEqual([false, true]);
      expect([buero.can_manage, buero.can_release]).toEqual([false, false]);
    });

    it('liefert ganztägige Abwesenheiten nur von Stammnutzer:innen und nur in der Woche', async () => {
      // Montag 2026-10-12 bis Sonntag 2026-10-18.
      await asPostgres(
        `insert into public.staff_working_hour_exceptions (organization_id, staff_member_id, on_date, kind)
         values ($1, $2, '2026-10-14', 'unavailable'), ($1, $2, '2026-10-20', 'unavailable'),
                ($1, $3, '2026-10-14', 'unavailable')`,
        [organizationId, STAFF.anna, STAFF.olivia],
      );
      const flotte = await daten<Flotte>(users.office, LISTE, ['2026-10-12']);
      // Olivia fährt kein Rad - ihre Abwesenheit gehört nicht hierher.
      expect(flotte.unavailable).toEqual([{ staff_member_id: STAFF.anna, on_date: '2026-10-14' }]);
      const ohneWoche = await daten<Flotte>(users.office, LISTE, [null]);
      expect(ohneWoche.unavailable).toEqual([]);
    });

    it('nummeriert die offenen Stellen eines Rads in der Reihenfolge ihres Entstehens', async () => {
      const rad = await daten<{ spots: Stelle[] }>(users.office, RAD, [FLOTTE.rad3]);
      expect(rad.spots.map((s) => [s.number, s.zone, s.severity])).toEqual([
        [1, 'bremse-vorne', 'problem'],
        [2, 'reifen-hinten', 'beobachten'],
        [3, 'riemen', 'problem'],
      ]);
    });
  });

  describe('Negativfälle (ADR-013 Punkt 9 Nr. 1)', () => {
    it('weist Trainingsbetreuung, Patientenkonto, Plattformkonto und Anonyme ab', async () => {
      for (const konto of [users.trainer, users.patientMax, users.plattformTina, null]) {
        for (const [sql, params] of [
          [LISTE, [null]],
          [RAD, [FLOTTE.rad1]],
          [WERKSTATT, [FLOTTE.rad3]],
          [`select public.take_fleet_key($1::uuid, null)`, [FLOTTE.rad2]],
          [UEBERGEBEN, [FLOTTE.rad1, STAFF.tim]],
          [CHECKUP, [FLOTTE.rad2, punkte(), null, '[]', true]],
        ] as const) {
          expect((await fehler(konto, sql, [...params]))?.code, `${konto} ${sql}`).toBe('42501');
        }
      }
    });

    it('lässt nur owner Räder und Depots pflegen (BEF-066)', async () => {
      for (const konto of [users.therapist, users.teamLead, users.office]) {
        expect(
          (await fehler(konto, `select public.save_fleet_depot(null, 'Depot West', null)`))?.code,
          konto,
        ).toBe('42501');
        expect(
          (
            await fehler(konto, RAD_SPEICHERN, [
              null,
              'Lastenrad 9',
              null,
              FLOTTE.depotNord,
              FLOTTE.depotNord,
              null,
              false,
              null,
              [],
              null,
              null,
              null,
            ])
          )?.code,
          konto,
        ).toBe('42501');
        expect(
          (await fehler(konto, `select public.remove_fleet_bike($1::uuid)`, [FLOTTE.rad2]))?.code,
          konto,
        ).toBe('42501');
        expect(
          (await fehler(konto, `select public.delete_fleet_depot($1::uuid)`, [FLOTTE.depotSued]))
            ?.code,
          konto,
        ).toBe('42501');
      }
    });

    it('lässt nur owner und team_lead sperren und freigeben (ANN-550)', async () => {
      for (const konto of [users.therapist, users.office]) {
        expect(
          (await fehler(konto, `select public.release_fleet_bike($1::uuid)`, [FLOTTE.rad3]))?.code,
          konto,
        ).toBe('42501');
        expect(
          (
            await fehler(konto, `select public.block_fleet_bike($1::uuid, 'Inspektion')`, [
              FLOTTE.rad2,
            ])
          )?.code,
          konto,
        ).toBe('42501');
      }
    });

    it('zeigt der fremden Organisation nichts und lässt sie nichts ändern (ADR-003)', async () => {
      const fremd = await fremdeOrganisation();
      const flotte = await daten<Flotte>(fremd.owner, LISTE, [null]);
      expect(flotte.bikes).toEqual([]);
      expect(flotte.depots).toEqual([]);
      expect(flotte.staff.map((s) => s.id)).toEqual([fremd.staffMember]);
      for (const [sql, params] of [
        [RAD, [FLOTTE.rad1]],
        [WERKSTATT, [FLOTTE.rad3]],
        [`select public.take_fleet_key($1::uuid, null)`, [FLOTTE.rad2]],
        [`select public.return_fleet_key($1::uuid)`, [FLOTTE.rad1]],
        [UEBERGEBEN, [FLOTTE.rad1, fremd.staffMember]],
        [`select public.release_fleet_bike($1::uuid)`, [FLOTTE.rad3]],
        [`select public.remove_fleet_bike($1::uuid)`, [FLOTTE.rad2]],
        [`select public.save_fleet_depot($1::uuid, 'Fremd', null)`, [FLOTTE.depotNord]],
        [CHECKUP, [FLOTTE.rad2, punkte(), null, '[]', true]],
        [PANNE, [FLOTTE.rad2, 'meldungOhneSperre', 'Klingel klemmt', null, null, null, '[]']],
      ] as const) {
        expect((await fehler(fremd.owner, sql, [...params]))?.code, sql).toBe('P0002');
      }
      // Ein fremdes Depot und eine fremde Mitarbeiterin lassen sich nicht zuordnen -
      // auch kein Schlüssel an sie übergeben.
      expect((await fehler(users.office, UEBERGEBEN, [FLOTTE.rad1, fremd.staffMember]))?.code).toBe(
        'P0002',
      );
      expect(
        (
          await fehler(users.ownerTherapist, RAD_SPEICHERN, [
            FLOTTE.rad2,
            'Lastenrad 2',
            null,
            FLOTTE.depotNord,
            FLOTTE.depotNord,
            null,
            false,
            fremd.staffMember,
            [1],
            null,
            null,
            null,
          ])
        )?.code,
      ).toBe('P0002');
    });

    it('gibt keiner Rolle Tabellenrecht - nur die Funktionen (ADR-004)', async () => {
      for (const tabelle of [
        'fleet_depots',
        'fleet_bikes',
        'fleet_key_handovers',
        'fleet_checkups',
        'fleet_breakdowns',
        'fleet_blocks',
        'fleet_spots',
      ]) {
        await expect(
          asUser(users.ownerTherapist, `select * from public.${tabelle}`),
          tabelle,
        ).rejects.toThrow(/permission denied/i);
        await expect(
          asUser(users.ownerTherapist, `delete from public.${tabelle}`),
          tabelle,
        ).rejects.toThrow(/permission denied/i);
      }
    });
  });

  describe('Räder und Depots (owner)', () => {
    it('legt ein Rad an und ändert es; Stand, Ersatzrad und Wochenplan werden geprüft', async () => {
      const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, RAD_SPEICHERN, [
        null,
        '  Lastenrad 9 ',
        null,
        FLOTTE.depotNord,
        null,
        'Hof der Praxis',
        false,
        STAFF.anna,
        [5, 1, 1],
        'Akku 500 Wh',
        null,
        null,
      ]);
      const id = rows[0]!.id;
      const { rows: zeile } = await asPostgres<{
        name: string;
        special_location: string;
        planned_weekdays: number[];
        updated_at: string;
        created_by: string;
      }>(
        `select name, special_location, planned_weekdays, updated_at::text, created_by from public.fleet_bikes where id = $1`,
        [id],
      );
      expect(zeile[0]).toMatchObject({
        name: 'Lastenrad 9',
        special_location: 'Hof der Praxis',
        planned_weekdays: [1, 5],
        created_by: users.ownerTherapist,
      });

      // Ein Ersatzrad hat keine Stammnutzer:in und keinen Wochenplan.
      await asUserCommitted(users.ownerTherapist, RAD_SPEICHERN, [
        id,
        'Lastenrad 9',
        null,
        FLOTTE.depotNord,
        FLOTTE.depotSued,
        null,
        true,
        STAFF.anna,
        [1, 2],
        null,
        null,
        null,
      ]);
      const { rows: ersatz } = await asPostgres<{
        regular_rider_id: string | null;
        planned_weekdays: number[];
        current_depot_id: string;
      }>(
        `select regular_rider_id, planned_weekdays, current_depot_id from public.fleet_bikes where id = $1`,
        [id],
      );
      expect(ersatz[0]).toEqual({
        regular_rider_id: null,
        planned_weekdays: [],
        current_depot_id: FLOTTE.depotSued,
      });

      // Gleichzeitige Änderung: ein veralteter Stand heißt 40001.
      expect(
        (
          await fehler(users.ownerTherapist, RAD_SPEICHERN, [
            id,
            'Lastenrad 9',
            null,
            FLOTTE.depotNord,
            FLOTTE.depotNord,
            null,
            false,
            null,
            [],
            null,
            null,
            zeile[0]!.updated_at,
          ])
        )?.code,
      ).toBe('40001');
    });

    it('weist unvollständige und widersprüchliche Angaben ab', async () => {
      const basis = [
        null,
        'Lastenrad 9',
        null,
        FLOTTE.depotNord,
        FLOTTE.depotNord,
        null,
        false,
        null,
        [],
        null,
        null,
        null,
      ];
      const mit = (index: number, wert: unknown) => basis.map((v, i) => (i === index ? wert : v));
      expect((await fehler(users.ownerTherapist, RAD_SPEICHERN, mit(1, '  ')))?.code).toBe('22023');
      expect((await fehler(users.ownerTherapist, RAD_SPEICHERN, mit(2, 'load75')))?.code).toBe(
        '22023',
      );
      // Standort: genau eines von Depot und benanntem Ort.
      expect((await fehler(users.ownerTherapist, RAD_SPEICHERN, mit(5, 'Hof')))?.code).toBe(
        '22023',
      );
      expect((await fehler(users.ownerTherapist, RAD_SPEICHERN, mit(4, null)))?.code).toBe('22023');
      expect((await fehler(users.ownerTherapist, RAD_SPEICHERN, mit(8, [8])))?.code).toBe('22023');
      // Den Namen gibt es schon - groß und klein gleich.
      expect((await fehler(users.ownerTherapist, RAD_SPEICHERN, mit(1, 'lastenrad 2')))?.code).toBe(
        '23505',
      );
    });

    it('legt Depots an, benennt sie um und entfernt nur leere', async () => {
      const { rows } = await asUserCommitted<{ id: string }>(
        users.ownerTherapist,
        `select public.save_fleet_depot(null, 'Raddepot West', 'Garage') as id`,
      );
      const id = rows[0]!.id;
      await asUserCommitted(
        users.ownerTherapist,
        `select public.save_fleet_depot($1::uuid, 'Depot West', null)`,
        [id],
      );
      expect(
        (
          await fehler(
            users.ownerTherapist,
            `select public.save_fleet_depot(null, 'raddepot nord', null)`,
          )
        )?.code,
      ).toBe('23505');
      expect(
        (
          await fehler(users.ownerTherapist, `select public.delete_fleet_depot($1::uuid)`, [
            FLOTTE.depotSued,
          ])
        )?.code,
      ).toBe('55000');
      await asUserCommitted(users.ownerTherapist, `select public.delete_fleet_depot($1::uuid)`, [
        id,
      ]);
      const { rows: rest } = await asPostgres(`select 1 from public.fleet_depots where id = $1`, [
        id,
      ]);
      expect(rest).toEqual([]);
    });

    it('löscht ein Rad ohne Verlauf und mustert eines mit Verlauf aus (ANN-557)', async () => {
      const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, RAD_SPEICHERN, [
        null,
        'Lastenrad 9',
        null,
        FLOTTE.depotNord,
        FLOTTE.depotNord,
        null,
        false,
        null,
        [],
        null,
        null,
        null,
      ]);
      const ohne = await datenCommitted<string>(
        users.ownerTherapist,
        `select public.remove_fleet_bike($1::uuid) as daten`,
        [rows[0]!.id],
      );
      expect(ohne).toBe('deleted');

      // Lastenrad 1: Schlüssel entnommen - erst zurücklegen.
      expect(
        (
          await fehler(users.ownerTherapist, `select public.remove_fleet_bike($1::uuid)`, [
            FLOTTE.rad1,
          ])
        )?.code,
      ).toBe('55000');

      // Lastenrad 3: Verlauf, offene Sperre und Stellen.
      const mit = await datenCommitted<string>(
        users.ownerTherapist,
        `select public.remove_fleet_bike($1::uuid) as daten`,
        [FLOTTE.rad3],
      );
      expect(mit).toBe('archived');
      const flotte = await daten<Flotte>(users.office, LISTE, [null]);
      expect(flotte.bikes.map((b) => b.id)).not.toContain(FLOTTE.rad3);
      expect((await fehler(users.office, RAD, [FLOTTE.rad3]))?.code).toBe('P0002');
      const { rows: stand } = await asPostgres<{
        regular_rider_id: string | null;
        offene_sperren: string;
        offene_stellen: string;
        checkups: string;
      }>(
        `select b.regular_rider_id,
                (select count(*) from public.fleet_blocks x where x.bike_id = b.id and x.released_at is null) as offene_sperren,
                (select count(*) from public.fleet_spots x where x.bike_id = b.id and x.resolved_at is null) as offene_stellen,
                (select count(*) from public.fleet_checkups x where x.bike_id = b.id) as checkups
         from public.fleet_bikes b where b.id = $1`,
        [FLOTTE.rad3],
      );
      expect(stand[0]).toEqual({
        regular_rider_id: null,
        offene_sperren: '0',
        offene_stellen: '0',
        checkups: '1',
      });
    });
  });

  describe('Schlüssel', () => {
    it('nimmt den Schlüssel für sich selbst und legt ihn zurück', async () => {
      await asUserCommitted(users.therapist, `select public.take_fleet_key($1::uuid, null)`, [
        FLOTTE.rad2,
      ]);
      let flotte = await daten<Flotte>(users.office, LISTE, [null]);
      expect(flotte.bikes.find((b) => b.id === FLOTTE.rad2)!.key?.holder_staff_id).toBe(STAFF.anna);
      expect(
        (await fehler(users.office, `select public.take_fleet_key($1::uuid, null)`, [FLOTTE.rad2]))
          ?.code,
      ).toBe('55000');

      // Zurücklegen darf auch eine Kollegin.
      await asUserCommitted(users.office, `select public.return_fleet_key($1::uuid)`, [
        FLOTTE.rad2,
      ]);
      flotte = await daten<Flotte>(users.office, LISTE, [null]);
      expect(flotte.bikes.find((b) => b.id === FLOTTE.rad2)!.key).toBeNull();
      expect(
        (await fehler(users.office, `select public.return_fleet_key($1::uuid)`, [FLOTTE.rad2]))
          ?.code,
      ).toBe('55000');

      const { rows } = await asPostgres<{ taken_by: string; returned_by: string }>(
        `select taken_by, returned_by from public.fleet_key_handovers where bike_id = $1`,
        [FLOTTE.rad2],
      );
      expect(rows).toEqual([{ taken_by: users.therapist, returned_by: users.office }]);
    });

    it('nimmt den Schlüssel für eine Kollegin aus dem Stamm, nie für ein gesperrtes Rad', async () => {
      await asUserCommitted(users.office, `select public.take_fleet_key($1::uuid, $2::uuid)`, [
        FLOTTE.rad2,
        STAFF.tim,
      ]);
      const flotte = await daten<Flotte>(users.office, LISTE, [null]);
      expect(flotte.bikes.find((b) => b.id === FLOTTE.rad2)!.key?.holder_name).toBe(
        'Tim Teamleitung',
      );
      expect(
        (await fehler(users.office, `select public.take_fleet_key($1::uuid, null)`, [FLOTTE.rad3]))
          ?.code,
      ).toBe('55000');
    });

    it('übergibt einen Schlüssel von Hand zu Hand in einem Vorgang (ANN-575)', async () => {
      // Lastenrad 1: Schlüssel bei Anna (Seed). Das Büro trägt die Übergabe an Tim ein.
      await asUserCommitted(users.office, UEBERGEBEN, [FLOTTE.rad1, STAFF.tim]);
      const flotte = await daten<Flotte>(users.office, LISTE, [null]);
      expect(flotte.bikes.find((b) => b.id === FLOTTE.rad1)!.key?.holder_name).toBe(
        'Tim Teamleitung',
      );
      const { rows } = await asPostgres<{
        holder_staff_id: string;
        returned_by: string | null;
        taken_by: string;
      }>(
        `select holder_staff_id, returned_by, taken_by from public.fleet_key_handovers
          where bike_id = $1 order by taken_at, returned_at nulls last`,
        [FLOTTE.rad1],
      );
      // Der alte Vorgang endet mit dem Büro, der neue beginnt mit ihm - einer offen.
      expect(rows.at(-2)).toMatchObject({ holder_staff_id: STAFF.anna, returned_by: users.office });
      expect(rows.at(-1)).toMatchObject({
        holder_staff_id: STAFF.tim,
        returned_by: null,
        taken_by: users.office,
      });
    });

    it('übergibt nicht an dieselbe Person, nicht ohne Schlüssel und nicht bei gesperrtem Rad', async () => {
      expect((await fehler(users.office, UEBERGEBEN, [FLOTTE.rad1, STAFF.anna]))?.code).toBe(
        '55000',
      );
      expect((await fehler(users.office, UEBERGEBEN, [FLOTTE.rad2, STAFF.tim]))?.code).toBe(
        '55000',
      );
      expect((await fehler(users.office, UEBERGEBEN, [FLOTTE.rad3, STAFF.tim]))?.code).toBe(
        '55000',
      );
      expect((await fehler(users.office, UEBERGEBEN, [FLOTTE.rad1, null]))?.code).toBe('22023');
      // Ein Rad, das gesperrt wird, während der Schlüssel bei jemandem liegt
      // (Zweitreview Überholung 6): keine Übergabe bis zur Freigabe.
      await asUserCommitted(users.teamLead, `select public.block_fleet_bike($1::uuid, 'Bremse')`, [
        FLOTTE.rad1,
      ]);
      const gesperrt = await fehler(users.office, UEBERGEBEN, [FLOTTE.rad1, STAFF.tim]);
      expect(gesperrt?.code).toBe('55000');
      expect(gesperrt?.message).toMatch(/bike is blocked/);
      // Nichts hat sich bewegt: der Schlüssel liegt weiter bei Anna.
      const flotte = await daten<Flotte>(users.office, LISTE, [null]);
      expect(flotte.bikes.find((b) => b.id === FLOTTE.rad1)!.key?.holder_staff_id).toBe(STAFF.anna);
    });
  });

  describe('Check-Up', () => {
    it('erfasst alle Prüfpunkte mit Stellen und sperrt das Rad nicht', async () => {
      const ergebnis = await datenCommitted<{ checkup_id: string; spot_ids: string[] }>(
        users.therapist,
        CHECKUP,
        [
          FLOTTE.rad2,
          punkte({ bremsen: 'problem', klingel: 'beobachten' }),
          'Sonst gut',
          JSON.stringify([
            {
              zone: 'bremse-vorne',
              severity: 'problem',
              point: [1.05, 0.31, -0.06],
              note: 'schleift',
            },
            { zone: 'rahmen', severity: 'beobachten', note: null },
          ]),
          true,
        ],
      );
      expect(ergebnis.spot_ids).toHaveLength(2);
      const rad = await daten<{ spots: Stelle[]; bike: Rad }>(users.office, RAD, [FLOTTE.rad2]);
      expect(rad.bike.block).toBeNull();
      expect(rad.spots.map((s) => [s.number, s.zone])).toEqual([
        [1, 'bremse-vorne'],
        [2, 'rahmen'],
      ]);
      // Den Punkt im Modell sendet nur noch eine ältere Fassung der App: Er bleibt ohne Wirkung.
      expect(rad.spots.some((s) => 'point' in s || 'model_version' in s)).toBe(false);
      expect(
        (
          await asPostgres(
            `select column_name from information_schema.columns
             where table_schema = 'public' and table_name = 'fleet_spots'
               and column_name in ('point_x', 'point_y', 'point_z', 'model_version')`,
          )
        ).rows,
      ).toEqual([]);
      const { rows } = await asPostgres<{ checked_by: string; bike_type: string }>(
        `select checked_by, bike_type from public.fleet_checkups where id = $1`,
        [ergebnis.checkup_id],
      );
      expect(rows[0]).toEqual({ checked_by: users.therapist, bike_type: 'load60_riemen' });
    });

    it('nummeriert die Stellen einer Meldung in der Reihenfolge, in der sie gesetzt wurden', async () => {
      // Die Stellen einer Meldung entstehen in einer Transaktion und tragen
      // denselben Zeitpunkt. Ihre Nummer - an der Nadel, in der Liste und in
      // der Unterlage dieselbe - folgt dem Setzen, nicht der Kennung.
      const zonen = ['staender', 'rahmen', 'akku', 'klingel', 'gabel', 'display'];
      await datenCommitted(users.therapist, CHECKUP, [
        FLOTTE.rad2,
        punkte({ staender: 'beobachten', akku: 'beobachten', klingel: 'beobachten' }),
        null,
        JSON.stringify(zonen.map((zone) => ({ zone, severity: 'beobachten', note: null }))),
        true,
      ]);
      const erwartet = zonen.map((zone, index) => [index + 1, zone]);
      const rad = await daten<{ spots: Stelle[] }>(users.office, RAD, [FLOTTE.rad2]);
      expect(rad.spots.map((s) => [s.number, s.zone])).toEqual(erwartet);
      const blatt = await daten<{ spots: { number: number; zone: string }[] }>(
        users.office,
        WERKSTATT,
        [FLOTTE.rad2],
      );
      expect(blatt.spots.map((s) => [s.number, s.zone])).toEqual(erwartet);
    });

    it('hebt die Bewertung über die Stelle an, nie ab (ANN-555)', async () => {
      const stelle = (severity: string) =>
        JSON.stringify([{ zone: 'bremse-hinten', severity, note: null }]);
      // Problem an der Bremse, „Bremsen“ aber nur beobachten: abgewiesen.
      expect(
        (
          await fehler(users.therapist, CHECKUP, [
            FLOTTE.rad2,
            punkte({ bremsen: 'beobachten' }),
            null,
            stelle('problem'),
            true,
          ])
        )?.code,
      ).toBe('22023');
      // Beobachten an der Bremse, „Bremsen“ in Ordnung: abgewiesen.
      expect(
        (
          await fehler(users.therapist, CHECKUP, [
            FLOTTE.rad2,
            punkte(),
            null,
            stelle('beobachten'),
            true,
          ])
        )?.code,
      ).toBe('22023');
      // Beobachten an der Bremse, „Bremsen“ Problem: Ein Problem bleibt stehen.
      expect(
        await fehler(users.therapist, CHECKUP, [
          FLOTTE.rad2,
          punkte({ bremsen: 'problem' }),
          null,
          stelle('beobachten'),
          true,
        ]),
      ).toBeNull();
      // Eine Stelle ohne Prüfpunkt hebt nichts an.
      expect(
        await fehler(users.therapist, CHECKUP, [
          FLOTTE.rad2,
          punkte(),
          null,
          JSON.stringify([{ zone: 'lenker', severity: 'problem', note: null }]),
          true,
        ]),
      ).toBeNull();
    });

    it('weist unvollständige Prüfungen und fremde Bauteile ab', async () => {
      const nurElf = JSON.stringify((JSON.parse(punkte()) as unknown[]).slice(0, 11));
      const vertauscht = JSON.stringify([...(JSON.parse(punkte()) as unknown[])].reverse());
      const falsch = punkte().replace('"ok"', '"gut"');
      for (const [items, spots, bestaetigt] of [
        [nurElf, '[]', true],
        [vertauscht, '[]', true],
        [falsch, '[]', true],
        [punkte(), '[]', false],
        [punkte(), JSON.stringify([{ zone: 'propeller', severity: 'problem' }]), true],
        [punkte(), JSON.stringify([{ zone: 'rahmen', severity: 'kaputt' }]), true],
      ] as const) {
        expect(
          (await fehler(users.therapist, CHECKUP, [FLOTTE.rad2, items, null, spots, bestaetigt]))
            ?.code,
          `${items.slice(0, 30)} ${spots}`,
        ).toBe('22023');
      }
    });
  });

  describe('Panne, Sperre und Freigabe', () => {
    it('sperrt nach dem Abschluss des Assistenten; „Weiterfahrt möglich“ sperrt nicht', async () => {
      const ohne = await datenCommitted<{ blocked: boolean }>(users.therapist, PANNE, [
        FLOTTE.rad2,
        'meldungOhneSperre',
        'Weiterfahrt möglich: Klingel klemmt',
        'Klingel klemmt',
        null,
        null,
        JSON.stringify([{ zone: 'klingel', severity: 'beobachten', note: 'klemmt' }]),
      ]);
      expect(ohne.blocked).toBe(false);
      let rad = await daten<{ bike: Rad; spots: Stelle[] }>(users.office, RAD, [FLOTTE.rad2]);
      expect(rad.bike.block).toBeNull();
      // In der Panne ist jede Stelle ein Schaden (Handoff, Vorschlag 4).
      expect(rad.spots.map((s) => s.severity)).toEqual(['problem']);

      const mit = await datenCommitted<{ breakdown_id: string; blocked: boolean }>(
        users.therapist,
        PANNE,
        [FLOTTE.rad2, 'depotAbgestellt', 'Ins Raddepot gebracht.', null, null, null, '[]'],
      );
      expect(mit.blocked).toBe(true);
      rad = await daten<{ bike: Rad; spots: Stelle[] }>(users.office, RAD, [FLOTTE.rad2]);
      expect(rad.bike.block?.breakdown_id).toBe(mit.breakdown_id);

      // Eine zweite sperrende Panne: es bleibt bei einer Sperre.
      await asUserCommitted(users.therapist, PANNE, [
        FLOTTE.rad2,
        'transportFortsetzung',
        'Fahrrad zurückgelassen.',
        null,
        'Ecke Wilhelmstraße',
        'fahrdienst',
        '[]',
      ]);
      const { rows } = await asPostgres<{ anzahl: string }>(
        `select count(*) as anzahl from public.fleet_blocks where bike_id = $1 and released_at is null`,
        [FLOTTE.rad2],
      );
      expect(rows[0]!.anzahl).toBe('1');
    });

    it('weist unbekannte Abschlüsse, fehlenden Text und unbekannte Weiterfahrt ab', async () => {
      for (const [abschluss, text, weiter] of [
        ['geplatzt', 'Text', null],
        ['depotAbgestellt', '   ', null],
        ['transportFortsetzung', 'Text', 'Hubschrauber'],
      ] as const) {
        expect(
          (
            await fehler(users.therapist, PANNE, [
              FLOTTE.rad2,
              abschluss,
              text,
              null,
              null,
              weiter,
              '[]',
            ])
          )?.code,
        ).toBe('22023');
      }
    });

    it('gibt frei: Sperre zu, alle offenen Stellen erledigt, beides bleibt im Verlauf', async () => {
      const ergebnis = await datenCommitted<{ released: boolean; resolved_spots: number }>(
        users.teamLead,
        `select public.release_fleet_bike($1::uuid) as daten`,
        [FLOTTE.rad3],
      );
      expect(ergebnis).toEqual({ released: true, resolved_spots: 3 });
      const rad = await daten<{
        bike: Rad;
        spots: Stelle[];
        blocks: { released_at: string | null; released_by_name: string }[];
      }>(users.office, RAD, [FLOTTE.rad3]);
      expect(rad.bike.block).toBeNull();
      expect(rad.spots).toHaveLength(3);
      expect(rad.spots.every((s) => s.number === null && s.resolved_at !== null)).toBe(true);
      expect(rad.blocks[0]).toMatchObject({ released_by_name: 'Tim Teamleitung' });
      // Nichts mehr offen: kein zweites Freigeben.
      expect(
        (await fehler(users.teamLead, `select public.release_fleet_bike($1::uuid)`, [FLOTTE.rad3]))
          ?.code,
      ).toBe('55000');
      // Freigegeben, also wieder nehmbar.
      expect(
        await fehler(users.therapist, `select public.take_fleet_key($1::uuid, null)`, [
          FLOTTE.rad3,
        ]),
      ).toBeNull();
    });

    it('leert den Pannenort mit der Freigabe und beim Ausmustern (ANN-558)', async () => {
      // Der Ort eines zurückgelassenen Rads kann ein Hausbesuch sein. Er wird
      // gebraucht, bis das Rad wieder da ist - nicht die drei Jahre der Meldung.
      for (const rad of [FLOTTE.rad2, FLOTTE.rad4]) {
        await asUserCommitted(users.therapist, PANNE, [
          rad,
          'transportFortsetzung',
          'Fahrrad zurückgelassen.',
          null,
          'Hinterhof Beispielweg 3',
          'fahrdienst',
          '[]',
        ]);
      }
      const ort = async (rad: string) =>
        (
          await asPostgres<{ location_note: string | null }>(
            `select location_note from public.fleet_breakdowns where bike_id = $1`,
            [rad],
          )
        ).rows.map((zeile) => zeile.location_note);
      expect(await ort(FLOTTE.rad2)).toEqual(['Hinterhof Beispielweg 3']);

      await asUserCommitted(users.teamLead, `select public.release_fleet_bike($1::uuid)`, [
        FLOTTE.rad2,
      ]);
      expect(await ort(FLOTTE.rad2)).toEqual([null]);

      // Ausmustern: Das Rad hat einen Verlauf und wird archiviert, der Ort geht.
      expect(await ort(FLOTTE.rad4)).toEqual(['Hinterhof Beispielweg 3']);
      expect(
        (
          await asUserCommitted<{ ergebnis: string }>(
            users.ownerTherapist,
            `select public.remove_fleet_bike($1::uuid) as ergebnis`,
            [FLOTTE.rad4],
          )
        ).rows[0]!.ergebnis,
      ).toBe('archived');
      expect((await ort(FLOTTE.rad4)).every((wert) => wert === null)).toBe(true);
    });

    it('nimmt einen Ort nur zum zurückgelassenen Rad an, das gesperrt wird (ANN-558)', async () => {
      // Sonst bliebe der Ort ohne Sperre stehen, und keine Freigabe leerte ihn.
      for (const abschluss of ['meldungOhneSperre', 'depotAbgestellt', 'lokalRepariert']) {
        expect(
          (
            await fehler(users.therapist, PANNE, [
              FLOTTE.rad2,
              abschluss,
              'Text',
              null,
              'Vor der Praxis',
              null,
              '[]',
            ])
          )?.code,
          abschluss,
        ).toBe('22023');
      }
      // Ein leerer Ort ist kein Ort.
      expect(
        await fehler(users.therapist, PANNE, [
          FLOTTE.rad2,
          'meldungOhneSperre',
          'Weiterfahrt möglich: Klingel klemmt',
          null,
          '   ',
          null,
          '[]',
        ]),
      ).toBeNull();
    });

    it('sperrt von Hand mit Grund und nicht doppelt', async () => {
      expect(
        (
          await fehler(users.teamLead, `select public.block_fleet_bike($1::uuid, '  ')`, [
            FLOTTE.rad2,
          ])
        )?.code,
      ).toBe('22023');
      await asUserCommitted(
        users.teamLead,
        `select public.block_fleet_bike($1::uuid, 'Inspektion')`,
        [FLOTTE.rad2],
      );
      expect(
        (
          await fehler(
            users.ownerTherapist,
            `select public.block_fleet_bike($1::uuid, 'Noch mal')`,
            [FLOTTE.rad2],
          )
        )?.code,
      ).toBe('55000');
      const flotte = await daten<Flotte>(users.office, LISTE, [null]);
      expect(flotte.bikes.find((b) => b.id === FLOTTE.rad2)!.block?.reason).toBe('Inspektion');
    });
  });

  describe('Unterlage für die Werkstatt (Handoff, Vorschlag 5)', () => {
    it('nennt das Rad und seine offenen Stellen, aber keine Namen, keine Termine, keinen Ort', async () => {
      await asUserCommitted(users.therapist, PANNE, [
        FLOTTE.rad3,
        'transportFortsetzung',
        'Fahrrad zurückgelassen – Standort: vor Hausnummer 7.',
        null,
        'vor Hausnummer 7',
        'carsharing',
        JSON.stringify([{ zone: 'reifen-vorne', note: 'Platten' }]),
      ]);
      const blatt = await daten<Record<string, unknown>>(users.office, WERKSTATT, [FLOTTE.rad3]);
      expect(Object.keys(blatt).sort()).toEqual(['bike_type', 'blocked_since', 'name', 'spots']);
      const spots = blatt.spots as Record<string, unknown>[];
      expect(spots.map((s) => [s.number, s.zone])).toEqual([
        [1, 'bremse-vorne'],
        [2, 'reifen-hinten'],
        [3, 'riemen'],
        [4, 'reifen-vorne'],
      ]);
      expect(Object.keys(spots[0]!).sort()).toEqual([
        'id',
        'note',
        'number',
        'severity',
        'source',
        'source_at',
        'zone',
      ]);
      const text = JSON.stringify(blatt);
      for (const verboten of ['Tim', 'Teamleitung', 'Anna', 'Hausnummer', 'Standort']) {
        expect(text, verboten).not.toContain(verboten);
      }
    });
  });

  describe('Kataloge (src/features/fleet)', () => {
    it('hält Prüfpunkte, Bauteile und ihre Zuordnung in Datenbank und Oberfläche gleich', async () => {
      const { rows } = await asPostgres<{ items: string[]; zones: string[] }>(
        `select app.fleet_check_items('load60_riemen') as items, app.fleet_zones('load60_riemen') as zones`,
      );
      expect(rows[0]!.items).toEqual(CHECK_ITEMS.map((item) => item.key));
      expect(rows[0]!.zones).toEqual(ZONE_KEYS);
      for (const zone of ZONE_KEYS) {
        const { rows: zuordnung } = await asPostgres<{ check: string | null }>(
          `select app.fleet_zone_check_item('load60_riemen', $1) as check`,
          [zone],
        );
        expect(zuordnung[0]!.check, zone).toBe(BIKE_ZONES[zone].check);
      }
    });

    it('kennt dieselben Abschlüsse des Pannenassistenten', async () => {
      const { rows } = await asPostgres<{ outcomes: string[] }>(
        `select app.fleet_breakdown_outcomes() as outcomes`,
      );
      expect(rows[0]!.outcomes).toEqual([...ABSCHLUSSARTEN]);
    });
  });

  describe('Löschlauf (ANN-551, ADR-013 Punkt 9 Nr. 4)', () => {
    async function vorhanden(tabelle: string, id: string): Promise<boolean> {
      const { rows } = await asPostgres(`select 1 from public.${tabelle} where id = $1`, [id]);
      return rows.length > 0;
    }

    async function journal(id: string): Promise<string[]> {
      const { rows } = await asPostgres<{ retention_class: string }>(
        `select retention_class from public.deletion_journal where target_id = $1`,
        [id],
      );
      return rows.map((r) => r.retention_class);
    }

    it('löscht zurückgelegte Schlüssel nach 30 Tagen, offene nie', async () => {
      const { rows } = await asPostgres<{ id: string }>(
        `insert into public.fleet_key_handovers (organization_id, bike_id, holder_staff_id, taken_at, taken_by, returned_at, returned_by)
         values ($1, $2, $3, now() - interval '40 days', $4, now() - interval '32 days', $4),
                ($1, $2, $3, now() - interval '30 days', $4, now() - interval '20 days', $4)
         returning id`,
        [organizationId, FLOTTE.rad2, STAFF.jannes, users.ownerTherapist],
      );
      await asPostgres(
        `update public.fleet_key_handovers set taken_at = now() - interval '5 years' where returned_at is null`,
      );
      await asPostgres('select public.apply_retention()');
      expect(await vorhanden('fleet_key_handovers', rows[0]!.id)).toBe(false);
      expect(await journal(rows[0]!.id)).toEqual(['schluesselverlauf']);
      expect(await vorhanden('fleet_key_handovers', rows[1]!.id)).toBe(true);
      // Der offene Schlüssel von Lastenrad 1 bleibt, egal wie alt.
      const { rows: offen } = await asPostgres(
        `select 1 from public.fleet_key_handovers where returned_at is null`,
      );
      expect(offen).toHaveLength(1);
    });

    it('löscht Check-Ups und Pannen drei Jahre nach Jahresende, nicht solange etwas offen ist', async () => {
      // Lastenrad 3 trägt offene Stellen und eine offene Sperre - nichts fällt.
      await asPostgres(`update public.fleet_checkups set checked_at = now() - interval '5 years'`);
      await asPostgres(
        `update public.fleet_breakdowns set reported_at = now() - interval '5 years'`,
      );
      await asPostgres('select public.apply_retention()');
      expect(await vorhanden('fleet_checkups', 'b2b2b2b2-b2b2-4b2b-8b2b-000000000021')).toBe(true);
      expect(await vorhanden('fleet_breakdowns', 'b2b2b2b2-b2b2-4b2b-8b2b-000000000031')).toBe(
        true,
      );

      // Freigegeben vor fünf Jahren: alles fällt, Stellen mit (cascade).
      await asPostgres(
        `update public.fleet_spots set resolved_at = now() - interval '5 years', resolved_by = $1`,
        [users.ownerTherapist],
      );
      await asPostgres(
        `update public.fleet_blocks set blocked_at = now() - interval '6 years',
                released_at = now() - interval '5 years', released_by = $1`,
        [users.ownerTherapist],
      );
      await asPostgres('select public.apply_retention()');
      expect(await vorhanden('fleet_checkups', 'b2b2b2b2-b2b2-4b2b-8b2b-000000000021')).toBe(false);
      expect(await vorhanden('fleet_breakdowns', 'b2b2b2b2-b2b2-4b2b-8b2b-000000000031')).toBe(
        false,
      );
      expect(await vorhanden('fleet_blocks', 'b2b2b2b2-b2b2-4b2b-8b2b-000000000041')).toBe(false);
      expect(await vorhanden('fleet_spots', 'b2b2b2b2-b2b2-4b2b-8b2b-000000000051')).toBe(false);
      expect(await journal('b2b2b2b2-b2b2-4b2b-8b2b-000000000021')).toEqual(['radflotte_ereignis']);
      expect(await journal('b2b2b2b2-b2b2-4b2b-8b2b-000000000041')).toEqual(['radflotte_ereignis']);
      // Das Rad selbst bleibt: Es ist in der Flotte, nicht ausgemustert.
      expect(await vorhanden('fleet_bikes', FLOTTE.rad3)).toBe(true);

      // Auditeintrag des Laufs mit dem Zähler der Radflotte, ohne Kennungen.
      const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
        `select context from public.audit_log where action = 'retention.applied'
         order by occurred_at desc limit 1`,
      );
      expect(rows[0]!.context.radflotte).toBe(4);
    });

    it('löscht ein ausgemustertes Rad, sobald sein Verlauf gefallen ist, auch nach einer Wiederherstellung (ANN-557)', async () => {
      // Lastenrad 3 hat Check-Up, Panne, Sperre und Stellen: Es wird ausgemustert.
      expect(
        (
          await asUserCommitted<{ ergebnis: string }>(
            users.ownerTherapist,
            `select public.remove_fleet_bike($1::uuid) as ergebnis`,
            [FLOTTE.rad3],
          )
        ).rows[0]!.ergebnis,
      ).toBe('archived');
      // Solange der Verlauf in seiner Frist ist, bleibt auch das Rad.
      await asPostgres('select public.apply_retention()');
      expect(await vorhanden('fleet_bikes', FLOTTE.rad3)).toBe(true);

      // Fünf Jahre später fallen Verlauf und Rad im selben Lauf.
      await asPostgres(
        `update public.fleet_checkups set checked_at = now() - interval '5 years' where bike_id = $1`,
        [FLOTTE.rad3],
      );
      await asPostgres(
        `update public.fleet_breakdowns set reported_at = now() - interval '5 years' where bike_id = $1`,
        [FLOTTE.rad3],
      );
      await asPostgres(
        `update public.fleet_blocks set blocked_at = now() - interval '6 years',
                released_at = now() - interval '5 years'
         where bike_id = $1`,
        [FLOTTE.rad3],
      );
      const { rows: gesichert } = await asPostgres<{ rad: unknown }>(
        `select to_jsonb(r) as rad from public.fleet_bikes r where id = $1`,
        [FLOTTE.rad3],
      );
      await asPostgres('select public.apply_retention()');
      expect(await vorhanden('fleet_bikes', FLOTTE.rad3)).toBe(false);
      expect(await journal(FLOTTE.rad3)).toEqual(['betriebsdaten']);
      // Räder in der Flotte bleiben, auch ohne jeden Verlauf.
      expect(await vorhanden('fleet_bikes', FLOTTE.rad5)).toBe(true);
      expect(await vorhanden('fleet_bikes', FLOTTE.rad2)).toBe(true);

      // Ein Restore bringt das Rad zurück; das Journal zieht nach.
      await asPostgres(
        `insert into public.fleet_bikes
         select * from jsonb_populate_record(null::public.fleet_bikes, $1::jsonb)`,
        [JSON.stringify(gesichert[0]!.rad)],
      );
      await asPostgres('select public.reapply_deletion_journal()');
      expect(await vorhanden('fleet_bikes', FLOTTE.rad3)).toBe(false);
    });

    it('lässt Jüngeres stehen und löscht nach einer Wiederherstellung erneut', async () => {
      // Vor zwei Jahren freigegeben: noch nicht fällig.
      await asPostgres(
        `update public.fleet_blocks set blocked_at = now() - interval '2 years 1 day',
                released_at = now() - interval '2 years', released_by = $1
         where id = 'b2b2b2b2-b2b2-4b2b-8b2b-000000000042'`,
        [users.ownerTherapist],
      );
      await asPostgres('select public.apply_retention()');
      expect(await vorhanden('fleet_blocks', 'b2b2b2b2-b2b2-4b2b-8b2b-000000000042')).toBe(true);

      await asPostgres(
        `update public.fleet_blocks set blocked_at = now() - interval '6 years',
                released_at = now() - interval '5 years'
         where id = 'b2b2b2b2-b2b2-4b2b-8b2b-000000000042'`,
      );
      await asPostgres('select public.apply_retention()');
      expect(await vorhanden('fleet_blocks', 'b2b2b2b2-b2b2-4b2b-8b2b-000000000042')).toBe(false);

      // Ein Restore bringt die Zeile zurück; das Journal zieht nach.
      await asPostgres(
        `insert into public.fleet_blocks (id, organization_id, bike_id, reason, blocked_at, blocked_by, released_at, released_by)
         values ('b2b2b2b2-b2b2-4b2b-8b2b-000000000042', $1, $2, 'Wiederhergestellt', now() - interval '6 years', $3,
                 now() - interval '5 years', $3)`,
        [organizationId, FLOTTE.rad6, users.ownerTherapist],
      );
      await asPostgres('select public.reapply_deletion_journal()');
      expect(await vorhanden('fleet_blocks', 'b2b2b2b2-b2b2-4b2b-8b2b-000000000042')).toBe(false);
    });
  });
});
