import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asServiceRole,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

// Kalender-Abo (Prinzipien 0.32 §3.4, ANN-838): eine geheime Adresse je Konto, nur als Prüfsumme.
const { users, patients } = SEED;

const ORG = '22222222-2222-4222-8222-000000000001';
const PRAXIS = '33333333-3333-4333-8333-000000000001';
const TIM = '55555555-5555-4555-8555-000000000004';
const ANNA = '55555555-5555-4555-8555-000000000002';

interface Eintrag {
  uid: string;
  beginn: string;
  ende: string;
  art: string;
}

const ERZEUGEN = 'select public.create_own_calendar_feed() as adresse';
const SEIT = 'select * from public.get_own_calendar_feed()';
const BEENDEN = 'select public.end_own_calendar_feed()';
const ABO = 'select public.calendar_feed($1) as abo';

async function erzeuge(konto: string): Promise<string> {
  const { rows } = await asUserCommitted<{ adresse: string }>(konto, ERZEUGEN);
  return rows[0]!.adresse;
}

async function abo(adresse: string): Promise<Eintrag[] | null> {
  const { rows } = await asServiceRole<{ abo: Eintrag[] | null }>(ABO, [adresse]);
  return rows[0]!.abo;
}

function pruefsumme(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

/** Ein Termin von Tim um 02:00 UTC, `tage` vom heutigen Tag aus; nachts kollidiert er mit nichts. */
async function termin(
  tage: number,
  teil: { status?: string; art?: string; staff?: string; org?: string; patient?: string } = {},
): Promise<string> {
  const art = teil.art ?? 'practice';
  const abgesagt = teil.status === 'cancelled';
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id, appointment_type, status,
       starts_at, ends_at, visit_street, visit_house_number, visit_postal_code, visit_city,
       cancelled_at, cancelled_by, cancellation_reason
     ) values (
       $1, $2, $3, case when $4 = 'practice' then $5::uuid end, $4, $6,
       date_trunc('day', now()) + make_interval(days => $7::int, hours => 2),
       date_trunc('day', now()) + make_interval(days => $7::int, hours => 2, mins => 30),
       case when $4 = 'home_visit' then 'Testweg' end, case when $4 = 'home_visit' then '1' end,
       case when $4 = 'home_visit' then '72070' end, case when $4 = 'home_visit' then 'Tübingen' end,
       case when $8 then now() end, case when $8 then $9::uuid end,
       case when $8 then 'practice_request' end
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
  });

  describe('Die Kalenderdatei', () => {
    it('liest allein der Dienst, nie ein Konto oder anon', async () => {
      const adresse = await erzeuge(users.teamLead);
      for (const konto of [users.teamLead, users.ownerTherapist, users.plattformTina]) {
        await expect(asUser(konto, ABO, [adresse])).rejects.toThrow(/permission denied/i);
      }
      await expect(asAnon(ABO, [adresse])).rejects.toThrow(/permission denied/i);
      // Die Hilfen dahinter ruft keine Anwendungsrolle direkt auf.
      await expect(asUser(users.teamLead, `select app.calendar_feed_hash('x')`)).rejects.toThrow(
        /permission denied/i,
      );
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

      const kennungen = new Set((await abo(adresse))!.map((e) => e.uid));
      const kennung = (id: string) => pruefsumme(`${id}:${pruefsumme(adresse)}`);
      for (const id of [nochDrin, weitVoraus, hausbesuch, video]) {
        expect(kennungen.has(kennung(id))).toBe(true);
      }
      for (const id of [zuAlt, zuWeit, abgesagt, vonAnna]) {
        expect(kennungen.has(kennung(id))).toBe(false);
      }
      // Genau Tims Termine im Fenster, keiner mehr und keiner weniger.
      const { rows } = await asPostgres<{ id: string }>(
        `select id from public.appointments
          where staff_member_id = $1 and status <> 'cancelled'
            and ends_at >= now() - interval '7 days' and starts_at < now() + interval '90 days'`,
        [TIM],
      );
      expect([...kennungen].sort()).toEqual(rows.map((r) => kennung(r.id)).sort());
    });

    it('nennt je Termin nur Kennung, Beginn, Ende und Art - keinen Namen, keine Adresse', async () => {
      const adresse = await erzeuge(users.teamLead);
      const hausbesuch = await termin(4, { art: 'home_visit' });
      const eintraege = (await abo(adresse))!;
      expect(eintraege.length).toBeGreaterThan(0);
      for (const eintrag of eintraege) {
        expect(Object.keys(eintrag).sort()).toEqual(['art', 'beginn', 'ende', 'uid']);
        expect(eintrag.uid).toMatch(/^[0-9a-f]{64}$/);
        expect(['home_visit', 'practice', 'video']).toContain(eintrag.art);
      }
      const text = JSON.stringify(eintraege);
      for (const verboten of [hausbesuch, 'Testweg', '72070', 'Tübingen', 'Max', patients.max]) {
        expect(text).not.toContain(verboten);
      }
      expect(eintraege.find((e) => e.art === 'home_visit')).toBeDefined();
    });

    it('vergibt mit einer neuen Adresse neue Kennungen', async () => {
      const id = await termin(4);
      const alt = await erzeuge(users.teamLead);
      const altKennung = pruefsumme(`${id}:${pruefsumme(alt)}`);
      expect((await abo(alt))!.some((e) => e.uid === altKennung)).toBe(true);
      const neu = await erzeuge(users.teamLead);
      const neuKennungen = (await abo(neu))!.map((e) => e.uid);
      expect(neuKennungen).not.toContain(altKennung);
      expect(neuKennungen).toContain(pruefsumme(`${id}:${pruefsumme(neu)}`));
    });

    it('ist leer bei unbekannter Adresse, gesperrtem Konto oder ausgeschiedener Person', async () => {
      expect(await abo('a'.repeat(43))).toBeNull();
      expect(await abo('zu-kurz')).toBeNull();
      expect(await abo("'; select 1; --")).toBeNull();

      const adresse = await erzeuge(users.teamLead);
      expect(await abo(adresse)).not.toBeNull();
      await asPostgres('update public.user_profiles set is_active = false where id = $1', [
        users.teamLead,
      ]);
      expect(await abo(adresse)).toBeNull();
      await asPostgres('update public.user_profiles set is_active = true where id = $1', [
        users.teamLead,
      ]);
      expect(await abo(adresse)).not.toBeNull();
      await asPostgres(
        "update public.staff_members set employment_status = 'inactive' where id = $1",
        [TIM],
      );
      expect(await abo(adresse)).toBeNull();
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
      const ihreKennungen = (await abo(ihre))!.map((e) => e.uid);
      expect(ihreKennungen).toEqual([pruefsumme(`${fremderTermin}:${pruefsumme(ihre)}`)]);
      const unsereKennungen = (await abo(unsere))!.map((e) => e.uid);
      expect(unsereKennungen).not.toContain(pruefsumme(`${fremderTermin}:${pruefsumme(unsere)}`));
    });
  });
});
