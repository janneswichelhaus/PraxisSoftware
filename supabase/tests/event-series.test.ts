import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase, tagInTagen } from './helpers/db';

/**
 * Dauerfehlzeit: eine Serie gleichartiger Ereignisse (CAL-021).
 *
 * Geprueft wird dreierlei:
 *
 *   1. Die **zweite Klammer** haelt, was CAL-017 nicht kann: Vorkommen einer
 *      Serie kennen einander, ohne dass ein Vorkommen seine Beteiligten
 *      verliert (ANN-059).
 *   2. **Dieses Vorkommen** und **die ganze Serie** sind wirklich zweierlei -
 *      der eine Vorgang laesst den anderen stehen.
 *   3. Eine Fehlzeit bleibt ein Ereignis: keine Patient:in, keine Verordnung,
 *      kein Gebuehrenanlass, keine Leistung (PROJECT_PRINCIPLES.md 8.1, 19).
 */

const { users, patients } = SEED;

const SERIE_ANLEGEN =
  'select public.create_event_series($1, $2::uuid[], $3, $4::date[], $5::time, $6::time, $7::uuid, $8::boolean) as serie';
const SERIE_LESEN = 'select * from public.list_event_series($1::uuid)';
const SERIE_AENDERN =
  'select public.update_event_series($1::uuid, $2::timestamptz, $3, $4, $5::time, $6::time, $7::uuid, $8::boolean) as anzahl';
const SERIE_ABSAGEN = 'select public.cancel_event_series($1::uuid, $2::timestamptz, $3) as anzahl';
const EREIGNIS =
  'select public.create_appointment_event($1, $2::uuid[], $3, $4::date, $5::time, $6::time, $7::uuid, $8::boolean) as anzahl';
const EREIGNIS_ABSAGEN =
  'select public.cancel_appointment_event($1::uuid, $2::timestamptz, $3) as anzahl';
const ANLEGEN =
  'select public.create_appointment($1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, true) as id';

const ANNA = '55555555-5555-4555-8555-000000000002';
const OLIVIA = '55555555-5555-4555-8555-000000000003';

/** Sechs Wochentermine weit voraus - die Seed-Termine liegen heute. */
const TAGE = [40, 47, 54, 61, 68, 75].map((t) => tagInTagen(t));

async function serie(
  optionen: {
    titel?: string;
    personen?: string[];
    tage?: string[];
    von?: string;
    bis?: string;
    user?: string;
  } = {},
): Promise<string> {
  const { rows } = await asUserCommitted<{ serie: string }>(
    optionen.user ?? users.office,
    SERIE_ANLEGEN,
    [
      optionen.titel ?? 'Teammeeting',
      optionen.personen ?? [ANNA],
      'video',
      optionen.tage ?? TAGE,
      optionen.von ?? '07:00',
      optionen.bis ?? '08:30',
      null,
      true,
    ],
  );
  return rows[0]!.serie;
}

interface Zeile {
  id: string;
  event_group_id: string;
  event_series_id: string | null;
  title: string;
  status: string;
  starts_at: Date;
  fee_basis: string | null;
  patient_id: string | null;
  treatment_basis_id: string | null;
}

async function zeilen(serieId: string): Promise<Zeile[]> {
  const { rows } = await asPostgres<Zeile>(
    `select id, event_group_id, event_series_id, title, status, starts_at,
            fee_basis, patient_id, treatment_basis_id
       from public.appointments
      where event_series_id = $1
      order by starts_at, staff_member_id`,
    [serieId],
  );
  return rows;
}

async function serienStand(serieId: string): Promise<string> {
  const { rows } = await asPostgres<{ stand: string }>(
    `select to_char(max(updated_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') as stand
       from public.appointments where event_series_id = $1`,
    [serieId],
  );
  return rows[0]!.stand;
}

