import { beforeAll, describe, expect, it } from 'vitest';
import {
  SEED,
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
 * TRN-EPIC-002: Ein Trainingstermin steht im selben Kalender, und die
 * Betreuung sieht nur ihn (TRN-004 bis TRN-006, ADR-022).
 *
 * Geprueft wird, wer anlegt, verschiebt und absagt (ANN-176), dass die
 * Vereinbarung optional ist (Punkt 5, ANN-179), dass der Hausbesuch seine
 * Anschrift aus dem Training nimmt (ANN-177), dass eine Absage kein
 * Ausfallhonorar setzt (ANN-178) - und vor allem, dass es in keine Richtung
 * einen Durchgriff gibt: weder beim Lesen noch beim Schreiben, und die
 * Belegung sagt "belegt" und nichts darueber hinaus (Punkt 11).
 */

const { users, patients, trainingRelationships, organizationId } = SEED;

const TOM = '55555555-5555-4555-8555-000000000006';
const ANNA = '55555555-5555-4555-8555-000000000002';
const TIM = '55555555-5555-4555-8555-000000000004';
const PRAXIS = '33333333-3333-4333-8333-000000000001';
const SEED_BASIS = 'ffffffff-ffff-4fff-8fff-000000000001';
const TRAINING_HEUTE = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000007';
const BEHANDLUNG_HEUTE = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';

const CREATE = `select public.create_training_appointment(
  $1::uuid, $2::uuid, $3, $4::date, $5::time, $6::time, $7::uuid, $8, $9::uuid, $10
) as id`;

type Termin = {
  relationship?: string;
  staff?: string;
  typ?: string;
  datum?: string;
  von?: string;
  bis?: string;
  ort?: string | null;
  ausserhalb?: boolean;
  basis?: string | null;
  vergangen?: boolean;
};

function termin(t: Termin = {}): unknown[] {
  return [
    t.relationship ?? trainingRelationships.tina,
    t.staff ?? TOM,
    t.typ ?? 'practice',
    t.datum ?? tagInTagen(9),
    t.von ?? '10:00',
    t.bis ?? '11:00',
    t.ort === undefined ? PRAXIS : t.ort,
    t.ausserhalb ?? true,
    t.basis ?? null,
    t.vergangen ?? false,
  ];
}

async function lege(user: string, t: Termin = {}): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(user, CREATE, termin(t));
  return rows[0]!.id;
}

async function zeile(id: string) {
  const { rows } = await asPostgres<Record<string, unknown>>(
    'select * from public.appointments where id = $1',
    [id],
  );
  return rows[0]!;
}

async function updatedAt(id: string): Promise<string> {
  const { rows } = await asPostgres<{ t: string }>(
    'select updated_at::text as t from public.appointments where id = $1',
    [id],
  );
  return rows[0]!.t;
}

async function audit(action: string, subjectId: string) {
  const { rows } = await asPostgres<{ outcome: string; context: Record<string, unknown> }>(
    `select outcome, context from public.audit_log
     where action = $1 and subject_id = $2 order by occurred_at, id`,
    [action, subjectId],
  );
  return rows;
}

/** Tim (therapist, team_lead) betreut zusaetzlich Training - die Haeufung nach §4.8. */
async function timTrainiertAuch(): Promise<void> {
  await asPostgres(
    `insert into public.user_roles (user_id, organization_id, role_key)
     values ($1, $2, 'trainer')`,
    [users.teamLead, organizationId],
  );
}

const FREMDES_VERHAELTNIS = 'eeeeeeee-eeee-4eee-8eee-0000000000ab';
const FREMDE_BASIS = 'ffffffff-ffff-4fff-8fff-0000000000ab';

/** Ein Trainingsverhaeltnis mit Vereinbarung in der zweiten Praxis (ADR-003). */
async function fremdesTraining(): Promise<void> {
  const fremd = await fremdeOrganisation();
  await asPostgres(
    `insert into public.training_relationships (id, organization_id, person_id, status, contract_started_on)
     values ($1, $2, $3, 'active', '2026-01-01') on conflict (id) do nothing`,
    [FREMDES_VERHAELTNIS, fremd.organizationId, fremd.personPatient],
  );
  await asPostgres(
    `insert into public.training_bases (id, organization_id, training_relationship_id, started_on)
     values ($1, $2, $3, '2026-01-01') on conflict (id) do nothing`,
    [FREMDE_BASIS, fremd.organizationId, FREMDES_VERHAELTNIS],
  );
}

const UPDATE = `select public.update_appointment(
  $1::uuid, $2::timestamptz, $3::uuid, $4, $5::date, $6::time, $7::time, $8::uuid, true, false
) as id`;
const CANCEL = `select public.cancel_appointment($1::uuid, $2::timestamptz, $3, null, null) as id`;

