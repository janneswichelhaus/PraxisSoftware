import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asAnon,
  asPostgres,
  asServiceRole,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
} from './helpers/db';

/**
 * BEF-181 (ADR-019 Fassung 6): Ladestrom aus den Kilometern der geplanten
 * Touren.
 *
 * Geprüft werden die Wegpunkte (dieselben Stopps wie die Tagesroute, Beginn
 * und Ende an Garage oder Startort, ohne Datum, Zeit, Kennung oder Namen),
 * wer sie bekommt (nur die eigene Person, nur abgeschlossene Monate), das
 * Eintragen der Monatssumme (nur service_role, einmal, binnen zehn Minuten,
 * nur am eigenen, noch nicht von anderen entschiedenen Antrag), die
 * Bedingung an der Tabelle und wer Kilometer und Betrag sieht (ANN-616: die
 * Person und owner, das Büro nicht). Kein Auditeintrag (ADR-010 Fassung 3).
 */

const { users, organizationId, patients } = SEED;

const ANNA = '55555555-5555-4555-8555-000000000002';
const JANNES = '55555555-5555-4555-8555-000000000001';
const LOCATION = '33333333-3333-4333-8333-000000000001';

const IBAN_ANNA = 'DE89370400440532013000';
const IBAN_JANNES = 'DE75512108001245126199';

const PUNKTE = 'select public.electricity_tour_points($1::date) as daten';
const STROM = 'select public.submit_electricity_reimbursement($1::date, $2::boolean, $3) as daten';
const EINTRAGEN =
  'select public.record_electricity_tour_distance($1::uuid, $2::uuid, $3::integer) as daten';
const ENTSCHEIDEN = 'select public.decide_reimbursement($1::uuid, $2::boolean, $3) as daten';
const LISTE = 'select public.list_reimbursements($1::uuid) as daten';

const PRAXIS = { lat: 48.5216, lon: 9.0576 };
const MAX = { lat: 48.5305, lon: 9.049 };
const ERIKA = { lat: 48.5164, lon: 9.0349 };
const GARAGE = { lat: 48.52, lon: 9.06 };

type Punkt = { lat: number; lon: number };

async function code(versuch: Promise<unknown>): Promise<string> {
  const fehler = await abgefangen(versuch);
  return fehler ? String((fehler as { code?: string }).code ?? fehler.message) : 'kein Fehler';
}

/** Der Erste eines Monats vor `zurueck` Monaten, in der Zeitzone der Praxis. */
async function monat(zurueck: number): Promise<string> {
  const { rows } = await asPostgres<{ m: string }>(
    `select to_char(date_trunc('month', now() at time zone 'Europe/Berlin')
                    - make_interval(months => $1), 'YYYY-MM-DD') as m`,
    [zurueck],
  );
  return rows[0]!.m;
}

/** Ein Tag des Monats: der `n`-te. */
function tag(ersterTag: string, n: number): string {
  return `${ersterTag.slice(0, 8)}${String(n).padStart(2, '0')}`;
}

const ANSCHRIFT: Record<string, [string, string, string, string]> = {
  [patients.max]: ['Beispielstrasse', '12', '72070', 'Tuebingen'],
  [patients.erika]: ['Testweg', '7', '72072', 'Tuebingen'],
};

