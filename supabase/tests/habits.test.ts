import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Gewohnheiten mit sehr kleinen Zielen (ALT-003, IDEA-ALT-002, ANN-370).
 *
 *   * Die Praxis trägt ein und beendet - die Rollen, die Pläne schreiben, je
 *     Bereich; höchstens drei laufende; im Training nur mit Einwilligung.
 *   * Die Person und ihre rechtliche Vertretung vermerken Tage (heute und
 *     sechs davor) und pausieren; die Begleitung liest nur.
 *   * Keine Serie, keine Quote, kein Vergleich: Die Antworten tragen eine
 *     feste Schlüsselliste ohne Zählwerk (ADR-006 Punkt 11, IDEA-ALT-007).
 */

const { users, patients, trainingRelationships, organizationId, platformAccesses } = SEED;

const EINTRAGEN = 'select public.add_habit($1, $2::uuid, $3, $4, $5) as id';
const BEENDEN = 'select public.end_habit($1::uuid)';
const LESEN = 'select public.get_checkins($1, $2::uuid) as daten';
const PORTAL = 'select public.platform_habits($1::uuid) as daten';
const VERMERKEN = 'select public.mark_platform_habit($1::uuid, $2::uuid, $3::date, $4)';
const PAUSIEREN = 'select public.pause_platform_habit($1::uuid, $2::uuid, $3)';

const erika = { konto: users.plattformErika, zugang: platformAccesses.erikaBehandlung };

interface Gewohnheit {
  id: string;
  action: string;
  cue: string;
  place: string | null;
  starts_on: string;
  paused: boolean;
  ended_at: string | null;
  marks: string[];
}

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

async function eintragen(
  konto: string,
  art: string,
  verhaeltnis: string,
  was = 'Zwei Minuten Mobilität',
  ausloeser = 'Nach dem Zähneputzen',
  wo: string | null = 'im Bad',
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, EINTRAGEN, [
    art,
    verhaeltnis,
    was,
    ausloeser,
    wo,
  ]);
  return rows[0]!.id;
}

async function praxis(konto: string, art: string, verhaeltnis: string) {
  const { rows } = await asUser<{
    daten: { habits: Gewohnheit[]; habits_writable: boolean; habits_max: number } | null;
  }>(konto, LESEN, [art, verhaeltnis]);
  return rows[0]!.daten;
}

async function portal(konto: string, zugang: string) {
  const { rows } = await asUser<{
    daten: {
      today: string;
      mark_days: number;
      can_mark: boolean;
      consent_needed: boolean;
      habits: Record<string, unknown>[];
    } | null;
  }>(konto, PORTAL, [zugang]);
  return rows[0]!.daten;
}

async function tag(zurueck: number): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    'select (app.training_today($1::uuid) - $2::integer)::text as tag',
    [organizationId, zurueck],
  );
  return rows[0]!.tag;
}

/** Einwilligung zu Gesundheitsangaben im Training (ADR-021 Punkt 4). */
async function einwilligung() {
  await asPostgres(
    `insert into public.training_consent_records
       (organization_id, training_relationship_id, record_kind, purpose, occurred_on, recorded_by)
     values ($1, $2, 'consent_granted', 'training_health_data', current_date, $3)`,
    [organizationId, trainingRelationships.tina, users.trainer],
  );
}

/** Das Eintragen auf einen früheren Tag legen, damit ältere Tage offen sind. */
async function seit(gewohnheit: string, tage: number) {
  await asPostgres(
    'update public.habits set starts_on = app.training_today($1::uuid) - $2::integer where id = $3',
    [organizationId, tage, gewohnheit],
  );
}

