import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
  testDatabaseUrl,
} from './helpers/db';
import { Client } from 'pg';

/**
 * Nachrücken von der Warteliste (PRX-004).
 *
 * Geprüft werden die Regel „passt auf den Platz", die Reihenfolge, der
 * Ausschluss der absagenden Person und eigener Überschneidungen, Rollen und
 * Mandantengrenze, und dass Anlegen und Schließen alles oder nichts sind.
 */

const { users, patients, organizationId } = SEED;
const ANNA = '55555555-5555-4555-8555-000000000002';
const TIM = '55555555-5555-4555-8555-000000000004';

function naechster(isoWochentag: number, abTagen = 8): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + abTagen);
  while (((d.getUTCDay() + 6) % 7) + 1 !== isoWochentag) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
const MONTAG = naechster(1);

const TREFFER = `select id, patient_id, territory_status
                   from public.list_waitlist_matches($1::uuid, $2::date, $3::time, $4::time, $5::uuid)`;
const UEBERNEHMEN_MIT = `select public.create_appointment_from_waitlist(
  $1::uuid, $6::uuid, $2::uuid, 'home_visit', $3::date, $4::time, $5::time, null, false, null, false) as id`;
/** Der Regelfall: Die Person der Adresszeile ist Max, dem die Einträge der Tests gehören. */
const UEBERNEHMEN = UEBERNEHMEN_MIT.replace('$6::uuid', `'${SEED.patients.max}'::uuid`);

async function eintrag(
  patient: string,
  over: Partial<{
    staff: string | null;
    dauer: number;
    fenster: unknown;
    ab: string | null;
    bis: string | null;
  }> = {},
): Promise<string> {
  const p = { staff: null, dauer: 60, fenster: [], ab: null, bis: null, ...over };
  const { rows } = await asUserCommitted<{ id: string }>(
    users.office,
    `select public.create_waitlist_entry($1::uuid, null, $2::uuid, 'home_visit', $3::int, $4::jsonb,
                                         $5::date, $6::date, 'patient_wish', null) as id`,
    [patient, p.staff, p.dauer, JSON.stringify(p.fenster), p.ab, p.bis],
  );
  return rows[0]!.id;
}

async function treffer(von = '09:00', bis = '10:00', ohne: string | null = null, staff = ANNA) {
  const { rows } = await asUser<{ id: string; patient_id: string; territory_status: string }>(
    users.office,
    TREFFER,
    [staff, MONTAG, von, bis, ohne],
  );
  return rows;
}

describe('Nachrücken: passende Einträge (PRX-004)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('findet Einträge nach Wunschzeit, Dauer, Therapeut:in und frühestens ab', async () => {
    const passt = await eintrag(patients.max, {
      fenster: [{ weekday: 1, from: '08:00', to: '12:00' }],
    });
    const falscherTag = await eintrag(patients.erika, {
      fenster: [{ weekday: 2, from: '08:00', to: '12:00' }],
    });
    const zuLang = await eintrag(patients.petra, { dauer: 90 });

    let ids = (await treffer()).map((t) => t.id);
    expect(ids).toEqual([passt]);
    expect(ids).not.toContain(falscherTag);
    expect(ids).not.toContain(zuLang);

    // Ein längerer Platz nimmt den längeren Wunsch mit.
    ids = (await treffer('09:00', '10:30')).map((t) => t.id);
    expect(ids).toContain(zuLang);
  });

  it('beachtet Wunsch-Therapeut:in und frühestens ab', async () => {
    const beiTim = await eintrag(patients.max, { staff: TIM });
    const spaeter = await eintrag(patients.erika, { ab: '2099-01-01' });
    const ids = (await treffer()).map((t) => t.id);
    expect(ids).not.toContain(beiTim);
    expect(ids).not.toContain(spaeter);
    expect((await treffer('09:00', '10:00', null, TIM)).map((t) => t.id)).toContain(beiTim);
  });

  it('ordnet nach "bis spätestens" und lässt die absagende Person weg', async () => {
    const ohneFrist = await eintrag(patients.petra);
    const frist = await eintrag(patients.erika, { bis: '2099-01-01' });
    const absagend = await eintrag(patients.max);
    expect((await treffer()).map((t) => t.id)).toEqual([frist, ohneFrist, absagend]);
    expect((await treffer('09:00', '10:00', patients.max)).map((t) => t.id)).toEqual([
      frist,
      ohneFrist,
    ]);
  });

  it('lässt Personen weg, die zu der Zeit schon einen Termin haben', async () => {
    await eintrag(patients.max);
    await asPostgres(
      `insert into public.appointments
         (organization_id, patient_id, staff_member_id, appointment_type, status, starts_at, ends_at,
          visit_street, visit_house_number, visit_postal_code, visit_city)
       values ($1::uuid, $2::uuid, $3::uuid, 'home_visit', 'confirmed',
               ($4::date + time '09:30') at time zone 'Europe/Berlin',
               ($4::date + time '10:30') at time zone 'Europe/Berlin',
               'Teststrasse', '1', '72070', 'Tuebingen')`,
      [organizationId, patients.max, TIM, MONTAG],
    );
    expect(await treffer()).toEqual([]);
  });

  it('sagt beim Hausbesuch, ob der Platz im Gebietstag liegt', async () => {
    await asUserCommitted(
      users.office,
      `select public.save_territory(null, null, 'Nord', array['72070'], '[{"weekday":2,"part":"am"}]'::jsonb)`,
    );
    await eintrag(patients.max);
    expect((await treffer())[0]!.territory_status).toBe('outside');
  });

  it('gibt der Trainingsbetreuung nichts und hält die Mandantengrenze', async () => {
    await eintrag(patients.max);
    const { rows } = await asUser(users.trainer, TREFFER, [ANNA, MONTAG, '09:00', '10:00', null]);
    expect(rows).toEqual([]);
    const fremd = await fremdeOrganisation();
    // Die Therapeut:in einer anderen Praxis gibt es für sie nicht.
    await expect(
      asUser(fremd.owner, TREFFER, [ANNA, MONTAG, '09:00', '10:00', null]),
    ).rejects.toThrow(/staff member not assignable/);
  });
});