describe('Trainingstermin anlegen (TRN-004)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it.each([
    ['trainer', users.trainer, 2],
    ['office', users.office, 3],
    ['owner', users.ownerTherapist, 4],
  ])('laesst %s einen Trainingstermin anlegen', async (_rolle, user, tage) => {
    const id = await lege(user, { datum: tagInTagen(tage + 10) });
    const r = await zeile(id);
    expect(r.kind).toBe('training');
    expect(r.patient_id).toBeNull();
    expect(r.treatment_basis_id).toBeNull();
    expect(r.training_relationship_id).toBe(trainingRelationships.tina);
    expect(r.status).toBe('confirmed');

    // Kennungen, kein Name, keine Anschrift (ADR-010 Punkt 3). Ob der Tag in
    // Toms Wochenplan liegt, haengt vom Wochentag ab - geprueft wird die Art.
    const eintrag = (await audit('appointment.created', id))[0]!;
    expect(eintrag.outcome).toBe('success');
    expect(typeof eintrag.context.outside_working_hours).toBe('boolean');
    expect({ ...eintrag.context, outside_working_hours: null }).toEqual({
      surface: 'web',
      kind: 'training',
      training_relationship_id: trainingRelationships.tina,
      staff_member_id: TOM,
      training_basis_id: null,
      outside_working_hours: null,
      in_the_past: false,
    });
  });

  it.each([
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
    ['Patientenkonto', users.patientMax],
  ])('weist %s bestaetigt ab', async (_rolle, user) => {
    await erwarteAbgewiesenenSchreibversuch(user, CREATE, termin(), 'appointment.created');
  });

  it('ordnet nur zu, wer die Rolle Trainingsbetreuung hat (ANN-176)', async () => {
    await expect(asUser(users.ownerTherapist, CREATE, termin({ staff: ANNA }))).rejects.toThrow(
      /^staff member not assignable$/,
    );
  });

  it('bleibt als Einzelstunde ohne Vereinbarung moeglich und nimmt eine laufende an (ADR-022 Punkt 5)', async () => {
    const ohne = await lege(users.trainer, { datum: tagInTagen(20) });
    expect((await zeile(ohne)).training_basis_id).toBeNull();

    const mit = await lege(users.trainer, { datum: tagInTagen(21), basis: SEED_BASIS });
    expect((await zeile(mit)).training_basis_id).toBe(SEED_BASIS);
  });

  it('nimmt keine Vereinbarung eines anderen Verhaeltnisses an', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(
      users.trainer,
      'select public.create_training_basis($1::uuid, null, 3) as id',
      [trainingRelationships.erika],
    );
    await expect(
      asUser(users.trainer, CREATE, termin({ basis: rows[0]!.id, datum: tagInTagen(22) })),
    ).rejects.toThrow(/^training basis not found$/);
  });

  it('kennt eine Behandlungsgrundlage nicht als Vereinbarung', async () => {
    const { rows } = await asPostgres<{ id: string }>(
      'select id from public.treatment_bases limit 1',
    );
    await expect(
      asUser(users.trainer, CREATE, termin({ basis: rows[0]!.id, datum: tagInTagen(22) })),
    ).rejects.toThrow(/^training basis not found$/);
  });

  it('plant nicht an einem beendeten Vertrag', async () => {
    await asPostgres(`update public.training_relationships set status = 'inactive' where id = $1`, [
      trainingRelationships.erika,
    ]);
    try {
      await expect(
        asUser(
          users.trainer,
          CREATE,
          termin({ relationship: trainingRelationships.erika, datum: tagInTagen(23) }),
        ),
      ).rejects.toThrow(/^training relationship is not active$/);
    } finally {
      await asPostgres(`update public.training_relationships set status = 'active' where id = $1`, [
        trainingRelationships.erika,
      ]);
    }
  });

  it('kennt ein Verhaeltnis einer anderen Organisation nicht', async () => {
    await fremdesTraining();
    await expect(
      asUser(users.trainer, CREATE, termin({ relationship: FREMDES_VERHAELTNIS })),
    ).rejects.toThrow(/^training relationship not found$/);
  });

  it('laesst alle drei Kanaele zu (ADR-022 Punkt 9)', async () => {
    const video = await lege(users.trainer, { typ: 'video', ort: null, datum: tagInTagen(24) });
    expect((await zeile(video)).appointment_type).toBe('video');
  });

  it('nimmt den Hausbesuch mit der Anschrift aus dem Training an (ANN-177)', async () => {
    const id = await lege(users.trainer, { typ: 'home_visit', ort: null, datum: tagInTagen(25) });
    const r = await zeile(id);
    expect([r.visit_street, r.visit_house_number, r.visit_postal_code, r.visit_city]).toEqual([
      'Trainingsweg',
      '5',
      '72076',
      'Tuebingen',
    ]);
  });

  it('nimmt keinen Hausbesuch ohne Anschrift im Training - auch wenn die Akte eine hat', async () => {
    // Erika hat eine Anschrift in der Akte, aber keine im Training.
    await expect(
      asUser(
        users.office,
        CREATE,
        termin({
          relationship: trainingRelationships.erika,
          typ: 'home_visit',
          ort: null,
          datum: tagInTagen(26),
        }),
      ),
    ).rejects.toThrow(/^home visit requires a complete address$/);
  });

  it('verlangt fuer die Vergangenheit eine Bestaetigung', async () => {
    await expect(asUser(users.trainer, CREATE, termin({ datum: tagInTagen(-3) }))).rejects.toThrow(
      /^appointment date is in the past$/,
    );
    const id = await lege(users.trainer, { datum: tagInTagen(-3), vergangen: true });
    expect((await audit('appointment.created', id))[0]?.context.in_the_past).toBe(true);
  });

  it('haelt das Raster', async () => {
    await expect(
      asUser(users.trainer, CREATE, termin({ von: '10:07', bis: '11:07', datum: tagInTagen(27) })),
    ).rejects.toThrow(/grid/);
  });
});

