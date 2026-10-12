import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { BENACHRICHTIGUNGEN, BENACHRICHTIGUNGSARTEN } from '../../src/lib/begriffe';
import {
  SEED,
  abgefangen,
  asPostgres,
  asServiceRole,
  asUser,
  asUserCommitted,
  resetDatabase,
} from './helpers/db';

/**
 * Benachrichtigungen nach Regeln (KOM-009, ADR-024 Abschnitt C).
 *
 * Getragen von vier Zusicherungen: Ohne Wahl der Person entsteht nichts
 * (Punkt 15). Ein Auftrag trägt keinen Text und keine Adresse (Punkt 17).
 * Der Versand prüft beim Abholen mit dem Stand von jetzt - Zugang, Wahl,
 * Schalter der Praxis, Sinn, Obergrenzen und Ruhezeit (Punkte 15, 16). Die
 * Praxis schaltet eine Art nur für alle ab und sieht nie, wer was gewählt hat
 * (ANN-344).
 */

const { organizationId, users, platformAccesses, patients, trainingRelationships } = SEED;
const erika = { konto: users.plattformErika, zugang: platformAccesses.erikaBehandlung };
const TERMIN = 'aaaaaaaa-aaaa-4aaa-8aaa-0000000009f1';
const ALLE = BENACHRICHTIGUNGSARTEN as string[];

const WAEHLEN =
  'select public.set_platform_notification_settings($1::uuid, $2::text[], $3::text[], $4::smallint, $5::smallint)';
const LESEN = 'select * from public.platform_notification_settings($1::uuid, $2)';
const REGISTRIEREN = 'select public.register_platform_push_subscription($1::uuid, $2, $3, $4)';
const ABHOLEN = 'select * from public.claim_notification_deliveries(50)';
const MELDEN = 'select public.finish_notification_delivery($1::uuid, $2, $3::text[])';
const SCHALTEN = 'select public.set_notification_kind_enabled($1, $2)';

const ENDPUNKT = 'https://push.example.invalid/geraet/eins';
const P256DH = 'B'.padEnd(87, 'A');
const AUTH = 'A'.repeat(22);

interface Auftrag {
  id: string;
  access_id: string;
  kind: string;
  channel: string;
  state: string;
  drop_reason: string | null;
  subject_at: Date | null;
  due_at: Date;
}

async function waehlen(
  email: string[],
  push: string[] = [],
  ruhe: [number, number] = [0, 0],
  konto = erika.konto,
  zugang = erika.zugang,
) {
  await asUserCommitted(konto, WAEHLEN, [zugang, email, push, ruhe[0], ruhe[1]]);
}

async function auftraege(): Promise<Auftrag[]> {
  return (
    await asPostgres<Auftrag>(
      'select * from public.notification_deliveries order by created_at, channel, id',
    )
  ).rows;
}

async function termin(start = "now() + interval '3 days'"): Promise<void> {
  await asPostgres(
    `insert into public.appointments
       (id, organization_id, kind, patient_id, staff_member_id, location_id,
        appointment_type, status, starts_at, ends_at, created_by)
     values ($1, $2, 'therapy', $3, '55555555-5555-4555-8555-000000000002',
             '33333333-3333-4333-8333-000000000001', 'practice', 'confirmed',
             ${start}, ${start} + interval '1 hour', $4)`,
    [TERMIN, organizationId, patients.erika, users.office],
  );
}

async function absagen(): Promise<void> {
  await asPostgres(
    `update public.appointments
        set status = 'cancelled', cancelled_at = now(), cancelled_by = $2
      where id = $1`,
    [TERMIN, users.office],
  );
}

async function fehlercode(versprechen: Promise<unknown>): Promise<string | undefined> {
  const fehler = (await abgefangen(versprechen)) as { code?: string } | null;
  return fehler?.code;
}