/**
 * Ein Vorkommen in die Vergangenheit ruecken.
 *
 * Nur fuer die Testvorbereitung: Das Anlegen weist einen vergangenen Tag ab
 * (CAL-003), und der Riegel aus CAL-017 laesst eine Zeitaenderung an einer
 * Ereigniszeile nur waehrend eines gruppenweiten Vorgangs zu. Beides ist
 * richtig so - geprueft werden soll, was danach mit einer Serie passiert, in
 * der ein Vorkommen schon stattgefunden hat.
 */
async function zurueckdatieren(gruppeId: string, tage: number): Promise<void> {
  await asPostgres(
    `begin;
     select set_config('app.event_group_update', 'on', true);
     update public.appointments
        set starts_at = starts_at - make_interval(days => ${tage}),
            ends_at   = ends_at   - make_interval(days => ${tage})
      where event_group_id = '${gruppeId}'::uuid;
     commit;`,
  );
}

describe('Dauerfehlzeit anlegen', () => {
  beforeEach(resetDatabase);

  it('legt je Tag ein Vorkommen an, alle unter einer Serienkennung', async () => {
    const id = await serie();
    const rows = await zeilen(id);

    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((r) => r.event_series_id))).toEqual(new Set([id]));
    // Sechs Vorkommen, also sechs Gruppen: Die Serie ersetzt die Gruppe nicht.
    expect(new Set(rows.map((r) => r.event_group_id)).size).toBe(6);
    expect(rows[0]).toMatchObject({
      title: 'Teammeeting',
      status: 'confirmed',
      patient_id: null,
      treatment_basis_id: null,
    });
  });

  it('haelt bei mehreren Beteiligten Gruppe und Serie auseinander', async () => {
    const id = await serie({ personen: [ANNA, OLIVIA], tage: TAGE.slice(0, 3) });
    const rows = await zeilen(id);

    // Drei Vorkommen mal zwei Beteiligte: sechs Zeilen, drei Gruppen, eine Serie.
    expect(rows).toHaveLength(6);
    expect(new Set(rows.map((r) => r.event_group_id)).size).toBe(3);
    expect(new Set(rows.map((r) => r.event_series_id)).size).toBe(1);
  });

  it('legt gar nichts an, wenn ein einziger Tag belegt ist', async () => {
    await asUserCommitted(users.office, ANLEGEN, [
      patients.max,
      ANNA,
      'video',
      TAGE[2],
      '07:00',
      '08:00',
      null,
    ]);

    await expect(serie()).rejects.toThrow(/overlaps/);

    const { rows } = await asPostgres<{ anzahl: string }>(
      "select count(*) as anzahl from public.appointments where kind = 'event' and title = 'Teammeeting'",
    );
    expect(rows[0]!.anzahl).toBe('0');
  });

  it('verlangt aufsteigende, verschiedene Tage', async () => {
    await expect(serie({ tage: [TAGE[1]!, TAGE[0]!] })).rejects.toThrow(/ascending/);
    await expect(serie({ tage: [TAGE[0]!, TAGE[0]!] })).rejects.toThrow(/ascending/);
  });

  it('bleibt bei der Hoechstzahl der Terminserie', async () => {
    const zuViele = Array.from({ length: 31 }, (_, i) => tagInTagen(100 + i));
    await expect(serie({ tage: zuViele })).rejects.toThrow(/limited to 30/);
  });

  it('laesst ein einzelnes Ereignis ohne Serie', async () => {
    await asUserCommitted(users.office, EREIGNIS, [
      'Einzelbesprechung',
      [ANNA],
      'video',
      tagInTagen(39),
      '07:00',
      '07:30',
      null,
      true,
    ]);

    const { rows } = await asPostgres<{ event_series_id: string | null }>(
      "select event_series_id from public.appointments where title = 'Einzelbesprechung'",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event_series_id).toBeNull();
  });

  it('bleibt der Terminverwaltung vorbehalten', async () => {
    await expect(serie({ user: users.patientMax })).rejects.toThrow(/not allowed/);
  });

  /**
   * Die Bezeichnung ist organisatorisch und bleibt es: Sie steht an der Zeile,
   * nicht im Auditkontext (ADR-011, ANN-060).
   */
  it('schreibt die Bezeichnung nicht in das Auditlog', async () => {
    await serie({ titel: 'Achtsamkeitspuffer' });

    const { rows } = await asPostgres<{ anzahl: string }>(
      `select count(*) as anzahl from public.audit_log
        where context::text ilike '%Achtsamkeitspuffer%'`,
    );
    expect(rows[0]!.anzahl).toBe('0');
  });
});