describe('Hausnummer im Trainingskontakt (ABN-020, BEF-111, ANN-177)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  /**
   * Die einmalige Aufteilung der Migration, nachgestellt: Was vor ABN-020 als
   * "Strasse und Hausnummer" in einem Feld stand, wird nur geteilt, wenn es
   * eindeutig ist; der Rest bleibt ungeteilt zur Pruefung stehen.
   */
  it.each([
    ['Trainingsweg 5', 'Trainingsweg', '5'],
    ['Musterweg 12a', 'Musterweg', '12a'],
    ['Am Ring 3-5', 'Am Ring', '3-5'],
    ['Strasse des 17. Juni 4', 'Strasse des 17. Juni', '4'],
    ['B 27', 'B 27', null],
    ['Hauptstrasse', 'Hauptstrasse', null],
  ])('%s', async (zeile, strasse, nummer) => {
    // Die Regel der Migration als eine Abfrage: dieselben Ausdruecke.
    const { rows } = await asPostgres<{ street: string | null; house_number: string | null }>(
      String.raw`with zeile as (select $1::text as l),
            nummer as (
              select substring(l from '\s([0-9][0-9a-zA-Z]*(\s*[-/]\s*[0-9][0-9a-zA-Z]*)?(\s?[a-zA-Z])?)$') as h, l
              from zeile),
            geteilt as (
              select l, h, btrim(left(l, length(l) - length(h))) as s from nummer)
       select case when h is not null and s <> '' and s !~ '(^|\s)([0-9]+|[A-Z])$' then s else l end as street,
              case when h is not null and s <> '' and s !~ '(^|\s)([0-9]+|[A-Z])$' then h end as house_number
       from geteilt`,
      [zeile],
    );
    expect(rows[0]).toEqual({ street: strasse, house_number: nummer });
  });

  it('uebernimmt Strasse und Hausnummer unveraendert in den Hausbesuch', async () => {
    const { rows } = await asPostgres<{ street: string; house_number: string }>(
      `select * from app.training_visit_address($1::uuid)`,
      [SEED.trainingRelationships.tina],
    );
    expect(rows[0]).toMatchObject({ street: 'Trainingsweg', house_number: '5' });
  });
});

