import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { OFFLINE_FRIST_TAGE } from '../../src/lib/geraeteablage';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  jwtClaims,
  planeEntfernen,
  resetDatabase,
  testDatabaseUrl,
} from './helpers/db';
import { Client } from 'pg';
import { KNIEBEUGE_GELAENDER, RUDERN_GELB, positionen, zugewiesenerPlan } from './helpers/plaene';

/**
 * Die Übertragung einer ohne Netz erfassten Einheit (TRK-007, ADR-024
 * Punkte 7 und 8, ANN-357).
 *
 *   * Additiv und wiederholbar: Kennungen vom Gerät, zweimal gesendet ist
 *     einmal gespeichert, nichts wird überschrieben.
 *   * Der Server urteilt beim Eingang, mit denselben Prüfungen wie online.
 *   * Eine Kennung des Geräts gewährt nichts: fremd heißt wie unbekannt.
 */

const { users, platformAccesses, patients, trainingRelationships, organizationId } = SEED;

const SYNC =
  'select public.sync_platform_exercise_session($1::uuid, $2::uuid, $3::uuid, $4::date, $5::timestamptz, $6::jsonb) as ergebnis';
const BEGINNEN = 'select public.start_platform_exercise_session($1::uuid, $2::uuid) as id';
const HAKEN = 'select public.mark_platform_exercise_set($1::uuid, $2::uuid, $3::uuid, $4, $5)';

const erika = { konto: users.plattformErika, zugang: platformAccesses.erikaBehandlung };

interface Ergebnis {
  session_id: string;
  status: 'ok' | 'finished' | 'empty';
  note_dropped: boolean;
}

interface Haken {
  id: string;
  kind: 'set';
  at: string;
  item_id: string;
  set_number: number;
  done: boolean;
}
type Ereignis =
  | Haken
  | { id: string; kind: 'finish'; at: string; note?: string; values?: Record<string, number> };

function haken(item: string, satz: number, done = true, at = '2026-10-12T06:00:00Z'): Haken {
  return { id: randomUUID(), kind: 'set', at, item_id: item, set_number: satz, done };
}

function ende(note = '', values: Record<string, number> = {}): Ereignis {
  return { id: randomUUID(), kind: 'finish', at: '2026-10-12T06:20:00Z', note, values };
}

async function heute(): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    'select app.training_today($1::uuid)::text as tag',
    [organizationId],
  );
  return rows[0]!.tag;
}

async function tagVor(tage: number): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    'select (app.training_today($1::uuid) - $2::integer)::text as tag',
    [organizationId, tage],
  );
  return rows[0]!.tag;
}

async function senden(
  konto: string,
  zugang: string,
  plan: string,
  einheit: string,
  tag: string,
  ereignisse: Ereignis[],
): Promise<Ergebnis> {
  const { rows } = await asUserCommitted<{ ergebnis: Ergebnis }>(konto, SYNC, [
    zugang,
    plan,
    einheit,
    tag,
    '2026-10-12T05:58:00Z',
    JSON.stringify(ereignisse),
  ]);
  return rows[0]!.ergebnis;
}

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

async function saetze(einheit: string): Promise<{ item_id: string; set_number: number }[]> {
  const { rows } = await asPostgres<{ item_id: string; set_number: number }>(
    `select item_id, set_number from public.exercise_plan_session_sets
      where session_id = $1 order by item_id, set_number`,
    [einheit],
  );
  return rows;
}