describe('Gewohnheiten in der Praxis (ALT-003)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.habits');
  });

  it('trägt ein mit Auslöser; die Rollen der Akte lesen, das Büro schreibt nicht', async () => {
    await eintragen(users.therapist, 'treatment', patients.erika);
    for (const konto of [users.therapist, users.office, users.ownerTherapist, users.teamLead]) {
      const daten = await praxis(konto, 'treatment', patients.erika);
      expect(daten!.habits).toEqual([
        expect.objectContaining({
          action: 'Zwei Minuten Mobilität',
          cue: 'Nach dem Zähneputzen',
          place: 'im Bad',
          starts_on: await tag(0),
          paused: false,
          ended_at: null,
          marks: [],
        }),
      ]);
      expect(daten!.habits_max).toBe(3);
    }
    expect((await praxis(users.office, 'treatment', patients.erika))!.habits_writable).toBe(false);
    expect((await praxis(users.therapist, 'treatment', patients.erika))!.habits_writable).toBe(
      true,
    );
    expect(
      await fehler(asUser(users.office, EINTRAGEN, ['treatment', patients.erika, 'a', 'b', null])),
    ).toBe('42501');
  });

  it('prüft Was und Auslöser, höchstens drei laufende (ANN-370)', async () => {
    for (const [was, ausloeser, wo] of [
      ['', 'Nach dem Zähneputzen', null],
      ['   ', 'Nach dem Zähneputzen', null],
      ['Treppe statt Aufzug', '', null],
      ['x'.repeat(121), 'Nach dem Zähneputzen', null],
      ['Treppe statt Aufzug', 'Im Büro', 'x'.repeat(121)],
    ]) {
      expect(
        await fehler(
          asUser(users.therapist, EINTRAGEN, ['treatment', patients.erika, was, ausloeser, wo]),
        ),
      ).toBe('23514');
    }
    const erste = await eintragen(users.therapist, 'treatment', patients.erika);
    await eintragen(users.therapist, 'treatment', patients.erika, 'Treppe', 'Im Büro', null);
    await eintragen(users.therapist, 'treatment', patients.erika, 'Wasser', 'Am Schreibtisch', '');
    expect(
      await fehler(
        asUser(users.therapist, EINTRAGEN, ['treatment', patients.erika, 'Vierte', 'Immer', null]),
      ),
    ).toBe('22023');
    // Beendet zählt nicht mehr; die Tage bleiben.
    await asUserCommitted(users.therapist, BEENDEN, [erste]);
    await eintragen(users.therapist, 'treatment', patients.erika, 'Vierte', 'Abends', null);
    const daten = await praxis(users.therapist, 'treatment', patients.erika);
    expect(daten!.habits).toHaveLength(4);
    // Laufende zuerst, die beendete zuletzt; ein leeres Wo ist keins.
    expect(daten!.habits.at(-1)).toMatchObject({ id: erste });
    expect(daten!.habits.at(-1)!.ended_at).not.toBeNull();
    expect(daten!.habits.find((h) => h.action === 'Wasser')!.place).toBeNull();
    expect(await fehler(asUser(users.therapist, BEENDEN, [erste]))).toBe('P0002');
  });

  it('kein Durchgriff zwischen den Bereichen, keine fremde Organisation (ADR-021 Punkt 6)', async () => {
    await einwilligung();
    const training = await eintragen(users.trainer, 'training', trainingRelationships.tina);
    const behandlung = await eintragen(users.therapist, 'treatment', patients.erika);
    expect(
      await fehler(asUser(users.trainer, EINTRAGEN, ['treatment', patients.erika, 'a', 'b', null])),
    ).toBe('42501');
    expect(
      await fehler(
        asUser(users.therapist, EINTRAGEN, [
          'training',
          trainingRelationships.tina,
          'a',
          'b',
          null,
        ]),
      ),
    ).toBe('42501');
    expect(await fehler(asUser(users.trainer, BEENDEN, [behandlung]))).toBe('42501');
    expect(await fehler(asUser(users.therapist, BEENDEN, [training]))).toBe('42501');
    expect(await praxis(users.therapist, 'training', trainingRelationships.tina)).toBeNull();
    // Das Büro liest im Training (ADR-021 Punkt 10).
    expect((await praxis(users.office, 'training', trainingRelationships.tina))!.habits).toEqual([
      expect.objectContaining({ id: training }),
    ]);
    const fremd = await fremdeOrganisation();
    expect(
      await fehler(asUser(fremd.owner, EINTRAGEN, ['treatment', patients.erika, 'a', 'b', null])),
    ).toBe('P0002');
    expect(await fehler(asUser(fremd.owner, BEENDEN, [behandlung]))).toBe('P0002');
    // Ein Plattformkonto schreibt die Praxisseite nie (ADR-023 Punkt 21).
    expect(
      await fehler(asUser(erika.konto, EINTRAGEN, ['treatment', patients.erika, 'a', 'b', null])),
    ).toBe('42501');
    expect(await fehler(asUser(erika.konto, BEENDEN, [behandlung]))).toBe('42501');
  });

  it('nicht nach Abschluss eintragen; beenden geht noch', async () => {
    const gewohnheit = await eintragen(users.therapist, 'treatment', patients.erika);
    try {
      await asPostgres(
        `update public.patients
            set care_concluded_on = current_date - 1, care_concluded_at = now(),
                care_concluded_by = $2::uuid
          where id = $1`,
        [patients.erika, users.therapist],
      );
      expect(
        await fehler(
          asUser(users.therapist, EINTRAGEN, ['treatment', patients.erika, 'a', 'b', null]),
        ),
      ).toBe('22023');
      expect((await praxis(users.therapist, 'treatment', patients.erika))!.habits_writable).toBe(
        false,
      );
      await asUserCommitted(users.therapist, BEENDEN, [gewohnheit]);
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('im Training nur mit Einwilligung eintragen (ANN-370)', async () => {
    try {
      await asPostgres(
        'delete from public.training_consent_records where training_relationship_id = $1',
        [trainingRelationships.tina],
      );
      expect(
        await fehler(
          asUser(users.trainer, EINTRAGEN, [
            'training',
            trainingRelationships.tina,
            'a',
            'b',
            null,
          ]),
        ),
      ).toBe('42501');
      expect(
        (await praxis(users.trainer, 'training', trainingRelationships.tina))!.habits_writable,
      ).toBe(false);
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('steht in der Auskunft mit Tagen, ohne Praxiskonto und Zugang (Art. 15)', async () => {
    const gewohnheit = await eintragen(users.therapist, 'treatment', patients.erika);
    await asUserCommitted(erika.konto, VERMERKEN, [erika.zugang, gewohnheit, await tag(0), true]);
    const { rows } = await asUser<{ daten: { tabellen: { habits: Record<string, unknown>[] } } }>(
      users.ownerTherapist,
      'select public.export_patient_record($1::uuid) as daten',
      [patients.erika],
    );
    const [eintrag] = rows[0]!.daten.tabellen.habits;
    expect(Object.keys(eintrag!).sort()).toEqual(
      [
        'action',
        'created_at',
        'cue',
        'ended_at',
        'id',
        'marks',
        'paused',
        'paused_at',
        'place',
        'starts_on',
      ].sort(),
    );
    expect(eintrag!['marks']).toEqual([await tag(0)]);
  });
});

describe('Gewohnheiten auf der Plattform (ALT-003)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.habits');
    await asPostgres('delete from public.audit_log');
  });

  it('zeigt die eigenen Gewohnheiten mit fester Schlüsselliste, ohne Serie oder Quote', async () => {
    await eintragen(users.therapist, 'treatment', patients.erika);
    const daten = await portal(erika.konto, erika.zugang);
    expect(daten).toMatchObject({ mark_days: 7, can_mark: true, consent_needed: false });
    expect(Object.keys(daten!.habits[0]!).sort()).toEqual(
      ['action', 'cue', 'ended_at', 'id', 'marks', 'paused', 'place', 'starts_on'].sort(),
    );
    // Max sieht nichts von Erika.
    expect(
      (await portal(users.plattformPaula, platformAccesses.paulaBegleitungMax))!.habits,
    ).toEqual([]);
  });

  it('vermerkt heute und die sechs Tage davor, nimmt zurück, nichts davor (ANN-370)', async () => {
    const g = await eintragen(users.therapist, 'treatment', patients.erika);
    await seit(g, 30);
    await asUserCommitted(erika.konto, VERMERKEN, [erika.zugang, g, await tag(0), true]);
    await asUserCommitted(erika.konto, VERMERKEN, [erika.zugang, g, await tag(6), true]);
    // Zweimal derselbe Tag ist ein Tag.
    await asUserCommitted(erika.konto, VERMERKEN, [erika.zugang, g, await tag(0), true]);
    for (const zurueck of [7, -1]) {
      expect(
        await fehler(asUser(erika.konto, VERMERKEN, [erika.zugang, g, await tag(zurueck), true])),
      ).toBe('22023');
    }
    let daten = await praxis(users.therapist, 'treatment', patients.erika);
    expect(daten!.habits[0]!.marks).toEqual([await tag(0), await tag(6)]);
    await asUserCommitted(erika.konto, VERMERKEN, [erika.zugang, g, await tag(6), false]);
    daten = await praxis(users.therapist, 'treatment', patients.erika);
    expect(daten!.habits[0]!.marks).toEqual([await tag(0)]);
    // Nicht vor dem Eintragen.
    await seit(g, 2);
    expect(
      await fehler(asUser(erika.konto, VERMERKEN, [erika.zugang, g, await tag(3), true])),
    ).toBe('22023');
  });

  it('pausiert und setzt fort; pausiert wird nichts vermerkt, nichts bricht', async () => {
    const g = await eintragen(users.therapist, 'treatment', patients.erika);
    await asUserCommitted(erika.konto, VERMERKEN, [erika.zugang, g, await tag(0), true]);
    await asUserCommitted(erika.konto, PAUSIEREN, [erika.zugang, g, true]);
    await asUserCommitted(erika.konto, PAUSIEREN, [erika.zugang, g, true]);
    expect((await praxis(users.therapist, 'treatment', patients.erika))!.habits[0]).toMatchObject({
      paused: true,
      marks: [await tag(0)],
    });
    expect(
      await fehler(asUser(erika.konto, VERMERKEN, [erika.zugang, g, await tag(0), false])),
    ).toBe('22023');
    await asUserCommitted(erika.konto, PAUSIEREN, [erika.zugang, g, false]);
    expect((await portal(erika.konto, erika.zugang))!.habits[0]).toMatchObject({ paused: false });
    // Beendet: weder vermerken noch pausieren.
    await asUserCommitted(users.therapist, BEENDEN, [g]);
    expect(
      await fehler(asUser(erika.konto, VERMERKEN, [erika.zugang, g, await tag(0), true])),
    ).toBe('P0002');
    expect(await fehler(asUser(erika.konto, PAUSIEREN, [erika.zugang, g, true]))).toBe('P0002');
  });

  it('nur das eigene Verhältnis: Begleitung, fremde Person, anderer Bereich, Praxiskonto', async () => {
    const max = await eintragen(users.therapist, 'treatment', patients.max);
    const g = await eintragen(users.therapist, 'treatment', patients.erika);
    // Die Begleitung liest, vermerkt aber nicht (wie ANN-352).
    const paula = await portal(users.plattformPaula, platformAccesses.paulaBegleitungMax);
    expect(paula!.can_mark).toBe(false);
    expect(paula!.habits).toEqual([expect.objectContaining({ id: max })]);
    expect(
      await fehler(
        asUser(users.plattformPaula, VERMERKEN, [
          platformAccesses.paulaBegleitungMax,
          max,
          await tag(0),
          true,
        ]),
      ),
    ).toBe('42501');
    // Erika mit Max' Gewohnheit, mit ihrem Training, fremdes Konto, Praxis.
    expect(
      await fehler(asUser(erika.konto, VERMERKEN, [erika.zugang, max, await tag(0), true])),
    ).toBe('P0002');
    expect(
      await fehler(
        asUser(erika.konto, VERMERKEN, [platformAccesses.erikaTraining, g, await tag(0), true]),
      ),
    ).not.toBe('kein Fehler');
    expect(await portal(users.plattformTina, erika.zugang)).toBeNull();
    expect(
      await fehler(asUser(users.plattformTina, VERMERKEN, [erika.zugang, g, await tag(0), true])),
    ).toBe('42501');
    expect(await portal(users.therapist, erika.zugang)).toBeNull();
    expect(await fehler(asUser(users.therapist, PAUSIEREN, [erika.zugang, g, true]))).toBe('42501');
    const fremd = await fremdeOrganisation();
    expect(await portal(fremd.owner, erika.zugang)).toBeNull();
    expect(await fehler(asUser(null, VERMERKEN, [erika.zugang, g, await tag(0), true]))).toBe(
      '42501',
    );
  });

  it('in der Lesefrist wird nicht mehr vermerkt, gelesen schon', async () => {
    const g = await eintragen(users.therapist, 'treatment', patients.erika);
    try {
      await asPostgres(
        `update public.patients
            set care_concluded_on = current_date - 2, care_concluded_at = now(),
                care_concluded_by = $2::uuid
          where id = $1`,
        [patients.erika, users.therapist],
      );
      const p = await portal(erika.konto, erika.zugang);
      expect(p!.can_mark).toBe(false);
      expect(p!.habits).toHaveLength(1);
      expect(
        await fehler(asUser(erika.konto, VERMERKEN, [erika.zugang, g, await tag(0), true])),
      ).toBe('42501');
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('im Training nur mit Einwilligung vermerken (ADR-021 Punkt 4)', async () => {
    const tina = { konto: users.plattformTina, zugang: platformAccesses.tinaTraining };
    await einwilligung();
    const g = await eintragen(users.trainer, 'training', trainingRelationships.tina);
    await asUserCommitted(tina.konto, VERMERKEN, [tina.zugang, g, await tag(0), true]);
    try {
      await asPostgres(
        'delete from public.training_consent_records where training_relationship_id = $1',
        [trainingRelationships.tina],
      );
      expect(await portal(tina.konto, tina.zugang)).toMatchObject({
        can_mark: false,
        consent_needed: true,
      });
      expect(
        await fehler(asUser(tina.konto, VERMERKEN, [tina.zugang, g, await tag(0), false])),
      ).toBe('42501');
      expect(await fehler(asUser(tina.konto, PAUSIEREN, [tina.zugang, g, true]))).toBe('42501');
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('eine rechtliche Vertretung vermerkt; das steht am Tag und im Protokoll (Punkt 24)', async () => {
    try {
      const BERND = 'cafecafe-cafe-4afe-8afe-0000000000c2';
      const KONTO = '99999999-9999-4999-8999-0000000000c2';
      await asPostgres(
        `insert into auth.users (id, aud, role, email)
         values ($1, 'authenticated', 'authenticated', 'bernd.gewohnheit@patient.invalid')`,
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
      const g = await eintragen(users.therapist, 'treatment', patients.erika);
      await asUserCommitted(KONTO, VERMERKEN, [BERND, g, await tag(0), true]);
      const tage = await asPostgres<{ platform_access_kind: string }>(
        'select platform_access_kind from public.habit_marks where habit_id = $1',
        [g],
      );
      expect(tage.rows).toEqual([{ platform_access_kind: 'legal_representative' }]);
      const { rows } = await asPostgres<{ actor_kind: string; view: string }>(
        `select actor_kind, context ->> 'view' as view from public.audit_log
         where actor_user_id = $1 and action = 'platform_representation.read'`,
        [KONTO],
      );
      expect(rows).toContainEqual({ actor_kind: 'representative', view: 'habit' });
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });

  it('steht im eigenen Export (POR-018)', async () => {
    const g = await eintragen(users.therapist, 'treatment', patients.erika);
    await asUserCommitted(erika.konto, VERMERKEN, [erika.zugang, g, await tag(0), true]);
    const { rows } = await asUser<{ daten: { habits: Record<string, unknown>[] } }>(
      erika.konto,
      'select public.platform_export($1::uuid) as daten',
      [erika.zugang],
    );
    expect(rows[0]!.daten.habits).toEqual([
      expect.objectContaining({ id: g, action: 'Zwei Minuten Mobilität', marks: [await tag(0)] }),
    ]);
  });
});
