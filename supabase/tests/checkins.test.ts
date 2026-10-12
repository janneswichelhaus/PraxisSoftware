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
      // Der Zusammenhang allein ist kein Check-in (TRK-005, ANN-355).
      [7, ['painkiller_24h', 'pain_side']],
      [7, ['pain_rest', 'painkiller_24h', 'painkiller_24h']],
    ];
    for (const [tage, fragen] of versuche) {
      expect(
        await fehler(asUser(users.therapist, SETZEN, ['treatment', patients.erika, tage, fragen])),
      ).toBe('22023');
    }
    // Fünf sind erlaubt, der Zusammenhang zählt nicht mit (ANN-355).
    await asUserCommitted(users.therapist, SETZEN, [
      'treatment',
      patients.erika,
      28,
      [
        'pain_rest',
        'pain_load',
        'daily_impairment',
        'sleep_quality',
        'stress',
        'painkiller_24h',
        'pain_side',
      ],
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
    // Andere Organisation: owner darf dort Training schreiben, findet Tina aber nicht.
    const fremd = await fremdeOrganisation();
    expect(
      await fehler(
        asUser(fremd.owner, SETZEN, ['training', trainingRelationships.tina, 7, ['stress']]),
      ),
    ).toBe('P0002');
    expect(
      await fehler(asUser(fremd.owner, BEENDEN, ['training', trainingRelationships.tina])),
    ).toBe('P0002');
    expect(await lesen(fremd.owner, 'treatment', patients.erika)).toBeNull();
  });

  it('Einstellen und Beenden: Büro, Plattformkonto und ohne Anmeldung abgewiesen (ANN-351)', async () => {
    await asUserCommitted(users.therapist, SETZEN, ['treatment', patients.erika, 7, ['stress']]);
    for (const konto of [users.office, users.plattformErika, null]) {
      expect(
        await fehler(asUser(konto, SETZEN, ['treatment', patients.erika, 7, ['stress']])),
      ).toBe('42501');
      expect(await fehler(asUser(konto, BEENDEN, ['treatment', patients.erika]))).toBe('42501');
    }
    // owner ohne Therapeutenrolle schreibt in der Behandlung nicht, wie beim Plan.
    await asPostgres(
      `delete from public.user_roles where user_id = $1 and role_key = 'therapist'`,
      [users.ownerTherapist],
    );
    try {
      expect(
        await fehler(asUser(users.ownerTherapist, BEENDEN, ['treatment', patients.erika])),
      ).toBe('42501');
      expect(
        await fehler(
          asUser(users.ownerTherapist, SETZEN, ['treatment', patients.erika, 7, ['stress']]),
        ),
      ).toBe('42501');
    } finally {
      await asPostgres(
        `insert into public.user_roles (user_id, organization_id, role_key)
         values ($1, $2, 'therapist')`,
        [users.ownerTherapist, organizationId],
      );
    }
    expect((await lesen(users.therapist, 'treatment', patients.erika))!.schedule).not.toBeNull();
  });

  it('nach dem Ende des Verhältnisses kein fälliger Tag, Beenden geht (Zweitreview S5)', async () => {
    await asUserCommitted(users.therapist, SETZEN, ['treatment', patients.erika, 7, ['stress']]);
    try {
      await asPostgres(
        `update public.patients
            set care_concluded_on = current_date - 1, care_concluded_at = now(),
                care_concluded_by = $2::uuid
          where id = $1`,
        [patients.erika, users.therapist],
      );
      const daten = await lesen(users.therapist, 'treatment', patients.erika);
      expect(daten).toMatchObject({ relationship_open: false, schedule: { due_on: null } });
      await asUserCommitted(users.therapist, BEENDEN, ['treatment', patients.erika]);
      expect((await lesen(users.therapist, 'treatment', patients.erika))!.schedule).toBeNull();
    } finally {
      await asPostgres(
        `update public.patients
            set care_concluded_on = null, care_concluded_at = null, care_concluded_by = null
          where id = $1`,
        [patients.erika],
      );
    }
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

const PORTAL = 'select public.platform_checkins($1::uuid) as daten';
const ANTWORTEN = 'select public.submit_platform_checkin($1::uuid, $2::jsonb) as id';

interface Portal {
  today: string;
  schedule: { interval_days: number; parameter_keys: string[] } | null;
  due_on: string | null;
  due: boolean;
  can_answer: boolean;
  consent_needed: boolean;
  last_values: Record<string, number>;
  history: { answered_on: string; recorded_by_kind: string; values: Record<string, number> }[];
}

async function portal(konto: string, zugang: string): Promise<Portal | null> {
  const { rows } = await asUser<{ daten: Portal | null }>(konto, PORTAL, [zugang]);
  return rows[0]!.daten;
}

const erika = { konto: users.plattformErika, zugang: platformAccesses.erikaBehandlung };

describe('Check-in auf der Plattform (TRK-003)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.checkins');
    await asPostgres('delete from public.checkin_schedules');
    await asPostgres('delete from public.audit_log');
    await asUserCommitted(users.therapist, SETZEN, [
      'treatment',
      patients.erika,
      7,
      ['pain_rest', 'pain_load', 'morning_stiffness_minutes'],
    ]);
  });

  it('zeigt den fälligen Check-in, nimmt die Antwort und ist danach nicht mehr fällig', async () => {
    const vorher = await portal(erika.konto, erika.zugang);
    expect(vorher).toMatchObject({
      schedule: {
        interval_days: 7,
        parameter_keys: ['pain_rest', 'pain_load', 'morning_stiffness_minutes'],
      },
      due: true,
      can_answer: true,
      consent_needed: false,
      last_values: {},
      history: [],
    });
    await asUserCommitted(erika.konto, ANTWORTEN, [
      erika.zugang,
      JSON.stringify({ pain_rest: 3, pain_load: null, morning_stiffness_minutes: 20 }),
    ]);
    const danach = await portal(erika.konto, erika.zugang);
    expect(danach!.due).toBe(false);
    expect(danach!.can_answer).toBe(false);
    expect(danach!.last_values).toEqual({ pain_rest: 3, morning_stiffness_minutes: 20 });
    expect(danach!.history).toEqual([
      {
        answered_on: danach!.today,
        recorded_by_kind: 'self',
        values: { pain_rest: 3, morning_stiffness_minutes: 20 },
      },
    ]);
    // Höchstens einer am Tag (ANN-350).
    expect(await fehler(asUser(erika.konto, ANTWORTEN, [erika.zugang, '{"pain_rest": 1}']))).toBe(
      '22023',
    );
    // Die Praxis liest ihn in „Zwischen den Terminen“.
    const praxis = await lesen(users.therapist, 'treatment', patients.erika);
    expect(praxis!.checkins[0]!.values).toEqual({ pain_rest: 3, morning_stiffness_minutes: 20 });
    // Kein Alarm, keine Benachrichtigung an die Praxis (DSN-001 D5).
    const { rows } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.notification_deliveries',
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('prüft die Angaben: nur gestellte Fragen, im Bereich, mindestens eine (ANN-349)', async () => {
    for (const werte of [
      {},
      { pain_rest: null },
      { stress: 3 },
      { pain_rest: 11 },
      { morning_stiffness_minutes: 241 },
      { pain_rest: 2.5 },
      { pain_rest: 1e12 },
      { session_pain: 2 },
      [1],
    ]) {
      expect(
        await fehler(asUser(erika.konto, ANTWORTEN, [erika.zugang, JSON.stringify(werte)])),
      ).toBe('22023');
    }
    const { rows } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.checkins',
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('nimmt Schmerzart, Dauer und Bewegungssicherheit an, unverändert (TRK-004)', async () => {
    await asUserCommitted(users.therapist, SETZEN, [
      'treatment',
      patients.erika,
      7,
      ['pain_after_load', 'pain_recovery_hours', 'pain_quality', 'movement_confidence'],
    ]);
    for (const werte of [{ pain_quality: 0 }, { pain_quality: 6 }, { pain_recovery_hours: 73 }]) {
      expect(
        await fehler(asUser(erika.konto, ANTWORTEN, [erika.zugang, JSON.stringify(werte)])),
      ).toBe('22023');
    }
    await asUserCommitted(erika.konto, ANTWORTEN, [
      erika.zugang,
      JSON.stringify({ pain_recovery_hours: 6, pain_quality: 2, movement_confidence: 3 }),
    ]);
    const praxis = await lesen(users.therapist, 'treatment', patients.erika);
    expect(praxis!.checkins[0]!.values).toEqual({
      pain_recovery_hours: 6,
      pain_quality: 2,
      movement_confidence: 3,
    });
  });

  it('nimmt den Zusammenhang mit einer Frage, nie allein (TRK-005, ANN-355)', async () => {
    await asUserCommitted(users.therapist, SETZEN, [
      'treatment',
      patients.erika,
      7,
      ['pain_load', 'painkiller_24h', 'pain_side'],
    ]);
    for (const werte of [
      { painkiller_24h: 1 },
      { painkiller_24h: 1, pain_side: 2 },
      { pain_load: 3, painkiller_24h: 2 },
      { pain_load: 3, pain_side: 0 },
    ]) {
      expect(
        await fehler(asUser(erika.konto, ANTWORTEN, [erika.zugang, JSON.stringify(werte)])),
      ).toBe('22023');
    }
    await asUserCommitted(erika.konto, ANTWORTEN, [
      erika.zugang,
      JSON.stringify({ pain_load: 3, painkiller_24h: 0, pain_side: 1 }),
    ]);
    const praxis = await lesen(users.therapist, 'treatment', patients.erika);
    expect(praxis!.checkins[0]!.values).toEqual({ pain_load: 3, painkiller_24h: 0, pain_side: 1 });
  });

  it('ohne Takt kein Check-in; vor dem nächsten Tag nicht fällig', async () => {
    await asUserCommitted(users.therapist, BEENDEN, ['treatment', patients.erika]);
    expect((await portal(erika.konto, erika.zugang))!.schedule).toBeNull();
    expect(await fehler(asUser(erika.konto, ANTWORTEN, [erika.zugang, '{"pain_rest": 1}']))).toBe(
      'P0002',
    );

    await asUserCommitted(users.therapist, SETZEN, ['treatment', patients.erika, 7, ['pain_rest']]);
    await asPostgres(
      `update public.checkin_schedules set starts_on = app.training_today($1) - 10`,
      [organizationId],
    );
    await checkinEintragen('treatment', patients.erika, 3, { pain_rest: 4 });
    const p = await portal(erika.konto, erika.zugang);
    expect(p!.due).toBe(false);
    expect(p!.last_values).toEqual({ pain_rest: 4 });
    expect(await fehler(asUser(erika.konto, ANTWORTEN, [erika.zugang, '{"pain_rest": 1}']))).toBe(
      '22023',
    );
  });

  it('Begleitung liest „Meine Angaben“, antwortet aber nicht (ANN-352)', async () => {
    await asUserCommitted(users.therapist, SETZEN, ['treatment', patients.max, 7, ['pain_rest']]);
    const p = await portal(users.plattformPaula, platformAccesses.paulaBegleitungMax);
    expect(p!.due).toBe(true);
    expect(p!.can_answer).toBe(false);
    expect(
      await fehler(
        asUser(users.plattformPaula, ANTWORTEN, [
          platformAccesses.paulaBegleitungMax,
          '{"pain_rest": 1}',
        ]),
      ),
    ).toBe('42501');
  });

  it('nur das eigene Verhältnis: anderer Bereich, fremde Person, Praxiskonto, andere Organisation', async () => {
    // Erikas Training hat keinen Takt; die Behandlung bleibt getrennt (4.8).
    const training = await portal(erika.konto, platformAccesses.erikaTraining);
    expect(training!.schedule).toBeNull();
    expect(training!.history).toEqual([]);
    expect(
      await fehler(
        asUser(erika.konto, ANTWORTEN, [platformAccesses.erikaTraining, '{"pain_rest": 1}']),
      ),
    ).not.toBe('kein Fehler');
    // Fremdes Konto mit Erikas Zugang.
    expect(await portal(users.plattformTina, erika.zugang)).toBeNull();
    expect(
      await fehler(asUser(users.plattformTina, ANTWORTEN, [erika.zugang, '{"pain_rest": 1}'])),
    ).toBe('42501');
    // Praxiskonto, andere Organisation, ohne Anmeldung.
    expect(await portal(users.therapist, erika.zugang)).toBeNull();
    expect(
      await fehler(asUser(users.therapist, ANTWORTEN, [erika.zugang, '{"pain_rest": 1}'])),
    ).toBe('42501');
    const fremd = await fremdeOrganisation();
    expect(await portal(fremd.owner, erika.zugang)).toBeNull();
    expect(await fehler(asUser(fremd.owner, ANTWORTEN, [erika.zugang, '{"pain_rest": 1}']))).toBe(
      '42501',
    );
    expect(await fehler(asUser(null, ANTWORTEN, [erika.zugang, '{"pain_rest": 1}']))).toBe('42501');
  });

  it('im Training nur mit Einwilligung zu Gesundheitsangaben (ADR-021 Punkt 4)', async () => {
    const tina = { konto: users.plattformTina, zugang: platformAccesses.tinaTraining };
    await asUserCommitted(users.trainer, SETZEN, [
      'training',
      trainingRelationships.tina,
      7,
      ['stress'],
    ]);
    await asPostgres(
      'delete from public.training_consent_records where training_relationship_id = $1',
      [trainingRelationships.tina],
    );
    try {
      const ohne = await portal(tina.konto, tina.zugang);
      expect(ohne).toMatchObject({ due: true, can_answer: false, consent_needed: true });
      expect(await fehler(asUser(tina.konto, ANTWORTEN, [tina.zugang, '{"stress": 4}']))).toBe(
        '42501',
      );
      await asPostgres(
        `insert into public.training_consent_records
           (organization_id, training_relationship_id, record_kind, purpose, occurred_on, recorded_by)
         values ($1, $2, 'consent_granted', 'training_health_data', current_date, $3)`,
        [organizationId, trainingRelationships.tina, users.trainer],
      );
      expect((await portal(tina.konto, tina.zugang))!.can_answer).toBe(true);
      await asUserCommitted(tina.konto, ANTWORTEN, [tina.zugang, '{"stress": 4}']);
      const praxis = await lesen(users.trainer, 'training', trainingRelationships.tina);
      expect(praxis!.checkins[0]!.values).toEqual({ stress: 4 });
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('gesperrt, entzogen oder eingeladen: keine Antwort, kein Lesen (Punkt 18, 23)', async () => {
    try {
      for (const zustand of [
        `status = 'locked', locked_at = now()`,
        `status = 'revoked', locked_at = null, revoked_at = now(), revoked_reason = 'practice'`,
      ]) {
        await asPostgres(`update public.platform_accesses set ${zustand} where id = $1`, [
          erika.zugang,
        ]);
        expect(await portal(erika.konto, erika.zugang)).toBeNull();
        expect(
          await fehler(asUser(erika.konto, ANTWORTEN, [erika.zugang, '{"pain_rest": 1}'])),
        ).toBe('42501');
      }
      // Erikas eigener Zugang, noch eingeladen.
      await asPostgres(
        `update public.platform_accesses
            set status = 'invited', revoked_at = null, revoked_reason = null, activated_at = null,
                account_user_id = null
          where id = $1`,
        [erika.zugang],
      );
      expect(await portal(erika.konto, erika.zugang)).toBeNull();
      expect(await fehler(asUser(erika.konto, ANTWORTEN, [erika.zugang, '{"pain_rest": 1}']))).toBe(
        '42501',
      );
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('in der Lesefrist wird nicht mehr geantwortet, gelesen schon (ANN-305)', async () => {
    await checkinEintragen('treatment', patients.erika, 10, { pain_rest: 2 });
    try {
      await asPostgres(
        `update public.patients
            set care_concluded_on = current_date - 2, care_concluded_at = now(),
                care_concluded_by = $2::uuid
          where id = $1`,
        [patients.erika, users.therapist],
      );
      const p = await portal(erika.konto, erika.zugang);
      expect(p!.can_answer).toBe(false);
      expect(p!.history).toHaveLength(1);
      expect(await fehler(asUser(erika.konto, ANTWORTEN, [erika.zugang, '{"pain_rest": 1}']))).toBe(
        '42501',
      );
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('eine rechtliche Vertretung antwortet; das steht am Check-in und im Protokoll (Punkt 24)', async () => {
    try {
      // Bernd ist rechtliche Vertretung von Erika (Betreuung).
      const BERND = 'cafecafe-cafe-4afe-8afe-0000000000c1';
      const KONTO = '99999999-9999-4999-8999-0000000000c1';
      await asPostgres(
        `insert into auth.users (id, aud, role, email)
         values ($1, 'authenticated', 'authenticated', 'bernd.checkin@patient.invalid')`,
        [KONTO],
      );
      await asPostgres(
        `insert into public.platform_accesses
           (id, organization_id, relationship_kind, relationship_id, patient_id, account_user_id,
            status, activated_at, access_kind, legal_basis, representative_name, proof_documents,
            health_scope, finance_scope, proof_recorded_by, proof_recorded_at, created_by)
         values ($1, $2, 'treatment', $3, $3, $4, 'active', now(), 'legal_representative',
                 'guardianship', 'Bernd Betreuer',
                 array['identity_document', 'guardianship_certificate'],
                 true, false, $5, now(), $5)`,
        [BERND, organizationId, patients.erika, KONTO, users.office],
      );
      await asUserCommitted(KONTO, ANTWORTEN, [BERND, '{"pain_rest": 6}']);
      const praxis = await lesen(users.therapist, 'treatment', patients.erika);
      expect(praxis!.checkins[0]).toMatchObject({
        recorded_by_kind: 'legal_representative',
        values: { pain_rest: 6 },
      });
      const { rows } = await asPostgres<{ actor_kind: string; view: string }>(
        `select actor_kind, context ->> 'view' as view from public.audit_log
         where actor_user_id = $1 and action = 'platform_representation.read'`,
        [KONTO],
      );
      expect(rows).toContainEqual({ actor_kind: 'representative', view: 'checkin' });
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('steht im eigenen Export (POR-018), ohne Kennung des Zugangs', async () => {
    await asUserCommitted(erika.konto, ANTWORTEN, [erika.zugang, '{"pain_rest": 5}']);
    const { rows } = await asUser<{
      daten: { checkins: { schedule: unknown; history: Record<string, unknown>[] } };
    }>(erika.konto, 'select public.platform_export($1::uuid) as daten', [erika.zugang]);
    expect(rows[0]!.daten.checkins.schedule).toMatchObject({ interval_days: 7 });
    expect(rows[0]!.daten.checkins.history).toEqual([
      expect.objectContaining({ values: { pain_rest: 5 } }),
    ]);
    expect(JSON.stringify(rows[0]!.daten.checkins)).not.toContain(erika.zugang);
  });
});
