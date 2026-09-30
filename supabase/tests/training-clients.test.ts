import { beforeAll, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
  tagInTagen,
} from './helpers/db';
import {
  erwarteAbgewiesenenLeseversuch,
  erwarteAbgewiesenenSchreibversuch,
} from './helpers/abgewiesen';

/**
 * TRN-EPIC-001: Eine Trainingskundin entsteht in der Anwendung - ohne Akte -,
 * und jemand darf sie betreuen (TRN-001, TRN-002, ADR-021, §4.8/§4.9).
 *
 * Die Schreibwege laufen ueber Serverfunktionen; RLS bleibt die zweite Linie.
 * Geprueft wird, wer schreibt (owner, trainer, office - ANN-172), dass
 * `patients` unberuehrt bleibt, dass eine vorhandene Person ihr zweites
 * Verhaeltnis ohne Dublette bekommt (ANN-173) und dass jede Aenderung und
 * jedes Oeffnen protokolliert ist (ADR-021 Punkt 8).
 */

const { users, persons, trainingRelationships } = SEED;

const CREATE =
  'select public.create_training_client($1, $2, $3::date, $4, $5, $6, $7, $8, $9::date) as id';
const UPDATE =
  'select public.update_training_client($1::uuid, $2, $3, $4::date, $5, $6, $7, $8, $9, $10::date) as id';

async function anzahl(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await asPostgres<{ n: number }>(
    `select count(*)::int as n from (${sql}) x`,
    params,
  );
  return rows[0]!.n;
}

async function audit(action: string, subjectId: string) {
  const { rows } = await asPostgres<{ outcome: string; context: Record<string, unknown> }>(
    `select outcome, context from public.audit_log
     where action = $1 and subject_id = $2 order by occurred_at, id`,
    [action, subjectId],
  );
  return rows;
}

describe('Trainingskund:in anlegen (TRN-001, TRN-002)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it.each([
    ['trainer', users.trainer],
    ['office', users.office],
    ['owner', users.ownerTherapist],
  ])('laesst %s eine Person ohne Akte anlegen', async (_rolle, user) => {
    const personenVorher = await anzahl('select 1 from public.persons');
    const patientenVorher = await anzahl('select 1 from public.patients');

    const { rows } = await asUserCommitted<{ id: string }>(user, CREATE, [
      ' Lena ',
      'Laufstark',
      '1990-05-01',
      'Lena@Beispiel.invalid',
      '+49 7071 0000999',
      'Trainingsweg 1',
      '72070',
      'Tuebingen',
      null,
    ]);
    const id = rows[0]!.id;
    expect(id).toBeTruthy();

    // Genau eine neue Person, keine neue Akte (ADR-021 Punkt 2).
    expect(await anzahl('select 1 from public.persons')).toBe(personenVorher + 1);
    expect(await anzahl('select 1 from public.patients')).toBe(patientenVorher);

    const { rows: zeile } = await asPostgres<{
      given_name: string;
      status: string;
      contract_started_on: string | null;
      email: string;
      akte: boolean;
    }>(
      `select pe.given_name, t.status, t.contract_started_on::text, d.email,
              exists (select 1 from public.patients p where p.person_id = t.person_id) as akte
         from public.training_relationships t
         join public.persons pe on pe.id = t.person_id
         join public.training_contact_details d on d.training_relationship_id = t.id
        where t.id = $1`,
      [id],
    );
    expect(zeile[0]).toMatchObject({
      given_name: 'Lena',
      status: 'active',
      email: 'lena@beispiel.invalid',
      akte: false,
    });
    // Ohne Angabe beginnt der Vertrag heute - in der Zeitzone der Praxis.
    const { rows: heute } = await asPostgres<{ tag: string }>(
      `select (now() at time zone o.time_zone)::date::text as tag
         from public.organizations o where o.id = $1`,
      [SEED.organizationId],
    );
    expect(zeile[0]?.contract_started_on).toBe(heute[0]?.tag);

    const eintraege = await audit('training_relationship.created', id);
    expect(eintraege).toHaveLength(1);
    expect(eintraege[0]).toEqual({
      outcome: 'success',
      context: { surface: 'web', new_person: true },
    });
  });

  it.each([
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['patient', users.patientMax],
  ])('weist %s ab - protokolliert, ohne etwas anzulegen', async (_rolle, user) => {
    const vorher = await anzahl('select 1 from public.training_relationships');
    await erwarteAbgewiesenenSchreibversuch(
      user,
      CREATE,
      ['Kein', 'Zugriff', null, null, null, null, null, null, null],
      'training_relationship.created',
    );
    expect(await anzahl('select 1 from public.training_relationships')).toBe(vorher);
  });

  it('verlangt einen Namen', async () => {
    const fehler = await abgefangen(
      asUser(users.trainer, CREATE, ['  ', 'Nachname', null, null, null, null, null, null, null]),
    );
    expect(fehler?.message).toMatch(/name is required/);
  });

  it('nimmt kein Geburtsdatum in der Zukunft an', async () => {
    const fehler = await abgefangen(
      asUser(users.trainer, CREATE, [
        'Zu',
        'Frueh',
        tagInTagen(3),
        null,
        null,
        null,
        null,
        null,
        null,
      ]),
    );
    expect(fehler?.message).toMatch(/date of birth is in the future/);
  });
});