describe('Einheit ohne Netz übertragen (TRK-007)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await planeEntfernen();
    await asPostgres('delete from public.audit_log');
  });

  it('legt Einheit und Haken mit den Kennungen des Geräts an, Zeit des Geräts als Angabe', async () => {
    const plan = await zugewiesenerPlan('therapy', patients.erika, 'Knie', [
      KNIEBEUGE_GELAENDER,
      RUDERN_GELB,
    ]);
    const [erste, zweite] = await positionen(plan);
    const einheit = randomUUID();
    const eins = haken(erste!, 1);
    const ergebnis = await senden(erika.konto, erika.zugang, plan, einheit, await heute(), [
      eins,
      haken(erste!, 2),
      haken(zweite!, 1),
      ende('  Knie zieht  ', { session_exertion: 6 }),
    ]);
    expect(ergebnis).toEqual({ session_id: einheit, status: 'ok', note_dropped: false });

    const { rows } = await asPostgres<Record<string, unknown>>(
      'select * from public.exercise_plan_sessions where id = $1',
      [einheit],
    );
    expect(rows[0]).toMatchObject({
      plan_id: plan,
      difficulty_note: 'Knie zieht',
      platform_access_id: erika.zugang,
      platform_access_kind: 'self',
      recorded_by: users.plattformErika,
      finished_by: users.plattformErika,
      reported_started_at: new Date('2026-10-12T05:58:00Z'),
      reported_finished_at: new Date('2026-10-12T06:20:00Z'),
    });
    // Eingang am Server, nicht die Uhr des Geräts.
    expect((rows[0]!.finished_at as Date).getTime()).toBeGreaterThan(Date.now() - 60_000);
    const haken1 = await asPostgres<{ id: string; reported_done_at: Date }>(
      'select id, reported_done_at from public.exercise_plan_session_sets where id = $1',
      [eins.id],
    );
    expect(haken1.rows[0]!.reported_done_at).toEqual(new Date('2026-10-12T06:00:00Z'));
    const werte = await asPostgres<{ parameter_key: string; value: number }>(
      'select parameter_key, value from public.exercise_plan_session_values where session_id = $1',
      [einheit],
    );
    expect(werte.rows).toEqual([{ parameter_key: 'session_exertion', value: 6 }]);

    // Die Praxis sieht die Zeit des Geräts neben dem Eingang (Art. 15 ebenso).
    const praxis = await asUser<{ plan: { sessions: Record<string, unknown>[] } }>(
      users.therapist,
      'select public.get_exercise_plan($1::uuid) as plan',
      [plan],
    );
    expect(praxis.rows[0]!.plan.sessions[0]).toMatchObject({
      sets_done: 3,
      reported_started_at: '2026-10-12T05:58:00+00:00',
      reported_finished_at: '2026-10-12T06:20:00+00:00',
    });
  });

  it('zweimal gesendet ist einmal gespeichert (Punkt 7)', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    const einheit = randomUUID();
    const tag = await heute();
    const ereignisse = [haken(position!, 1), haken(position!, 2), ende('Knie')];
    await senden(erika.konto, erika.zugang, plan, einheit, tag, ereignisse);
    // Die Antwort ging verloren; das Gerät sendet dasselbe noch einmal.
    expect(await senden(erika.konto, erika.zugang, plan, einheit, tag, ereignisse)).toEqual({
      session_id: einheit,
      status: 'finished',
      note_dropped: false,
    });
    const { rows } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.exercise_plan_sessions where plan_id = $1',
      [plan],
    );
    expect(rows[0]!.n).toBe(1);
    expect(await saetze(einheit)).toHaveLength(2);
  });

  it('eine offene Einheit wächst Stück für Stück; Zurücknehmen in Reihenfolge', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    const einheit = randomUUID();
    const tag = await heute();
    const an = haken(position!, 1);
    await senden(erika.konto, erika.zugang, plan, einheit, tag, [an, haken(position!, 2)]);
    // Zweites Senden derselben ersten Ereignisse und dazu: 2 aus, 3 an.
    await senden(erika.konto, erika.zugang, plan, einheit, tag, [
      an,
      haken(position!, 2, false),
      haken(position!, 3),
    ]);
    expect((await saetze(einheit)).map((s) => s.set_number)).toEqual([1, 3]);
    // An, aus, an für denselben Satz in einer Sendung: am Ende an.
    await senden(erika.konto, erika.zugang, plan, einheit, tag, [
      haken(position!, 2),
      haken(position!, 2, false),
      haken(position!, 2),
    ]);
    expect((await saetze(einheit)).map((s) => s.set_number)).toEqual([1, 2, 3]);
  });

  it('online begonnene Einheit: die Kennung des Servers wird fortgesetzt', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    const { rows } = await asUserCommitted<{ id: string }>(erika.konto, BEGINNEN, [
      erika.zugang,
      plan,
    ]);
    const einheit = rows[0]!.id;
    await asUserCommitted(erika.konto, HAKEN, [erika.zugang, einheit, position, 1, true]);
    await senden(erika.konto, erika.zugang, plan, einheit, await heute(), [
      haken(position!, 2),
      ende(),
    ]);
    expect((await saetze(einheit)).map((s) => s.set_number)).toEqual([1, 2]);
  });

  it('ist am selben Tag schon eine offen (zweites Gerät), kommen die Haken dazu', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    const { rows } = await asUserCommitted<{ id: string }>(erika.konto, BEGINNEN, [
      erika.zugang,
      plan,
    ]);
    const offen = rows[0]!.id;
    await asUserCommitted(erika.konto, HAKEN, [erika.zugang, offen, position, 1, true]);
    const ergebnis = await senden(erika.konto, erika.zugang, plan, randomUUID(), await heute(), [
      haken(position!, 2),
    ]);
    expect(ergebnis.session_id).toBe(offen);
    expect((await saetze(offen)).map((s) => s.set_number)).toEqual([1, 2]);
  });

  it('eine Einheit von gestern kommt mit ihrem Tag an, nicht älter als die Ablage', async () => {
    const plan = await zugewiesenerPlan();
    // Der Plan läuft seit einem Monat (der Wächter erlaubt das nur ohne Trigger).
    await asPostgres(
      `alter table public.exercise_plans disable trigger exercise_plans_guard;
       update public.exercise_plans set runs_from = runs_from - 30 where id = '${plan}';
       alter table public.exercise_plans enable trigger exercise_plans_guard;`,
    );
    const [position] = await positionen(plan);
    const gestern = await tagVor(1);
    const einheit = randomUUID();
    await senden(erika.konto, erika.zugang, plan, einheit, gestern, [haken(position!, 1), ende()]);
    const { rows } = await asPostgres<{ performed_on: string }>(
      'select performed_on::text from public.exercise_plan_sessions where id = $1',
      [einheit],
    );
    expect(rows[0]!.performed_on).toBe(gestern);

    const zuAlt = await tagVor(OFFLINE_FRIST_TAGE + 1);
    expect(
      await fehler(
        senden(erika.konto, erika.zugang, plan, randomUUID(), zuAlt, [haken(position!, 1)]),
      ),
    ).toBe('P0002');
    // Gerade noch: der letzte Tag der Ablage.
    await senden(erika.konto, erika.zugang, plan, randomUUID(), await tagVor(OFFLINE_FRIST_TAGE), [
      haken(position!, 1),
    ]);
    // Nicht in der Zukunft - ein Tag voraus ist Zeitzone oder Uhr und zählt
    // als heute (Zweitreview S3).
    expect(
      await fehler(
        senden(erika.konto, erika.zugang, plan, randomUUID(), await tagVor(-2), [
          haken(position!, 1),
        ]),
      ),
    ).toBe('22023');
    const morgen = randomUUID();
    await senden(erika.konto, erika.zugang, plan, morgen, await tagVor(-1), [haken(position!, 2)]);
    const tag = await asPostgres<{ performed_on: string }>(
      'select performed_on::text from public.exercise_plan_sessions where id = $1',
      [morgen],
    );
    expect(tag.rows[0]!.performed_on).toBe(await heute());
  });

  it('die Frist des Servers ist die der Ablage auf dem Gerät (ADR-024 Punkt 5)', async () => {
    const { rows } = await asPostgres<{ tage: number }>(
      'select app.offline_transfer_days() as tage',
    );
    expect(rows[0]!.tage).toBe(OFFLINE_FRIST_TAGE);
  });

  it('nichts angekommen, nichts angelegt: nur zurückgenommene Haken', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    const einheit = randomUUID();
    expect(
      await senden(erika.konto, erika.zugang, plan, einheit, await heute(), [
        haken(position!, 1),
        haken(position!, 1, false),
        ende('Knie'),
      ]),
    ).toMatchObject({ status: 'empty' });
    const { rows } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.exercise_plan_sessions where plan_id = $1',
      [plan],
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('der Server urteilt beim Eingang: beendeter Plan, gesperrter Zugang (Punkt 8)', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    await asUserCommitted(users.therapist, 'select public.end_exercise_plan($1::uuid)', [plan]);
    expect(
      await fehler(
        senden(erika.konto, erika.zugang, plan, randomUUID(), await heute(), [haken(position!, 1)]),
      ),
    ).toBe('P0002');

    const zweiter = await zugewiesenerPlan();
    const [p2] = await positionen(zweiter);
    try {
      await asPostgres(
        `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
        [erika.zugang],
      );
      expect(
        await fehler(
          senden(erika.konto, erika.zugang, zweiter, randomUUID(), await heute(), [haken(p2!, 1)]),
        ),
      ).toBe('42501');
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('in der Lesefrist kommt nichts mehr an (ANN-305)', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    try {
      await asPostgres(
        `update public.patients
            set care_concluded_on = current_date - 2, care_concluded_at = now(),
                care_concluded_by = $2::uuid
          where id = $1`,
        [patients.erika, users.therapist],
      );
      expect(
        await fehler(
          senden(erika.konto, erika.zugang, plan, randomUUID(), await heute(), [
            haken(position!, 1),
          ]),
        ),
      ).toBe('42501');
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('eine fremde Kennung gewährt nichts und verrät nichts (Punkt 7)', async () => {
    // Tinas Einheit an Tinas Plan …
    const tinasPlan = await zugewiesenerPlan('training', trainingRelationships.tina, 'Tina');
    const [tinasPosition] = await positionen(tinasPlan);
    const tinasEinheit = randomUUID();
    const tinasHaken = haken(tinasPosition!, 1);
    await senden(
      users.plattformTina,
      platformAccesses.tinaTraining,
      tinasPlan,
      tinasEinheit,
      await heute(),
      [tinasHaken],
    );
    // … trifft Erika mit ihrem eigenen Plan: wie unbekannt.
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    expect(
      await fehler(
        senden(erika.konto, erika.zugang, plan, tinasEinheit, await heute(), [haken(position!, 1)]),
      ),
    ).toBe('P0002');
    // Mit Tinas Plan über den eigenen Zugang: wie ein fremder Plan.
    expect(
      await fehler(
        senden(
          erika.konto,
          platformAccesses.erikaTraining,
          tinasPlan,
          tinasEinheit,
          await heute(),
          [haken(tinasPosition!, 2)],
        ),
      ),
    ).toBe('P0002');
    // Eine Haken-Kennung, die es schon bei Tina gibt, ändert dort nichts.
    const eigene = randomUUID();
    await senden(erika.konto, erika.zugang, plan, eigene, await heute(), [
      { ...tinasHaken, item_id: position!, set_number: 1 },
      haken(position!, 2),
    ]);
    expect(await saetze(tinasEinheit)).toEqual([{ item_id: tinasPosition, set_number: 1 }]);
    expect((await saetze(eigene)).map((s) => s.set_number)).toEqual([2]);
    // Eine Übung eines fremden Plans: abgewiesen, nichts angelegt.
    expect(
      await fehler(
        senden(erika.konto, erika.zugang, plan, randomUUID(), await heute(), [
          haken(tinasPosition!, 1),
        ]),
      ),
    ).toBe('P0002');
  });

  it('Begleitung, Praxiskonto, andere Organisation, ohne Anmeldung: abgewiesen', async () => {
    const plan = await zugewiesenerPlan('therapy', patients.max, 'Max');
    const [position] = await positionen(plan);
    const args = (zugang: string) => [
      zugang,
      plan,
      randomUUID(),
      '2026-10-12',
      null,
      JSON.stringify([haken(position!, 1)]),
    ];
    expect(
      await fehler(asUser(users.plattformPaula, SYNC, args(platformAccesses.paulaBegleitungMax))),
    ).toBe('42501');
    expect(await fehler(asUser(users.therapist, SYNC, args(erika.zugang)))).toBe('42501');
    const fremd = await fremdeOrganisation();
    expect(await fehler(asUser(fremd.owner, SYNC, args(erika.zugang)))).toBe('42501');
    // Ohne Anmeldung: wie eine gesperrte Sitzung - das Gerät behält die Daten.
    expect(await fehler(asUser(null, SYNC, args(erika.zugang)))).toBe('28000');
  });

  it('prüft die Form: Satz, Art, Ende zuletzt, ein Ereignis ohne Kennung', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    const tag = await heute();
    const versuch = (ereignisse: unknown[]) =>
      fehler(
        asUser(erika.konto, SYNC, [
          erika.zugang,
          plan,
          randomUUID(),
          tag,
          null,
          JSON.stringify(ereignisse),
        ]),
      );
    expect(await versuch([haken(position!, 4)])).toBe('22023');
    expect(await versuch([haken(position!, 0)])).toBe('22023');
    expect(await versuch([{ ...haken(position!, 1), kind: 'skip' }])).toBe('22023');
    expect(await versuch([ende(), haken(position!, 1)])).toBe('22023');
    expect(await versuch([{ ...haken(position!, 1), id: undefined }])).toBe('22023');
    // Ohne „done" kein stilles Zurücknehmen (Zweitreview H1).
    expect(await versuch([{ ...haken(position!, 1), done: undefined }])).toBe('22023');
    expect(await versuch([haken(position!, 1), ende('x'.repeat(501))])).toBe('22023');
    expect(await versuch([haken(position!, 1), ende('', { session_exertion: 11 })])).toBe('22023');
    expect(
      await fehler(asUser(erika.konto, SYNC, [erika.zugang, plan, randomUUID(), tag, null, '{}'])),
    ).toBe('22023');
    // Nichts davon hat eine Einheit hinterlassen.
    const { rows } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.exercise_plan_sessions where plan_id = $1',
      [plan],
    );
    expect(rows[0]!.n).toBe(0);
  });

  it('im Training ohne Einwilligung beim Eingang: beendet, Satz und Angaben fallen weg', async () => {
    const plan = await zugewiesenerPlan('training', trainingRelationships.tina, 'Tina');
    const [position] = await positionen(plan);
    const tina = { konto: users.plattformTina, zugang: platformAccesses.tinaTraining };
    await asPostgres(
      'delete from public.training_consent_records where training_relationship_id = $1',
      [trainingRelationships.tina],
    );
    const einheit = randomUUID();
    expect(
      await senden(tina.konto, tina.zugang, plan, einheit, await heute(), [
        haken(position!, 1),
        ende('Rücken', { session_pain: 4 }),
      ]),
    ).toEqual({ session_id: einheit, status: 'ok', note_dropped: true });
    const { rows } = await asPostgres<{ difficulty_note: string | null; finished: boolean }>(
      `select difficulty_note, finished_at is not null as finished
         from public.exercise_plan_sessions where id = $1`,
      [einheit],
    );
    expect(rows[0]).toEqual({ difficulty_note: null, finished: true });
    const werte = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.exercise_plan_session_values where session_id = $1',
      [einheit],
    );
    expect(werte.rows[0]!.n).toBe(0);
  });

  it('gesperrte Sitzung: eigener Code, kein Urteil über die Daten (Zweitreview B1)', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    // Angemeldet vor 61 Minuten: Höchstdauer um (ADR-025 Punkt 1).
    const claims = jwtClaims(erika.konto, {
      amr: [{ method: 'password', timestamp: Math.floor(Date.now() / 1000) - 61 * 60 }],
      session_id: 'bcbcbcbc-bcbc-4cbc-8cbc-000000000031',
    });
    const client = new Client({ connectionString: testDatabaseUrl() });
    await client.connect();
    let code = 'kein Fehler';
    try {
      await client.query('begin');
      await client.query("select set_config('role', 'authenticated', true)");
      await client.query("select set_config('request.jwt.claims', $1, true)", [claims]);
      await client.query(SYNC, [
        erika.zugang,
        plan,
        randomUUID(),
        await heute(),
        null,
        JSON.stringify([haken(position!, 1)]),
      ]);
    } catch (e) {
      code = String((e as { code?: string }).code);
    } finally {
      await client.query('rollback').catch(() => undefined);
      await client.end();
    }
    expect(code).toBe('28000');
  });

  it('eine offene Einheit eines anderen Tages nimmt nichts an (ANN-305, Zweitreview S1)', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    const { rows } = await asUserCommitted<{ id: string }>(erika.konto, BEGINNEN, [
      erika.zugang,
      plan,
    ]);
    const gestern = rows[0]!.id;
    await asUserCommitted(erika.konto, HAKEN, [erika.zugang, gestern, position, 1, true]);
    await asPostgres(
      'update public.exercise_plan_sessions set performed_on = performed_on - 1 where id = $1',
      [gestern],
    );
    expect(
      await senden(erika.konto, erika.zugang, plan, gestern, await heute(), [haken(position!, 2)]),
    ).toMatchObject({ status: 'closed' });
    expect((await saetze(gestern)).map((s) => s.set_number)).toEqual([1]);
  });

  it('anderswo beendet: „closed"; dasselbe Ende noch einmal: „finished" (Zweitreview S5)', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    const einheit = randomUUID();
    const tag = await heute();
    const eins = haken(position!, 1);
    const schluss = ende('Knie');
    await senden(erika.konto, erika.zugang, plan, einheit, tag, [eins, schluss]);
    expect(
      await senden(erika.konto, erika.zugang, plan, einheit, tag, [eins, schluss]),
    ).toMatchObject({ status: 'finished' });
    // Ein anderes Ende (etwa ein zweites Gerät) trifft eine beendete Einheit.
    expect(
      await senden(erika.konto, erika.zugang, plan, einheit, tag, [haken(position!, 2), ende()]),
    ).toMatchObject({ status: 'closed' });
    expect(
      await senden(erika.konto, erika.zugang, plan, einheit, tag, [haken(position!, 2)]),
    ).toMatchObject({ status: 'closed' });
    expect((await saetze(einheit)).map((s) => s.set_number)).toEqual([1]);
  });

  it('kein neues Auditereignis; die Vertretung wie beim Beginnen (ADR-024 Punkt 6)', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    await senden(erika.konto, erika.zugang, plan, randomUUID(), await heute(), [
      haken(position!, 1),
    ]);
    const { rows } = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.audit_log',
    );
    expect(rows[0]!.n).toBe(0);
  });
});