describe('Katalog (ADR-024 Punkt 13)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('hält Datenbank und Wortlaut deckungsgleich', async () => {
    const { rows } = await asPostgres<{ arten: string[] }>(
      'select app.notification_kinds() as arten',
    );
    expect([...rows[0]!.arten].sort()).toEqual([...ALLE].sort());
  });

  it('lässt die Ruhezeit für jede Art gelten - so rechnet die Datenbank', () => {
    for (const art of BENACHRICHTIGUNGSARTEN) expect(BENACHRICHTIGUNGEN[art].ruhezeit).toBe(true);
  });

  it('legt im Auftrag weder Text noch Adresse noch Endpunkt ab (Punkt 17)', async () => {
    const { rows } = await asPostgres<{ column_name: string }>(
      `select column_name from information_schema.columns
        where table_schema = 'public' and table_name = 'notification_deliveries'
        order by ordinal_position`,
    );
    expect(rows.map((r) => r.column_name)).toEqual([
      'id',
      'organization_id',
      'access_id',
      'kind',
      'channel',
      'subject_id',
      'subject_at',
      'created_at',
      'due_at',
      'state',
      'claimed_at',
      'attempts',
      'finished_at',
      'drop_reason',
    ]);
  });
});

describe('Ruhezeit und Erinnerungstage (Punkt 15, ANN-343)', () => {
  const faellig = (zeit: string, von: number, bis: number) =>
    asPostgres<{ t: string }>(
      `select to_char(app.notification_due_at($1::timestamptz, 'Europe/Berlin', $2::smallint, $3::smallint)
                at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI') as t`,
      [zeit, von, bis],
    ).then((r) => r.rows[0]!.t);

  it('verschiebt in die Ruhezeit Fallendes an ihr Ende, sonst nichts', async () => {
    expect(await faellig('2026-10-14 21:30 Europe/Berlin', 20, 8)).toBe('2026-10-15 08:00');
    expect(await faellig('2026-10-14 06:10 Europe/Berlin', 20, 8)).toBe('2026-10-14 08:00');
    expect(await faellig('2026-10-14 12:00 Europe/Berlin', 20, 8)).toBe('2026-10-14 12:00');
    expect(await faellig('2026-10-14 13:00 Europe/Berlin', 12, 14)).toBe('2026-10-14 14:00');
    expect(await faellig('2026-10-14 23:00 Europe/Berlin', 0, 0)).toBe('2026-10-14 23:00');
  });

  it('erinnert ab 17 Uhr an den nächsten Tag, freitags bis Montag, am Wochenende nicht', async () => {
    const tage = (lokal: string) =>
      asPostgres<{ d: string }>(
        `select to_char(d, 'YYYY-MM-DD') as d
           from app.notification_reminder_days($1::timestamp) d order by d`,
        [lokal],
      ).then((r) => r.rows.map((z) => z.d));
    expect(await tage('2026-10-12 17:05')).toEqual(['2026-10-13']); // Montag
    expect(await tage('2026-10-12 16:59')).toEqual([]);
    expect(await tage('2026-10-16 17:05')).toEqual(['2026-10-17', '2026-10-18', '2026-10-19']);
    expect(await tage('2026-10-17 18:00')).toEqual([]); // Samstag
    expect(await tage('2026-10-18 18:00')).toEqual([]); // Sonntag
  });
});