describe('Verschieben und Absagen (TRN-004)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('laesst die Trainingsbetreuung verschieben und protokolliert das Verhaeltnis', async () => {
    const id = await lege(users.trainer, { datum: tagInTagen(30) });
    await asUserCommitted(users.trainer, UPDATE, [
      id,
      await updatedAt(id),
      TOM,
      'practice',
      tagInTagen(31),
      '12:00',
      '13:30',
      PRAXIS,
    ]);
    const r = await zeile(id);
    expect(r.kind).toBe('training');
    const kontext = (await audit('appointment.rescheduled', id))[0]!.context;
    expect(typeof kontext.outside_working_hours).toBe('boolean');
    expect({ ...kontext, outside_working_hours: null }).toEqual({
      surface: 'web',
      patient_id: null,
      staff_member_id: TOM,
      changed_fields: ['starts_at', 'ends_at'],
      outside_working_hours: null,
      in_the_past: false,
      kind: 'training',
      training_relationship_id: trainingRelationships.tina,
    });
  });

  it('ordnet beim Verschieben nur Trainingsbetreuung zu', async () => {
    const id = await lege(users.trainer, { datum: tagInTagen(32) });
    await expect(
      asUser(users.trainer, UPDATE, [
        id,
        await updatedAt(id),
        ANNA,
        'practice',
        tagInTagen(32),
        '10:00',
        '11:00',
        PRAXIS,
      ]),
    ).rejects.toThrow(/^staff member not assignable$/);
  });

  it('macht aus einem Trainingstermin einen Hausbesuch mit der Anschrift aus dem Training', async () => {
    const id = await lege(users.trainer, { datum: tagInTagen(33) });
    await asUserCommitted(users.office, UPDATE, [
      id,
      await updatedAt(id),
      TOM,
      'home_visit',
      tagInTagen(33),
      '10:00',
      '11:00',
      null,
    ]);
    expect((await zeile(id)).visit_street).toBe('Trainingsweg');
  });

  it('sagt ab, ohne ein Ausfallhonorar zu setzen - auch kurzfristig (ANN-178)', async () => {
    // Der Seed-Termin beginnt heute: eine Absage jetzt waere an einer
    // Behandlung kurzfristig.
    await asUserCommitted(users.trainer, CANCEL, [
      TRAINING_HEUTE,
      await updatedAt(TRAINING_HEUTE),
      'patient_request',
    ]);
    const r = await zeile(TRAINING_HEUTE);
    expect(r.status).toBe('cancelled');
    expect(r.fee_basis).toBeNull();
    expect((await audit('appointment.cancelled', TRAINING_HEUTE))[0]?.context).toEqual({
      surface: 'web',
      patient_id: null,
      staff_member_id: TOM,
      fee: false,
      received_later: false,
      kind: 'training',
      training_relationship_id: trainingRelationships.tina,
    });
  });

  it('laesst den Kontext auch beim Verschieben nicht wechseln (ADR-022 Punkt 10)', async () => {
    const id = await lege(users.trainer, { datum: tagInTagen(34) });
    await expect(
      asPostgres(`update public.appointments set kind = 'therapy' where id = $1`, [id]),
    ).rejects.toThrow(/context cannot be changed/);
  });
});

describe('Kein Durchgriff beim Schreiben (TRN-006, ADR-022 Punkt 11)', () => {
  let training: string;

  beforeAll(async () => {
    await resetDatabase();
    training = await lege(users.trainer, { datum: tagInTagen(40) });
  }, 120_000);

  it.each([
    [
      'update_appointment',
      UPDATE,
      (id: string, t: string) => [id, t, TOM, 'practice', tagInTagen(41), '10:00', '11:00', PRAXIS],
    ],
    ['cancel_appointment', CANCEL, (id: string, t: string) => [id, t, 'other']],
    [
      'complete_appointment',
      'select public.complete_appointment($1::uuid, $2::timestamptz) as id',
      (id: string, t: string) => [id, t],
    ],
    [
      'record_no_show',
      'select public.record_no_show($1::uuid, $2::timestamptz, false) as id',
      (id: string, t: string) => [id, t],
    ],
    [
      'reopen_appointment',
      'select public.reopen_appointment($1::uuid, $2::timestamptz) as id',
      (id: string, t: string) => [id, t],
    ],
    [
      'set_appointment_notification',
      "select public.set_appointment_notification($1::uuid, array['phone']) as id",
      (id: string) => [id],
    ],
  ])(
    '%s: ein Trainingstermin ist fuer die Therapeutin nicht gefunden',
    async (_pfad, sql, parameter) => {
      const vorher = await zeile(training);
      await expect(
        asUser(users.therapist, sql, parameter(training, await updatedAt(training))),
      ).rejects.toThrow(/^appointment not found$/);
      expect(await zeile(training)).toEqual(vorher);
    },
  );

  it.each([
    [
      'update_appointment',
      UPDATE,
      (id: string, t: string) => [
        id,
        t,
        ANNA,
        'home_visit',
        tagInTagen(41),
        '10:00',
        '11:00',
        null,
      ],
    ],
    ['cancel_appointment', CANCEL, (id: string, t: string) => [id, t, 'other']],
  ])(
    '%s: ein Behandlungstermin ist fuer die Trainingsbetreuung nicht gefunden',
    async (_pfad, sql, parameter) => {
      const vorher = await zeile(BEHANDLUNG_HEUTE);
      await expect(
        asUser(users.trainer, sql, parameter(BEHANDLUNG_HEUTE, await updatedAt(BEHANDLUNG_HEUTE))),
      ).rejects.toThrow(/^appointment not found$/);
      expect(await zeile(BEHANDLUNG_HEUTE)).toEqual(vorher);
    },
  );

  it.each([
    ['team_lead', users.teamLead],
    ['die fremde Praxis', '11111111-1111-4111-8111-0000000000ab'],
  ])('update und cancel: fuer %s ist der Trainingstermin nicht gefunden', async (_wer, konto) => {
    await fremdeOrganisation();
    const vorher = await zeile(training);
    const stand = await updatedAt(training);
    await expect(
      asUser(konto, UPDATE, [
        training,
        stand,
        TOM,
        'practice',
        tagInTagen(41),
        '10:00',
        '11:00',
        PRAXIS,
      ]),
    ).rejects.toThrow(/^appointment not found$/);
    await expect(asUser(konto, CANCEL, [training, stand, 'other'])).rejects.toThrow(
      /^appointment not found$/,
    );
    expect(await zeile(training)).toEqual(vorher);
  });

  it('laesst die Trainingsbetreuung keinen internen Termin aendern oder absagen', async () => {
    const intern = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005';
    const vorher = await zeile(intern);
    const stand = await updatedAt(intern);
    await expect(
      asUser(users.trainer, UPDATE, [
        intern,
        stand,
        TOM,
        'practice',
        tagInTagen(41),
        '10:00',
        '11:00',
        PRAXIS,
      ]),
    ).rejects.toThrow(/^appointment not found$/);
    await expect(asUser(users.trainer, CANCEL, [intern, stand, 'other'])).rejects.toThrow(
      /^appointment not found$/,
    );
    expect(await zeile(intern)).toEqual(vorher);
  });

  it('dokumentiert keinen Trainingstermin und verraet nicht, in welchem Zustand er ist', async () => {
    // Bis zum Zweitreview antwortete create_treatment_note je nach Zustand
    // eines fremden Termins mit verschiedenen Saetzen - ein Orakel.
    await expect(
      asUser(users.therapist, 'select public.create_treatment_note($1::uuid, $2) as id', [
        training,
        'Probe',
      ]),
    ).rejects.toThrow(/^appointment not found$/);
  });

  it('haelt auch einen kuenftigen Schreibweg auf: der Riegel an der Tabelle', async () => {
    // Ein Weg, der den Kontext vergisst, schreibt mit der Sitzung der
    // Therapeutin - der Trigger findet den Termin nicht.
    await expect(
      asPostgres(
        `select set_config('request.jwt.claims', '{"sub":"${users.therapist}"}', true);
         update public.appointments set updated_at = now() where id = '${training}'`,
      ),
    ).rejects.toThrow(/appointment not found/);
    await expect(
      asPostgres(
        `select set_config('request.jwt.claims', '{"sub":"${users.trainer}"}', true);
         update public.appointments set updated_at = now() where id = '${BEHANDLUNG_HEUTE}'`,
      ),
    ).rejects.toThrow(/appointment not found/);
  });
});