describe('Das zweite Verhaeltnis einer vorhandenen Person (ANN-173)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  const START = 'select public.start_training_for_person($1::uuid, $2::date) as id';

  it('bindet eine Patientin ohne zweite Person an - fuer office', async () => {
    const personenVorher = await anzahl('select 1 from public.persons');
    const { rows } = await asUserCommitted<{ id: string }>(users.office, START, [
      persons.max,
      null,
    ]);
    const id = rows[0]!.id;

    expect(await anzahl('select 1 from public.persons')).toBe(personenVorher);
    const { rows: zeile } = await asPostgres<{ person_id: string; email: string | null }>(
      `select t.person_id, d.email from public.training_relationships t
         left join public.training_contact_details d on d.training_relationship_id = t.id
        where t.id = $1`,
      [id],
    );
    expect(zeile[0]?.person_id).toBe(persons.max);
    // Aus der Akte wird nichts uebernommen - auch keine Kontaktdaten.
    expect(zeile[0]?.email).toBeNull();

    expect((await audit('training_relationship.created', id))[0]?.context).toEqual({
      surface: 'web',
      new_person: false,
    });
  });

  it('kennt fuer die Trainingsbetreuung keine Akte - nicht gefunden wie eine fremde Kennung', async () => {
    // Petras Person hat nur eine Akte. Waere sie fuer den Trainer anbindbar,
    // verriete die Funktion, dass es sie in der Behandlung gibt (§4.8).
    const { rows: petra } = await asPostgres<{ person_id: string }>(
      'select person_id from public.patients where id = $1',
      [SEED.patients.petra],
    );
    const fehlerAkte = await abgefangen(asUser(users.trainer, START, [petra[0]!.person_id, null]));
    const fehlerFremd = await abgefangen(
      asUser(users.trainer, START, ['44444444-4444-4444-8444-0000000000ff', null]),
    );
    expect(fehlerAkte?.message).toMatch(/person not found/);
    expect(fehlerFremd?.message).toBe(fehlerAkte?.message);
  });

  it('legt kein zweites Trainingsverhaeltnis an', async () => {
    const fehler = await abgefangen(asUser(users.ownerTherapist, START, [persons.erika, null]));
    expect(fehler?.message).toMatch(/training relationship already exists/);
  });

  it.each([
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
  ])('weist %s ab', async (_rolle, user) => {
    await erwarteAbgewiesenenSchreibversuch(
      user,
      START,
      [persons.max, null],
      'training_relationship.created',
    );
  });
});

