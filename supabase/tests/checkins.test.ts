import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Check-in mit einstellbarem Takt, Praxisseite (TRK-002, IDEA-TRK-004,
 * DSN-001 Abschnitt 6).
 *
 *   * Einstellen dürfen die Rollen, die Pläne schreiben; lesen die, die Pläne
 *     lesen, je Bereich (ANN-351, ADR-021 Punkt 6).
 *   * Alle 1 bis 28 Tage, eine bis fünf Fragen des Takts `checkin`
 *     (ANN-349, ANN-350); fällig am Tag der Einstellung, dann vom letzten an.
 *   * Die Angaben stehen unverändert da, ohne Bewertung (ADR-006 Punkt 11),
 *     in der Auskunft (Art. 15) und ziehen beim Zusammenführen mit.
 */

const { users, patients, trainingRelationships, organizationId, platformAccesses } = SEED;

const LESEN = 'select public.get_checkins($1, $2::uuid) as daten';
const SETZEN = 'select public.set_checkin_schedule($1, $2::uuid, $3, $4::text[])';
const BEENDEN = 'select public.end_checkin_schedule($1, $2::uuid)';

interface Daten {
  today: string;
  can_write: boolean;
  schedule: {
    interval_days: number;
    parameter_keys: string[];
    starts_on: string;
    due_on: string;
    updated_by_name: string | null;
  } | null;
  checkins: {
    answered_on: string;
    recorded_by_kind: string;
    values: Record<string, number>;
  }[];
}

async function lesen(konto: string, art: string, verhaeltnis: string): Promise<Daten | null> {
  const { rows } = await asUser<{ daten: Daten | null }>(konto, LESEN, [art, verhaeltnis]);
  return rows[0]!.daten;
}

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

async function heute(): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    'select app.training_today($1::uuid)::text as tag',
    [organizationId],
  );
  return rows[0]!.tag;
}

