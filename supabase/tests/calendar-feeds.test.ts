import { createHash } from 'node:crypto';
import { Client } from 'pg';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asServiceRole,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  jwtClaims,
  resetDatabase,
  testDatabaseUrl,
} from './helpers/db';

// Kalender-Abo (Prinzipien 0.32 §3.4, ANN-838): eine geheime Adresse je Konto, nur als Prüfsumme.
const { users, patients } = SEED;

const ORG = '22222222-2222-4222-8222-000000000001';
const PRAXIS = '33333333-3333-4333-8333-000000000001';
const TIM = '55555555-5555-4555-8555-000000000004';
const ANNA = '55555555-5555-4555-8555-000000000002';
const ROLLE = 'calendar_feed_reader';
// Sitzungskennungen sind UUIDs (app.jwt_session_id).
const SITZUNG_ALT = '99999999-9999-4999-8999-0000000000a1';
const SITZUNG_PIN_ANLEGEN = '99999999-9999-4999-8999-0000000000a2';
const SITZUNG_PIN = '99999999-9999-4999-8999-0000000000a3';

interface Eintrag {
  uid: string;
  beginn: string;
  ende: string;
  art: string;
}

interface Kalender {
  zeitzone: string;
  termine: Eintrag[];
}

const ERZEUGEN = 'select public.create_own_calendar_feed() as adresse';
const SEIT = 'select * from public.get_own_calendar_feed()';
const BEENDEN = 'select public.end_own_calendar_feed()';
const ABO = 'select public.calendar_feed($1) as abo';

async function erzeuge(konto: string): Promise<string> {
  const { rows } = await asUserCommitted<{ adresse: string }>(konto, ERZEUGEN);
  return rows[0]!.adresse;
}

/** Wie PostgREST mit dem Token der Function: in der Rolle `calendar_feed_reader` (ANN-839). */
async function alsDienst<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('role', $1, true)", [ROLLE]);
    await client.query("select set_config('request.jwt.claims', $1, true)", [
      JSON.stringify({ role: ROLLE }),
    ]);
    const { rows } = await client.query(sql, params as never[]);
    await client.query('rollback');
    return rows as T[];
  } catch (fehler) {
    await client.query('rollback').catch(() => undefined);
    throw fehler;
  } finally {
    await client.end();
  }
}

async function abo(adresse: string): Promise<Kalender | null> {
  const [zeile] = await alsDienst<{ abo: Kalender | null }>(ABO, [adresse]);
  return zeile!.abo;
}

async function kennungen(adresse: string): Promise<string[]> {
  return (await abo(adresse))!.termine.map((e) => e.uid);
}

/** Ein Aufruf mit eigenen Angaben zur Anmeldung, bestätigt (wie in app-pin.test.ts). */
async function mitAnmeldung<T>(claims: string, sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  try {
    await client.query('begin');
    await client.query("select set_config('role', 'authenticated', true)");
    await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
    const { rows } = await client.query(sql, params as never[]);
    await client.query('commit');
    return rows as T[];
  } catch (fehler) {
    await client.query('rollback').catch(() => undefined);
    throw fehler;
  } finally {
    await client.end();
  }
}

function angemeldetVor(konto: string, minuten: number, sitzung: string = konto): string {
  return jwtClaims(konto, {
    session_id: sitzung,
    amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - minuten * 60 }],
  });
}

async function fehlercode(versprechen: Promise<unknown>): Promise<string | null> {
  try {
    await versprechen;
    return null;
  } catch (fehler) {
    return (fehler as { code?: string }).code ?? 'unbekannt';
  }
}