describe('Dublettenhinweis beim Anlegen (TRN-002)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  const FIND = 'select * from public.find_possible_training_duplicates($1, $2, $3::date)';

  it('zeigt der Trainingsbetreuung nur Trainingskund:innen', async () => {
    const { rows: tina } = await asUser<{ kind: string; person_id: string }>(users.trainer, FIND, [
      'Tina',
      'Trainingskundin',
      null,
    ]);
    expect(tina).toEqual([expect.objectContaining({ kind: 'training', person_id: persons.tina })]);

    // Max ist nur Patient: kein Treffer, kein Hinweis auf die Akte.
    const { rows: max } = await asUser(users.trainer, FIND, ['Max', 'Mustermann', null]);
    expect(max).toEqual([]);
  });

  it('zeigt owner und office auch Patient:innen - mit der Person zum Anbinden', async () => {
    for (const user of [users.office, users.ownerTherapist]) {
      const { rows } = await asUser<{
        kind: string;
        training_relationship_id: string | null;
        person_id: string;
        date_of_birth: string | null;
      }>(user, FIND, ['max', 'MUSTERMANN', null]);
      expect(rows).toEqual([
        expect.objectContaining({
          kind: 'patient',
          training_relationship_id: null,
          person_id: persons.max,
        }),
      ]);
    }
  });

  it('nennt eine Person mit beiden Verhaeltnissen nur einmal, als Trainingskundin', async () => {
    const { rows } = await asUser<{ kind: string; person_id: string }>(users.office, FIND, [
      'Erika',
      'Beispiel',
      null,
    ]);
    expect(rows).toEqual([expect.objectContaining({ kind: 'training', person_id: persons.erika })]);
  });

  it.each([
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
  ])('weist %s ab - protokolliert', async (_rolle, user) => {
    await erwarteAbgewiesenenLeseversuch(
      user,
      FIND,
      ['Tina', 'Trainingskundin', null],
      'training_relationships.read',
    );
  });
});