describe('Nachrücken: Übernahme in einer Transaktion (PRX-004)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('legt den Termin an und schließt den Eintrag als eingeplant', async () => {
    const id = await eintrag(patients.max);
    const { rows } = await asUserCommitted<{ id: string }>(users.office, UEBERNEHMEN, [
      id,
      ANNA,
      MONTAG,
      '09:00',
      '10:00',
    ]);
    const termin = rows[0]!.id;
    const { rows: stand } = await asPostgres<{ status: string; placed_appointment_id: string }>(
      'select status, placed_appointment_id from public.waitlist_entries where id = $1',
      [id],
    );
    expect(stand[0]).toEqual({ status: 'placed', placed_appointment_id: termin });
    const { rows: termine } = await asPostgres<{ patient_id: string }>(
      'select patient_id from public.appointments where id = $1',
      [termin],
    );
    expect(termine[0]!.patient_id).toBe(patients.max);
    const { rows: audit } = await asPostgres<{ action: string }>(
      `select action from public.audit_log where subject_id in ($1, $2) order by occurred_at`,
      [id, termin],
    );
    expect(audit.map((a) => a.action)).toEqual(
      expect.arrayContaining(['appointment.created', 'waitlist_entry.closed']),
    );
  });

  it('schließt nichts, wenn der Termin scheitert', async () => {
    const id = await eintrag(patients.max);
    // Sonntag: keine Arbeitszeit - create_appointment weist ab.
    const sonntag = naechster(7);
    await expect(
      asUserCommitted(users.office, UEBERNEHMEN, [id, ANNA, sonntag, '09:00', '10:00']),
    ).rejects.toThrow(/outside_working_hours/);
    const { rows } = await asPostgres<{ status: string }>(
      'select status from public.waitlist_entries where id = $1',
      [id],
    );
    expect(rows[0]!.status).toBe('open');
  });

  it('plant einen Eintrag nicht zweimal ein, auch nicht gleichzeitig', async () => {
    const id = await eintrag(patients.max);
    const a = new Client({ connectionString: testDatabaseUrl() });
    const b = new Client({ connectionString: testDatabaseUrl() });
    await a.connect();
    await b.connect();
    try {
      for (const c of [a, b]) {
        await c.query('begin');
        await c.query("select set_config('role', 'authenticated', true)");
        await c.query("select set_config('request.jwt.claims', $1, true)", [
          JSON.stringify({ sub: users.office, role: 'authenticated' }),
        ]);
      }
      await a.query(UEBERNEHMEN, [id, ANNA, MONTAG, '09:00', '10:00']);
      const zweiter = abgefangen(b.query(UEBERNEHMEN, [id, TIM, MONTAG, '11:00', '12:00']));
      await a.query('commit');
      const fehler = await zweiter;
      expect(fehler?.message).toMatch(/waitlist entry closed/);
      await b.query('rollback');
    } finally {
      await a.end();
      await b.end();
    }
  });

  it('legt keinen Termin für eine andere Person an, als das Formular zeigt (Zweitreview 3)', async () => {
    const id = await eintrag(patients.max);
    await expect(
      asUser(users.office, UEBERNEHMEN_MIT, [id, ANNA, MONTAG, '09:00', '10:00', patients.erika]),
    ).rejects.toThrow(/another patient/);
  });

  it('weist geschlossene, fremde und unbekannte Einträge ab', async () => {
    const id = await eintrag(patients.max);
    await asUserCommitted(users.office, UEBERNEHMEN, [id, ANNA, MONTAG, '09:00', '10:00']);
    await expect(
      asUser(users.office, UEBERNEHMEN, [id, ANNA, MONTAG, '11:00', '12:00']),
    ).rejects.toThrow(/waitlist entry closed/);
    const fremd = await fremdeOrganisation();
    const neu = await eintrag(patients.erika);
    await expect(
      asUser(fremd.owner, UEBERNEHMEN, [neu, fremd.staffMember, MONTAG, '09:00', '10:00']),
    ).rejects.toThrow(/waitlist entry not found|not allowed/);
    await expect(
      asUser(users.trainer, UEBERNEHMEN, [neu, ANNA, MONTAG, '09:00', '10:00']),
    ).rejects.toThrow(/not allowed/);
  });
});