describe('Die Wahl der Person (Punkt 15)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('ist von Anfang an aus, mit der Vorgabe der Ruhezeit', async () => {
    const { rows } = await asUser(erika.konto, LESEN, [erika.zugang, null]);
    expect(rows).toEqual([
      expect.objectContaining({
        email_kinds: [],
        push_kinds: [],
        quiet_from: 20,
        quiet_until: 8,
        chosen_at: null,
        disabled_kinds: [],
        device_registered: false,
      }),
    ]);
  });

  it('speichert die Wahl mit Zeitpunkt am Zugang, ohne Dubletten', async () => {
    await waehlen(['message_answered', 'message_answered'], [], [21, 7]);
    const { rows } = await asUser(erika.konto, LESEN, [erika.zugang, null]);
    expect(rows[0]).toEqual(
      expect.objectContaining({
        email_kinds: ['message_answered'],
        quiet_from: 21,
        quiet_until: 7,
        chosen_at: expect.any(Date),
      }),
    );
  });

  it('weist eine unbekannte Art und eine falsche Ruhezeit ab', async () => {
    expect(
      await fehlercode(asUser(erika.konto, WAEHLEN, [erika.zugang, ['werbung'], [], 20, 8])),
    ).toBe('22023');
    expect(await fehlercode(asUser(erika.konto, WAEHLEN, [erika.zugang, [], [], 24, 8]))).toBe(
      '22023',
    );
  });

  it('gilt je Zugang: fremder Zugang, Praxis und Anonym bekommen nichts', async () => {
    expect(
      await fehlercode(
        asUser(erika.konto, WAEHLEN, [platformAccesses.tinaTraining, ALLE, [], 20, 8]),
      ),
    ).toBe('42501');
    expect((await asUser(users.ownerTherapist, LESEN, [erika.zugang, null])).rows).toEqual([]);
    expect(
      await fehlercode(asUser(users.ownerTherapist, WAEHLEN, [erika.zugang, ALLE, [], 20, 8])),
    ).toBe('42501');
    expect(await fehlercode(asUser(null, WAEHLEN, [erika.zugang, ALLE, [], 20, 8]))).toBe('42501');
  });

  it('gibt den Tabellen kein direktes Recht', async () => {
    for (const tabelle of [
      'platform_notification_settings',
      'notification_deliveries',
      'platform_push_subscriptions',
      'notification_kind_switches',
    ]) {
      expect(
        await fehlercode(asUser(erika.konto, `select * from public.${tabelle}`)),
        tabelle,
      ).toBe('42501');
      expect(
        await fehlercode(asUser(users.ownerTherapist, `select * from public.${tabelle}`)),
        tabelle,
      ).toBe('42501');
    }
  });
});

