import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asAnon,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Grafiken der Statistikseite (STA-004), Vergütungsmodell (STA-005) und
 * Umsatz je behandelnder Person (STA-006, ANN-156, ANN-157).
 */
const { users, organizationId, patients } = SEED;

const JANNES = '55555555-5555-4555-8555-000000000001';
const ANNA = '55555555-5555-4555-8555-000000000002';
const TIM = '55555555-5555-4555-8555-000000000004';
const LOCATION = '33333333-3333-4333-8333-000000000001';
const TZ = 'Europe/Berlin';

const KATALOG = {
  /** Krankengymnastik, 45,00 Euro. */
  kg: 'cccccccc-cccc-4ccc-8ccc-000000000001',
  /** Manuelle Therapie, 55,00 Euro. */
  mt: 'cccccccc-cccc-4ccc-8ccc-000000000003',
} as const;

const MONATE = 'select * from public.list_practice_revenue_months($1::int)';
const LEISTUNGEN = 'select * from public.list_top_services($1::date, $2::int)';
const JE_PERSON = 'select * from public.list_revenue_by_staff($1::int)';
const MODELL = 'select public.set_staff_compensation_model($1::uuid, $2::text) as modell';

const n = (wert: string | number | null): number => Number(wert ?? 0);

async function termin(staff: string, stunde: number): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, treatment_basis_id,
       completed_at, completed_by
     ) values (
       $1, $2, $3, $4, 'practice', 'documented',
       (date_trunc('month', now() at time zone '${TZ}') + make_interval(hours => $5::int)) at time zone '${TZ}',
       (date_trunc('month', now() at time zone '${TZ}') + make_interval(hours => $5::int + 1)) at time zone '${TZ}',
       $6, now(), $7
     ) returning id`,
    [
      organizationId,
      patients.erika,
      staff,
      LOCATION,
      stunde,
      // ABR-032: ohne Grundlage, damit der Monat die Klammer bleibt.
      null,
      users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

/** Eine ausgestellte Rechnung über die angegebenen Leistungen (Person, Position). */
async function rechnung(posten: Array<[string, string]>): Promise<string> {
  let stunde = 30;
  for (const [staff, position] of posten) {
    const id = await termin(staff, stunde);
    stunde += 2;
    await asUserCommitted(
      users.ownerTherapist,
      'select public.record_billable_services($1::uuid, $2::jsonb)',
      [id, JSON.stringify([{ catalog_item_id: position, quantity: 1 }])],
    );
  }
  const monat = await asPostgres<{ m: string }>(
    `select to_char(date_trunc('month', (now() at time zone '${TZ}')::date), 'YYYY-MM-DD') as m`,
  );
  const { rows } = await asUserCommitted<{ id: string }>(
    users.office,
    'select public.create_invoice_draft($1::uuid, $2::date) as id',
    [patients.erika, monat.rows[0]!.m],
  );
  await asUserCommitted(users.office, 'select public.issue_invoice($1::uuid) as nummer', [
    rows[0]!.id,
  ]);
  return rows[0]!.id;
}

interface Monat {
  month: Date;
  revenue_cents: string;
  revenue_therapy_cents: string;
  revenue_training_cents: string;
  payments_cents: string;
}

interface Personenzeile {
  month: Date;
  staff_member_id: string | null;
  staff_name: string | null;
  revenue_cents: string;
}

describe('Umsatz der letzten Monate und Leistungen (STA-004)', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('liefert zwoelf Monate bis zum laufenden, mit Umsatz und Eingang getrennt', async () => {
    const vorher = (await asUser<Monat>(users.ownerTherapist, MONATE, [12])).rows;
    expect(vorher).toHaveLength(12);

    const id = await rechnung([[ANNA, KATALOG.kg]]);
    await asUserCommitted(
      users.office,
      'select public.record_payment($1::uuid, $2::int, (now() at time zone $3)::date, $4, $5, null)',
      [id, 2000, TZ, 'bank_transfer', 'incoming'],
    );

    const nachher = (await asUser<Monat>(users.ownerTherapist, MONATE, [12])).rows;
    const letzter = nachher.at(-1)!;
    const davor = vorher.at(-1)!;
    // Das Terminhonorar des einen Termins (ABR-031).
    expect(n(letzter.revenue_cents) - n(davor.revenue_cents)).toBe(14000);
    expect(n(letzter.revenue_therapy_cents) - n(davor.revenue_therapy_cents)).toBe(14000);
    expect(n(letzter.payments_cents) - n(davor.payments_cents)).toBe(2000);

    // Dieselbe Zahl wie die Kennzahl des Monats: eine Regel, zwei Leser.
    const kennzahl = await asUser<{ revenue_cents: string; payments_cents: string }>(
      users.ownerTherapist,
      'select revenue_cents, payments_cents from public.get_practice_statistics(null)',
    );
    expect(n(kennzahl.rows[0]!.revenue_cents)).toBe(n(letzter.revenue_cents));
    expect(n(kennzahl.rows[0]!.payments_cents)).toBe(n(letzter.payments_cents));
  });

  it('weist eine unvernuenftige Zahl von Monaten ab', async () => {
    await expect(asUser(users.ownerTherapist, MONATE, [0])).rejects.toThrow(/months out of range/);
    await expect(asUser(users.ownerTherapist, MONATE, [37])).rejects.toThrow(/months out of range/);
  });

  it('ordnet die Leistungen nach Umsatz und rechnet dieselbe Summe wie die Steuergruppen', async () => {
    const id = await rechnung([
      [ANNA, KATALOG.mt],
      [ANNA, KATALOG.kg],
      [JANNES, KATALOG.mt],
    ]);
    const { rows } = await asUser<{ code: string; revenue_cents: string }>(
      users.ownerTherapist,
      LEISTUNGEN,
      [null, 10],
    );
    const codes = rows.map((r) => r.code);
    expect(codes.indexOf('MT')).toBeLessThan(codes.indexOf('KG'));
    const mt = rows.find((r) => r.code === 'MT')!;
    expect(n(mt.revenue_cents)).toBeGreaterThanOrEqual(11000);

    // Zeilen im Snapshot und Steuergruppen ergeben denselben Betrag, und die
    // Posten mit Person ebenso.
    const summe = await asPostgres<{ zeilen: string; posten: string; gruppen: string }>(
      `select (select sum((z ->> 'line_total_cents')::bigint)
                 from jsonb_array_elements((select snapshot -> 'items' from public.invoices where id = $2)) z) as zeilen,
              (select sum(l.betrag) from app.revenue_staff_lines($1, '2020-01-01', '2200-01-01') l
                where l.invoice_id = $2) as posten,
              app.snapshot_gross_cents((select snapshot from public.invoices where id = $2)) as gruppen`,
      [organizationId, id],
    );
    expect(n(summe.rows[0]!.zeilen)).toBe(n(summe.rows[0]!.gruppen));
    expect(n(summe.rows[0]!.posten)).toBe(n(summe.rows[0]!.gruppen));
  });

  it('zeigt Monatsreihe und Leistungen allein owner', async () => {
    for (const konto of [users.office, users.therapist, users.teamLead, users.patientMax]) {
      await erwarteAbgewiesenenLeseversuch(konto, MONATE, [12], 'statistics.read');
      await erwarteAbgewiesenenLeseversuch(konto, LEISTUNGEN, [null, 10], 'statistics.read');
    }
    await expect(asAnon(MONATE, [12])).rejects.toThrow(/permission denied/i);
    await expect(asAnon(LEISTUNGEN, [null, 10])).rejects.toThrow(/permission denied/i);

    await rechnung([[ANNA, KATALOG.kg]]);
    const fremd = await fremdeOrganisation();
    const monate = (await asUser<Monat>(fremd.owner, MONATE, [12])).rows;
    expect(monate.every((m) => n(m.revenue_cents) === 0)).toBe(true);
    expect((await asUser(fremd.owner, LEISTUNGEN, [null, 10])).rows).toEqual([]);
  });
});

describe('Vergütungsmodell (STA-005)', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  interface ModellStand {
    model: string;
    changed_by: string | null;
    changed_at: string;
  }

  /** Wer und wann der letzten Aenderung stehen am Modell (LOG-EPIC-001). */
  async function stand(): Promise<ModellStand[]> {
    return (
      await asPostgres<ModellStand>(
        `select model, changed_by,
                to_char(changed_at, 'YYYY-MM-DD"T"HH24:MI:SS.US') as changed_at
           from public.staff_compensation_models where staff_member_id = $1`,
        [ANNA],
      )
    ).rows;
  }

  async function auditErfolge(): Promise<number> {
    const { rows } = await asPostgres<{ n: number }>(
      "select count(*)::int as n from public.audit_log where outcome = 'success'",
    );
    return rows[0]!.n;
  }

  it('setzt owner das Modell, haelt wer/wann am Datensatz fest und entfernt es mit null (LOG-EPIC-001)', async () => {
    const auditVorher = await auditErfolge();
    await asUserCommitted(users.ownerTherapist, MODELL, [ANNA, 'revenue_share']);
    const erst = await stand();
    expect(erst).toHaveLength(1);
    expect(erst[0]).toMatchObject({ model: 'revenue_share', changed_by: users.ownerTherapist });

    // Dasselbe Modell noch einmal ist kein Vorgang: Die Zeile bleibt unberuehrt.
    await asUserCommitted(users.ownerTherapist, MODELL, [ANNA, 'revenue_share']);
    expect(await stand()).toEqual(erst);

    await asUserCommitted(users.ownerTherapist, MODELL, [ANNA, 'fixed_salary']);
    expect(await stand()).toMatchObject([
      { model: 'fixed_salary', changed_by: users.ownerTherapist },
    ]);

    await asUserCommitted(users.ownerTherapist, MODELL, [ANNA, null]);
    const { rows } = await asPostgres('select 1 from public.staff_compensation_models');
    expect(rows).toHaveLength(0);
    expect(await auditErfolge()).toBe(auditVorher);
  });

  it('weist ein unbekanntes Modell und eine fremde Person ab', async () => {
    await expect(asUser(users.ownerTherapist, MODELL, [ANNA, 'akkord'])).rejects.toThrow(
      /unknown compensation model/,
    );
    const fremd = await fremdeOrganisation();
    await expect(asUser(fremd.owner, MODELL, [ANNA, 'revenue_share'])).rejects.toThrow(
      /staff member not found/,
    );
  });

  it('laesst allein owner setzen', async () => {
    for (const konto of [users.office, users.therapist, users.teamLead, users.patientMax]) {
      await expect(asUser(konto, MODELL, [ANNA, 'revenue_share']), konto).rejects.toThrow(
        /not allowed to change the compensation model/,
      );
    }
    await expect(asAnon(MODELL, [ANNA, 'revenue_share'])).rejects.toThrow(/permission denied/i);
  });

  it('zeigt das Modell owner und der Person selbst, keiner fremden Person', async () => {
    await asUserCommitted(users.ownerTherapist, MODELL, [ANNA, 'revenue_share']);
    await asUserCommitted(users.ownerTherapist, MODELL, [TIM, 'fixed_salary']);
    const lesen = 'select staff_member_id, model from public.staff_compensation_models';
    expect((await asUser(users.ownerTherapist, lesen)).rows).toHaveLength(2);
    expect((await asUser(users.therapist, lesen)).rows).toEqual([
      { staff_member_id: ANNA, model: 'revenue_share' },
    ]);
    expect((await asUser(users.teamLead, lesen)).rows).toEqual([
      { staff_member_id: TIM, model: 'fixed_salary' },
    ]);
    for (const konto of [users.office, users.patientMax, users.patientErika, users.trainer]) {
      expect((await asUser(konto, lesen)).rows, konto).toEqual([]);
    }
    const fremd = await fremdeOrganisation();
    expect((await asUser(fremd.owner, lesen)).rows).toEqual([]);
  });

  it('ist an der Funktion vorbei nicht schreibbar', async () => {
    for (const sql of [
      `insert into public.staff_compensation_models (staff_member_id, organization_id, model)
         values ('${ANNA}', '${organizationId}', 'revenue_share')`,
      `update public.staff_compensation_models set model = 'revenue_share'`,
      `delete from public.staff_compensation_models`,
    ]) {
      await expect(asUser(users.ownerTherapist, sql), sql).rejects.toThrow(/permission denied/i);
    }
  });

  it('faellt mit dem Mitarbeiterdatensatz (Loeschpfad)', async () => {
    const neu = '55555555-5555-4555-8555-0000000000ee';
    await asPostgres(
      `insert into public.persons (id, organization_id, given_name, family_name)
         values ('44444444-4444-4444-8444-0000000000ee', $1, 'Nora', 'Neu');
       insert into public.staff_members (id, organization_id, person_id, primary_location_id)
         values ('${neu}', $1, '44444444-4444-4444-8444-0000000000ee', '${LOCATION}');`.replace(
        /\$1/g,
        `'${organizationId}'`,
      ),
    );
    await asUserCommitted(users.ownerTherapist, MODELL, [neu, 'revenue_share']);
    await asPostgres(`delete from public.staff_members where id = '${neu}'`);
    const { rows } = await asPostgres(
      'select 1 from public.staff_compensation_models where staff_member_id = $1',
      [neu],
    );
    expect(rows).toHaveLength(0);
  });
});

describe('Umsatz je behandelnder Person (STA-006)', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  async function jePerson(konto: string): Promise<Personenzeile[]> {
    return (await asUserCommitted<Personenzeile>(konto, JE_PERSON, [6])).rows;
  }

  function summeFuer(zeilen: Personenzeile[], staff: string): number {
    return zeilen
      .filter((z) => z.staff_member_id === staff)
      .reduce((s, z) => s + n(z.revenue_cents), 0);
  }

  it('ordnet den Umsatz der behandelnden Person zu - owner sieht alle', async () => {
    const vorher = await jePerson(users.ownerTherapist);
    await rechnung([
      [ANNA, KATALOG.kg],
      [ANNA, KATALOG.mt],
      [JANNES, KATALOG.kg],
    ]);
    const nachher = await jePerson(users.ownerTherapist);
    // Je Termin das Terminhonorar, gleich welches Heilmittel (ABR-031).
    expect(summeFuer(nachher, ANNA) - summeFuer(vorher, ANNA)).toBe(14000 + 14000);
    expect(summeFuer(nachher, JANNES) - summeFuer(vorher, JANNES)).toBe(14000);
    expect(nachher.find((z) => z.staff_member_id === ANNA)!.staff_name).toBe('Anna Beispiel');
  });

  it('zieht ein Storno bei der behandelnden Person ab', async () => {
    const vorher = await jePerson(users.ownerTherapist);
    const id = await rechnung([[ANNA, KATALOG.kg]]);
    await asUserCommitted(users.office, 'select public.cancel_invoice($1::uuid, $2::text)', [
      id,
      'Synthetisch: falscher Empfaenger',
    ]);
    expect(summeFuer(await jePerson(users.ownerTherapist), ANNA)).toBe(summeFuer(vorher, ANNA));
  });

  it('zeigt einer Person mit Umsatzbeteiligung nur den eigenen Umsatz', async () => {
    await rechnung([
      [ANNA, KATALOG.kg],
      [JANNES, KATALOG.kg],
    ]);
    await asUserCommitted(users.ownerTherapist, MODELL, [ANNA, 'revenue_share']);
    const eigene = await jePerson(users.therapist);
    expect(eigene.length).toBeGreaterThan(0);
    expect(eigene.every((z) => z.staff_member_id === ANNA)).toBe(true);
  });

  it('weist ohne Umsatzbeteiligung und ohne owner protokolliert ab', async () => {
    await rechnung([[ANNA, KATALOG.kg]]);
    await asUserCommitted(users.ownerTherapist, MODELL, [ANNA, 'fixed_salary']);
    await asUserCommitted(users.ownerTherapist, MODELL, [TIM, null]);
    for (const konto of [
      users.therapist,
      users.teamLead,
      users.office,
      users.trainer,
      users.patientMax,
    ]) {
      await erwarteAbgewiesenenLeseversuch(konto, JE_PERSON, [6], 'statistics.read');
    }
    await expect(asAnon(JE_PERSON, [6])).rejects.toThrow(/permission denied/i);
  });

  it('protokolliert den Blick auf den Umsatz je Person nicht (LOG-EPIC-001, §20)', async () => {
    // Das Protokoll dient Datenschutz und Sicherheit, nie der Leistungs- oder
    // Verhaltenskontrolle von Mitarbeitenden (ADR-010 Fassung 3).
    await asUserCommitted(users.ownerTherapist, MODELL, [ANNA, 'revenue_share']);
    await asPostgres('delete from public.audit_log');
    await jePerson(users.ownerTherapist);
    await jePerson(users.therapist);
    const { rows } = await asPostgres('select id from public.audit_log');
    expect(rows).toEqual([]);
  });

  it('endet an der Organisationsgrenze', async () => {
    await rechnung([[ANNA, KATALOG.kg]]);
    const fremd = await fremdeOrganisation();
    expect(await jePerson(fremd.owner)).toEqual([]);
  });

  it('laesst eine Trainerin mit Umsatzbeteiligung zu - massgeblich ist das Modell, nicht die Rolle', async () => {
    const TOM = '55555555-5555-4555-8555-000000000006';
    await asUserCommitted(users.ownerTherapist, MODELL, [TOM, 'revenue_share']);
    const vorher = (
      await asPostgres(
        `select 1 from public.audit_log where action = 'access.denied' and actor_user_id = $1`,
        [users.trainer],
      )
    ).rows.length;
    expect(await jePerson(users.trainer)).toEqual([]);
    const nachher = (
      await asPostgres(
        `select 1 from public.audit_log where action = 'access.denied' and actor_user_id = $1`,
        [users.trainer],
      )
    ).rows.length;
    expect(nachher).toBe(vorher);
  });

  it('haelt die Summe je Monat gleich dem Praxisumsatz, auch wenn ein Posten fehlt', async () => {
    const id = await rechnung([
      [ANNA, KATALOG.kg],
      [JANNES, KATALOG.mt],
    ]);
    // Ein Posten verschwindet - wie nach Storno und Loeschen der Leistung.
    await asPostgres(`
      set session_replication_role = replica;
      delete from public.invoice_items
       where invoice_id = '${id}'
         and billable_service_id in (
           select b.id from public.billable_services b
           join public.appointments a on a.id = b.appointment_id
           where a.staff_member_id = '${JANNES}');
      set session_replication_role = origin;
    `);
    const zeilen = await jePerson(users.ownerTherapist);
    const monat = zeilen.at(-1)!.month.getTime();
    const summe = zeilen
      .filter((z) => z.month.getTime() === monat)
      .reduce((s, z) => s + n(z.revenue_cents), 0);
    const praxis = await asUser<{ revenue_cents: string }>(
      users.ownerTherapist,
      'select revenue_cents from public.get_practice_statistics(null)',
    );
    expect(summe).toBe(n(praxis.rows[0]!.revenue_cents));
    const ohne = zeilen.find((z) => z.month.getTime() === monat && z.staff_member_id === null);
    expect(n(ohne!.revenue_cents)).toBe(14000);
    expect(ohne!.staff_name).toBeNull();
  });
});