describe('Die Serienkennung selbst', () => {
  beforeEach(resetDatabase);

  it('haengt an keiner Behandlung', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.office, ANLEGEN, [
      patients.max,
      ANNA,
      'video',
      tagInTagen(39),
      '07:00',
      '08:00',
      null,
    ]);

    // Eine Kopie derselben Behandlung ein Jahr spaeter, nur mit Serienkennung:
    // Die Bedingung an der Tabelle weist sie ab, bevor irgendein Schreibweg
    // gefragt waere.
    await expect(
      asPostgres(
        `insert into public.appointments (
           organization_id, patient_id, staff_member_id, appointment_type, kind,
           status, starts_at, ends_at, event_series_id
         )
         select organization_id, patient_id, staff_member_id, appointment_type, kind,
                status, starts_at + interval '365 days', ends_at + interval '365 days',
                gen_random_uuid()
           from public.appointments where id = $1`,
        [rows[0]!.id],
      ),
    ).rejects.toThrow(/appointments_event_series/);
  });

  it('wird von keinem Schreibweg mehr geaendert', async () => {
    const id = await serie({ tage: TAGE.slice(0, 2) });
    const rows = await zeilen(id);

    await expect(
      asPostgres(
        'update public.appointments set event_series_id = gen_random_uuid() where id = $1',
        [rows[0]!.id],
      ),
    ).rejects.toThrow(/event series cannot be changed/);
  });
});

describe('Dauerfehlzeit lesen', () => {
  beforeEach(resetDatabase);

  it('nennt je Vorkommen eine Zeile und den Stand der ganzen Serie', async () => {
    const id = await serie({ personen: [ANNA, OLIVIA], tage: TAGE.slice(0, 3) });
    const { rows } = await asUser<{
      event_group_id: string;
      title: string;
      open_count: number;
      cancelled_count: number;
      series_updated_at: Date;
    }>(users.office, SERIE_LESEN, [id]);

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ title: 'Teammeeting', open_count: 2, cancelled_count: 0 });
    expect(new Set(rows.map((r) => r.series_updated_at.getTime())).size).toBe(1);
  });
});

