import { beforeEach, describe, expect, it } from 'vitest';
import { CHECK_ITEMS } from '@/features/fleet/bike3d/zones';
import { SEITEN } from '@/features/fleet/checkupablauf';
import {
  SEED,
  abgefangen,
  asPostgres,
  asStorageApi,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Check-Up mit Werbeflächen und Seitenfotos, Meldungen für den Arbeitgeber,
 * Check-Up-Rhythmus (FLT-007 bis FLT-009; ANN-568 bis ANN-570).
 *
 * Geprüft werden: Ohne „abgewischt“ oder einen Grund nimmt der Server keinen
 * Check-Up an; je Seite ein Foto, nur am Check-Up, außerhalb der vier
 * weiteren; die Liste der Meldungen nur für owner und team_lead mit allen
 * Negativfällen (ADR-013 Punkt 9 Nr. 1) und ohne Objektschlüssel; der
 * Rhythmus nur durch owner, im Bereich 1 bis 90 oder aus.
 */

const { users, organizationId } = SEED;

const FLOTTE = {
  rad2: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000012',
  rad3: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000013',
  checkup: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000021',
  panne: 'b2b2b2b2-b2b2-4b2b-8b2b-000000000031',
} as const;

const CHECKUP = `select public.record_fleet_checkup($1::uuid, $2::jsonb, $3, $4::jsonb, true, $5, $6) as daten`;
const VORBEREITEN =
  'select * from public.prepare_fleet_photo_upload($1::uuid, $2::uuid, $3::bigint, $4::text, $5::text)';
const BESTAETIGEN = 'select public.confirm_fleet_photo_upload($1::uuid)';
const MELDUNGEN = 'select public.list_fleet_reports($1::date) as daten';
const RHYTHMUS = 'select public.set_fleet_checkup_interval($1::integer)';
const LISTE = 'select public.list_fleet(null) as daten';
const SUMME = 'd'.repeat(64);

function punkte() {
  return JSON.stringify(CHECK_ITEMS.map((item) => ({ key: item.key, rating: 'ok', note: null })));
}

async function code(versuch: Promise<unknown>): Promise<string> {
  const fehler = await abgefangen(versuch);
  return fehler ? String((fehler as { code?: string }).code ?? fehler.message) : 'kein Fehler';
}

async function checkUp(
  konto: string,
  werbeflaechen: string | null = 'wiped',
  grund: string | null = null,
): Promise<string> {
  const { rows } = await asUserCommitted<{ daten: { checkup_id: string } }>(konto, CHECKUP, [
    FLOTTE.rad2,
    punkte(),
    null,
    '[]',
    werbeflaechen,
    grund,
  ]);
  return rows[0]!.daten.checkup_id;
}

async function seitenfoto(konto: string, checkup: string, seite: string | null) {
  const { rows } = await asUserCommitted<{
    photo_id: string;
    bucket_id: string;
    object_key: string;
  }>(konto, VORBEREITEN, [null, checkup, 1000, SUMME, seite]);
  const v = rows[0]!;
  await asStorageApi(
    konto,
    'storage.object.upload',
    `insert into storage.objects (bucket_id, name, metadata)
     values ($1, $2, jsonb_build_object('size', 1000::bigint, 'mimetype', 'image/jpeg'))`,
    [v.bucket_id, v.object_key],
  );
  await asUserCommitted(konto, BESTAETIGEN, [v.photo_id]);
  return v;
}

interface Meldung {
  kind: 'checkup' | 'breakdown';
  id: string;
  bike_id: string;
  bike_name: string;
  at: string;
  by_name: string | null;
  ad_surfaces?: string | null;
  ad_surfaces_note?: string | null;
  spots: { zone: string; number: number | null }[];
  photos: { id: string; spot_id: string | null; side: string | null }[];
}

describe('Check-Up-Pflege und Meldungen (FLT-007 bis FLT-009)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  describe('Werbeflächen (ANN-568)', () => {
    it('speichert „abgewischt“ ohne Grund und „nicht möglich“ mit Grund', async () => {
      const abgewischt = await checkUp(users.therapist, 'wiped', 'wird verworfen');
      const nicht = await checkUp(users.therapist, 'not_possible', '  Kein Tuch im Depot ');
      const { rows } = await asPostgres<{
        id: string;
        ad_surfaces: string;
        ad_surfaces_note: string | null;
      }>(
        'select id, ad_surfaces, ad_surfaces_note from public.fleet_checkups where id = any($1::uuid[])',
        [[abgewischt, nicht]],
      );
      expect(
        Object.fromEntries(rows.map((r) => [r.id, [r.ad_surfaces, r.ad_surfaces_note]])),
      ).toEqual({
        [abgewischt]: ['wiped', null],
        [nicht]: ['not_possible', 'Kein Tuch im Depot'],
      });
    });

    it('weist einen Check-Up ohne Angabe, mit unbekanntem Wert oder ohne Grund ab', async () => {
      for (const [wert, grund] of [
        [null, null],
        ['vielleicht', null],
        ['not_possible', null],
        ['not_possible', '   '],
        ['not_possible', 'x'.repeat(201)],
      ] as const) {
        expect(
          await code(
            asUser(users.therapist, CHECKUP, [FLOTTE.rad2, punkte(), null, '[]', wert, grund]),
          ),
          `${wert} ${grund}`,
        ).toBe('22023');
      }
    });

    it('nimmt die alte Fassung ohne Werbeflächen nicht mehr an', async () => {
      expect(
        await code(
          asUser(
            users.therapist,
            'select public.record_fleet_checkup($1::uuid, $2::jsonb, null, $3::jsonb, true)',
            [FLOTTE.rad2, punkte(), '[]'],
          ),
        ),
      ).toBe('42883');
    });

    it('lässt einen Check-Up vor der Einführung ohne Wert stehen', async () => {
      const { rows } = await asPostgres<{ ad_surfaces: string | null }>(
        'select ad_surfaces from public.fleet_checkups where id = $1',
        [FLOTTE.checkup],
      );
      expect(rows[0]!.ad_surfaces).toBeNull();
    });
  });

  describe('Seitenfotos (ANN-568)', () => {
    it('kennt dieselben vier Seiten wie die Oberfläche', async () => {
      const { rows } = await asPostgres<{ seiten: string[] }>(
        'select app.fleet_photo_sides() as seiten',
      );
      expect(rows[0]!.seiten).toEqual(SEITEN.map((seite) => seite.key));
    });

    it('nimmt je Seite ein Foto, neben den vier weiteren', async () => {
      const checkup = await checkUp(users.therapist);
      for (const seite of SEITEN) await seitenfoto(users.therapist, checkup, seite.key);
      for (let i = 0; i < 4; i += 1) await seitenfoto(users.therapist, checkup, null);
      expect(await code(seitenfoto(users.therapist, checkup, null))).toBe('23514');
      expect(await code(seitenfoto(users.therapist, checkup, 'left'))).toBe('23505');

      const { rows } = await asUser<{ side: string | null }>(
        users.office,
        'select side from public.list_fleet_photos($1::uuid) where checkup_id = $2',
        [FLOTTE.rad2, checkup],
      );
      expect(rows.map((r) => r.side).sort()).toEqual(
        ['back', 'front', 'left', 'right', null, null, null, null].sort(),
      );
    });

    it('lässt einen abgebrochenen Versuch die Seite nicht blockieren', async () => {
      const checkup = await checkUp(users.therapist);
      // Vorbereitet, aber nie bestätigt - etwa weil die Verbindung abriss.
      const { rows } = await asUserCommitted<{ photo_id: string }>(users.therapist, VORBEREITEN, [
        null,
        checkup,
        1000,
        SUMME,
        'front',
      ]);
      const foto = await seitenfoto(users.therapist, checkup, 'front');
      const { rows: zeilen } = await asPostgres<{ id: string; status: string }>(
        "select id, status from public.fleet_photos where checkup_id = $1 and side = 'front'",
        [checkup],
      );
      expect(zeilen).toEqual([{ id: foto.photo_id, status: 'ready' }]);
      expect(zeilen[0]!.id).not.toBe(rows[0]!.photo_id);
      // Ein fertiges Foto weicht nicht.
      expect(await code(seitenfoto(users.therapist, checkup, 'front'))).toBe('23505');
    });

    it('weist eine unbekannte Seite und eine Seite an einer Stelle ab', async () => {
      const checkup = await checkUp(users.therapist);
      expect(
        await code(asUser(users.therapist, VORBEREITEN, [null, checkup, 1000, SUMME, 'oben'])),
      ).toBe('22023');
      const { rows } = await asUserCommitted<{ daten: { spot_ids: string[] } }>(
        users.therapist,
        CHECKUP,
        [
          FLOTTE.rad2,
          punkte(),
          null,
          JSON.stringify([{ zone: 'lenker', severity: 'problem', point: null, note: null }]),
          'wiped',
          null,
        ],
      );
      expect(
        await code(
          asUser(users.therapist, VORBEREITEN, [
            rows[0]!.daten.spot_ids[0],
            null,
            1000,
            SUMME,
            'left',
          ]),
        ),
      ).toBe('22023');
    });

    it('lässt die Seite eines Fotos nicht ändern', async () => {
      const checkup = await checkUp(users.therapist);
      const foto = await seitenfoto(users.therapist, checkup, 'left');
      expect(
        await code(
          asPostgres("update public.fleet_photos set side = 'right' where id = $1", [
            foto.photo_id,
          ]),
        ),
      ).toBe('42501');
    });

    it('nimmt Fotos nur zum eigenen Check-Up, auch mit Seite', async () => {
      const checkup = await checkUp(users.therapist);
      expect(
        await code(asUser(users.teamLead, VORBEREITEN, [null, checkup, 1000, SUMME, 'left'])),
      ).toBe('P0002');
    });
  });

  describe('Meldungen für den Arbeitgeber (ANN-569)', () => {
    it('zeigt owner und team_lead Check-Ups und Pannen aller Räder, neueste zuerst', async () => {
      const neu = await checkUp(users.therapist, 'not_possible', 'Kein Tuch im Depot');
      await seitenfoto(users.therapist, neu, 'front');
      for (const konto of [users.ownerTherapist, users.teamLead]) {
        const { rows } = await asUser<{ daten: Meldung[] }>(konto, MELDUNGEN, [null]);
        const meldungen = rows[0]!.daten;
        expect(meldungen.map((m) => [m.kind, m.id])).toEqual([
          ['checkup', neu],
          ['breakdown', FLOTTE.panne],
          ['checkup', FLOTTE.checkup],
        ]);
        const [jetzt, panne, alt] = meldungen;
        expect(jetzt).toMatchObject({
          bike_id: FLOTTE.rad2,
          bike_name: 'Lastenrad 2',
          by_name: 'Anna Beispiel',
          ad_surfaces: 'not_possible',
          ad_surfaces_note: 'Kein Tuch im Depot',
        });
        expect(jetzt!.photos).toEqual([expect.objectContaining({ side: 'front', spot_id: null })]);
        expect(panne!.spots.map((s) => [s.zone, s.number])).toEqual([['riemen', null]]);
        expect(alt!.spots.map((s) => s.zone)).toEqual(['bremse-vorne', 'reifen-hinten']);
      }
    });

    it('liefert keine Objektschlüssel und keine Verweise', async () => {
      const neu = await checkUp(users.therapist);
      const foto = await seitenfoto(users.therapist, neu, 'left');
      const { rows } = await asUser<{ daten: Meldung[] }>(users.ownerTherapist, MELDUNGEN, [null]);
      const text = JSON.stringify(rows[0]!.daten);
      expect(text).not.toContain(foto.object_key);
      expect(text).not.toContain('object_key');
    });

    it('beginnt am angegebenen Tag und reicht höchstens ein Jahr zurück', async () => {
      await asPostgres(
        "update public.fleet_checkups set checked_at = now() - interval '100 days' where id = $1",
        [FLOTTE.checkup],
      );
      const ohne = await asUser<{ daten: Meldung[] }>(users.ownerTherapist, MELDUNGEN, [null]);
      expect(ohne.rows[0]!.daten.map((m) => m.id)).toEqual([FLOTTE.panne]);
      const { rows: tag } = await asPostgres<{ ab: string }>(
        "select ((now() at time zone 'Europe/Berlin')::date - 120)::text as ab",
      );
      const mit = await asUser<{ daten: Meldung[] }>(users.ownerTherapist, MELDUNGEN, [tag[0]!.ab]);
      expect(mit.rows[0]!.daten.map((m) => m.id)).toEqual([FLOTTE.panne, FLOTTE.checkup]);
      const { rows: zuAlt } = await asPostgres<{ ab: string }>(
        "select ((now() at time zone 'Europe/Berlin')::date - 400)::text as ab",
      );
      expect(await code(asUser(users.ownerTherapist, MELDUNGEN, [zuAlt[0]!.ab]))).toBe('22023');
    });

    it('lässt ausgemusterte Räder weg', async () => {
      await asPostgres(
        'update public.fleet_bikes set archived_at = now(), archived_by = $2 where id = $1',
        [FLOTTE.rad3, users.ownerTherapist],
      );
      const { rows } = await asUser<{ daten: Meldung[] }>(users.ownerTherapist, MELDUNGEN, [null]);
      expect(rows[0]!.daten).toEqual([]);
    });

    it('weist Therapie, Büro, Trainingsbetreuung, Patient, Plattform und Anonyme ab', async () => {
      for (const konto of [
        users.therapist,
        users.office,
        users.trainer,
        users.patientMax,
        users.plattformTina,
        null,
      ]) {
        expect(await code(asUser(konto, MELDUNGEN, [null])), String(konto)).toBe('42501');
      }
    });

    it('zeigt einer anderen Praxis nichts von dieser', async () => {
      const fremd = await fremdeOrganisation();
      const { rows } = await asUser<{ daten: Meldung[] }>(fremd.owner, MELDUNGEN, [null]);
      expect(rows[0]!.daten).toEqual([]);
    });

    it('nennt das Recht in der Flotte', async () => {
      const recht = async (konto: string) =>
        (await asUser<{ daten: { can_read_reports: boolean } }>(konto, LISTE)).rows[0]!.daten
          .can_read_reports;
      expect(await recht(users.ownerTherapist)).toBe(true);
      expect(await recht(users.teamLead)).toBe(true);
      expect(await recht(users.therapist)).toBe(false);
      expect(await recht(users.office)).toBe(false);
    });
  });

  describe('Check-Up-Rhythmus (ANN-570)', () => {
    async function rhythmus(konto: string = users.therapist): Promise<number | null> {
      const { rows } = await asUser<{ daten: { checkup_interval_days: number | null } }>(
        konto,
        LISTE,
      );
      return rows[0]!.daten.checkup_interval_days;
    }

    it('steht auf 14 Tagen und lässt sich durch owner ändern und abschalten', async () => {
      expect(await rhythmus()).toBe(14);
      await asUserCommitted(users.ownerTherapist, RHYTHMUS, [21]);
      expect(await rhythmus()).toBe(21);
      await asUserCommitted(users.ownerTherapist, RHYTHMUS, [null]);
      expect(await rhythmus()).toBeNull();
    });

    it('weist Werte außerhalb von 1 bis 90 Tagen ab', async () => {
      for (const tage of [0, -7, 91, 365]) {
        expect(await code(asUser(users.ownerTherapist, RHYTHMUS, [tage])), String(tage)).toBe(
          '22023',
        );
      }
    });

    it('lässt nur owner den Rhythmus ändern', async () => {
      for (const konto of [
        users.therapist,
        users.teamLead,
        users.office,
        users.trainer,
        users.patientMax,
        users.plattformTina,
        null,
      ]) {
        expect(await code(asUser(konto, RHYTHMUS, [7])), String(konto)).toBe('42501');
      }
      expect(await rhythmus()).toBe(14);
    });

    it('ändert nur die eigene Praxis', async () => {
      const fremd = await fremdeOrganisation();
      await asUserCommitted(fremd.owner, RHYTHMUS, [7]);
      expect(await rhythmus()).toBe(14);
      const { rows } = await asPostgres<{ tage: number }>(
        'select fleet_checkup_interval_days as tage from public.organizations where id = $1',
        [fremd.organizationId],
      );
      expect(rows[0]!.tage).toBe(7);
      const { rows: hier } = await asPostgres<{ tage: number }>(
        'select fleet_checkup_interval_days as tage from public.organizations where id = $1',
        [organizationId],
      );
      expect(hier[0]!.tage).toBe(14);
    });
  });
});