function pruefsumme(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Ein Termin von Tim um 02:00 UTC, `tage` vom heutigen Tag aus; nachts kollidiert er mit nichts. */
async function termin(
  tage: number,
  teil: {
    status?: string;
    art?: string;
    staff?: string;
    org?: string;
    patient?: string;
    fehlzeit?: boolean;
  } = {},
): Promise<string> {
  const art = teil.art ?? 'practice';
  const abgesagt = teil.status === 'cancelled';
  const fehlzeit = teil.fehlzeit === true;
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id, appointment_type, status,
       starts_at, ends_at, visit_street, visit_house_number, visit_postal_code, visit_city,
       cancelled_at, cancelled_by, cancellation_reason, kind, title, event_group_id
     ) values (
       $1, case when not $10 then $2::uuid end, $3, case when $4 = 'practice' then $5::uuid end, $4, $6,
       date_trunc('day', now()) + make_interval(days => $7::int, hours => 2),
       date_trunc('day', now()) + make_interval(days => $7::int, hours => 2, mins => 30),
       case when $4 = 'home_visit' then 'Testweg' end, case when $4 = 'home_visit' then '1' end,
       case when $4 = 'home_visit' then '72070' end, case when $4 = 'home_visit' then 'Tübingen' end,
       case when $8 then now() end, case when $8 then $9::uuid end,
       case when $8 then 'practice_request' end,
       case when $10 then 'internal' else 'therapy' end,
       case when $10 then 'Teambesprechung' end,
       case when $10 then gen_random_uuid() end
     ) returning id`,
    [
      teil.org ?? ORG,
      teil.patient ?? patients.max,
      teil.staff ?? TIM,
      art,
      PRAXIS,
      teil.status ?? 'confirmed',
      tage,
      abgesagt,
      users.ownerTherapist,
      fehlzeit,
    ],
  );
  return rows[0]!.id;
}

describe('Kalender-Abo (PRX-048)', () => {
  beforeEach(async () => {
    await resetDatabase();
  });

  describe('Die Adresse', () => {
    it('erzeugt 43 Zeichen aus 32 Zufallsbytes und speichert nur ihre Prüfsumme', async () => {
      const adresse = await erzeuge(users.teamLead);
      expect(adresse).toMatch(/^[A-Za-z0-9_-]{43}$/);
      const { rows } = await asPostgres<Record<string, unknown>>(
        'select * from public.calendar_feeds where user_id = $1',
        [users.teamLead],
      );
      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]!).sort()).toEqual(['created_at', 'token_hash', 'user_id']);
      expect(rows[0]!.token_hash).toBe(pruefsumme(adresse));
      expect(JSON.stringify(rows)).not.toContain(adresse);
    });

    it('gibt die Adresse nur beim Erzeugen heraus, danach nur das Datum', async () => {
      expect((await asUser(users.teamLead, SEIT)).rows).toEqual([]);
      await erzeuge(users.teamLead);
      const { rows } = await asUser<Record<string, unknown>>(users.teamLead, SEIT);
      expect(rows).toHaveLength(1);
      expect(Object.keys(rows[0]!)).toEqual(['created_at']);
      // Jede Person sieht nur ihr eigenes.
      expect((await asUser(users.therapist, SEIT)).rows).toEqual([]);
    });

    it('ersetzt mit einer neuen Adresse die alte und beendet sofort', async () => {
      const alt = await erzeuge(users.teamLead);
      const neu = await erzeuge(users.teamLead);
      expect(neu).not.toBe(alt);
      expect(await abo(alt)).toBeNull();
      expect(await abo(neu)).not.toBeNull();

      await asUserCommitted(users.teamLead, BEENDEN);
      expect(await abo(neu)).toBeNull();
      expect((await asUser(users.teamLead, SEIT)).rows).toEqual([]);
    });

    it('gibt es nur für ein aktives Konto mit eigenem, aktivem Mitarbeiterdatensatz', async () => {
      for (const konto of [
        users.patientMax,
        users.patientErika,
        users.plattformTina,
        users.plattformErika,
        users.plattformPaula,
      ]) {
        await expect(asUser(konto, ERZEUGEN)).rejects.toThrow(
          /not allowed to subscribe a calendar/,
        );
      }
      await expect(asUser(null, ERZEUGEN)).rejects.toThrow(/not authenticated/);
      await expect(asAnon(ERZEUGEN)).rejects.toThrow(/permission denied/i);
      await expect(asAnon(SEIT)).rejects.toThrow(/permission denied/i);
      await expect(asAnon(BEENDEN)).rejects.toThrow(/permission denied/i);
      for (const konto of [users.ownerTherapist, users.therapist, users.office, users.trainer]) {
        expect(await erzeuge(konto)).toMatch(/^[A-Za-z0-9_-]{43}$/);
      }
    });

    it('verlangt wie die PIN eine Anmeldung, die höchstens zehn Minuten zurückliegt', async () => {
      // Offen durch Bedienung, aber die Anmeldung ist elf Minuten alt (ANN-325).
      await asPostgres(
        `insert into public.session_activity (session_id, user_id, last_activity_at)
         values ($1, $2, now())`,
        [SITZUNG_ALT, users.teamLead],
      );
      const alt = angemeldetVor(users.teamLead, 11, SITZUNG_ALT);
      expect(await mitAnmeldung(alt, 'select count(*) from public.appointments')).toHaveLength(1);
      expect(await fehlercode(mitAnmeldung(alt, ERZEUGEN))).toBe('P0001');
      await expect(mitAnmeldung(alt, ERZEUGEN)).rejects.toThrow(/reauthentication required/);
      const frisch = angemeldetVor(users.teamLead, 9, SITZUNG_ALT);
      const [neu] = await mitAnmeldung<{ adresse: string }>(frisch, ERZEUGEN);
      expect(neu!.adresse).toMatch(/^[A-Za-z0-9_-]{43}$/);
    });

    it('zählt eine Freigabe per PIN nicht als frische Anmeldung', async () => {
      await mitAnmeldung(
        angemeldetVor(users.teamLead, 1, SITZUNG_PIN_ANLEGEN),
        'select public.set_own_pin($1)',
        ['590284'],
      );
      const gesperrt = angemeldetVor(users.teamLead, 61, SITZUNG_PIN);
      const [frei] = await mitAnmeldung<{ unlocked: boolean }>(
        gesperrt,
        'select * from public.unlock_with_pin($1)',
        ['590284'],
      );
      expect(frei!.unlocked).toBe(true);
      expect(await fehlercode(mitAnmeldung(gesperrt, ERZEUGEN))).toBe('P0001');
    });

    it('fällt mit dem Konto', async () => {
      const konto = '77777777-7777-4777-8777-0000000000aa';
      await asPostgres(
        `insert into auth.users (id, email, aud, role)
           values ($1, 'abo@praxis.invalid', 'authenticated', 'authenticated')`,
        [konto],
      );
      await asPostgres(
        `insert into public.calendar_feeds (user_id, token_hash) values ($1, repeat('a', 64))`,
        [konto],
      );
      await asPostgres('delete from auth.users where id = $1', [konto]);
      const { rows } = await asPostgres('select 1 from public.calendar_feeds where user_id = $1', [
        konto,
      ]);
      expect(rows).toEqual([]);
    });

    it('endet mit der Sperre durch die Inhaberin und gilt nach dem Entsperren nicht wieder', async () => {
      const adresse = await erzeuge(users.teamLead);
      expect(await abo(adresse)).not.toBeNull();
      await asUserCommitted(
        users.ownerTherapist,
        'select public.set_staff_account_active($1, false)',
        [TIM],
      );
      const zeilen = 'select 1 from public.calendar_feeds where user_id = $1';
      expect((await asPostgres(zeilen, [users.teamLead])).rows).toEqual([]);
      await asUserCommitted(
        users.ownerTherapist,
        'select public.set_staff_account_active($1, true)',
        [TIM],
      );
      expect(await abo(adresse)).toBeNull();
      expect(await erzeuge(users.teamLead)).not.toBe(adresse);
    });

    it('endet mit dem Ausscheiden; andere Abos bleiben', async () => {
      const tim = await erzeuge(users.teamLead);
      const anna = await erzeuge(users.therapist);
      await asPostgres(
        "update public.staff_members set employment_status = 'inactive' where id = $1",
        [TIM],
      );
      await asPostgres(
        "update public.staff_members set employment_status = 'active' where id = $1",
        [TIM],
      );
      expect(await abo(tim)).toBeNull();
      expect(await abo(anna)).not.toBeNull();
    });

    it('lässt sich immer beenden, auch ohne Organisation; ohne Abo ändert das nichts', async () => {
      const anna = await erzeuge(users.therapist);
      for (const konto of [users.plattformTina, users.patientMax, users.teamLead]) {
        await asUserCommitted(konto, BEENDEN);
      }
      expect(await abo(anna)).not.toBeNull();
      await expect(asUser(null, BEENDEN)).rejects.toThrow(/not authenticated/);
    });
  });

  describe('Die Kalenderdatei', () => {
    it('liest allein die Rolle der Function, nie ein Konto, anon oder service_role', async () => {
      const adresse = await erzeuge(users.teamLead);
      for (const konto of [users.teamLead, users.ownerTherapist, users.plattformTina]) {
        await expect(asUser(konto, ABO, [adresse])).rejects.toThrow(/permission denied/i);
      }
      await expect(asAnon(ABO, [adresse])).rejects.toThrow(/permission denied/i);
      await expect(asServiceRole(ABO, [adresse])).rejects.toThrow(/permission denied/i);
      await expect(asServiceRole('select * from public.calendar_feeds')).rejects.toThrow(
        /permission denied/i,
      );
      // Die Hilfen dahinter ruft keine Anwendungsrolle direkt auf.
      await expect(asUser(users.teamLead, `select app.calendar_feed_hash('x')`)).rejects.toThrow(
        /permission denied/i,
      );
      expect(await abo(adresse)).not.toBeNull();
    });

    it('gibt der Rolle der Function genau calendar_feed und sonst nichts (ADR-004)', async () => {
      const { rows: funktionen } = await asPostgres<{ funktion: string }>(
        `select p.oid::regprocedure::text as funktion
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where n.nspname in ('public', 'app', 'auth', 'storage')
            and p.prorettype <> 'trigger'::regtype
            and has_function_privilege($1, p.oid, 'execute')
            and has_schema_privilege($1, n.oid, 'usage')
          order by 1`,
        [ROLLE],
      );
      expect(funktionen.map((f) => f.funktion)).toEqual(['calendar_feed(text)']);
      const { rows: tabellen } = await asPostgres<{ tabelle: string }>(
        `select format('%s.%s', n.nspname, c.relname) as tabelle
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname in ('public', 'app', 'auth', 'storage')
            and c.relkind in ('r', 'v', 'm', 'p', 'S')
            and (has_table_privilege($1, c.oid, 'select') or has_table_privilege($1, c.oid, 'insert')
                 or has_table_privilege($1, c.oid, 'update') or has_table_privilege($1, c.oid, 'delete'))`,
        [ROLLE],
      );
      expect(tabellen).toEqual([]);
      const schema = await asPostgres<{ darf: boolean }>(
        "select has_schema_privilege($1, 'app', 'usage') as darf",
        [ROLLE],
      );
      expect(schema.rows[0]!.darf).toBe(false);
      // Mit dem Token der Function: weder Termine noch Abos, noch eine andere Funktion.
      for (const sql of [
        'select count(*) from public.appointments',
        'select count(*) from public.calendar_feeds',
        'select * from public.get_own_calendar_feed()',
      ]) {
        await expect(alsDienst(sql)).rejects.toThrow(/permission denied/i);
      }
      const rolle = await asPostgres<{ ist: boolean }>(
        `select rolcanlogin or rolsuper or rolbypassrls or rolcreaterole as ist
           from pg_roles where rolname = $1`,
        [ROLLE],
      );
      expect(rolle.rows[0]!.ist).toBe(false);
      // So wechselt PostgREST: authenticator darf in die Rolle, die Rolle hat eine kurze Frist.
      const wechsel = await asPostgres<{ darf: boolean; frist: string[] | null }>(
        `select pg_has_role('authenticator', $1, 'member') as darf,
                (select rolconfig from pg_roles where rolname = $1) as frist`,
        [ROLLE],
      );
      expect(wechsel.rows[0]!.darf).toBe(true);
      expect(wechsel.rows[0]!.frist).toContain('statement_timeout=3s');
      const client = new Client({ connectionString: testDatabaseUrl() });
      await client.connect();
      try {
        await client.query('begin');
        await client.query('set local role authenticator');
        await client.query(`set local role ${ROLLE}`);
        const { rows } = await client.query<{ abo: unknown }>(ABO, ['a'.repeat(43)]);
        expect(rows[0]!.abo).toBeNull();
      } finally {
        await client.query('rollback').catch(() => undefined);
        await client.end();
      }
    });

    it('enthält nur eigene, nicht abgesagte Termine von 7 Tagen zurück bis 90 voraus', async () => {
      const adresse = await erzeuge(users.teamLead);
      const zuAlt = await termin(-8);
      const nochDrin = await termin(-6);
      const weitVoraus = await termin(89);
      const zuWeit = await termin(91);
      const abgesagt = await termin(2, { status: 'cancelled' });
      const vonAnna = await termin(3, { staff: ANNA });
      const hausbesuch = await termin(4, { art: 'home_visit' });
      const video = await termin(5, { art: 'video' });
      const fehlzeit = await termin(6, { fehlzeit: true, art: 'video' });

      const drin = new Set(await kennungen(adresse));
      const kennung = (id: string) => pruefsumme(`${id}:${pruefsumme(adresse)}`);
      for (const id of [nochDrin, weitVoraus, hausbesuch, video, fehlzeit]) {
        expect(drin.has(kennung(id))).toBe(true);
      }
      for (const id of [zuAlt, zuWeit, abgesagt, vonAnna]) {
        expect(drin.has(kennung(id))).toBe(false);
      }
      // Genau Tims Termine im Fenster, keiner mehr und keiner weniger.
      const { rows } = await asPostgres<{ id: string }>(
        `select id from public.appointments
          where staff_member_id = $1 and status <> 'cancelled'
            and ends_at >= now() - interval '7 days' and starts_at < now() + interval '90 days'`,
        [TIM],
      );
      expect([...drin].sort()).toEqual(rows.map((r) => kennung(r.id)).sort());
    });

    it('nennt die Zeitzone der Praxis und je Termin nur Kennung, Beginn, Ende und Art', async () => {
      const adresse = await erzeuge(users.teamLead);
      const hausbesuch = await termin(4, { art: 'home_visit' });
      const fehlzeit = await termin(5, { fehlzeit: true, art: 'video' });
      const kalender = (await abo(adresse))!;
      expect(Object.keys(kalender).sort()).toEqual(['termine', 'zeitzone']);
      const { rows } = await asPostgres<{ zone: string }>(
        'select time_zone as zone from public.organizations where id = $1',
        [ORG],
      );
      expect(kalender.zeitzone).toBe(rows[0]!.zone);
      expect(kalender.termine.length).toBeGreaterThan(0);
      for (const eintrag of kalender.termine) {
        expect(Object.keys(eintrag).sort()).toEqual(['art', 'beginn', 'ende', 'uid']);
        expect(eintrag.uid).toMatch(/^[0-9a-f]{64}$/);
        expect(['home_visit', 'practice', 'video']).toContain(eintrag.art);
      }
      const kennung = (id: string) => pruefsumme(`${id}:${pruefsumme(adresse)}`);
      expect(kalender.termine.find((e) => e.uid === kennung(hausbesuch))?.art).toBe('home_visit');
      // Eine Fehlzeit steht mit ihrer Art nach §3.4 (hier Video), nie mit ihrem Titel.
      expect(kalender.termine.find((e) => e.uid === kennung(fehlzeit))?.art).toBe('video');
      const text = JSON.stringify(kalender);
      for (const verboten of [
        hausbesuch,
        fehlzeit,
        'Testweg',
        '72070',
        'Tübingen',
        'Max',
        'Teambesprechung',
        patients.max,
      ]) {
        expect(text).not.toContain(verboten);
      }
    });

    it('vergibt mit einer neuen Adresse neue Kennungen', async () => {
      const id = await termin(4);
      const alt = await erzeuge(users.teamLead);
      const altKennung = pruefsumme(`${id}:${pruefsumme(alt)}`);
      expect(await kennungen(alt)).toContain(altKennung);
      const neu = await erzeuge(users.teamLead);
      const neuKennungen = await kennungen(neu);
      expect(neuKennungen).not.toContain(altKennung);
      expect(neuKennungen).toContain(pruefsumme(`${id}:${pruefsumme(neu)}`));
    });

    it('ist leer bei unbekannter oder falsch geformter Adresse und bei gesperrtem Profil', async () => {
      expect(await abo('a'.repeat(43))).toBeNull();
      expect(await abo('zu-kurz')).toBeNull();
      expect(await abo("'; select 1; --")).toBeNull();

      // Ohne den Weg über die Sperre (etwa von Hand): Die Datei prüft das Profil selbst.
      const adresse = await erzeuge(users.teamLead);
      await asPostgres(
        'alter table public.user_profiles disable trigger user_profiles_calendar_feed_on_lock',
      );
      try {
        await asPostgres('update public.user_profiles set is_active = false where id = $1', [
          users.teamLead,
        ]);
        expect(await abo(adresse)).toBeNull();
      } finally {
        await asPostgres(
          'alter table public.user_profiles enable trigger user_profiles_calendar_feed_on_lock',
        );
      }
      await expect(asUser(users.teamLead, ERZEUGEN)).rejects.toThrow(
        /not allowed to subscribe a calendar/,
      );
    });

    it('endet an der Organisationsgrenze', async () => {
      const fremd = await fremdeOrganisation();
      const unsere = await erzeuge(users.teamLead);
      const ihre = await erzeuge(fremd.owner);
      const fremderTermin = await termin(4, {
        org: fremd.organizationId,
        staff: fremd.staffMember,
        patient: fremd.patient,
        art: 'video',
      });
      expect(await kennungen(ihre)).toEqual([pruefsumme(`${fremderTermin}:${pruefsumme(ihre)}`)]);
      expect(await kennungen(unsere)).not.toContain(
        pruefsumme(`${fremderTermin}:${pruefsumme(unsere)}`),
      );
    });
  });
});