describe('Ereignisse legen Aufträge an (Punkt 16)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await termin();
  }, 120_000);

  it('legt ohne Wahl nichts an', async () => {
    await absagen();
    expect(await auftraege()).toEqual([]);
  });

  it('legt nach der Wahl für die Absage einen Mailauftrag mit Zeitpunkt an', async () => {
    await waehlen(['appointment_cancelled']);
    await absagen();
    const liste = await auftraege();
    expect(liste).toEqual([
      expect.objectContaining({
        access_id: erika.zugang,
        kind: 'appointment_cancelled',
        channel: 'email',
        state: 'pending',
        subject_at: expect.any(Date),
      }),
    ]);
  });

  it('meldet eine Verschiebung mit der neuen Zeit, nicht bei offenem Wunsch der Person', async () => {
    await waehlen(['appointment_changed']);
    await asPostgres(
      `update public.appointments set starts_at = starts_at + interval '1 day',
              ends_at = ends_at + interval '1 day' where id = $1`,
      [TERMIN],
    );
    expect((await auftraege()).map((a) => a.kind)).toEqual(['appointment_changed']);

    await asPostgres('delete from public.notification_deliveries');
    await asPostgres(
      `insert into public.platform_appointment_requests
         (organization_id, relationship_kind, relationship_id, patient_id, appointment_id, kind,
          created_by_access_id, created_by)
       values ($1, 'treatment', $2, $2, $3, 'change', $4, $5)`,
      [organizationId, patients.erika, TERMIN, erika.zugang, erika.konto],
    );
    await asPostgres(
      `update public.appointments set starts_at = starts_at + interval '1 day',
              ends_at = ends_at + interval '1 day' where id = $1`,
      [TERMIN],
    );
    expect(await auftraege()).toEqual([]);
  });

  it('legt Push nur für ein registriertes Gerät an', async () => {
    await waehlen([], ['appointment_cancelled']);
    await absagen();
    expect(await auftraege()).toEqual([]);

    await asPostgres(
      `update public.appointments set status = 'confirmed', cancelled_at = null, cancelled_by = null
        where id = $1`,
      [TERMIN],
    );
    await asUserCommitted(erika.konto, REGISTRIEREN, [erika.zugang, ENDPUNKT, P256DH, AUTH]);
    await absagen();
    expect((await auftraege()).map((a) => a.channel)).toEqual(['push']);
  });

  it('legt nichts an, wenn die Praxis die Art abgeschaltet hat', async () => {
    await waehlen(['appointment_cancelled']);
    await asUserCommitted(users.ownerTherapist, SCHALTEN, ['appointment_cancelled', false]);
    await absagen();
    expect(await auftraege()).toEqual([]);
    const { rows } = await asUser(erika.konto, LESEN, [erika.zugang, null]);
    expect(rows[0]).toEqual(expect.objectContaining({ disabled_kinds: ['appointment_cancelled'] }));
  });

  it('meldet die Antwort der Praxis auf eine Rückfrage, nicht den eigenen Eintrag', async () => {
    await waehlen(['message_answered']);
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.platform_messages
         (organization_id, relationship_kind, relationship_id, patient_id, topic, status, due_on,
          created_by)
       values ($1, 'treatment', $2, $2, 'other', 'open', current_date + 2, $3) returning id`,
      [organizationId, patients.erika, erika.konto],
    );
    const vorgang = rows[0]!.id;
    await asPostgres(
      `insert into public.platform_message_entries
         (organization_id, message_id, side, body, access_id, author_kind, created_by)
       values ($1, $2, 'person', 'Frage', $3, 'self', $4)`,
      [organizationId, vorgang, erika.zugang, erika.konto],
    );
    expect(await auftraege()).toEqual([]);
    await asPostgres(
      `insert into public.platform_message_entries
         (organization_id, message_id, side, body, author_kind, author_label, created_by)
       values ($1, $2, 'practice', 'Antwort', 'staff', 'Anna Beispiel', $3)`,
      [organizationId, vorgang, users.therapist],
    );
    expect(await auftraege()).toEqual([
      expect.objectContaining({ kind: 'message_answered', subject_at: null }),
    ]);
  });

  it('meldet den beantworteten Terminwunsch und den neuen Plan', async () => {
    await waehlen(['request_answered', 'plan_assigned']);
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.platform_appointment_requests
         (organization_id, relationship_kind, relationship_id, patient_id, kind, preferred_days,
          created_by_access_id, created_by)
       values ($1, 'treatment', $2, $2, 'new', array[current_date + 4], $3, $4) returning id`,
      [organizationId, patients.erika, erika.zugang, erika.konto],
    );
    await asPostgres(
      `update public.platform_appointment_requests
          set status = 'declined', resolved_at = now(), resolved_by = $2, answer = 'Leider voll.'
        where id = $1`,
      [rows[0]!.id, users.office],
    );
    await asPostgres(
      `insert into public.exercise_plans
         (organization_id, service_area, patient_id, title, created_by, updated_by)
       values ($1, 'therapy', $2, 'Plan', $3, $3)`,
      [organizationId, patients.erika, users.therapist],
    );
    await asPostgres(
      `update public.exercise_plans
          set status = 'assigned', assigned_at = now(), assigned_by = $2, runs_from = current_date,
              runs_until = current_date + 28, original_runs_until = current_date + 28
        where patient_id = $1 and title = 'Plan'`,
      [patients.erika, users.therapist],
    );
    expect((await auftraege()).map((a) => a.kind).sort()).toEqual([
      'plan_assigned',
      'request_answered',
    ]);
  });

  it('benachrichtigt jeden Zugang des Verhältnisses nach seiner eigenen Wahl', async () => {
    // Tina hat ein anderes Verhältnis und bleibt still.
    await waehlen(
      ['appointment_cancelled'],
      [],
      [0, 0],
      users.plattformTina,
      platformAccesses.tinaTraining,
    );
    await waehlen(['appointment_cancelled']);
    await absagen();
    expect((await auftraege()).map((a) => a.access_id)).toEqual([erika.zugang]);
    expect(trainingRelationships.tina).toBeDefined();
  });

  it('erinnert einmal je Termin, auch wenn der Lauf zweimal kommt', async () => {
    await waehlen(['appointment_reminder']);
    const anlegen = () =>
      asPostgres(
        `select app.enqueue_notification($1, 'treatment', $2, 'appointment_reminder', $3,
                (select starts_at from public.appointments where id = $3))`,
        [organizationId, patients.erika, TERMIN],
      );
    await anlegen();
    await anlegen();
    expect((await auftraege()).map((a) => a.kind)).toEqual(['appointment_reminder']);
  });
});