describe('Die Belegung sagt "belegt" und nichts darueber hinaus (TRN-006)', () => {
  const tag = tagInTagen(45);

  beforeAll(async () => {
    await resetDatabase();
    await timTrainiertAuch();
  }, 120_000);

  it('meldet der Trainingsbetreuung eine Behandlung zur selben Zeit nur als Ueberschneidung', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(
      users.ownerTherapist,
      `select public.create_appointment($1::uuid, $2::uuid, 'practice', $3::date,
         '10:00'::time, '11:00'::time, $4::uuid, true) as id`,
      [patients.max, TIM, tag, PRAXIS],
    );
    expect(rows[0]!.id).toBeTruthy();

    const fehler = await asUser(
      users.trainer,
      CREATE,
      termin({ staff: TIM, datum: tag, von: '10:30', bis: '11:30' }),
    ).catch((e: Error & { detail?: string; hint?: string }) => e);
    expect(fehler).toBeInstanceOf(Error);
    const e = fehler as Error & { detail?: string; hint?: string; code?: string };
    // Genau diese Meldung: kein Name, keine Zeit, keine Kennung des fremden Termins.
    expect(e.message).toBe('appointment overlaps an existing one');
    expect(e.code).toBe('23P01');
    expect(e.detail).toBeUndefined();
    expect(e.hint).toBeUndefined();

    // ... und im Kalender der Trainingsbetreuung steht davon nichts.
    const kalender = await asUser<{ kind: string }>(
      users.trainer,
      `select kind from public.list_appointments($1::date, $2::date, $3::uuid)`,
      [tag, tagInTagen(46), TIM],
    );
    expect(kalender.rows).toEqual([]);
  });

  it('meldet umgekehrt der Praxis ein Training zur selben Zeit genauso', async () => {
    await lege(users.trainer, { staff: TIM, datum: tag, von: '14:00', bis: '15:00' });
    const fehler = await asUser(
      users.ownerTherapist,
      `select public.create_appointment($1::uuid, $2::uuid, 'practice', $3::date,
         '14:30'::time, '15:30'::time, $4::uuid, true) as id`,
      [patients.max, TIM, tag, PRAXIS],
    ).catch((e: Error & { detail?: string }) => e);
    expect((fehler as Error).message).toBe('appointment overlaps an existing one');
    expect((fehler as Error & { detail?: string }).detail).toBeUndefined();
  });
});

