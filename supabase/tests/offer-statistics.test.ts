import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Je Zahl die Faelle der einen Quelle `get_offer_statistics` (ANN-831), dazu die Liste der Pakete
 * ohne Anschluss aus derselben Regel (ANN-834). Gezaehlt wird gegen den Ausgangsstand.
 */
const { users, organizationId, patients, trainingRelationships } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';
const TP3 = 'cccccccc-cccc-4ccc-8ccc-000000000014';
const TZ = 'Europe/Berlin';

const ZAHLEN = 'select * from public.get_offer_statistics($1::date)';
const LISTE = 'select * from public.list_ending_training_packages()';

interface Angebotszahlen {
  time_zone: string;
  today: string;
  month: string;
  training_clients: number;
  packages_running: number;
  packages_started: number;
  packages_ending: number;
  packages_ending_until: string;
  aftercare_running: number;
  aftercare_started: number;
  aftercare_cancelled: number;
  training_sessions: number;
}

async function zahlen(monat: string | null = null): Promise<Angebotszahlen> {
  const { rows } = await asUser<Angebotszahlen>(
    users.ownerTherapist,
    `select time_zone, to_char(today, 'YYYY-MM-DD') as today, to_char(month, 'YYYY-MM-DD') as month,
            training_clients, packages_running, packages_started, packages_ending,
            to_char(packages_ending_until, 'YYYY-MM-DD') as packages_ending_until,
            aftercare_running, aftercare_started, aftercare_cancelled, training_sessions
       from public.get_offer_statistics($1::date)`,
    [monat],
  );
  expect(rows).toHaveLength(1);
  return rows[0]!;
}

interface PaketOhneAnschluss {
  training_relationship_id: string;
  given_name: string | null;
  family_name: string | null;
  package_months: number;
  ends_on: string;
}

async function liste(konto: string = users.ownerTherapist): Promise<PaketOhneAnschluss[]> {
  const { rows } = await asUser<PaketOhneAnschluss>(
    konto,
    `select training_relationship_id, given_name, family_name, package_months,
            to_char(ends_on, 'YYYY-MM-DD') as ends_on
       from public.list_ending_training_packages()`,
  );
  return rows;
}

async function datum(ausdruck: string): Promise<string> {
  const { rows } = await asPostgres<{ t: string }>(
    `select to_char(${ausdruck}, 'YYYY-MM-DD') as t`,
  );
  return rows[0]!.t;
}

/** Tage ab heute in der Zeitzone der Praxis, als SQL-Ausdruck. */
const tag = (tage: number) => `((now() at time zone '${TZ}')::date + ${tage})`;
/** Tage ab dem Monatsanfang, als SQL-Ausdruck. */
const imMonat = (tage: number) =>
  `(date_trunc('month', now() at time zone '${TZ}')::date + ${tage})`;

async function monatsanfang(): Promise<string> {
  const { rows } = await asPostgres<{ monat: string }>(
    `select to_char(date_trunc('month', (now() at time zone '${TZ}')::date), 'YYYY-MM-DD') as monat`,
  );
  return rows[0]!.monat;
}

async function paket(
  beginn: string,
  ende: string,
  verhaeltnis: string = trainingRelationships.tina,
) {
  await asPostgres(
    `insert into public.training_packages
       (organization_id, training_relationship_id, catalog_item_id, starts_on, ends_on)
     values ($1, $2, $3, ${beginn}, ${ende})`,
    [organizationId, verhaeltnis, TP3],
  );
}