describe('Aendern, Beenden, Wiederaufnehmen (TRN-001)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  const tina = trainingRelationships.tina;
  const END = 'select public.end_training_relationship($1::uuid, $2::date) as tag';
  const REOPEN = 'select public.reopen_training_relationship($1::uuid) as id';

  it('aendert Name, Kontakt und Beginn und protokolliert nur die Feldnamen', async () => {
    await asUserCommitted(users.trainer, UPDATE, [
      tina,
      'Tina',
      'Trainingskundin-Neu',
      '1988-02-03',
      'tina@beispiel.invalid',
      null,
      null,
      null,
      null,
      tagInTagen(-30),
    ]);

    const { rows } = await asPostgres<{ family_name: string; start: string; email: string }>(
      `select pe.family_name, t.contract_started_on::text as start, d.email
         from public.training_relationships t
         join public.persons pe on pe.id = t.person_id
         left join public.training_contact_details d on d.training_relationship_id = t.id
        where t.id = $1`,
      [tina],
    );
    expect(rows[0]).toEqual({
      family_name: 'Trainingskundin-Neu',
      start: tagInTagen(-30),
      email: 'tina@beispiel.invalid',
    });

    const eintraege = await audit('training_relationship.updated', tina);
    expect(eintraege.at(-1)?.context).toEqual({
      surface: 'web',
      fields: ['name', 'contract_started_on', 'contact'],
    });
  });

  it('schreibt nichts, wenn sich nichts aendert', async () => {
    const vorher = (await audit('training_relationship.updated', tina)).length;
    await asUserCommitted(users.trainer, UPDATE, [
      tina,
      'Tina',
      'Trainingskundin-Neu',
      '1988-02-03',
      'tina@beispiel.invalid',
      '',
      ' ',
      null,
      null,
      tagInTagen(-30),
    ]);
    expect(await audit('training_relationship.updated', tina)).toHaveLength(vorher);
  });

  it('beendet nicht in der Zukunft und nicht vor dem Beginn', async () => {
    expect((await abgefangen(asUser(users.trainer, END, [tina, tagInTagen(2)])))?.message).toMatch(
      /in the future/,
    );
    expect(
      (await abgefangen(asUser(users.trainer, END, [tina, tagInTagen(-31)])))?.message,
    ).toMatch(/before the contract start/);
  });

  it('setzt das Vertragsende als Anker und nimmt es wieder zurueck', async () => {
    await asUserCommitted(users.office, END, [tina, tagInTagen(-1)]);
    const { rows } = await asPostgres<{ status: string; ende: string }>(
      `select status, contract_ended_on::text as ende from public.training_relationships where id = $1`,
      [tina],
    );
    expect(rows[0]).toEqual({ status: 'inactive', ende: tagInTagen(-1) });
    expect((await audit('training_relationship.ended', tina)).at(-1)?.context).toEqual({
      surface: 'web',
      ended_on: tagInTagen(-1),
    });

    // Nie still umdatiert.
    expect((await abgefangen(asUser(users.trainer, END, [tina, null])))?.message).toMatch(
      /already ended/,
    );
    // Der Beginn rueckt nicht hinter das Ende.
    expect(
      (
        await abgefangen(
          asUser(users.trainer, UPDATE, [
            tina,
            'Tina',
            'Trainingskundin-Neu',
            null,
            null,
            null,
            null,
            null,
            null,
            tagInTagen(0),
          ]),
        )
      )?.message,
    ).toMatch(/after the contract end/);

    await asUserCommitted(users.trainer, REOPEN, [tina]);
    const { rows: wieder } = await asPostgres<{ status: string; ende: string | null }>(
      `select status, contract_ended_on::text as ende from public.training_relationships where id = $1`,
      [tina],
    );
    expect(wieder[0]).toEqual({ status: 'active', ende: null });
    expect((await audit('training_relationship.reopened', tina)).at(-1)?.context).toEqual({
      surface: 'web',
      previous_ended_on: tagInTagen(-1),
    });
  });

  it.each([
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
  ])('weist %s bei allen drei Schreibwegen ab', async (_rolle, user) => {
    await erwarteAbgewiesenenSchreibversuch(
      user,
      UPDATE,
      [tina, 'X', 'Y', null, null, null, null, null, null, tagInTagen(-5)],
      'training_relationship.updated',
    );
    await erwarteAbgewiesenenSchreibversuch(user, END, [tina, null], 'training_relationship.ended');
    await erwarteAbgewiesenenSchreibversuch(user, REOPEN, [tina], 'training_relationship.reopened');

    const { rows } = await asPostgres<{ status: string }>(
      'select status from public.training_relationships where id = $1',
      [tina],
    );
    expect(rows[0]?.status).toBe('active');
  });

  it('findet eine Kennung einer anderen Organisation nicht', async () => {
    const fehler = await abgefangen(
      asUser(users.trainer, END, ['eeeeeeee-eeee-4eee-8eee-0000000000ff', null]),
    );
    expect(fehler?.message).toMatch(/training relationship not found/);
  });
});