describe('Dieses Vorkommen gegen die ganze Serie', () => {
  beforeEach(resetDatabase);

  it('aendert mit der Serie alle noch nicht begonnenen Vorkommen', async () => {
    const id = await serie();
    const anzahl = await asUserCommitted<{ anzahl: number }>(users.office, SERIE_AENDERN, [
      id,
      await serienStand(id),
      'Teammeeting (neu)',
      'video',
      '07:30',
      '09:00',
      null,
      true,
    ]);

    expect(anzahl.rows[0]!.anzahl).toBe(6);
    const rows = await zeilen(id);
    expect(rows.every((r) => r.title === 'Teammeeting (neu)')).toBe(true);
    // Die Tage bleiben, die Uhrzeit wandert.
    expect(rows.map((r) => r.starts_at.toISOString().slice(0, 10))).toEqual(TAGE);
  });

  it('laesst ein begonnenes Vorkommen stehen', async () => {
    const id = await serie();
    const rows = await zeilen(id);
    await zurueckdatieren(rows[0]!.event_group_id, 50);

    const anzahl = await asUserCommitted<{ anzahl: number }>(users.office, SERIE_AENDERN, [
      id,
      await serienStand(id),
      'Teammeeting (neu)',
      'video',
      '07:30',
      '09:00',
      null,
      true,
    ]);

    expect(anzahl.rows[0]!.anzahl).toBe(5);
    const danach = await zeilen(id);
    expect(danach.filter((r) => r.title === 'Teammeeting')).toHaveLength(1);
  });

  it('sagt mit der Serie alle noch nicht begonnenen Vorkommen ab', async () => {
    const id = await serie();
    const anzahl = await asUserCommitted<{ anzahl: number }>(users.office, SERIE_ABSAGEN, [
      id,
      await serienStand(id),
      'practice_request',
    ]);

    expect(anzahl.rows[0]!.anzahl).toBe(6);
    const rows = await zeilen(id);
    expect(rows.every((r) => r.status === 'cancelled')).toBe(true);
    // Eine Fehlzeit kostet nichts - an einem Ereignis entsteht nie ein
    // Gebuehrenanlass (CAL-016).
    expect(rows.every((r) => r.fee_basis === null)).toBe(true);
  });

  it('laesst ein begonnenes Vorkommen bestaetigt', async () => {
    const id = await serie();
    const rows = await zeilen(id);
    await zurueckdatieren(rows[0]!.event_group_id, 50);

    await asUserCommitted(users.office, SERIE_ABSAGEN, [
      id,
      await serienStand(id),
      'practice_request',
    ]);

    const danach = await zeilen(id);
    expect(danach.filter((r) => r.status === 'confirmed')).toHaveLength(1);
  });

  it('sagt ein einzelnes Vorkommen ab, ohne die Serie anzutasten', async () => {
    const id = await serie();
    const rows = await zeilen(id);
    const gruppe = rows[0]!.event_group_id;
    const { rows: stand } = await asPostgres<{ stand: string }>(
      `select to_char(max(updated_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') as stand
         from public.appointments where event_group_id = $1`,
      [gruppe],
    );

    await asUserCommitted(users.office, EREIGNIS_ABSAGEN, [
      gruppe,
      stand[0]!.stand,
      'practice_request',
    ]);

    const danach = await zeilen(id);
    expect(danach.filter((r) => r.status === 'cancelled')).toHaveLength(1);
    expect(danach.filter((r) => r.status === 'confirmed')).toHaveLength(5);
  });

  it('ueberspringt bei der Serie, was schon abgesagt ist', async () => {
    const id = await serie();
    const rows = await zeilen(id);
    const gruppe = rows[0]!.event_group_id;
    const { rows: stand } = await asPostgres<{ stand: string }>(
      `select to_char(max(updated_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') as stand
         from public.appointments where event_group_id = $1`,
      [gruppe],
    );
    await asUserCommitted(users.office, EREIGNIS_ABSAGEN, [
      gruppe,
      stand[0]!.stand,
      'practice_request',
    ]);

    const anzahl = await asUserCommitted<{ anzahl: number }>(users.office, SERIE_AENDERN, [
      id,
      await serienStand(id),
      'Teammeeting (neu)',
      'video',
      '07:30',
      '09:00',
      null,
      true,
    ]);
    expect(anzahl.rows[0]!.anzahl).toBe(5);
  });

  it('weist einen veralteten Stand ab', async () => {
    const id = await serie();
    const alt = await serienStand(id);
    await asUserCommitted(users.office, SERIE_AENDERN, [
      id,
      alt,
      'Teammeeting (neu)',
      'video',
      '07:30',
      '09:00',
      null,
      true,
    ]);

    await expect(
      asUserCommitted(users.office, SERIE_ABSAGEN, [id, alt, 'practice_request']),
    ).rejects.toThrow(/changed meanwhile/);
  });

  it('bleibt der Terminverwaltung vorbehalten', async () => {
    const id = await serie();
    await expect(
      asUser(users.patientMax, SERIE_ABSAGEN, [id, await serienStand(id), 'practice_request']),
    ).rejects.toThrow(/not allowed/);
  });
});
