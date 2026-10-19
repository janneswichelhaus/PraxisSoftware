import { beforeEach, describe, expect, it } from 'vitest';
import {
  FREMDE_ORGANISATION,
  SEED,
  asPostgres,
  asServiceRole,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Erinnerungen an das Ernährungstagebuch (ERN-009, ADR-027 Punkt 12,
 * ADR-024 Punkte 13 bis 17).
 *
 *   * Von Anfang an aus; die Person wählt je Mahlzeit eine Uhrzeit und die
 *     Wege dieser Art - einschalten nur mit Einwilligung und eingeschaltetem
 *     Tagebuch, abschalten immer.
 *   * Der Zeitplan legt fällige Erinnerungen an, nicht in der Ruhezeit, und
 *     wiederholt sich ohne Doppel; beim Abholen entfällt, was keinen Sinn
 *     mehr hat (Widerruf, Tagebuch aus, Uhrzeit geändert).
 *   * Eine je Mahlzeit und Tag; sie zählen nicht in die Woche der übrigen
 *     Arten (ANN-662).
 *   * Die Begleitung nicht; die Praxis liest die Wahl nicht.
 */

const { users, platformAccesses } = SEED;
const ZUGANG = platformAccesses.erikaBehandlung;
const PROFIL = 'f0f0f0f0-f0f0-4f0f-8f0f-000000000001';
const FASSUNG = '2026-10';
const WAEHLEN = 'select public.set_platform_diary_reminders($1::uuid, $2::jsonb, $3, $4)';
const LESEN = 'select public.platform_diary_reminders($1::uuid) as d';
const ANLEGEN = 'select public.enqueue_nutrition_diary_reminders() as n';
const ABHOLEN = 'select * from public.claim_notification_deliveries(50)';
const RUHE =
  'select public.set_platform_notification_settings($1::uuid, $2::text[], $3::text[], $4::smallint, $5::smallint)';

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

/** Die Uhrzeit der Praxis jetzt, auf 15 Minuten abgerundet - „gerade fällig“. */
async function geradeFaellig(): Promise<string> {
  const { rows } = await asPostgres<{ t: string }>(
    `select to_char(date_trunc('hour', l) + floor(extract(minute from l) / 15) * interval '15 minutes',
                    'HH24:MI') as t
     from (select now() at time zone time_zone as l from public.organizations where id = $1) x`,
    [SEED.organizationId],
  );
  return rows[0]!.t;
}

async function waehlen(erinnerungen: { meal: string; time: string }[], mail = true, push = false) {
  await asUserCommitted(users.plattformErika, WAEHLEN, [
    ZUGANG,
    JSON.stringify(erinnerungen),
    mail,
    push,
  ]);
}

async function ohneRuhezeit() {
  // Gleicher Anfang und gleiches Ende: keine Ruhezeit. Die Wege dieser Art
  // setzt danach waehlen().
  await asUserCommitted(users.plattformErika, RUHE, [ZUGANG, [], [], 0, 0]);
}

async function auftraege() {
  return (
    await asPostgres<{ kind: string; channel: string; state: string; drop_reason: string | null }>(
      `select kind, channel, state, drop_reason from public.notification_deliveries
        where kind = 'nutrition_diary_reminder' order by created_at, id`,
    )
  ).rows;
}

describe('Erinnerungen an das Tagebuch (ERN-009)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('von Anfang an aus; wählen, lesen, abschalten', async () => {
    const { rows } = await asUser<{ d: Record<string, unknown> }>(users.plattformErika, LESEN, [
      ZUGANG,
    ]);
    expect(rows[0]!.d).toMatchObject({ reminders: [], email: false, push: false });

    await waehlen([
      { meal: 'dinner', time: '18:30' },
      { meal: 'breakfast', time: '07:45' },
    ]);
    const { rows: danach } = await asUser<{ d: Record<string, unknown> }>(
      users.plattformErika,
      LESEN,
      [ZUGANG],
    );
    expect(danach[0]!.d).toMatchObject({
      reminders: [
        { meal: 'breakfast', time: '07:45' },
        { meal: 'dinner', time: '18:30' },
      ],
      email: true,
      push: false,
    });
    // Die übrigen Arten bleiben, wie sie waren.
    await asUserCommitted(users.plattformErika, RUHE, [ZUGANG, ['plan_assigned'], [], 20, 8]);
    await waehlen([{ meal: 'lunch', time: '12:00' }]);
    const { rows: arten } = await asPostgres<{ email_kinds: string[] }>(
      'select email_kinds from public.platform_notification_settings where access_id = $1',
      [ZUGANG],
    );
    expect(arten[0]!.email_kinds).toEqual(['nutrition_diary_reminder', 'plan_assigned']);

    await waehlen([], false, false);
    const { rows: aus } = await asPostgres<{ n: number; email_kinds: string[] }>(
      `select (select count(*)::int from public.nutrition_diary_reminders) as n,
              (select email_kinds from public.platform_notification_settings
                where access_id = $1) as email_kinds`,
      [ZUGANG],
    );
    expect(aus[0]).toEqual({ n: 0, email_kinds: ['plan_assigned'] });
  });

  it('prüft die Wahl: Mahlzeit, Viertelstunde, einmal je Mahlzeit', async () => {
    const versuch = (liste: unknown) =>
      fehler(asUser(users.plattformErika, WAEHLEN, [ZUGANG, JSON.stringify(liste), true, false]));
    expect(await versuch([{ meal: 'brunch', time: '10:00' }])).toBe('22023');
    expect(await versuch([{ meal: 'lunch', time: '12:10' }])).toBe('22023');
    expect(await versuch([{ meal: 'lunch', time: '24:00' }])).toBe('22023');
    expect(
      await versuch([
        { meal: 'lunch', time: '12:00' },
        { meal: 'lunch', time: '13:00' },
      ]),
    ).toBe('22023');
    expect(await versuch([{ meal: 'lunch', time: '12:00', text: 'x' }])).toBe('22023');
    expect(await versuch({ meal: 'lunch' })).toBe('22023');
  });

  it('einschalten nur mit Einwilligung und eingeschaltetem Tagebuch; aus geht immer', async () => {
    await asPostgres('update public.nutrition_profiles set diary_enabled = false where id = $1', [
      PROFIL,
    ]);
    expect(
      await fehler(
        asUser(users.plattformErika, WAEHLEN, [
          ZUGANG,
          JSON.stringify([{ meal: 'lunch', time: '12:00' }]),
          true,
          false,
        ]),
      ),
    ).toBe('42501');
    await asPostgres('update public.nutrition_profiles set diary_enabled = true where id = $1', [
      PROFIL,
    ]);
    await waehlen([{ meal: 'lunch', time: '12:00' }]);
    await asUserCommitted(
      users.plattformErika,
      'select public.record_platform_nutrition_consent($1::uuid, false, $2)',
      [ZUGANG, FASSUNG],
    );
    expect(
      await fehler(
        asUser(users.plattformErika, WAEHLEN, [
          ZUGANG,
          JSON.stringify([{ meal: 'lunch', time: '13:00' }]),
          true,
          false,
        ]),
      ),
    ).toBe('42501');
    await waehlen([], false, false);
  });

  it('Begleitung und Praxiskonto: nichts; die Praxis liest die Wahl nicht', async () => {
    expect(
      await fehler(
        asUser(users.plattformPaula, WAEHLEN, [
          platformAccesses.paulaBegleitungMax,
          '[]',
          false,
          false,
        ]),
      ),
    ).toBe('42501');
    const { rows } = await asUser<{ d: unknown }>(users.plattformPaula, LESEN, [
      platformAccesses.paulaBegleitungMax,
    ]);
    expect(rows[0]!.d).toBeNull();
    expect(await fehler(asUser(users.ownerTherapist, WAEHLEN, [ZUGANG, '[]', false, false]))).toBe(
      '42501',
    );
    await waehlen([{ meal: 'lunch', time: '12:00' }]);
    for (const konto of [users.ownerTherapist, users.office]) {
      expect(
        await fehler(asUser(konto, 'select count(*) from public.nutrition_diary_reminders')),
        konto,
      ).toBe('42501');
    }
  });

  it('Zeitplan: fällig je Weg, ohne Doppel; Ruhezeit und Schalter der Praxis halten ab', async () => {
    await ohneRuhezeit();
    const jetzt = await geradeFaellig();
    await waehlen([{ meal: 'snack', time: jetzt }]);
    const { rows } = await asPostgres<{ n: number }>(ANLEGEN);
    expect(rows[0]!.n).toBe(1);
    expect((await asPostgres<{ n: number }>(ANLEGEN)).rows[0]!.n).toBe(0);
    expect(await auftraege()).toEqual([
      { kind: 'nutrition_diary_reminder', channel: 'email', state: 'pending', drop_reason: null },
    ]);

    // Ruhezeit rund um die Uhr: nichts entsteht (entfällt statt morgen).
    await asPostgres(`delete from public.notification_deliveries`);
    await asPostgres(
      `update public.platform_notification_settings set quiet_from = 0, quiet_until = 23
        where access_id = $1`,
      [ZUGANG],
    );
    const stunde = Number(jetzt.slice(0, 2));
    if (stunde < 23) {
      expect((await asPostgres<{ n: number }>(ANLEGEN)).rows[0]!.n).toBe(0);
    }
    await asPostgres(
      `update public.platform_notification_settings set quiet_from = 0, quiet_until = 0
        where access_id = $1`,
      [ZUGANG],
    );

    // Die Praxis schaltet die Art für alle ab.
    await asUserCommitted(
      users.ownerTherapist,
      'select public.set_notification_kind_enabled($1, $2)',
      ['nutrition_diary_reminder', false],
    );
    expect((await asPostgres<{ n: number }>(ANLEGEN)).rows[0]!.n).toBe(0);
  });

  it('beim Abholen: entfällt nach Widerruf, mit Tagebuch aus und geänderter Uhrzeit', async () => {
    await ohneRuhezeit();
    const jetzt = await geradeFaellig();
    await waehlen([{ meal: 'snack', time: jetzt }]);
    await asPostgres(ANLEGEN);
    await asPostgres('update public.nutrition_profiles set diary_enabled = false where id = $1', [
      PROFIL,
    ]);
    expect((await asServiceRole(ABHOLEN)).rows).toEqual([]);
    expect((await auftraege())[0]).toMatchObject({ state: 'dropped', drop_reason: 'obsolete' });

    await asPostgres('update public.nutrition_profiles set diary_enabled = true where id = $1', [
      PROFIL,
    ]);
    await asPostgres(`delete from public.notification_deliveries`);
    await asPostgres(ANLEGEN);
    // Uhrzeit inzwischen geändert: die alte Erinnerung entfällt.
    await asPostgres(
      `update public.nutrition_diary_reminders set remind_at = remind_at + interval '15 minutes'`,
    );
    expect((await asServiceRole(ABHOLEN)).rows).toEqual([]);
    expect((await auftraege())[0]).toMatchObject({ drop_reason: 'obsolete' });
  });

  it('geht beim Abholen mit festem Text, eine je Mahlzeit und Tag, ohne die Woche zu füllen', async () => {
    await ohneRuhezeit();
    const jetzt = await geradeFaellig();
    await waehlen([{ meal: 'snack', time: jetzt }]);
    await asPostgres(ANLEGEN);
    const { rows } = await asServiceRole<{ kind: string; subject_at: Date }>(ABHOLEN);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe('nutrition_diary_reminder');

    // Zehn gesendete Tagebucherinnerungen dieser Woche zählen nicht für die
    // Obergrenze der übrigen Arten (ANN-662).
    await asPostgres(
      `insert into public.notification_deliveries
         (organization_id, access_id, kind, channel, subject_id, subject_at, due_at, state,
          finished_at, attempts)
       select $1, $2, 'nutrition_diary_reminder', 'email', gen_random_uuid(),
              now() - (n || ' days')::interval, now() - (n || ' days')::interval, 'sent',
              now() - (n || ' days')::interval, 1
       from generate_series(1, 10) n`,
      [SEED.organizationId, ZUGANG],
    );
    await asUserCommitted(users.plattformErika, RUHE, [
      ZUGANG,
      ['plan_assigned', 'nutrition_diary_reminder'],
      [],
      0,
      0,
    ]);
    await asPostgres(
      `select app.enqueue_notification($1, 'treatment', $2, 'plan_assigned', null, null)`,
      [SEED.organizationId, SEED.patients.erika],
    );
    const { rows: plan } = await asServiceRole<{ kind: string }>(ABHOLEN);
    expect(plan.map((r) => r.kind)).toEqual(['plan_assigned']);
  });

  it('neu speichern nach einer Erinnerung bringt keine zweite für dieselbe Mahlzeit (Zweitreview)', async () => {
    await ohneRuhezeit();
    const jetzt = await geradeFaellig();
    await waehlen([{ meal: 'snack', time: jetzt }]);
    await asPostgres(ANLEGEN);
    expect(await asServiceRole(ABHOLEN).then((r) => r.rows)).toHaveLength(1);
    await asPostgres(
      `update public.notification_deliveries set state = 'sent', finished_at = now()`,
    );
    // Gleiche Wahl noch einmal gespeichert: dieselbe Zeile, kein zweiter Auftrag.
    await waehlen([{ meal: 'snack', time: jetzt }]);
    expect((await asPostgres<{ n: number }>(ANLEGEN)).rows[0]!.n).toBe(0);
    // Andere Uhrzeit am selben Tag: dieselbe Zeile, darum greift die Grenze je Mahlzeit.
    await asPostgres(
      `update public.nutrition_diary_reminders set remind_at = remind_at - interval '15 minutes'`,
    );
    await asPostgres(
      `insert into public.notification_deliveries
         (organization_id, access_id, kind, channel, subject_id, subject_at, due_at)
       select r.organization_id, r.access_id, 'nutrition_diary_reminder', 'email', r.id,
              ((now() at time zone o.time_zone)::date + r.remind_at) at time zone o.time_zone, now()
       from public.nutrition_diary_reminders r join public.organizations o on o.id = r.organization_id`,
    );
    expect((await asServiceRole(ABHOLEN)).rows).toEqual([]);
    expect((await auftraege()).at(-1)).toMatchObject({ drop_reason: 'daily_cap' });
  });

  it('fremdes Konto, fremde Organisation, Lesefrist: kein Einschalten, kein Lesen', async () => {
    await fremdeOrganisation();
    const ein = JSON.stringify([{ meal: 'lunch', time: '12:00' }]);
    for (const konto of [users.plattformTina, FREMDE_ORGANISATION.owner]) {
      expect(await fehler(asUser(konto, WAEHLEN, [ZUGANG, ein, true, false])), konto).toBe('42501');
      const { rows } = await asUser<{ d: unknown }>(konto, LESEN, [ZUGANG]);
      expect(rows[0]!.d, konto).toBeNull();
    }
    await waehlen([{ meal: 'lunch', time: '12:00' }]);
    await asPostgres(
      `update public.patients
          set care_concluded_on = current_date - 2, care_concluded_at = now(),
              care_concluded_by = $2::uuid
        where id = $1`,
      [SEED.patients.erika, users.therapist],
    );
    expect(await fehler(asUser(users.plattformErika, WAEHLEN, [ZUGANG, ein, true, false]))).toBe(
      '42501',
    );
    // Abschalten geht auch in der Lesefrist.
    await waehlen([], false, false);
  });

  it('fallen mit dem Zugang und mit dem Profil; Favoriten mit dem Profil', async () => {
    await waehlen([{ meal: 'lunch', time: '12:00' }]);
    await asPostgres('delete from public.platform_accesses where id = $1', [ZUGANG]);
    expect(
      (
        await asPostgres<{ n: number }>(
          'select count(*)::int as n from public.nutrition_diary_reminders',
        )
      ).rows[0]!.n,
    ).toBe(0);
    await resetDatabase();
    await waehlen([{ meal: 'lunch', time: '12:00' }]);
    await asUserCommitted(
      users.plattformErika,
      `select public.set_platform_diary_favorite($1::uuid, 'person',
         'f1f1f1f1-f1f1-4f1f-8f1f-000000000002', true)`,
      [ZUGANG],
    );
    await asPostgres('delete from public.nutrition_profiles where id = $1', [PROFIL]);
    const { rows } = await asPostgres<{ r: number; f: number }>(
      `select (select count(*)::int from public.nutrition_diary_reminders) as r,
              (select count(*)::int from public.nutrition_diary_favorites) as f`,
    );
    expect(rows[0]).toEqual({ r: 0, f: 0 });
  });
});