describe('Versand: abholen und melden (Punkt 16)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await termin();
  }, 120_000);

  it('gibt dem Versand Adresse und Zeitzone, sonst nichts über die Person', async () => {
    await waehlen(['appointment_cancelled']);
    await absagen();
    const { rows } = await asServiceRole<Record<string, unknown>>(ABHOLEN);
    expect(rows).toEqual([
      {
        id: expect.any(String),
        kind: 'appointment_cancelled',
        channel: 'email',
        subject_at: expect.any(Date),
        time_zone: 'Europe/Berlin',
        email: expect.stringContaining('@'),
        push_targets: null,
      },
    ]);
    // Abgeholt ist vergeben.
    expect((await asServiceRole(ABHOLEN)).rows).toEqual([]);

    await asServiceRole(MELDEN, [rows[0]!.id, 'sent', []]);
    expect(await auftraege()).toEqual([expect.objectContaining({ state: 'sent' })]);
  });

  it('ist für Konten nicht aufrufbar', async () => {
    expect(await fehlercode(asUser(erika.konto, ABHOLEN))).toBe('42501');
    expect(await fehlercode(asUser(users.ownerTherapist, ABHOLEN))).toBe('42501');
    expect(
      await fehlercode(
        asUser(users.ownerTherapist, MELDEN, ['00000000-0000-4000-8000-000000000000', 'sent', []]),
      ),
    ).toBe('42501');
    expect(
      await fehlercode(
        asUser(users.ownerTherapist, 'select public.enqueue_appointment_reminders()'),
      ),
    ).toBe('42501');
  });

  it('lässt fallen, was nicht mehr gilt: Wahl zurückgenommen, Zugang beendet, Termin weg', async () => {
    await waehlen(['appointment_cancelled', 'message_answered']);
    await absagen();
    await waehlen(['message_answered']);
    await asServiceRole(ABHOLEN);
    expect(await auftraege()).toEqual([
      expect.objectContaining({ state: 'dropped', drop_reason: 'not_wanted' }),
    ]);

    await asPostgres('delete from public.notification_deliveries');
    await waehlen(['appointment_reminder']);
    await asPostgres(
      `update public.appointments set status = 'confirmed', cancelled_at = null, cancelled_by = null
        where id = $1`,
      [TERMIN],
    );
    await asPostgres(
      `select app.enqueue_notification($1, 'treatment', $2, 'appointment_reminder', $3,
              (select starts_at from public.appointments where id = $3))`,
      [organizationId, patients.erika, TERMIN],
    );
    await absagen();
    await asServiceRole(ABHOLEN);
    expect(await auftraege()).toEqual([
      expect.objectContaining({ state: 'dropped', drop_reason: 'obsolete' }),
    ]);

    await asPostgres('delete from public.notification_deliveries');
    await waehlen(['plan_assigned']);
    await asPostgres(
      `select app.enqueue_notification($1, 'treatment', $2, 'plan_assigned', null, null)`,
      [organizationId, patients.erika],
    );
    await asPostgres(
      `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
      [erika.zugang],
    );
    await asServiceRole(ABHOLEN);
    expect(await auftraege()).toEqual([
      expect.objectContaining({ state: 'dropped', drop_reason: 'access_ended' }),
    ]);
  });

  it('schickt höchstens eine je Art und Tag', async () => {
    await waehlen(['plan_assigned']);
    const anlegen = () =>
      asPostgres(
        `select app.enqueue_notification($1, 'treatment', $2, 'plan_assigned', null, null)`,
        [organizationId, patients.erika],
      );
    await anlegen();
    await anlegen();
    const abgeholt = (await asServiceRole<{ id: string }>(ABHOLEN)).rows;
    expect(abgeholt).toHaveLength(1);
    expect((await auftraege()).map((a) => a.drop_reason)).toEqual(
      expect.arrayContaining(['daily_cap', null]),
    );
  });

  it('schickt höchstens zehn je Woche und Weg', async () => {
    await waehlen(['plan_assigned']);
    await asPostgres(
      `insert into public.notification_deliveries
         (organization_id, access_id, kind, channel, due_at, state, finished_at, created_at)
       select $1, $2, 'message_answered', 'email', now() - n * interval '10 hours', 'sent',
              now() - n * interval '10 hours', now() - n * interval '10 hours'
         from generate_series(1, 10) n`,
      [organizationId, erika.zugang],
    );
    await asPostgres(
      `select app.enqueue_notification($1, 'treatment', $2, 'plan_assigned', null, null)`,
      [organizationId, patients.erika],
    );
    expect((await asServiceRole(ABHOLEN)).rows).toEqual([]);
    expect((await auftraege()).filter((a) => a.kind === 'plan_assigned')).toEqual([
      expect.objectContaining({ state: 'dropped', drop_reason: 'weekly_cap' }),
    ]);
  });

  it('verschiebt, was jetzt in die Ruhezeit fiele, statt es zu schicken', async () => {
    await waehlen(['plan_assigned']);
    await asPostgres(
      `select app.enqueue_notification($1, 'treatment', $2, 'plan_assigned', null, null)`,
      [organizationId, patients.erika],
    );
    // Jetzt eine Ruhezeit, die die laufende Stunde abdeckt.
    const { rows } = await asPostgres<{ h: number }>(
      `select extract(hour from now() at time zone 'Europe/Berlin')::int as h`,
    );
    const stunde = rows[0]!.h;
    await waehlen(['plan_assigned'], [], [stunde, (stunde + 2) % 24]);
    expect((await asServiceRole(ABHOLEN)).rows).toEqual([]);
    const [auftrag] = await auftraege();
    expect(auftrag!.state).toBe('pending');
    expect(auftrag!.due_at.getTime()).toBeGreaterThan(Date.now());
  });

  it('löscht abgewiesene Endpunkte und gibt nach drei Fehlschlägen auf', async () => {
    await asUserCommitted(erika.konto, REGISTRIEREN, [erika.zugang, ENDPUNKT, P256DH, AUTH]);
    await waehlen([], ['plan_assigned']);
    await asPostgres(
      `select app.enqueue_notification($1, 'treatment', $2, 'plan_assigned', null, null)`,
      [organizationId, patients.erika],
    );
    const [auftrag] = (await asServiceRole<{ id: string; push_targets: unknown }>(ABHOLEN)).rows;
    expect(auftrag!.push_targets).toEqual([{ endpoint: ENDPUNKT, p256dh: P256DH, auth: AUTH }]);
    await asServiceRole(MELDEN, [auftrag!.id, 'gone', [ENDPUNKT]]);
    expect(await auftraege()).toEqual([
      expect.objectContaining({ state: 'dropped', drop_reason: 'no_device' }),
    ]);
    expect((await asPostgres('select * from public.platform_push_subscriptions')).rows).toEqual([]);

    await asPostgres('delete from public.notification_deliveries');
    await waehlen(['plan_assigned']);
    await asPostgres(
      `select app.enqueue_notification($1, 'treatment', $2, 'plan_assigned', null, null)`,
      [organizationId, patients.erika],
    );
    for (let versuch = 1; versuch <= 3; versuch++) {
      await asPostgres(
        `update public.notification_deliveries set due_at = now() - interval '1 minute'`,
      );
      const [a] = (await asServiceRole<{ id: string }>(ABHOLEN)).rows;
      expect(a, `Versuch ${versuch}`).toBeDefined();
      await asServiceRole(MELDEN, [a!.id, 'failed', []]);
    }
    expect(await auftraege()).toEqual([expect.objectContaining({ state: 'failed', attempts: 3 })]);
    expect(await fehlercode(asServiceRole(MELDEN, [(await auftraege())[0]!.id, 'sent', []]))).toBe(
      'P0002',
    );
  });

  it('löscht abgeschlossene Aufträge nach 30 Tagen', async () => {
    await asPostgres(
      `insert into public.notification_deliveries
         (organization_id, access_id, kind, channel, due_at, state, finished_at)
       values ($1, $2, 'plan_assigned', 'email', now(), 'sent', now() - interval '31 days'),
              ($1, $2, 'plan_assigned', 'email', now(), 'sent', now() - interval '29 days')`,
      [organizationId, erika.zugang],
    );
    await asPostgres('select public.purge_notification_deliveries()');
    expect(await auftraege()).toHaveLength(1);
  });
});

describe('Push-Registrierung (Punkt 17)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('registriert das Gerät, zeigt es an und weist falsche Schlüssel ab', async () => {
    await asUserCommitted(erika.konto, REGISTRIEREN, [erika.zugang, ENDPUNKT, P256DH, AUTH]);
    const { rows } = await asUser(erika.konto, LESEN, [erika.zugang, ENDPUNKT]);
    expect(rows[0]).toEqual(expect.objectContaining({ device_registered: true }));
    expect(
      await fehlercode(asUser(erika.konto, REGISTRIEREN, [erika.zugang, 'http://x', P256DH, AUTH])),
    ).toBe('22023');
    expect(
      await fehlercode(
        asUser(erika.konto, REGISTRIEREN, [platformAccesses.tinaTraining, ENDPUNKT, P256DH, AUTH]),
      ),
    ).toBe('42501');
  });

  it('fällt beim Abmelden nur an den eigenen Zugängen', async () => {
    await asUserCommitted(erika.konto, REGISTRIEREN, [erika.zugang, ENDPUNKT, P256DH, AUTH]);
    await asUserCommitted(users.plattformTina, REGISTRIEREN, [
      platformAccesses.tinaTraining,
      ENDPUNKT,
      P256DH,
      AUTH,
    ]);
    await asUserCommitted(erika.konto, 'select public.remove_platform_push_subscription($1)', [
      ENDPUNKT,
    ]);
    const { rows } = await asPostgres<{ access_id: string }>(
      'select access_id from public.platform_push_subscriptions',
    );
    expect(rows.map((r) => r.access_id)).toEqual([platformAccesses.tinaTraining]);
  });

  it('fällt mit dem Ende des Zugangs', async () => {
    await asUserCommitted(erika.konto, REGISTRIEREN, [erika.zugang, ENDPUNKT, P256DH, AUTH]);
    await asPostgres(
      `update public.platform_accesses
          set status = 'revoked', revoked_at = now(), revoked_by = $2, revoked_reason = 'practice'
        where id = $1`,
      [erika.zugang, users.ownerTherapist],
    );
    expect((await asPostgres('select * from public.platform_push_subscriptions')).rows).toEqual([]);
  });
});

describe('Schalter der Praxis (Punkt 15)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('nur owner schaltet ab und wieder frei', async () => {
    await asUserCommitted(users.ownerTherapist, SCHALTEN, ['plan_assigned', false]);
    expect(
      (await asUser(users.ownerTherapist, 'select * from public.notification_kind_switches()'))
        .rows,
    ).toEqual([expect.objectContaining({ kind: 'plan_assigned' })]);
    await asUserCommitted(users.ownerTherapist, SCHALTEN, ['plan_assigned', true]);
    expect(
      (await asUser(users.ownerTherapist, 'select * from public.notification_kind_switches()'))
        .rows,
    ).toEqual([]);

    for (const konto of [users.therapist, users.office, users.teamLead, erika.konto]) {
      expect(await fehlercode(asUser(konto, SCHALTEN, ['plan_assigned', false])), konto).toBe(
        '42501',
      );
    }
    expect(await fehlercode(asUser(users.ownerTherapist, SCHALTEN, ['werbung', false]))).toBe(
      '22023',
    );
  });
});