/** Ein beantworteter Check-in, wie ihn TRK-003 schreibt. */
async function checkinEintragen(
  art: 'treatment' | 'training',
  verhaeltnis: string,
  tageZurueck: number,
  werte: Record<string, number>,
  zugang: string = platformAccesses.erikaBehandlung,
): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.checkins
       (organization_id, relationship_kind, relationship_id, patient_id, training_relationship_id,
        answered_on, platform_access_id, platform_access_kind, recorded_by)
     values ($1, $2, $3, case when $2 = 'treatment' then $3::uuid end,
             case when $2 = 'training' then $3::uuid end,
             app.training_today($1) - $4::integer, $5, 'self', $6)
     returning id`,
    [organizationId, art, verhaeltnis, tageZurueck, zugang, users.plattformErika],
  );
  const id = rows[0]!.id;
  for (const [key, wert] of Object.entries(werte)) {
    await asPostgres(
      `insert into public.checkin_values (organization_id, checkin_id, parameter_key, value)
       values ($1, $2, $3, $4)`,
      [organizationId, id, key, wert],
    );
  }
  return id;
}

describe('Check-in, Takt und Lesen in der Praxis (TRK-002)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.checkins');
    await asPostgres('delete from public.checkin_schedules');
    await asPostgres('delete from public.audit_log');
  });

  it('stellt den Takt ein; die Rollen der Akte lesen ihn, fällig ab heute (ANN-350)', async () => {
    await asUserCommitted(users.therapist, SETZEN, [
      'treatment',
      patients.erika,
      7,
      ['pain_rest', 'pain_load', 'daily_impairment'],
    ]);
    const tag = await heute();
    for (const konto of [users.therapist, users.office, users.ownerTherapist, users.teamLead]) {
      const daten = await lesen(konto, 'treatment', patients.erika);
      expect(daten!.schedule).toMatchObject({
        interval_days: 7,
        parameter_keys: ['pain_rest', 'pain_load', 'daily_impairment'],
        starts_on: tag,
        due_on: tag,
        updated_by_name: 'Anna Beispiel',
      });
      expect(daten!.checkins).toEqual([]);
    }
    // Schreiben dürfen die Rollen der Pläne, das Büro nicht (ANN-351).
    expect((await lesen(users.office, 'treatment', patients.erika))!.can_write).toBe(false);
    expect((await lesen(users.therapist, 'treatment', patients.erika))!.can_write).toBe(true);
  });

  it('rechnet den nächsten Tag vom letzten Check-in; Verpasstes wird nicht nachgeholt', async () => {
    await asUserCommitted(users.therapist, SETZEN, ['treatment', patients.erika, 7, ['pain_rest']]);
    await asPostgres(
      `update public.checkin_schedules set starts_on = app.training_today($1) - 30`,
      [organizationId],
    );
    // Seit 30 Tagen eingestellt, nie beantwortet: fällig ist einer seit dem
    // Anfang, nicht vier.
    const anfang = await asPostgres<{ tag: string }>(
      `select (app.training_today($1) - 30)::text as tag`,
      [organizationId],
    );
    expect((await lesen(users.therapist, 'treatment', patients.erika))!.schedule!.due_on).toBe(
      anfang.rows[0]!.tag,
    );
    await checkinEintragen('treatment', patients.erika, 3, { pain_rest: 4 });
    const { rows } = await asPostgres<{ tag: string }>(
      `select (app.training_today($1) + 4)::text as tag`,
      [organizationId],
    );
    expect((await lesen(users.therapist, 'treatment', patients.erika))!.schedule!.due_on).toBe(
      rows[0]!.tag,
    );
  });

  it('ändert Takt und Fragen, ohne den Anfang zu verschieben; Beenden lässt die Angaben', async () => {
    await asUserCommitted(users.therapist, SETZEN, ['treatment', patients.erika, 7, ['pain_rest']]);
    await asPostgres(
      `update public.checkin_schedules set starts_on = app.training_today($1) - 10`,
      [organizationId],
    );
    await checkinEintragen('treatment', patients.erika, 1, { pain_rest: 2 });
    await asUserCommitted(users.teamLead, SETZEN, [
      'treatment',
      patients.erika,
      14,
      ['sleep_quality', 'stress'],
    ]);
    const daten = await lesen(users.therapist, 'treatment', patients.erika);
    expect(daten!.schedule).toMatchObject({
      interval_days: 14,
      parameter_keys: ['sleep_quality', 'stress'],
      updated_by_name: 'Tim Teamleitung',
    });
    const { rows } = await asPostgres<{ tag: string }>(
      `select (app.training_today($1) - 10)::text as tag`,
      [organizationId],
    );
    expect(daten!.schedule!.starts_on).toBe(rows[0]!.tag);

    await asUserCommitted(users.therapist, BEENDEN, ['treatment', patients.erika]);
    const danach = await lesen(users.therapist, 'treatment', patients.erika);
    expect(danach!.schedule).toBeNull();
    // Was beantwortet ist, bleibt (ANN-350).
    expect(danach!.checkins).toEqual([
      expect.objectContaining({ recorded_by_kind: 'self', values: { pain_rest: 2 } }),
    ]);
  });

  it('zeigt die Angaben unverändert, jüngste zuerst, ohne Bewertung (ADR-006 Punkt 11)', async () => {
    await checkinEintragen('treatment', patients.erika, 5, { pain_rest: 8, pain_load: 9 });
    await checkinEintragen('treatment', patients.erika, 1, {
      pain_rest: 3,
      morning_stiffness_minutes: 45,
    });
    const daten = await lesen(users.office, 'treatment', patients.erika);
    expect(daten!.checkins.map((c) => c.values)).toEqual([
      { pain_rest: 3, morning_stiffness_minutes: 45 },
      { pain_rest: 8, pain_load: 9 },
    ]);
    // Nur die feste Liste: kein Trend, keine Stufe, keine Kennung.
    expect(Object.keys(daten!.checkins[0]!).sort()).toEqual([
      'answered_on',
      'recorded_at',
      'recorded_by_kind',
      'values',
    ]);
  });

  it('prüft Takt und Fragen (ANN-349, ANN-350)', async () => {
    const versuche: [number, string[]][] = [
      [0, ['pain_rest']],
      [29, ['pain_rest']],
      [7, []],
      [
        7,
        [
          'pain_rest',
          'pain_load',
          'daily_impairment',
          'sleep_quality',
          'stress',
          'morning_stiffness_minutes',
        ],
      ],
      [7, ['pain_rest', 'pain_rest']],
      [7, ['session_pain']],
      [7, ['unbekannt']],
    ];
    for (const [tage, fragen] of versuche) {
      expect(
        await fehler(asUser(users.therapist, SETZEN, ['treatment', patients.erika, tage, fragen])),
      ).toBe('22023');
    }
    // Fünf sind erlaubt.
    await asUserCommitted(users.therapist, SETZEN, [
      'treatment',
      patients.erika,
      28,
      ['pain_rest', 'pain_load', 'daily_impairment', 'sleep_quality', 'stress'],
    ]);
  });

  it('nur im offenen Verhältnis; unbekannte und fremde Verhältnisse gibt es nicht', async () => {
    try {
      await asPostgres(
        `update public.patients
            set care_concluded_on = current_date - 1, care_concluded_at = now(),
                care_concluded_by = $2::uuid
          where id = $1`,
        [patients.erika, users.therapist],
      );
      expect(
        await fehler(asUser(users.therapist, SETZEN, ['treatment', patients.erika, 7, ['stress']])),
      ).toBe('22023');
    } finally {
      await asPostgres(
        `update public.patients
            set care_concluded_on = null, care_concluded_at = null, care_concluded_by = null
          where id = $1`,
        [patients.erika],
      );
    }
    expect(
      await fehler(
        asUser(users.therapist, SETZEN, [
          'treatment',
          '66666666-6666-4666-8666-0000000000ff',
          7,
          ['stress'],
        ]),
      ),
    ).toBe('P0002');
    // Die Art muss zum Verhältnis passen.
    expect(
      await fehler(asUser(users.therapist, SETZEN, ['training', patients.erika, 7, ['stress']])),
    ).toBe('P0002');
    const fremd = await fremdeOrganisation();
    expect(
      await fehler(asUser(fremd.owner, SETZEN, ['treatment', patients.erika, 7, ['stress']])),
    ).not.toBe('kein Fehler');
    expect(await lesen(fremd.owner, 'treatment', patients.erika)).toBeNull();
  });

  it('kein Durchgriff zwischen den Bereichen (ADR-021 Punkt 6, ANN-351)', async () => {
    // Die Trainingsbetreuung stellt im Training ein, nicht in der Behandlung.
    await asUserCommitted(users.trainer, SETZEN, [
      'training',
      trainingRelationships.tina,
      3,
      ['stress'],
    ]);
    expect(
      await fehler(asUser(users.trainer, SETZEN, ['treatment', patients.erika, 7, ['stress']])),
    ).toBe('42501');
    expect(
      await fehler(
        asUser(users.therapist, SETZEN, ['training', trainingRelationships.tina, 7, ['stress']]),
      ),
    ).toBe('42501');
    expect(
      await fehler(
        asUser(users.office, SETZEN, ['training', trainingRelationships.tina, 7, ['stress']]),
      ),
    ).toBe('42501');
    expect(
      await fehler(asUser(users.therapist, BEENDEN, ['training', trainingRelationships.tina])),
    ).toBe('42501');
    // Das Büro liest im Training (ADR-021 Punkt 10), die Behandlungsrolle nicht.
    expect(
      (await lesen(users.office, 'training', trainingRelationships.tina))!.schedule,
    ).toMatchObject({
      interval_days: 3,
    });
    expect(await lesen(users.therapist, 'training', trainingRelationships.tina)).toBeNull();
    expect(await lesen(users.trainer, 'treatment', patients.erika)).toBeNull();
  });

  it('protokolliert das Lesen wie das Öffnen der Akte und jede Abweisung (ADR-010)', async () => {
    await asUserCommitted(users.office, LESEN, ['treatment', patients.erika]);
    const { rows } = await asPostgres<{ action: string; subject_id: string; view: string }>(
      `select action, subject_id, context ->> 'view' as view from public.audit_log
       where actor_user_id = $1`,
      [users.office],
    );
    expect(rows).toEqual([
      { action: 'patient_record.viewed', subject_id: patients.erika, view: 'checkins' },
    ]);
    await erwarteAbgewiesenenLeseversuch(
      users.trainer,
      `select l from public.get_checkins('treatment', $1::uuid) l where l is not null`,
      [patients.erika],
      'checkins.read',
    );
    // Ein Plattformkonto liest die Praxisseite nie (ADR-023 Punkt 21).
    expect(await fehler(asUser(users.plattformErika, LESEN, ['treatment', patients.erika]))).toBe(
      '42501',
    );
  });

  it('kein Tabellenrecht (ADR-004)', async () => {
    for (const tabelle of ['checkin_schedules', 'checkins', 'checkin_values']) {
      expect(await fehler(asUser(users.therapist, `select * from public.${tabelle}`))).toBe(
        '42501',
      );
    }
  });

  it('steht in der Auskunft (Art. 15), ohne Kennungen', async () => {
    await asUserCommitted(users.therapist, SETZEN, ['treatment', patients.erika, 7, ['pain_rest']]);
    await checkinEintragen('treatment', patients.erika, 2, { pain_rest: 5 });
    const { rows } = await asUser<{
      daten: { tabellen: { checkin_schedules: unknown[]; checkins: Record<string, unknown>[] } };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as daten', [
      patients.erika,
    ]);
    const tabellen = rows[0]!.daten.tabellen;
    expect(tabellen.checkin_schedules).toEqual([
      expect.objectContaining({ interval_days: 7, parameter_keys: ['pain_rest'] }),
    ]);
    expect(tabellen.checkins).toEqual([
      expect.objectContaining({ recorded_by_kind: 'self', values: { pain_rest: 5 } }),
    ]);
    expect(JSON.stringify(tabellen.checkins)).not.toContain(platformAccesses.erikaBehandlung);
  });

  it('fällt mit der Akte und mit dem Trainingsverhältnis (ADR-008)', async () => {
    await asUserCommitted(users.therapist, SETZEN, ['treatment', patients.erika, 7, ['pain_rest']]);
    await checkinEintragen('treatment', patients.erika, 2, { pain_rest: 5 });
    await asUserCommitted(users.trainer, SETZEN, [
      'training',
      trainingRelationships.tina,
      7,
      ['stress'],
    ]);
    await checkinEintragen(
      'training',
      trainingRelationships.tina,
      1,
      { stress: 2 },
      platformAccesses.tinaTraining,
    );
    try {
      await asPostgres(
        'select app.delete_patient_record($1::uuid, extensions.gen_random_uuid(), now())',
        [patients.erika],
      );
      await asPostgres(
        'select app.delete_training_relationship($1::uuid, extensions.gen_random_uuid(), now())',
        [trainingRelationships.tina],
      );
      const { rows } = await asPostgres<{ n: number }>(
        `select (select count(*) from public.checkin_schedules)
              + (select count(*) from public.checkins)
              + (select count(*) from public.checkin_values) as n`,
      );
      expect(Number(rows[0]!.n)).toBe(0);
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });
});
