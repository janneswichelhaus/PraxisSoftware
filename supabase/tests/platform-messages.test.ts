import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  planeEntfernen,
  resetDatabase,
} from './helpers/db';
import { positionen, zugewiesenerPlan } from './helpers/plaene';

/**
 * Eine Frage an die Praxis (KOM-001, IDEA-KOM-001, -002, ANN-308 bis ANN-313).
 *
 *   * Ein Vorgang mit Thema, optionalem Bezug und Zustand; die Einträge sind
 *     unveränderlich.
 *   * Antwort fällig nach den Werktagen der Praxis (ANN-309).
 *   * Schreiben: jede Art des Zugangs, nicht in der Lesefrist (ANN-313); im
 *     Training Übung und Beschwerden nur mit Einwilligung (ANN-311).
 *   * Eine Begleitung sieht Früheres nur mit Einwilligung (ADR-023 Punkt 13).
 *   * Negativfälle nach ADR-023 Punkt 23.
 */

const { users, platformAccesses, patients, trainingRelationships, organizationId } = SEED;
const FRAGEN = 'select public.start_platform_message($1::uuid, $2, $3, $4::uuid, $5::uuid) as id';
const NACHTRAGEN = 'select public.add_platform_message_entry($1::uuid, $2::uuid, $3) as id';
const ERLEDIGEN = 'select public.close_platform_message($1::uuid, $2::uuid)';
const LESEN = 'select public.platform_messages($1::uuid) as daten';
const erika = { konto: users.plattformErika, zugang: platformAccesses.erikaBehandlung };
const tina = { konto: users.plattformTina, zugang: platformAccesses.tinaTraining };
const paula = { konto: users.plattformPaula, zugang: platformAccesses.paulaBegleitungMax };

interface Eintrag {
  side: string;
  body: string;
  author: string;
  author_label: string | null;
}
interface Vorgang {
  id: string;
  topic: string;
  reference_label: string | null;
  status: string;
  due_on: string | null;
  closed_by_side: string | null;
  entries: Eintrag[];
}
interface Ansicht {
  response_workdays: number;
  can_write: boolean;
  health_topics: boolean;
  messages: Vorgang[];
}

async function ansicht(konto: string, zugang: string): Promise<Ansicht | null> {
  const { rows } = await asUser<{ daten: Ansicht | null }>(konto, LESEN, [zugang]);
  return rows[0]!.daten;
}

async function fragen(
  wer: { konto: string; zugang: string },
  thema = 'organisational',
  text = 'Kann ich den Termin am Freitag verschieben?',
  plan: string | null = null,
  uebung: string | null = null,
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(wer.konto, FRAGEN, [
    wer.zugang,
    thema,
    text,
    plan,
    uebung,
  ]);
  return rows[0]!.id;
}

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

async function werktage(von: string, n: number): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    `select to_char(app.add_workdays($1::date, $2), 'YYYY-MM-DD') as tag`,
    [von, n],
  );
  return rows[0]!.tag;
}