async function termin(opts: {
  tag: string;
  von: string;
  bis: string;
  typ?: 'home_visit' | 'practice' | 'video';
  status?: 'confirmed' | 'cancelled';
  staff?: string;
  patient?: string;
}): Promise<string> {
  const typ = opts.typ ?? 'home_visit';
  const status = opts.status ?? 'confirmed';
  const patient = opts.patient ?? patients.max;
  const anschrift = typ === 'home_visit' ? ANSCHRIFT[patient]! : [null, null, null, null];
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at,
       visit_street, visit_house_number, visit_postal_code, visit_city,
       cancelled_at, cancelled_by
     ) values (
       $1, $2, $3, $4, $5, $6,
       (($7::date + $8::time) at time zone 'Europe/Berlin'),
       (($7::date + $9::time) at time zone 'Europe/Berlin'),
       $10, $11, $12, $13,
       case when $6 = 'cancelled' then now() end,
       case when $6 = 'cancelled' then $14::uuid end
     ) returning id`,
    [
      organizationId,
      patient,
      opts.staff ?? ANNA,
      typ === 'practice' ? LOCATION : null,
      typ,
      status,
      opts.tag,
      opts.von,
      opts.bis,
      ...anschrift,
      users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

async function punkte(konto: string, ersterTag: string): Promise<Punkt[][]> {
  const { rows } = await asUser<{ daten: Punkt[][] }>(konto, PUNKTE, [ersterTag]);
  return rows[0]!.daten;
}

async function strom(
  konto: string,
  ersterTag: string,
): Promise<{ id: string; amount_cents: number }> {
  const { rows } = await asUserCommitted<{ daten: { id: string; amount_cents: number } }>(
    konto,
    STROM,
    [ersterTag, true, null],
  );
  return rows[0]!.daten;
}

async function eintragen(id: string, konto: string, km: number) {
  const { rows } = await asServiceRole<{
    daten: { id: string; tour_km: number; amount_cents: number };
  }>(EINTRAGEN, [id, konto, km]);
  return rows[0]!.daten;
}

async function antrag(id: string) {
  const { rows } = await asPostgres<{
    tour_km: number | null;
    km_per_hour: number | null;
    working_minutes: number | null;
    wh_per_km: number;
    rate_cents_per_kwh: number;
    amount_cents: number;
  }>(
    `select tour_km, km_per_hour, working_minutes, wh_per_km, rate_cents_per_kwh, amount_cents
       from public.staff_reimbursements where id = $1`,
    [id],
  );
  return rows[0]!;
}

describe('Ladestrom aus Touren (BEF-181)', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
    await asUserCommitted(users.therapist, 'select public.set_own_payout_account($1)', [IBAN_ANNA]);
    await asUserCommitted(users.ownerTherapist, 'select public.set_own_payout_account($1)', [
      IBAN_JANNES,
    ]);
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.staff_reimbursements');
    await asPostgres('delete from public.appointments');
    await asPostgres(
      `update public.locations
          set garage_street = null, garage_house_number = null, garage_postal_code = null,
              garage_city = null, garage_lat = null, garage_lon = null,
              garage_geocode_precision = null
        where id = $1`,
      [LOCATION],
    );
  });

  describe('Wegpunkte der Touren', () => {
    it('fährt je Tag vom Startort über die Termine mit Ort zurück - ohne Datum, Zeit oder Kennung', async () => {
      const m = await monat(1);
      await termin({ tag: tag(m, 3), von: '09:00', bis: '10:00', patient: patients.max });
      await termin({ tag: tag(m, 3), von: '11:00', bis: '12:00', typ: 'practice' });
      await termin({ tag: tag(m, 3), von: '14:00', bis: '15:00', patient: patients.erika });
      await termin({ tag: tag(m, 5), von: '09:00', bis: '10:00', patient: patients.erika });

      const tage = await punkte(users.therapist, m);

      expect(tage).toEqual([
        // Der Praxistermin liegt am Startort - er fällt mit dem Weg dorthin nicht zusammen,
        // weil zwischen Max und Erika gefahren wird.
        [PRAXIS, MAX, PRAXIS, ERIKA, PRAXIS],
        [PRAXIS, ERIKA, PRAXIS],
      ]);
      const text = JSON.stringify(tage);
      expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}|[0-9a-f]{8}-[0-9a-f]{4}|Beispielstrasse|Max/);
    });

    it('beginnt und endet an der Garage, wenn sie gesetzt ist', async () => {
      const m = await monat(1);
      await asPostgres(
        `update public.locations
            set garage_street = 'Radweg', garage_house_number = '3', garage_postal_code = '72072',
                garage_city = 'Tuebingen'
          where id = $1`,
        [LOCATION],
      );
      // Die Koordinate getrennt: Eine Änderung der Anschrift verwirft sie (ANN-016).
      await asPostgres(
        `update public.locations
            set garage_lat = $2, garage_lon = $3, garage_geocode_precision = 'address'
          where id = $1`,
        [LOCATION, GARAGE.lat, GARAGE.lon],
      );
      await termin({ tag: tag(m, 4), von: '09:00', bis: '10:00' });

      expect(await punkte(users.therapist, m)).toEqual([[GARAGE, MAX, GARAGE]]);
    });

    it('lässt abgesagte Termine, Videotermine, fremde Personen und andere Monate weg', async () => {
      const m = await monat(1);
      const vorher = await monat(2);
      await termin({ tag: tag(m, 3), von: '09:00', bis: '10:00', status: 'cancelled' });
      await termin({ tag: tag(m, 3), von: '10:00', bis: '11:00', typ: 'video' });
      await termin({ tag: tag(m, 3), von: '11:00', bis: '12:00', staff: JANNES });
      await termin({ tag: tag(vorher, 3), von: '09:00', bis: '10:00' });

      expect(await punkte(users.therapist, m)).toEqual([]);
      expect(await punkte(users.ownerTherapist, m)).toEqual([[PRAXIS, MAX, PRAXIS]]);
    });

    it('lässt zwei Termine am selben Ort zu einem Punkt zusammenfallen', async () => {
      const m = await monat(1);
      await termin({ tag: tag(m, 6), von: '09:00', bis: '10:00' });
      await termin({ tag: tag(m, 6), von: '10:00', bis: '11:00' });

      expect(await punkte(users.therapist, m)).toEqual([[PRAXIS, MAX, PRAXIS]]);
    });

    it('gibt die Punkte nur für abgeschlossene Monate und nur Praxiskonten mit Mitarbeiterdatensatz', async () => {
      const laufend = await monat(0);
      expect(await code(punkte(users.therapist, laufend))).toBe('22023');
      expect(await code(punkte(users.therapist, await monat(13)))).toBe('22023');
      expect(await code(punkte(users.patientMax, await monat(1)))).toBe('42501');
      expect(await code(punkte(users.plattformTina, await monat(1)))).toBe('42501');
      expect(await code(asAnon(PUNKTE, [await monat(1)]))).toBe('42501');
    });

    it('liefert einer anderen Praxis nie die Touren dieser Praxis', async () => {
      const fremd = await fremdeOrganisation();
      const m = await monat(1);
      await termin({ tag: tag(m, 3), von: '09:00', bis: '10:00' });
      // Die fremde owner hat einen Mitarbeiterdatensatz, aber keine Touren hier.
      expect(await punkte(fremd.owner, m)).toEqual([]);
    });
  });

  describe('Eintragen der Monatssumme', () => {
    it('gibt das Eintragen nur service_role, die Wegpunkte angemeldeten Konten, die Hilfe niemandem', async () => {
      const { rows } = await asPostgres<{
        name: string;
        auth: boolean;
        anon: boolean;
        dienst: boolean;
      }>(
        `select p.oid::regprocedure::text as name,
                has_function_privilege('authenticated', p.oid, 'execute') as auth,
                has_function_privilege('anon', p.oid, 'execute') as anon,
                has_function_privilege('service_role', p.oid, 'execute') as dienst
           from pg_proc p join pg_namespace n on n.oid = p.pronamespace
          where (n.nspname = 'public' and p.proname in (
                  'electricity_tour_points', 'record_electricity_tour_distance'))
             or (n.nspname = 'app' and p.proname = 'electricity_tour_days')
          order by 1`,
      );
      expect(rows).toEqual([
        {
          name: 'app.electricity_tour_days(uuid,uuid,date)',
          auth: false,
          anon: false,
          dienst: false,
        },
        { name: 'electricity_tour_points(date)', auth: true, anon: false, dienst: false },
        {
          name: 'record_electricity_tour_distance(uuid,uuid,integer)',
          auth: false,
          anon: false,
          dienst: true,
        },
      ]);
    });

    it('lässt die Person die Summe nicht selbst setzen', async () => {
      const m = await monat(1);
      const { id } = await strom(users.therapist, m);
      expect(await code(asUser(users.therapist, EINTRAGEN, [id, users.therapist, 9999]))).toBe(
        '42501',
      );
      expect(await code(asAnon(EINTRAGEN, [id, users.therapist, 9999]))).toBe('42501');
      expect((await antrag(id)).tour_km).toBeNull();
    });

    it('trägt die Summe ein und rechnet den Betrag aus km × Wh/km × ct/kWh neu', async () => {
      const m = await monat(1);
      const { id, amount_cents: vorher } = await strom(users.therapist, m);
      const vor = await antrag(id);
      expect(vor.km_per_hour).toBe(6);

      const ergebnis = await eintragen(id, users.therapist, 412);

      const nach = await antrag(id);
      const erwartet = Math.floor((412 * vor.wh_per_km * vor.rate_cents_per_kwh + 500) / 1000);
      expect(ergebnis).toEqual({ id, tour_km: 412, amount_cents: erwartet });
      expect(nach).toMatchObject({
        tour_km: 412,
        km_per_hour: null,
        working_minutes: vor.working_minutes,
        amount_cents: erwartet,
      });
      expect(erwartet).not.toBe(vorher);
    });

    it('trägt höchstens einmal ein', async () => {
      const { id } = await strom(users.therapist, await monat(1));
      await eintragen(id, users.therapist, 100);
      expect(await code(eintragen(id, users.therapist, 200))).toBe('P0002');
      expect((await antrag(id)).tour_km).toBe(100);
    });

    it('trägt nur für das Konto ein, das beantragt hat', async () => {
      const { id } = await strom(users.therapist, await monat(1));
      expect(await code(eintragen(id, users.ownerTherapist, 100))).toBe('P0002');
      expect(await code(eintragen(id, users.office, 100))).toBe('P0002');
      expect((await antrag(id)).tour_km).toBeNull();
    });

    it('trägt nach zehn Minuten nichts mehr ein', async () => {
      const { id } = await strom(users.therapist, await monat(1));
      await asPostgres(
        `update public.staff_reimbursements set requested_at = now() - interval '11 minutes' where id = $1`,
        [id],
      );
      expect(await code(eintragen(id, users.therapist, 100))).toBe('P0002');
    });

    it('lässt einen schon entschiedenen Antrag, wie er ist', async () => {
      const { id, amount_cents } = await strom(users.therapist, await monat(1));
      await asUserCommitted(users.ownerTherapist, ENTSCHEIDEN, [id, true, null]);
      expect(await code(eintragen(id, users.therapist, 100))).toBe('P0002');
      expect(await antrag(id)).toMatchObject({ tour_km: null, amount_cents });
    });

    it('trägt beim selbst eingetragenen Antrag von owner ein, solange er nicht ausgezahlt ist', async () => {
      const { id } = await strom(users.ownerTherapist, await monat(1));
      expect((await eintragen(id, users.ownerTherapist, 50)).tour_km).toBe(50);
    });

    it('lehnt eine Summe außerhalb der Grenzen und ein deaktiviertes Konto ab', async () => {
      const { id } = await strom(users.therapist, await monat(1));
      expect(await code(eintragen(id, users.therapist, 0))).toBe('22023');
      expect(await code(eintragen(id, users.therapist, 10001))).toBe('22023');
      await asPostgres('update public.user_profiles set is_active = false where id = $1', [
        users.therapist,
      ]);
      try {
        expect(await code(eintragen(id, users.therapist, 100))).toBe('P0002');
      } finally {
        await asPostgres('update public.user_profiles set is_active = true where id = $1', [
          users.therapist,
        ]);
      }
    });

    it('hält die Rechnung an der Tabelle fest', async () => {
      const { id } = await strom(users.therapist, await monat(1));
      expect(
        await code(
          asPostgres(
            `update public.staff_reimbursements
                set tour_km = 100, km_per_hour = null, amount_cents = amount_cents + 1
              where id = $1`,
            [id],
          ),
        ),
      ).toBe('23514');
      expect(
        await code(
          asPostgres(`update public.staff_reimbursements set tour_km = 100 where id = $1`, [id]),
        ),
      ).toBe('23514');
    });

    it('schreibt keinen Auditeintrag', async () => {
      const { rows: vorher } = await asPostgres<{ n: number }>(
        'select count(*)::int as n from public.audit_log',
      );
      const { id } = await strom(users.therapist, await monat(1));
      await eintragen(id, users.therapist, 100);
      const { rows: nachher } = await asPostgres<{ n: number }>(
        'select count(*)::int as n from public.audit_log',
      );
      expect(nachher[0]!.n).toBe(vorher[0]!.n);
    });
  });

  describe('Wer Kilometer und Betrag sieht (ANN-616)', () => {
    async function liste(konto: string, person: string | null) {
      const { rows } = await asUser<{
        daten: {
          person: {
            reimbursements: {
              id: string;
              tour_km: number | null;
              amount_cents: number | null;
              wh_per_km: number | null;
              rate_cents_per_kwh: number | null;
            }[];
          };
          to_decide: { id: string; tour_km: number | null; amount_cents: number | null }[];
        };
      }>(konto, LISTE, [person]);
      return rows[0]!.daten;
    }

    it('zeigt sie der Person und owner, dem Büro weder Kilometer noch Betrag', async () => {
      const { id } = await strom(users.therapist, await monat(1));
      const { amount_cents } = await eintragen(id, users.therapist, 412);

      const eigene = (await liste(users.therapist, null)).person.reimbursements[0]!;
      expect(eigene).toMatchObject({ id, tour_km: 412, amount_cents });

      const owner = await liste(users.ownerTherapist, ANNA);
      expect(owner.person.reimbursements[0]).toMatchObject({ tour_km: 412, amount_cents });
      expect(owner.to_decide[0]).toMatchObject({ id, tour_km: 412, amount_cents });

      const buero = (await liste(users.office, ANNA)).person.reimbursements[0]!;
      expect(buero).toMatchObject({
        id,
        tour_km: null,
        amount_cents: null,
        wh_per_km: null,
        rate_cents_per_kwh: null,
      });
    });

    it('zeigt dem Büro einen Antrag nach km je Stunde weiter mit Betrag', async () => {
      const { id, amount_cents } = await strom(users.therapist, await monat(1));
      const buero = (await liste(users.office, ANNA)).person.reimbursements[0]!;
      expect(buero).toMatchObject({ id, tour_km: null, amount_cents });
    });
  });
});