async function abo(beginn: string, patientin: string = patients.erika): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.aftercare_subscriptions (organization_id, patient_id, starts_on, created_by)
     values ($1, $2, ${beginn}, $3) returning id`,
    [organizationId, patientin, users.office],
  );
  return rows[0]!.id;
}

async function kuendige(id: string, eingang: string, ende: string) {
  await asPostgres(
    `update public.aftercare_subscriptions
        set cancelled_at = now(), cancelled_by = $2, cancelled_on = ${eingang},
            cancelled_via = 'practice', ends_on = ${ende}
      where id = $1`,
    [id, users.office],
  );
}

async function trainingstermin(stunde: number, status: string, beratung = false) {
  const abgesagt = status === 'cancelled';
  await asPostgres(
    `insert into public.appointments (
       organization_id, kind, training_relationship_id, staff_member_id, location_id,
       appointment_type, status, occasion, starts_at, ends_at, cancelled_at, cancelled_by
     ) values (
       $1, 'training', $2, $3, $4, 'practice', $5, $6,
       (date_trunc('month', now() at time zone '${TZ}') + make_interval(hours => $7::int)) at time zone '${TZ}',
       (date_trunc('month', now() at time zone '${TZ}') + make_interval(hours => $7::int + 1)) at time zone '${TZ}',
       $8, $9
     )`,
    [
      organizationId,
      trainingRelationships.erika,
      STAFF_ANNA,
      LOCATION,
      status,
      beratung ? 'nutrition_counselling' : 'regular',
      stunde,
      abgesagt ? new Date().toISOString() : null,
      abgesagt ? users.office : null,
    ],
  );
}

describe('Kennzahlen fuer Training, Abo und Pakete (PRX-041)', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  describe('Trainingspakete', () => {
    it('zaehlt laufende Pakete zum Stand heute - ein kuenftiges und ein abgelaufenes nicht', async () => {
      const vorher = await zahlen();
      // Zwei Pakete eines Verhaeltnisses ueberschneiden sich nie (training_packages_no_overlap).
      await paket(tag(-100), tag(-31));
      await paket(tag(-30), tag(60));
      await paket(tag(0), tag(0), trainingRelationships.erika);
      await paket(tag(1), tag(90), trainingRelationships.erika);
      expect((await zahlen()).packages_running - vorher.packages_running).toBe(2);
    });

    it('zaehlt neue Pakete nach dem Beginn im gewaehlten Monat', async () => {
      const monat = await monatsanfang();
      const vorher = await zahlen(monat);
      await paket(imMonat(0), imMonat(90));
      await paket(imMonat(-1), imMonat(90), trainingRelationships.erika);
      const k = await zahlen(monat);
      expect(k.month).toBe(monat);
      expect(k.packages_started - vorher.packages_started).toBe(1);
    });

    it('zaehlt ein Paket ohne Anschluss bis Tag 27, nicht Tag 28 und nicht mit Folgepaket', async () => {
      const vorher = await zahlen();
      await paket(tag(-60), tag(27));
      await paket(tag(-60), tag(28), trainingRelationships.erika);
      let k = await zahlen();
      expect(k.packages_ending - vorher.packages_ending).toBe(1);
      expect(k.packages_ending_until).toBe(
        (await asPostgres<{ t: string }>(`select to_char(${tag(27)}, 'YYYY-MM-DD') as t`)).rows[0]!
          .t,
      );

      // Das Folgepaket ist gebucht: niemand muss angesprochen werden.
      await paket(tag(28), tag(118));
      k = await zahlen();
      expect(k.packages_ending - vorher.packages_ending).toBe(0);
    });

    it('zaehlt ein endendes Paket nicht, wenn das Trainingsverhaeltnis beendet ist', async () => {
      const vorher = await zahlen();
      await paket(tag(-60), tag(5));
      await asPostgres(
        `update public.training_relationships set status = 'inactive' where id = $1`,
        [trainingRelationships.tina],
      );
      const k = await zahlen();
      expect(k.packages_ending - vorher.packages_ending).toBe(0);
      expect(vorher.training_clients - k.training_clients).toBe(1);
    });
  });

  describe('Nachsorge-Abos', () => {
    it('zaehlt laufende und neue Abos; ein vor dem Beginn gekuendigtes zaehlt nirgends', async () => {
      const monat = await monatsanfang();
      const vorher = await zahlen(monat);
      await abo(imMonat(0));
      const nie = await abo(tag(10), patients.max);
      await kuendige(nie, tag(0), tag(9));
      const k = await zahlen(monat);
      // Laufend nur, wenn der Monatsanfang nicht nach heute liegt - er tut es nie.
      expect(k.aftercare_running - vorher.aftercare_running).toBe(1);
      expect(k.aftercare_started - vorher.aftercare_started).toBe(1);
    });

    it('laesst ein gekuendigtes Abo bis zu seinem Ende laufen und zaehlt die Kuendigung im Monat des Eingangs', async () => {
      const monat = await monatsanfang();
      const vorher = await zahlen(monat);
      const a = await abo(tag(-40));
      await kuendige(a, imMonat(0), tag(20));
      const b = await abo(tag(-80), patients.max);
      await kuendige(b, imMonat(-1), tag(-1));
      const k = await zahlen(monat);
      expect(k.aftercare_running - vorher.aftercare_running).toBe(1);
      expect(k.aftercare_cancelled - vorher.aftercare_cancelled).toBe(1);
    });
  });

  describe('Trainingstermine', () => {
    it('zaehlt stattgefundene Trainingstermine des Monats - ohne Absage, Plan und Beratung', async () => {
      const monat = await monatsanfang();
      const vorher = await zahlen(monat);
      await trainingstermin(8, 'documented');
      await trainingstermin(9, 'invoiced');
      await trainingstermin(10, 'cancelled');
      await trainingstermin(11, 'confirmed');
      await trainingstermin(12, 'documented', true);
      const k = await zahlen(monat);
      expect(k.training_sessions - vorher.training_sessions).toBe(2);
    });
  });

  describe('Wer die Zahlen sieht', () => {
    it('liefert nur Summen - keine Person, keine Kennung', async () => {
      const k = await zahlen();
      for (const spalte of Object.keys(k)) {
        expect(spalte).not.toMatch(/(^|_)(id|name|staff|patient)($|_)/);
      }
    });

    it('zeigt die Zahlen allein owner und weist alle anderen protokolliert ab', async () => {
      for (const konto of [
        users.office,
        users.therapist,
        users.teamLead,
        users.trainer,
        users.patientMax,
        users.patientErika,
      ]) {
        await erwarteAbgewiesenenLeseversuch(konto, ZAHLEN, [null], 'statistics.read');
      }
      await expect(asAnon(ZAHLEN, [null])).rejects.toThrow(/permission denied/i);
    });

    it('endet an der Organisationsgrenze - in jeder der acht Zahlen', async () => {
      const monat = await monatsanfang();
      await paket(imMonat(0), tag(10));
      const a = await abo(imMonat(0));
      await kuendige(a, imMonat(0), tag(20));
      await trainingstermin(8, 'documented');
      const eigen = await zahlen(monat);
      expect(eigen.packages_started).toBeGreaterThan(0);
      expect(eigen.aftercare_cancelled).toBeGreaterThan(0);
      expect(eigen.training_sessions).toBeGreaterThan(0);

      const fremd = await fremdeOrganisation();
      const { rows } = await asUser<Angebotszahlen>(fremd.owner, ZAHLEN, [monat]);
      expect(rows[0]).toMatchObject({
        training_clients: 0,
        packages_running: 0,
        packages_started: 0,
        packages_ending: 0,
        aftercare_running: 0,
        aftercare_started: 0,
        aftercare_cancelled: 0,
        training_sessions: 0,
      });
    });

    it('weist einen Monat ausserhalb jeder Vernunft ab', async () => {
      await expect(asUser(users.ownerTherapist, ZAHLEN, ['1999-01-01'])).rejects.toThrow(
        /month out of range/,
      );
    });
  });

  describe('Liste der Pakete ohne Anschluss (PRX-043)', () => {
    it('listet genau, was die Kennzahl zaehlt - Tag 27 ja, Tag 28 nicht, mit Folgepaket nicht', async () => {
      expect(await liste()).toEqual([]);
      const vorher = await zahlen();
      await paket(tag(-60), tag(27));
      await paket(tag(-60), tag(28), trainingRelationships.erika);

      const zeilen = await liste();
      expect(zeilen.map((z) => z.training_relationship_id)).toEqual([trainingRelationships.tina]);
      expect(zeilen[0]!.ends_on).toBe(await datum(tag(27)));
      expect((await zahlen()).packages_ending - vorher.packages_ending).toBe(zeilen.length);

      // Das Folgepaket ist gebucht: Die Zeile geht, die Zahl mit ihr.
      await paket(tag(28), tag(118));
      expect(await liste()).toEqual([]);
      expect((await zahlen()).packages_ending).toBe(vorher.packages_ending);
    });

    it('laesst ein abgelaufenes Paket und ein beendetes Verhaeltnis weg', async () => {
      await paket(tag(-90), tag(-1));
      await paket(tag(-60), tag(5), trainingRelationships.erika);
      expect((await liste()).map((z) => z.training_relationship_id)).toEqual([
        trainingRelationships.erika,
      ]);

      await asPostgres(
        `update public.training_relationships set status = 'inactive' where id = $1`,
        [trainingRelationships.erika],
      );
      expect(await liste()).toEqual([]);
    });

    it('nennt nur Name, Laufzeit und letzten Tag, das naechste Ende zuerst', async () => {
      await paket(tag(-60), tag(20));
      await paket(tag(-60), tag(3), trainingRelationships.erika);
      const zeilen = await liste(users.office);
      expect(zeilen.map((z) => z.training_relationship_id)).toEqual([
        trainingRelationships.erika,
        trainingRelationships.tina,
      ]);
      expect(zeilen[0]).toMatchObject({ package_months: 3, ends_on: await datum(tag(3)) });
      expect(zeilen[0]!.family_name).toBeTruthy();

      // Kein Kontakt, keine Kennung des Pakets, kein Preis (ANN-834).
      const { rows } = await asUser<Record<string, unknown>>(users.office, LISTE);
      expect(Object.keys(rows[0]!).sort()).toEqual([
        'ends_on',
        'family_name',
        'given_name',
        'package_months',
        'training_relationship_id',
      ]);
    });

    it('zeigt die Liste owner und office und weist alle anderen protokolliert ab', async () => {
      await paket(tag(-60), tag(10));
      expect(await liste(users.ownerTherapist)).toHaveLength(1);
      expect(await liste(users.office)).toHaveLength(1);
      // Trainingsbetreuung und Therapie lesen keine Pakete (ANN-071), Patientenkonten nie.
      for (const konto of [
        users.therapist,
        users.teamLead,
        users.trainer,
        users.patientMax,
        users.patientErika,
      ]) {
        await erwarteAbgewiesenenLeseversuch(konto, LISTE, [], 'training_packages.read');
      }
      await expect(asUser(null, LISTE)).rejects.toThrow(/not authenticated/);
      await expect(asAnon(LISTE)).rejects.toThrow(/permission denied/i);
    });

    it('endet an der Organisationsgrenze', async () => {
      await paket(tag(-60), tag(10));
      expect(await liste()).toHaveLength(1);
      const fremd = await fremdeOrganisation();
      const { rows } = await asUser(fremd.owner, LISTE);
      expect(rows).toEqual([]);
    });

    it('laesst die Regel fuer keine Anwendungsrolle direkt aufrufen', async () => {
      for (const sql of [
        `select * from app.ending_training_packages('${organizationId}')`,
        `select app.ending_training_packages_until('${organizationId}')`,
      ]) {
        await expect(asUser(users.ownerTherapist, sql)).rejects.toThrow(/permission denied/i);
        await expect(asAnon(sql)).rejects.toThrow(/permission denied/i);
      }
    });
  });
});