describe('Lesen (TRN-001)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  const LIST = 'select * from public.list_training_clients()';
  const GET = 'select * from public.get_training_client($1::uuid)';

  it('liefert die Trefferliste ohne Kontaktdaten und ohne Protokoll', async () => {
    const vorher = await anzahl(
      "select 1 from public.audit_log where action like 'training_relationship%'",
    );
    const { rows } = await asUser<Record<string, unknown>>(users.trainer, LIST);
    expect(rows.map((r) => r.id)).toEqual(
      expect.arrayContaining([trainingRelationships.tina, trainingRelationships.erika]),
    );
    expect(Object.keys(rows[0]!).sort()).toEqual([
      'contract_ended_on',
      'contract_started_on',
      'family_name',
      'given_name',
      'id',
      'person_id',
      'status',
    ]);
    expect(
      await anzahl("select 1 from public.audit_log where action like 'training_relationship%'"),
    ).toBe(vorher);
  });

  it('protokolliert das Oeffnen der Detailansicht (ADR-021 Punkt 8)', async () => {
    const { rows } = await asUserCommitted<{ id: string; given_name: string }>(users.trainer, GET, [
      trainingRelationships.tina,
    ]);
    expect(rows).toEqual([expect.objectContaining({ given_name: 'Tina' })]);
    expect(await audit('training_relationship.viewed', trainingRelationships.tina)).toEqual([
      { outcome: 'success', context: { surface: 'web' } },
    ]);
  });

  it('unterscheidet eine unbekannte Kennung nicht von einer fremden', async () => {
    const fehler = await abgefangen(
      asUser(users.trainer, GET, ['eeeeeeee-eeee-4eee-8eee-0000000000ff']),
    );
    expect(fehler?.message).toMatch(/training relationship not found/);
  });

  it.each([
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['patient', users.patientErika],
  ])('weist %s bei Liste und Detail ab - protokolliert', async (_rolle, user) => {
    await erwarteAbgewiesenenLeseversuch(user, LIST, [], 'training_relationships.read');
    await erwarteAbgewiesenenLeseversuch(
      user,
      GET,
      [trainingRelationships.erika],
      'training_relationship.viewed',
    );
    const { rows } = await asUser(user, 'select 1 from public.training_contact_details');
    expect(rows).toEqual([]);
  });
});

describe('Kein Durchgriff von der Trainingsbetreuung in die Behandlung (TRN-003)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('bekommt aus der Dublettenpruefung der Kartei nichts - protokolliert', async () => {
    await erwarteAbgewiesenenLeseversuch(
      users.trainer,
      'select * from public.find_possible_duplicates($1, $2, $3::date)',
      ['Erika', 'Beispiel', null],
      'patient_directory.read',
    );
  });

  it('legt keine Akte an', async () => {
    const fehler = await abgefangen(
      asUser(
        users.trainer,
        `select public.create_patient('Neu', 'Akte', null, null, null, null, null, null, null)`,
      ),
    );
    expect(fehler).not.toBeNull();
    expect(await anzahl("select 1 from public.persons where family_name = 'Akte'")).toBe(0);
  });

  it('sieht an Erika nur das Training, nicht die Akte', async () => {
    const { rows: training } = await asUser(
      users.trainer,
      'select 1 from public.training_relationships where person_id = $1',
      [persons.erika],
    );
    expect(training).toHaveLength(1);
    const { rows: akte } = await asUser(
      users.trainer,
      'select 1 from public.patients where person_id = $1',
      [persons.erika],
    );
    expect(akte).toEqual([]);
  });
});