describe('Kein Durchgriff beim Lesen (TRN-006)', () => {
  const heute = tagInTagen(0);
  const morgen = tagInTagen(1);

  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  it('zeigt der Trainingsbetreuung im Kalender nur Trainingstermine - mit Namen aus dem Training', async () => {
    const { rows } = await asUser<Record<string, unknown>>(
      users.trainer,
      'select * from public.list_appointments($1::date, $2::date)',
      [heute, tagInTagen(2)],
    );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(new Set(rows.map((r) => r.kind))).toEqual(new Set(['training']));
    const tina = rows.find((r) => r.id === TRAINING_HEUTE)!;
    expect(tina.training_given_name).toBe('Tina');
    expect(tina.training_relationship_id).toBe(trainingRelationships.tina);
    expect(tina.patient_given_name).toBeNull();
    expect(tina.patient_id).toBeNull();
  });

  it.each([
    ['therapist', users.therapist],
    ['team_lead', users.teamLead],
  ])('zeigt %s im Kalender keinen Trainingstermin', async (_rolle, user) => {
    const { rows } = await asUser<{ kind: string }>(
      user,
      'select kind from public.list_appointments($1::date, $2::date)',
      [heute, tagInTagen(2)],
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.kind)).not.toContain('training');
  });

  it('zeigt owner und office beide Kontexte', async () => {
    for (const user of [users.ownerTherapist, users.office]) {
      const { rows } = await asUser<{ kind: string }>(
        user,
        'select kind from public.list_appointments($1::date, $2::date)',
        [heute, tagInTagen(2)],
      );
      expect(new Set(rows.map((r) => r.kind))).toEqual(
        new Set(['therapy', 'internal', 'training']),
      );
    }
  });

  it('nennt am Training einer Person mit Akte nur den Namen aus dem Training', async () => {
    const id = await lege(users.office, {
      relationship: trainingRelationships.erika,
      datum: tagInTagen(3),
    });
    const { rows } = await asUser<Record<string, unknown>>(
      users.ownerTherapist,
      'select * from public.list_appointments($1::date, $2::date)',
      [tagInTagen(3), tagInTagen(4)],
    );
    const r = rows.find((z) => z.id === id)!;
    expect(r.patient_id).toBeNull();
    expect(r.patient_family_name).toBeNull();
    expect(r.training_family_name).toBe('Beispiel');
  });

  it('gibt der Trainingsbetreuung die eigene Tagesliste - ohne Behandlung', async () => {
    const eigene = await asUser<Record<string, unknown>>(
      users.trainer,
      'select * from public.list_day_plan($1::date, $2::uuid)',
      [heute, TOM],
    );
    expect(eigene.rows.map((r) => r.id)).toEqual([TRAINING_HEUTE]);
    expect(eigene.rows[0]!.training_given_name).toBe('Tina');
    expect(eigene.rows[0]!.documentation_status).toBeNull();

    const annas = await asUser(
      users.trainer,
      'select * from public.list_day_plan($1::date, $2::uuid)',
      [heute, ANNA],
    );
    expect(annas.rows).toEqual([]);
  });

  it.each([
    ['Patientenkonto', users.patientMax],
    ['therapist', users.therapist],
  ])('weist %s an Detail, Kundenterminen und Betreuungsliste bestaetigt ab', async (_w, konto) => {
    await erwarteAbgewiesenenLeseversuch(
      konto,
      'select * from public.get_training_appointment($1::uuid)',
      [TRAINING_HEUTE],
      'appointments.read',
    );
    await erwarteAbgewiesenenLeseversuch(
      konto,
      'select * from public.list_training_client_appointments($1::uuid)',
      [trainingRelationships.tina],
      'training_relationships.read',
    );
    await erwarteAbgewiesenenLeseversuch(
      konto,
      'select * from public.list_assignable_trainers()',
      [],
      'appointments.read',
    );
  });

  it('kennt fuer die fremde Praxis weder Trainingstermin noch Kundentermine', async () => {
    const fremd = await fremdeOrganisation();
    await expect(
      asUser(fremd.owner, 'select * from public.get_training_appointment($1::uuid)', [
        TRAINING_HEUTE,
      ]),
    ).rejects.toThrow(/^appointment not found$/);
    const { rows } = await asUser(
      fremd.owner,
      'select * from public.list_training_client_appointments($1::uuid)',
      [trainingRelationships.tina],
    );
    expect(rows).toEqual([]);
    const kalender = await asUser(
      fremd.owner,
      'select * from public.list_appointments($1::date, $2::date)',
      [heute, tagInTagen(2)],
    );
    expect(kalender.rows).toEqual([]);
  });

  it('gibt anon weder Kalender noch Tagesliste (Zweitreview)', async () => {
    const { rows } = await asPostgres<{ kalender: boolean; tag: boolean }>(`
      select
        has_function_privilege('anon', 'public.list_appointments(date, date, uuid, uuid, text)', 'execute') as kalender,
        has_function_privilege('anon', 'public.list_day_plan(date, uuid)', 'execute') as tag
    `);
    expect(rows[0]).toEqual({ kalender: false, tag: false });
  });

  it('liest keine internen Termine fuer die Trainingsbetreuung (ANN-180)', async () => {
    const { rows } = await asUser<{ kind: string }>(
      users.trainer,
      'select kind from public.appointments',
    );
    expect(new Set(rows.map((r) => r.kind))).toEqual(new Set(['training']));
  });

  it('liefert das Detail eines Trainingstermins - fuer andere Kontexte nicht gefunden', async () => {
    const { rows } = await asUser<Record<string, unknown>>(
      users.trainer,
      'select * from public.get_training_appointment($1::uuid)',
      [TRAINING_HEUTE],
    );
    expect(rows[0]).toMatchObject({
      client_given_name: 'Tina',
      staff_given_name: 'Tom',
      training_basis_id: SEED_BASIS,
    });
    expect(rows[0]!.location_name).toBeTruthy();
    for (const user of [users.trainer, users.ownerTherapist]) {
      await expect(
        asUser(user, 'select * from public.get_training_appointment($1::uuid)', [BEHANDLUNG_HEUTE]),
      ).rejects.toThrow(/^appointment not found$/);
    }
  });

  it('weist die Therapeutin am Detail und an den Terminen einer Trainingskund:in ab', async () => {
    await erwarteAbgewiesenenLeseversuch(
      users.therapist,
      'select * from public.get_training_appointment($1::uuid)',
      [TRAINING_HEUTE],
      'appointments.read',
    );
    await erwarteAbgewiesenenLeseversuch(
      users.therapist,
      'select * from public.list_training_client_appointments($1::uuid)',
      [trainingRelationships.tina],
      'training_relationships.read',
    );
    await erwarteAbgewiesenenLeseversuch(
      users.therapist,
      'select * from public.list_assignable_trainers()',
      [],
      'appointments.read',
    );
  });

  it('listet die Termine einer Trainingskund:in - nie eine Behandlung derselben Person', async () => {
    const { rows } = await asUser<{ id: string; status: string }>(
      users.trainer,
      'select id, status from public.list_training_client_appointments($1::uuid)',
      [trainingRelationships.tina],
    );
    // Seit TRN-EPIC-003 steht im Seed auch die durchgefuehrte Stunde von
    // vorgestern (TRN-007).
    expect(rows.map((r) => r.id)).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-000000000009',
      TRAINING_HEUTE,
      'aaaaaaaa-aaaa-4aaa-8aaa-000000000008',
    ]);

    // Erika hat auch eine Akte mit Behandlungsterminen - keiner davon steht
    // in ihrer Trainingsliste, auch nicht fuer owner, der beide sieht.
    const erika = await asUser<{ id: string }>(
      users.ownerTherapist,
      'select id from public.list_training_client_appointments($1::uuid)',
      [trainingRelationships.erika],
    );
    const behandlungen = await asPostgres<{ id: string }>(
      'select id from public.appointments where patient_id = $1',
      [patients.erika],
    );
    expect(behandlungen.rows.length).toBeGreaterThan(0);
    const ids = new Set(erika.rows.map((r) => r.id));
    expect(behandlungen.rows.filter((r) => ids.has(r.id))).toEqual([]);
  });

  it('bietet als betreuende Person nur Trainingsbetreuung an', async () => {
    const { rows } = await asUser<{ staff_member_id: string }>(
      users.office,
      'select staff_member_id from public.list_assignable_trainers()',
    );
    expect(rows.map((r) => r.staff_member_id)).toEqual([TOM]);
  });

  it('laesst die Trainingsbetreuung nicht in der Kartei suchen - und Tina steht in keiner', async () => {
    await erwarteAbgewiesenenLeseversuch(
      users.trainer,
      'select * from public.search_patients($1, 10)',
      ['Tina'],
      'patient_directory.read',
    );
    const { rows } = await asUser(users.therapist, 'select * from public.search_patients($1, 10)', [
      'Trainingskundin',
    ]);
    expect(rows).toEqual([]);
  });

  it('zeigt morgen die Einzelstunde ohne Vereinbarung', async () => {
    const { rows } = await asUser<{ training_basis_id: string | null }>(
      users.trainer,
      'select training_basis_id from public.get_training_appointment($1::uuid)',
      ['aaaaaaaa-aaaa-4aaa-8aaa-000000000008'],
    );
    expect(rows[0]!.training_basis_id).toBeNull();
    expect(morgen).toBeTruthy();
  });
});