describe('Eine Frage an die Praxis (KOM-001)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.platform_messages');
    await planeEntfernen();
  });

  it('Werktage: Montag bis Freitag, ein Samstag zählt ab Montag (ANN-309)', async () => {
    // 2026-10-05 ist ein Montag.
    expect(await werktage('2026-10-05', 2)).toBe('2026-10-07');
    expect(await werktage('2026-10-08', 2)).toBe('2026-10-12');
    expect(await werktage('2026-10-10', 2)).toBe('2026-10-13');
    expect(await werktage('2026-10-09', 1)).toBe('2026-10-12');
  });

  it('stellt eine Frage: offen, fällig nach zwei Werktagen, ein Eintrag', async () => {
    const id = await fragen(erika);
    const daten = (await ansicht(erika.konto, erika.zugang))!;
    expect(daten.response_workdays).toBe(2);
    expect(daten.can_write).toBe(true);
    expect(daten.health_topics).toBe(true);
    expect(daten.messages).toHaveLength(1);
    const v = daten.messages[0]!;
    expect(v.id).toBe(id);
    expect(v.status).toBe('open');
    const { rows } = await asPostgres<{ soll: string }>(
      `select to_char(app.add_workdays(app.training_today($1::uuid), 2), 'YYYY-MM-DD') as soll`,
      [organizationId],
    );
    expect(v.due_on).toBe(rows[0]!.soll);
    expect(v.entries).toEqual([
      expect.objectContaining({
        side: 'person',
        body: 'Kann ich den Termin am Freitag verschieben?',
        author: 'you',
        author_label: null,
      }),
    ]);
  });

  it('die Frist steht in den Praxisstammdaten', async () => {
    await asPostgres(
      'update public.organizations set message_response_workdays = 5 where id = $1',
      [organizationId],
    );
    try {
      await fragen(erika);
      const v = (await ansicht(erika.konto, erika.zugang))!.messages[0]!;
      const { rows } = await asPostgres<{ soll: string }>(
        `select to_char(app.add_workdays(app.training_today($1::uuid), 5), 'YYYY-MM-DD') as soll`,
        [organizationId],
      );
      expect(v.due_on).toBe(rows[0]!.soll);
    } finally {
      await asPostgres(
        'update public.organizations set message_response_workdays = 2 where id = $1',
        [organizationId],
      );
    }
  });

  it('prüft Thema und Text', async () => {
    expect(
      await fehler(asUser(erika.konto, FRAGEN, [erika.zugang, 'chat', 'Hallo', null, null])),
    ).toBe('22023');
    expect(
      await fehler(asUser(erika.konto, FRAGEN, [erika.zugang, 'other', '   ', null, null])),
    ).toBe('22023');
    expect(
      await fehler(
        asUser(erika.konto, FRAGEN, [erika.zugang, 'other', 'x'.repeat(2001), null, null]),
      ),
    ).toBe('22023');
  });

  it('Bezug nur bei „Übung“ und nur auf einen Plan des eigenen Verhältnisses', async () => {
    const plan = await zugewiesenerPlan();
    const [position] = await positionen(plan);
    const id = await fragen(erika, 'exercise', 'Wie tief soll ich gehen?', plan, position);
    const v = (await ansicht(erika.konto, erika.zugang))!.messages.find((m) => m.id === id)!;
    expect(v.topic).toBe('exercise');
    expect(v.reference_label).toBeTruthy();

    const nurPlan = await fragen(erika, 'exercise', 'Wie oft?', plan);
    const w = (await ansicht(erika.konto, erika.zugang))!.messages.find((m) => m.id === nurPlan)!;
    expect(w.reference_label).toBe('Heimprogramm Knie');

    expect(
      await fehler(asUser(erika.konto, FRAGEN, [erika.zugang, 'other', 'Plan?', plan, null])),
    ).toBe('22023');
    expect(
      await fehler(
        asUser(erika.konto, FRAGEN, [erika.zugang, 'exercise', 'Plan?', null, position]),
      ),
    ).toBe('22023');
    const maxPlan = await zugewiesenerPlan('therapy', patients.max, 'Max');
    expect(
      await fehler(asUser(erika.konto, FRAGEN, [erika.zugang, 'exercise', 'Plan?', maxPlan, null])),
    ).toBe('P0002');
    const training = await zugewiesenerPlan('training', trainingRelationships.erika, 'Training');
    expect(
      await fehler(
        asUser(erika.konto, FRAGEN, [erika.zugang, 'exercise', 'Plan?', training, null]),
      ),
    ).toBe('P0002');
    const [fremdePosition] = await positionen(maxPlan);
    expect(
      await fehler(
        asUser(erika.konto, FRAGEN, [erika.zugang, 'exercise', 'Plan?', plan, fremdePosition]),
      ),
    ).toBe('P0002');
  });

  it('nachtragen: die Praxis ist wieder am Zug; erledigt heißt keine Einträge mehr', async () => {
    const id = await fragen(erika);
    await asUserCommitted(erika.konto, NACHTRAGEN, [erika.zugang, id, 'Oder Montag?']);
    let v = (await ansicht(erika.konto, erika.zugang))!.messages[0]!;
    expect(v.entries.map((e) => e.body)).toEqual([
      'Kann ich den Termin am Freitag verschieben?',
      'Oder Montag?',
    ]);
    expect(v.status).toBe('open');

    await asUserCommitted(erika.konto, ERLEDIGEN, [erika.zugang, id]);
    v = (await ansicht(erika.konto, erika.zugang))!.messages[0]!;
    expect(v.status).toBe('closed');
    expect(v.due_on).toBeNull();
    expect(v.closed_by_side).toBe('person');
    expect(await fehler(asUser(erika.konto, NACHTRAGEN, [erika.zugang, id, 'Noch was']))).toBe(
      '22023',
    );
    expect(await fehler(asUser(erika.konto, ERLEDIGEN, [erika.zugang, id]))).toBe('22023');
  });

  it('Einträge sind unveränderlich (ANN-308)', async () => {
    const id = await fragen(erika);
    expect(
      await fehler(
        asPostgres(
          `update public.platform_message_entries set body = 'anders' where message_id = $1`,
          [id],
        ),
      ),
    ).toBe('42501');
  });

  it('im Training: Übung und Beschwerden nur mit Einwilligung (ANN-311)', async () => {
    await asPostgres(
      'delete from public.training_consent_records where training_relationship_id = $1',
      [trainingRelationships.tina],
    );
    expect((await ansicht(tina.konto, tina.zugang))!.health_topics).toBe(false);
    expect(
      await fehler(asUser(tina.konto, FRAGEN, [tina.zugang, 'complaint', 'Knie', null, null])),
    ).toBe('42501');
    expect(
      await fehler(asUser(tina.konto, FRAGEN, [tina.zugang, 'exercise', 'Knie', null, null])),
    ).toBe('42501');
    await fragen(tina, 'organisational', 'Rechnung?');
    await fragen(tina, 'other', 'Parkplatz?');

    await asPostgres(
      `insert into public.training_consent_records
         (organization_id, training_relationship_id, record_kind, purpose, occurred_on, recorded_by)
       values ($1, $2, 'consent_granted', 'training_health_data', current_date, $3)`,
      [organizationId, trainingRelationships.tina, users.trainer],
    );
    expect((await ansicht(tina.konto, tina.zugang))!.health_topics).toBe(true);
    const id = await fragen(tina, 'complaint', 'Knie zwickt');

    // Nach einem Widerruf kein Nachtrag mehr zu Beschwerden.
    await asPostgres(
      `insert into public.training_consent_records
         (organization_id, training_relationship_id, record_kind, purpose, occurred_on, recorded_by)
       values ($1, $2, 'consent_withdrawn', 'training_health_data', current_date, $3)`,
      [organizationId, trainingRelationships.tina, users.trainer],
    );
    expect(await fehler(asUser(tina.konto, NACHTRAGEN, [tina.zugang, id, 'Besser']))).toBe('42501');
  });

  it('Bereiche getrennt: der Zugang zur Behandlung sieht das Training nicht', async () => {
    const training = await fragen({ konto: erika.konto, zugang: platformAccesses.erikaTraining });
    const behandlung = await fragen(erika);
    expect((await ansicht(erika.konto, erika.zugang))!.messages.map((m) => m.id)).toEqual([
      behandlung,
    ]);
    expect(
      (await ansicht(erika.konto, platformAccesses.erikaTraining))!.messages.map((m) => m.id),
    ).toEqual([training]);
    expect(await fehler(asUser(erika.konto, NACHTRAGEN, [erika.zugang, training, 'x']))).toBe(
      'P0002',
    );
  });

  it('Begleitung: schreibt mit, Name am Eintrag, Früheres nur mit Einwilligung', async () => {
    // Ein Vorgang von vor der Einwilligung der Begleitung.
    const { rows } = await asPostgres<{ id: string }>(
      `insert into public.platform_messages
         (organization_id, relationship_kind, relationship_id, patient_id, topic, status, due_on,
          created_by, created_at, last_entry_at)
       values ($1, 'treatment', $2, $2, 'other', 'open', current_date + 2, $3,
               now() - interval '30 days', now() - interval '30 days')
       returning id`,
      [organizationId, patients.max, users.office],
    );
    const frueher = rows[0]!.id;
    await asPostgres(
      `insert into public.platform_message_entries
         (organization_id, message_id, side, body, author_kind, created_by, created_at)
       values ($1, $2, 'person', 'Frühere Frage', 'self', $3, now() - interval '30 days')`,
      [organizationId, frueher, users.office],
    );

    const neu = await fragen(paula, 'complaint', 'Max hat seit gestern Schmerzen.');
    let daten = (await ansicht(paula.konto, paula.zugang))!;
    expect(daten.messages.map((m) => m.id)).toEqual([neu]);
    expect(daten.messages[0]!.entries[0]).toEqual(
      expect.objectContaining({ author: 'you', author_label: 'Paula Mustermann' }),
    );
    expect(await fehler(asUser(paula.konto, NACHTRAGEN, [paula.zugang, frueher, 'x']))).toBe(
      'P0002',
    );

    // Der Umfang der Einwilligung ist fest (POR-005); der Test setzt ihn an
    // den Triggern vorbei, wie eine neue Begleitung mit diesem Umfang.
    const umfang = (wert: boolean) =>
      asPostgres(
        `set session_replication_role = replica;
         update public.platform_accesses set consent_earlier_messages = ${wert}
          where id = '${paula.zugang}';
         set session_replication_role = origin;`,
      );
    await umfang(true);
    daten = (await ansicht(paula.konto, paula.zugang))!;
    expect(daten.messages.map((m) => m.id).sort()).toEqual([frueher, neu].sort());

    // Am Eintrag steht, wer geschrieben hat - nachweisbar ohne Auditlog.
    const eintrag = await asPostgres<{ author_kind: string; author_label: string }>(
      `select author_kind, author_label from public.platform_message_entries where message_id = $1`,
      [neu],
    );
    expect(eintrag.rows[0]).toEqual({ author_kind: 'companion', author_label: 'Paula Mustermann' });
    // Jeder Aufruf über eine Vertretung steht im Protokoll (ADR-023 Punkt 24).
    const audit = await asPostgres<{ n: number }>(
      `select count(*)::int as n from public.audit_log
        where action = 'platform_representation.read' and subject_id = $1`,
      [patients.max],
    );
    expect(audit.rows[0]!.n).toBeGreaterThan(0);
    await umfang(false);
  });

  it('fremde Person, Praxiskonto, andere Organisation, ohne Anmeldung: nichts', async () => {
    const id = await fragen(erika);
    expect(await ansicht(tina.konto, erika.zugang)).toBeNull();
    expect(await ansicht(users.therapist, erika.zugang)).toBeNull();
    const fremd = await fremdeOrganisation();
    expect(await ansicht(fremd.owner, erika.zugang)).toBeNull();
    for (const konto of [tina.konto, users.therapist, fremd.owner, null]) {
      expect(await fehler(asUser(konto, FRAGEN, [erika.zugang, 'other', 'x', null, null]))).toBe(
        '42501',
      );
      expect(await fehler(asUser(konto, NACHTRAGEN, [erika.zugang, id, 'x']))).toBe('42501');
      expect(await fehler(asUser(konto, ERLEDIGEN, [erika.zugang, id]))).toBe('42501');
    }
    // Den eigenen Zugang mit fremder Kennung: kein Vorgang.
    expect(await fehler(asUser(tina.konto, NACHTRAGEN, [tina.zugang, id, 'x']))).toBe('P0002');
    // Kein Tabellenrecht.
    expect(
      await fehler(asUser(users.ownerTherapist, 'select * from public.platform_messages')),
    ).toBe('42501');
  });

  it('gesperrt, entzogen, eingeladen: nichts (Punkt 23)', async () => {
    const id = await fragen(erika);
    try {
      await asPostgres(
        `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
        [erika.zugang],
      );
      expect(await ansicht(erika.konto, erika.zugang)).toBeNull();
      expect(await fehler(asUser(erika.konto, NACHTRAGEN, [erika.zugang, id, 'x']))).toBe('42501');
      await asPostgres(
        `update public.platform_accesses
            set status = 'revoked', locked_at = null, revoked_at = now(), revoked_reason = 'practice'
          where id = $1`,
        [erika.zugang],
      );
      expect(await ansicht(erika.konto, erika.zugang)).toBeNull();
      expect(
        await fehler(asUser(erika.konto, FRAGEN, [erika.zugang, 'other', 'x', null, null])),
      ).toBe('42501');
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('in der Lesefrist: lesen ja, schreiben nein (ANN-313)', async () => {
    const id = await fragen(erika);
    try {
      await asPostgres(
        `update public.patients
            set care_concluded_on = current_date - 2, care_concluded_at = now(),
                care_concluded_by = $2::uuid
          where id = $1`,
        [patients.erika, users.therapist],
      );
      const daten = (await ansicht(erika.konto, erika.zugang))!;
      expect(daten.can_write).toBe(false);
      expect(daten.messages.map((m) => m.id)).toEqual([id]);
      expect(await fehler(asUser(erika.konto, NACHTRAGEN, [erika.zugang, id, 'x']))).toBe('42501');
      expect(await fehler(asUser(erika.konto, ERLEDIGEN, [erika.zugang, id]))).toBe('42501');
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('Löschlauf: erledigt und nicht zugeordnet, drei Jahre nach Jahresende (ADR-008)', async () => {
    const alt = await fragen(erika);
    const jung = await fragen(erika);
    const offen = await fragen(erika);
    const training = await fragen({ konto: erika.konto, zugang: platformAccesses.erikaTraining });
    for (const [id, jahre] of [
      [alt, 4],
      [jung, 1],
      [training, 4],
    ] as const) {
      await asPostgres(
        `update public.platform_messages
            set status = 'closed', due_on = null, closed_by_side = 'person',
                closed_at = now() - ($2::int * interval '1 year')
          where id = $1`,
        [id, jahre],
      );
    }
    await asPostgres('select public.apply_retention()');
    const { rows } = await asPostgres<{ id: string }>('select id from public.platform_messages');
    expect(rows.map((r) => r.id).sort()).toEqual([jung, offen, training].sort());
    const eintraege = await asPostgres<{ n: number }>(
      'select count(*)::int as n from public.platform_message_entries where message_id = $1',
      [alt],
    );
    expect(eintraege.rows[0]!.n).toBe(0);
    const journal = await asPostgres<{ target_table: string; retention_class: string }>(
      'select target_table, retention_class from public.deletion_journal where target_id = $1',
      [alt],
    );
    expect(journal.rows).toEqual([
      { target_table: 'platform_messages', retention_class: 'patientenkommunikation' },
    ]);
  });

  it('Löschlauf: eine Löschsperre der Akte hält', async () => {
    const alt = await fragen(erika);
    await asPostgres(
      `update public.platform_messages
          set status = 'closed', due_on = null, closed_by_side = 'person',
              closed_at = now() - interval '4 years'
        where id = $1`,
      [alt],
    );
    await asPostgres(
      `insert into public.legal_holds (organization_id, subject_type, subject_id, reason, placed_by)
       values ($1, 'patient', $2, 'Probe', $3)`,
      [organizationId, patients.erika, users.ownerTherapist],
    );
    try {
      await asPostgres('select public.apply_retention()');
      const { rows } = await asPostgres('select 1 from public.platform_messages where id = $1', [
        alt,
      ]);
      expect(rows).toHaveLength(1);
    } finally {
      await asPostgres('delete from public.legal_holds');
    }
  });

  it('fällt mit der Akte und mit dem Trainingsverhältnis', async () => {
    await fragen(erika);
    await fragen({ konto: erika.konto, zugang: platformAccesses.erikaTraining });
    try {
      await asPostgres(
        'select app.delete_patient_record($1::uuid, extensions.gen_random_uuid(), now())',
        [patients.erika],
      );
      await asPostgres(
        'select app.delete_training_relationship($1::uuid, extensions.gen_random_uuid(), now())',
        [trainingRelationships.erika],
      );
      const { rows } = await asPostgres<{ n: number }>(
        `select (select count(*) from public.platform_messages)
              + (select count(*) from public.platform_message_entries) as n`,
      );
      expect(Number(rows[0]!.n)).toBe(0);
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });
});