describe('Rolle Trainingsbetreuung zuweisbar (TRN-003)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  const ANNA = '55555555-5555-4555-8555-000000000002';
  const ROLLEN = 'select public.set_staff_account_roles($1::uuid, $2::text[])';
  const LIST = 'select * from public.list_training_clients()';

  it('laesst trainer als Praxisrolle zu, patient weiter nicht', async () => {
    await asPostgres(`select app.assert_staff_role_keys(array['trainer'])`);
    await asPostgres(`select app.assert_staff_role_keys(array['therapist', 'trainer'])`);
    const fehler = await abgefangen(
      asPostgres(`select app.assert_staff_role_keys(array['patient'])`),
    );
    expect(fehler?.message).toMatch(/unknown role/);
  });

  it('gibt einer Therapeutin mit zusaetzlicher Trainingsrolle beide Bereiche - und nimmt sie wieder', async () => {
    // Vorher: Anna ist therapist und sieht kein Training.
    await erwarteAbgewiesenenLeseversuch(users.therapist, LIST, [], 'training_relationships.read');

    await asUserCommitted(users.ownerTherapist, ROLLEN, [ANNA, ['therapist', 'trainer']]);
    const { rows } = await asUser<{ id: string }>(users.therapist, LIST);
    expect(rows.map((r) => r.id)).toEqual(
      expect.arrayContaining([trainingRelationships.tina, trainingRelationships.erika]),
    );
    // Die Akte bleibt ihr aus der Therapeutenrolle - Haeufung, kein Schluss (§4.8).
    const { rows: akten } = await asUser(users.therapist, 'select 1 from public.patients');
    expect(akten.length).toBeGreaterThan(0);

    await asUserCommitted(users.ownerTherapist, ROLLEN, [ANNA, ['therapist']]);
    await erwarteAbgewiesenenLeseversuch(users.therapist, LIST, [], 'training_relationships.read');
  });

  it('macht aus einem reinen Trainingskonto kein Behandlungskonto', async () => {
    await asUserCommitted(users.ownerTherapist, ROLLEN, [ANNA, ['trainer']]);
    try {
      const { rows: akten } = await asUser(users.therapist, 'select 1 from public.patients');
      expect(akten).toEqual([]);
      const { rows: flags } = await asUser<{ staff: boolean; training: boolean }>(
        users.therapist,
        'select app.is_staff() as staff, app.can_write_training_relationships() as training',
      );
      expect(flags[0]).toEqual({ staff: false, training: true });
    } finally {
      await asUserCommitted(users.ownerTherapist, ROLLEN, [ANNA, ['therapist']]);
    }
  });

  it('bleibt allein owner vorbehalten', async () => {
    await erwarteAbgewiesenenSchreibversuch(
      users.office,
      ROLLEN,
      [ANNA, ['trainer']],
      'staff_account.roles_changed',
    );
  });
});

describe('Mandantengrenze (ADR-003)', () => {
  const FREMD_TRAINING = 'eeeeeeee-eeee-4eee-8eee-0000000000ab';

  beforeAll(async () => {
    await resetDatabase();
    const f = await fremdeOrganisation();
    await asPostgres(
      `insert into public.training_relationships (id, organization_id, person_id, contract_started_on)
       values ($1, $2, $3, current_date)`,
      [FREMD_TRAINING, f.organizationId, f.personPatient],
    );
  }, 120_000);

  it('zeigt dem owner einer anderen Praxis keine Trainingskund:in dieser Praxis', async () => {
    const { owner } = await fremdeOrganisation();
    const { rows } = await asUser<{ id: string }>(
      owner,
      'select * from public.list_training_clients()',
    );
    expect(rows.map((r) => r.id)).toEqual([FREMD_TRAINING]);
    const fehler = await abgefangen(
      asUser(owner, 'select * from public.get_training_client($1::uuid)', [
        trainingRelationships.tina,
      ]),
    );
    expect(fehler?.message).toMatch(/training relationship not found/);
    const { rows: kontakt } = await asUser(owner, 'select 1 from public.training_contact_details');
    expect(kontakt).toEqual([]);
  });

  it('laesst die Trainingsbetreuung nichts in einer anderen Praxis aendern oder anbinden', async () => {
    const f = await fremdeOrganisation();
    for (const sql of [
      'select public.end_training_relationship($1::uuid) as x',
      'select public.reopen_training_relationship($1::uuid) as x',
      `select public.update_training_client($1::uuid, 'X', 'Y', null, null, null, null, null, null, current_date) as x`,
    ]) {
      const fehler = await abgefangen(asUser(users.trainer, sql, [FREMD_TRAINING]));
      expect(fehler?.message).toMatch(/training relationship not found/);
    }
    // Auch owner nicht: die Person der anderen Praxis ist hier unbekannt.
    const fehler = await abgefangen(
      asUser(users.ownerTherapist, 'select public.start_training_for_person($1::uuid) as x', [
        f.personOwner,
      ]),
    );
    expect(fehler?.message).toMatch(/person not found/);
  });

  it('findet in der Dublettenpruefung niemanden aus einer anderen Praxis', async () => {
    const { rows } = await asUser(
      users.ownerTherapist,
      'select * from public.find_possible_training_duplicates($1, $2, null)',
      ['Peter', 'Fremdpatient'],
    );
    expect(rows).toEqual([]);
  });
});