describe('Vereinbarungen (TRN-005)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  const CREATE_BASIS = 'select public.create_training_basis($1::uuid, $2::date, $3) as id';

  it('legt eine Vereinbarung an und protokolliert sie', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.trainer, CREATE_BASIS, [
      trainingRelationships.tina,
      null,
      5,
    ]);
    const id = rows[0]!.id;
    expect((await audit('training_basis.created', id))[0]).toEqual({
      outcome: 'success',
      context: {
        surface: 'web',
        training_relationship_id: trainingRelationships.tina,
        agreed_quantity: 5,
      },
    });

    const liste = await asUser<{ id: string; agreed_quantity: number; appointment_count: number }>(
      users.trainer,
      'select * from public.list_training_bases($1::uuid)',
      [trainingRelationships.tina],
    );
    // Heute und die durchgefuehrte Stunde von vorgestern (Seed, TRN-007).
    expect(liste.rows.find((r) => r.id === SEED_BASIS)?.appointment_count).toBe(2);
    expect(liste.rows.find((r) => r.id === id)).toMatchObject({
      agreed_quantity: 5,
      appointment_count: 0,
    });
  });

  it('nimmt eine Vereinbarung ohne Anzahl an und keine mit 0', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.office, CREATE_BASIS, [
      trainingRelationships.tina,
      null,
      null,
    ]);
    expect(rows[0]!.id).toBeTruthy();
    await expect(
      asUser(users.office, CREATE_BASIS, [trainingRelationships.tina, null, 0]),
    ).rejects.toThrow(/agreed quantity/);
  });

  it('schliesst ab, sperrt neue Termine daran und oeffnet wieder', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.trainer, CREATE_BASIS, [
      trainingRelationships.tina,
      null,
      2,
    ]);
    const id = rows[0]!.id;
    await asUserCommitted(users.trainer, 'select public.conclude_training_basis($1::uuid)', [id]);
    await expect(
      asUser(users.trainer, CREATE, termin({ basis: id, datum: tagInTagen(50) })),
    ).rejects.toThrow(/^training basis is concluded$/);
    expect(await audit('training_basis.concluded', id)).toHaveLength(1);

    await asUserCommitted(users.trainer, 'select public.reopen_training_basis($1::uuid)', [id]);
    await lege(users.trainer, { basis: id, datum: tagInTagen(50) });
    expect(await audit('training_basis.reopened', id)).toHaveLength(1);
  });

  it('sperrt nicht, wenn die vereinbarte Anzahl erreicht ist (ANN-179)', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.trainer, CREATE_BASIS, [
      trainingRelationships.tina,
      null,
      1,
    ]);
    const id = rows[0]!.id;
    await lege(users.trainer, { basis: id, datum: tagInTagen(51) });
    await lege(users.trainer, { basis: id, datum: tagInTagen(52) });
    const liste = await asUser<{ id: string; appointment_count: number }>(
      users.trainer,
      'select * from public.list_training_bases($1::uuid)',
      [trainingRelationships.tina],
    );
    expect(liste.rows.find((r) => r.id === id)?.appointment_count).toBe(2);
  });

  it('legt an einem beendeten Vertrag keine an und oeffnet keine wieder', async () => {
    const { rows } = await asUserCommitted<{ id: string }>(users.trainer, CREATE_BASIS, [
      trainingRelationships.erika,
      null,
      3,
    ]);
    const id = rows[0]!.id;
    await asUserCommitted(users.trainer, 'select public.conclude_training_basis($1::uuid)', [id]);
    await asPostgres(`update public.training_relationships set status = 'inactive' where id = $1`, [
      trainingRelationships.erika,
    ]);
    try {
      await expect(
        asUser(users.trainer, CREATE_BASIS, [trainingRelationships.erika, null, 3]),
      ).rejects.toThrow(/^training relationship is not active$/);
      await expect(
        asUser(users.trainer, 'select public.reopen_training_basis($1::uuid)', [id]),
      ).rejects.toThrow(/^training relationship is not active$/);
    } finally {
      await asPostgres(`update public.training_relationships set status = 'active' where id = $1`, [
        trainingRelationships.erika,
      ]);
    }
  });

  it('kennt eine Vereinbarung einer anderen Organisation nicht', async () => {
    await fremdesTraining();
    await expect(
      asUser(users.trainer, 'select public.conclude_training_basis($1::uuid)', [FREMDE_BASIS]),
    ).rejects.toThrow(/^training basis not found$/);
    const { rows } = await asUser(
      users.trainer,
      'select * from public.list_training_bases($1::uuid)',
      [FREMDES_VERHAELTNIS],
    );
    expect(rows).toEqual([]);
  });

  it('weist die Therapeutin an der Liste ab', async () => {
    await erwarteAbgewiesenenLeseversuch(
      users.therapist,
      'select * from public.list_training_bases($1::uuid)',
      [trainingRelationships.tina],
      'training_relationships.read',
    );
  });
});
