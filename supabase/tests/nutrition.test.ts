import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { gleichzeitig } from './helpers/gleichzeitig';

/**
 * Ernährungsprofil in der Praxis (ERN-001, ADR-027 Abschnitt A, ADR-021
 * Punkt 11, ADR-008 Fassung 6).
 *
 *   * Allein die Fähigkeit "Ernährungsberatung" (owner, ADR-027 Punkt 4) liest und
 *     schreibt - Büro, Therapie, Teamleitung und Trainingsbetreuung nicht,
 *     auch nicht an "ihrem" Verhältnis; nicht über die Tabelle, nicht über
 *     die Funktionen.
 *   * Ohne Einwilligung kein Profil und kein Eintrag; höchstens ein laufendes
 *     Profil je Person über beide Verhältnisse.
 *   * Lesen steht als Öffnen des Verhältnisses im Protokoll, keine neue
 *     Aktion (ADR-010 Fassung 3).
 *   * Eigene Frist: drei Jahre nach dem Ende; mit dem Verhältnis früher.
 */

const { users, patients, trainingRelationships, organizationId } = SEED;

const ANLEGEN = `select public.create_nutrition_profile($1, $2::uuid, $3::date, $4::smallint,
  $5::numeric, $6, $7::numeric, $8, $9::numeric, $10::numeric, $11) as id`;
const LESEN = 'select public.get_nutrition_profile($1, $2::uuid) as daten';
const AENDERN = `select public.update_nutrition_profile($1::uuid, $2::timestamptz, $3::smallint, $4,
  $5::numeric, $6::numeric, $7, $8, $9::numeric) as stand`;
const UEBERSCHREIBEN = `select public.set_nutrition_overrides($1::uuid, $2::smallint, $3::smallint,
  $4::smallint, $5::smallint, $6::smallint)`;
const NOTIZEN = 'select public.set_nutrition_notes($1::uuid, $2)';
const GEWICHT = 'select public.record_nutrition_weight($1::uuid, $2::date, $3::numeric)';
const EINWILLIGUNG = 'select public.record_nutrition_consent($1::uuid, $2, $3::date) as id';
const BEENDEN = 'select public.end_nutrition_profile($1::uuid, $2::date)';

/** Rollen ohne die Fähigkeit - jede einzeln (ADR-027 Punkt 4). */
const OHNE_FAEHIGKEIT = [
  ['Büro', users.office],
  ['Therapie', users.therapist],
  ['Teamleitung', users.teamLead],
  ['Trainingsbetreuung', users.trainer],
] as const;

interface Profil {
  id: string;
  relationship_kind: string;
  started_on: string;
  ended_on: string | null;
  height_cm: number;
  goal: string;
  target_weight_kg: number | null;
  target_weight_source: string | null;
  notes: string | null;
  diary_enabled: boolean;
  updated_at: string;
  consent: { state: string; occurred_on: string; source: string } | null;
  consent_history: { record_kind: string }[];
  weights: { measured_on: string; weight_kg: number; source: string }[];
  targets: {
    status: string;
    missing?: string[];
    bmr?: { kcal: number; formula: string };
    energy?: { kcal: number; overridden: boolean; below_bmr: boolean };
    protein?: { g: number; g_per_kg: number };
    target_weight?: { kg: number | null; below_floor: boolean };
  };
}

interface Antwort {
  today: string;
  relationship_open: boolean;
  birth_date_known: boolean;
  running_elsewhere: string | null;
  earlier_count: number;
  profile: Profil | null;
}

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

async function heute(zurueck = 0): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    'select (app.training_today($1::uuid) - $2::integer)::text as tag',
    [organizationId, zurueck],
  );
  return rows[0]!.tag;
}

function parameter(
  art: string,
  verhaeltnis: string,
  einwilligung: string | null,
  extra: Partial<{ zielgewicht: number | null; notizen: string | null; koerperfett: number }> = {},
) {
  return [
    art,
    verhaeltnis,
    einwilligung,
    168,
    72.5,
    'female',
    1.6,
    'lose',
    extra.koerperfett ?? null,
    extra.zielgewicht ?? null,
    extra.notizen ?? null,
  ];
}

async function anlegen(
  art = 'treatment',
  verhaeltnis: string = patients.erika,
  extra: Parameters<typeof parameter>[3] = {},
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(
    users.ownerTherapist,
    ANLEGEN,
    parameter(art, verhaeltnis, await heute(), extra),
  );
  return rows[0]!.id;
}

async function lesen(konto: string, art: string, verhaeltnis: string): Promise<Antwort | null> {
  const { rows } = await asUser<{ daten: Antwort | null }>(konto, LESEN, [art, verhaeltnis]);
  return rows[0]!.daten;
}

async function anzahl(sql: string, params: unknown[] = []): Promise<number> {
  const { rows } = await asPostgres<{ n: string }>(sql, params);
  return Number(rows[0]!.n);
}

describe('Ernährungsprofil: Rechte (ERN-001, ADR-027 Punkt 4)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.nutrition_profiles');
  });

  it('owner legt an der Akte an - mit Einwilligung, erstem Gewicht und Zielwerten', async () => {
    const id = await anlegen('treatment', patients.erika, {
      zielgewicht: 65,
      notizen: 'Frühstück fällt oft aus.',
    });
    const daten = await lesen(users.ownerTherapist, 'treatment', patients.erika);
    expect(daten).toMatchObject({
      relationship_open: true,
      birth_date_known: true,
      running_elsewhere: null,
      earlier_count: 0,
    });
    const profil = daten!.profile!;
    expect(profil).toMatchObject({
      id,
      relationship_kind: 'treatment',
      started_on: await heute(),
      ended_on: null,
      height_cm: 168,
      goal: 'lose',
      target_weight_kg: 65,
      target_weight_source: 'counsellor',
      notes: 'Frühstück fällt oft aus.',
      diary_enabled: false,
      consent: { state: 'granted', occurred_on: await heute(), source: 'practice' },
    });
    expect(profil.weights).toEqual([
      { measured_on: await heute(), weight_kg: 72.5, source: 'practice', recorded_by_kind: null },
    ]);
    // Erika ist 1963 geboren - das Alter kommt aus den Stammdaten der Akte.
    expect(profil.targets.status).toBe('ok');
    expect(profil.targets.bmr!.formula).toBe('mifflin_st_jeor');
  });

  it('Büro, Therapie, Teamleitung und Trainingsbetreuung lesen und schreiben nichts', async () => {
    const id = await anlegen();
    const training = await anlegen('training', trainingRelationships.tina);
    for (const [, konto] of OHNE_FAEHIGKEIT) {
      expect(await lesen(konto, 'treatment', patients.erika)).toBeNull();
      // Auch nicht am "eigenen" Verhältnis: Training liest das Büro sonst
      // vollständig (ADR-021 Punkt 10, Ausnahme Punkt 11).
      expect(await lesen(konto, 'training', trainingRelationships.tina)).toBeNull();
      expect(
        await fehler(asUser(konto, ANLEGEN, parameter('treatment', patients.max, await heute()))),
      ).toBe('42501');
      expect(await fehler(asUser(konto, GEWICHT, [id, await heute(), 70]))).toBe('42501');
      expect(await fehler(asUser(konto, NOTIZEN, [training, 'x']))).toBe('42501');
      expect(await fehler(asUser(konto, BEENDEN, [id, await heute()]))).toBe('42501');
      // Die Tabellen geben ohne Fähigkeit keine Zeile her (zweite Linie).
      for (const tabelle of [
        'nutrition_profiles',
        'nutrition_consent_records',
        'nutrition_weight_entries',
      ]) {
        const { rows } = await asUser<{ n: string }>(
          konto,
          `select count(*) as n from public.${tabelle}`,
        );
        expect(Number(rows[0]!.n)).toBe(0);
      }
    }
    // Die Abweisung des Lesens steht im Protokoll (ADR-010 Punkt 16).
    await asUserCommitted(users.office, LESEN, ['treatment', patients.erika]);
    expect(
      await anzahl(
        `select count(*) as n from public.audit_log
          where action = 'access.denied' and actor_user_id = $1
            and context ->> 'operation' = 'nutrition.read'`,
        [users.office],
      ),
    ).toBeGreaterThan(0);
  });

  it('kein Schreibrecht auf den Tabellen, für niemanden', async () => {
    const { rows } = await asPostgres<{ tabelle: string; recht: string }>(
      `select t.tabelle, r.recht
       from unnest(array['nutrition_profiles', 'nutrition_consent_records',
                         'nutrition_weight_entries']) t(tabelle)
       cross join unnest(array['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE']) r(recht)
       cross join unnest(array['anon', 'authenticated']) k(rolle)
       where has_table_privilege(k.rolle, 'public.' || t.tabelle, r.recht)`,
    );
    expect(rows).toEqual([]);
  });

  it('fremde Organisation, Plattformkonto und ohne Anmeldung: nichts', async () => {
    const id = await anlegen();
    const fremd = await fremdeOrganisation();
    expect(await lesen(fremd.owner, 'treatment', patients.erika)).toBeNull();
    expect(
      await fehler(
        asUser(fremd.owner, ANLEGEN, parameter('treatment', patients.max, await heute())),
      ),
    ).toBe('P0002');
    expect(await fehler(asUser(fremd.owner, GEWICHT, [id, await heute(), 70]))).toBe('P0002');
    const { rows } = await asUser<{ n: string }>(
      fremd.owner,
      'select count(*) as n from public.nutrition_profiles',
    );
    expect(Number(rows[0]!.n)).toBe(0);
    // Ein Plattformkonto schreibt und liest die Praxisseite nie (ADR-023 Punkt 21).
    for (const konto of [users.plattformErika, users.plattformTina, users.plattformPaula]) {
      expect(await fehler(asUser(konto, LESEN, ['treatment', patients.erika]))).not.toBe(
        'kein Fehler',
      );
      expect(
        await fehler(asUser(konto, ANLEGEN, parameter('treatment', patients.erika, await heute()))),
      ).toBe('42501');
      expect(await fehler(asUser(konto, GEWICHT, [id, await heute(), 70]))).toBe('42501');
    }
    expect(await fehler(asUser(null, LESEN, ['treatment', patients.erika]))).toBe('42501');
    expect(
      await fehler(asUser(null, ANLEGEN, parameter('treatment', patients.erika, await heute()))),
    ).toBe('42501');
  });
});

describe('Ernährungsprofil: Anlegen, Einwilligung, Gewicht (ERN-001)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.nutrition_profiles');
  });

  it('ohne Einwilligung kein Profil; nicht in der Zukunft', async () => {
    expect(
      await fehler(
        asUser(users.ownerTherapist, ANLEGEN, parameter('treatment', patients.erika, null)),
      ),
    ).toBe('22023');
    expect(
      await fehler(
        asUser(
          users.ownerTherapist,
          ANLEGEN,
          parameter('treatment', patients.erika, await heute(-1)),
        ),
      ),
    ).toBe('22023');
    expect(await anzahl('select count(*) as n from public.nutrition_profiles')).toBe(0);
  });

  it('höchstens ein laufendes Profil je Person, über beide Verhältnisse (Punkt 1)', async () => {
    await anlegen('treatment', patients.erika);
    // Erika hat auch ein Trainingsverhältnis: dort entsteht keines.
    expect(
      await fehler(
        asUser(
          users.ownerTherapist,
          ANLEGEN,
          parameter('training', trainingRelationships.erika, await heute()),
        ),
      ),
    ).toBe('23505');
    // Die Beratung sieht am Training, wo es läuft - aber nicht dessen Inhalt.
    const training = await lesen(users.ownerTherapist, 'training', trainingRelationships.erika);
    expect(training).toMatchObject({ running_elsewhere: 'treatment', profile: null });
    // Nach dem Ende geht ein neues, auch am anderen Verhältnis.
    const id = (await lesen(users.ownerTherapist, 'treatment', patients.erika))!.profile!.id;
    await asUserCommitted(users.ownerTherapist, BEENDEN, [id, await heute()]);
    const neu = await anlegen('training', trainingRelationships.erika);
    const daten = await lesen(users.ownerTherapist, 'training', trainingRelationships.erika);
    expect(daten!.profile!.id).toBe(neu);
    // Ohne Geburtsdatum in den Stammdaten des Trainings: keine Zielwerte,
    // und die Rechnung sagt, was fehlt. Eiweiß im Training ist 1,6 g.
    expect(daten!.birth_date_known).toBe(false);
    expect(daten!.profile!.targets).toEqual({ status: 'missing', missing: ['birth_date'] });
  });

  it('nicht am beendeten Trainingsverhältnis anlegen', async () => {
    try {
      await asPostgres(
        'update public.training_relationships set contract_ended_on = current_date - 1 where id = $1',
        [trainingRelationships.tina],
      );
      expect(
        await fehler(
          asUser(
            users.ownerTherapist,
            ANLEGEN,
            parameter('training', trainingRelationships.tina, await heute()),
          ),
        ),
      ).toBe('22023');
    } finally {
      await asPostgres(
        'update public.training_relationships set contract_ended_on = null where id = $1',
        [trainingRelationships.tina],
      );
    }
  });

  it('Ändern mit Stand, Überschreiben gekennzeichnet, Notizen', async () => {
    const id = await anlegen();
    const vorher = (await lesen(users.ownerTherapist, 'treatment', patients.erika))!.profile!;
    const { rows } = await asUserCommitted<{ stand: string }>(users.ownerTherapist, AENDERN, [
      id,
      vorher.updated_at,
      170,
      'female',
      30,
      1.8,
      'maintain',
      'standard',
      66,
    ]);
    expect(rows[0]!.stand).not.toBe(vorher.updated_at);
    // Ein zweites Ändern mit dem alten Stand scheitert (40001).
    expect(
      await fehler(
        asUser(users.ownerTherapist, AENDERN, [
          id,
          vorher.updated_at,
          170,
          'female',
          30,
          1.8,
          'maintain',
          'standard',
          66,
        ]),
      ),
    ).toBe('40001');
    // Katch-McArdle nur mit Körperfett.
    const jetzt = (await lesen(users.ownerTherapist, 'treatment', patients.erika))!.profile!;
    expect(jetzt.targets.bmr!.formula).toBe('cunningham');
    expect(
      await fehler(
        asUser(users.ownerTherapist, AENDERN, [
          id,
          jetzt.updated_at,
          170,
          'female',
          null,
          1.8,
          'maintain',
          'katch_mcardle',
          66,
        ]),
      ),
    ).toBe('23514');

    // Punkt 22: auch unter den Grundumsatz, dann gekennzeichnet.
    await asUserCommitted(users.ownerTherapist, UEBERSCHREIBEN, [id, 900, 120, null, null, null]);
    const ueber = (await lesen(users.ownerTherapist, 'treatment', patients.erika))!.profile!;
    expect(ueber.targets.energy).toMatchObject({ kcal: 900, overridden: true, below_bmr: true });
    expect(ueber.targets.protein!.g).toBe(120);
    // Leer heißt wieder berechnet.
    await asUserCommitted(users.ownerTherapist, UEBERSCHREIBEN, [id, null, null, null, null, null]);
    const berechnet = (await lesen(users.ownerTherapist, 'treatment', patients.erika))!.profile!;
    expect(berechnet.targets.energy).toMatchObject({ overridden: false, below_bmr: false });

    await asUserCommitted(users.ownerTherapist, NOTIZEN, [id, '  Isst gern warm.  ']);
    expect((await lesen(users.ownerTherapist, 'treatment', patients.erika))!.profile!.notes).toBe(
      'Isst gern warm.',
    );
    expect(await fehler(asUser(users.ownerTherapist, NOTIZEN, [id, 'x'.repeat(4001)]))).toBe(
      '23514',
    );
  });

  it('ein Zielgewicht der Beratung unter BMI 18,5 ist erlaubt und gekennzeichnet', async () => {
    await anlegen('treatment', patients.erika, { zielgewicht: 50 });
    // 168 cm: 18,5 × 1,68² = 52,2 kg.
    const profil = (await lesen(users.ownerTherapist, 'treatment', patients.erika))!.profile!;
    expect(profil.targets.target_weight).toMatchObject({ kg: 50, below_floor: true });
  });

  it('Gewicht eines je Tag, nicht in der Zukunft, nicht vor dem Profil', async () => {
    const id = await anlegen();
    await asUserCommitted(users.ownerTherapist, GEWICHT, [id, await heute(), 71.9]);
    const profil = (await lesen(users.ownerTherapist, 'treatment', patients.erika))!.profile!;
    expect(profil.weights).toHaveLength(1);
    expect(profil.weights[0]!.weight_kg).toBe(71.9);
    expect(await fehler(asUser(users.ownerTherapist, GEWICHT, [id, await heute(-1), 71]))).toBe(
      '22023',
    );
    expect(await fehler(asUser(users.ownerTherapist, GEWICHT, [id, await heute(1), 71]))).toBe(
      '22023',
    );
    expect(await fehler(asUser(users.ownerTherapist, GEWICHT, [id, await heute(), 10]))).toBe(
      '23514',
    );
  });

  it('nach dem Widerruf kein Eintrag; beenden geht; erneut erteilen öffnet wieder', async () => {
    const id = await anlegen();
    await asUserCommitted(users.ownerTherapist, EINWILLIGUNG, [
      id,
      'consent_withdrawn',
      await heute(),
    ]);
    const profil = (await lesen(users.ownerTherapist, 'treatment', patients.erika))!.profile!;
    expect(profil.consent).toMatchObject({ state: 'withdrawn' });
    expect(profil.consent_history.map((r) => r.record_kind)).toEqual([
      'consent_withdrawn',
      'consent_granted',
    ]);
    expect(await fehler(asUser(users.ownerTherapist, GEWICHT, [id, await heute(), 70]))).toBe(
      '42501',
    );
    expect(await fehler(asUser(users.ownerTherapist, NOTIZEN, [id, 'x']))).toBe('42501');
    expect(
      await fehler(
        asUser(users.ownerTherapist, UEBERSCHREIBEN, [id, 2000, null, null, null, null]),
      ),
    ).toBe('42501');
    expect(
      await fehler(
        asUser(users.ownerTherapist, EINWILLIGUNG, [id, 'consent_withdrawn', await heute()]),
      ),
    ).toBe('23514');
    // Die erneute Einwilligung liegt nicht vor dem Widerruf, den sie aufhebt
    // (Art. 7 Abs. 1 DSGVO, Zweitreview ERN-EPIC-001).
    expect(
      await fehler(
        asUser(users.ownerTherapist, EINWILLIGUNG, [id, 'consent_granted', await heute(1)]),
      ),
    ).toBe('22023');
    await asUserCommitted(users.ownerTherapist, EINWILLIGUNG, [
      id,
      'consent_granted',
      await heute(),
    ]);
    await asUserCommitted(users.ownerTherapist, GEWICHT, [id, await heute(), 70]);
    await asUserCommitted(users.ownerTherapist, BEENDEN, [id, await heute()]);
    // Beendet ist unveränderlich.
    expect(await fehler(asUser(users.ownerTherapist, GEWICHT, [id, await heute(), 69]))).toBe(
      '22023',
    );
    expect(await fehler(asUser(users.ownerTherapist, BEENDEN, [id, await heute()]))).toBe('22023');
  });

  it('Lesen steht als Öffnen der Akte bzw. des Trainingsverhältnisses im Protokoll', async () => {
    await anlegen();
    await asPostgres("delete from public.audit_log where action = 'patient_record.viewed'");
    await asUserCommitted(users.ownerTherapist, LESEN, ['treatment', patients.erika]);
    const { rows } = await asPostgres<{ action: string; subject_id: string; view: string }>(
      `select action, subject_id, context ->> 'view' as view from public.audit_log
        where actor_user_id = $1 and action like '%.viewed'`,
      [users.ownerTherapist],
    );
    expect(rows).toEqual([
      { action: 'patient_record.viewed', subject_id: patients.erika, view: 'nutrition' },
    ]);
    // Keine neue Aktion (ADR-010 Fassung 3).
    expect(
      await anzahl("select count(*) as n from public.audit_log where action like 'nutrition%'"),
    ).toBe(0);
  });
});

describe('Ernährungsprofil: Frist, Auskunft, Zusammenführen (ERN-001)', () => {
  beforeEach(async () => {
    await resetDatabase();
    // Der Seed trägt ein laufendes Profil an Erikas Akte.
    await asPostgres('delete from public.nutrition_profiles');
  }, 120_000);

  async function zurueckdatieren(id: string, endeVorTagen: number) {
    await asPostgres(
      `update public.nutrition_profiles
          set started_on = current_date - ($2::integer + 30), ended_on = current_date - $2::integer,
              ended_by = $3::uuid
        where id = $1`,
      [id, endeVorTagen, users.ownerTherapist],
    );
  }

  it('fällt drei Jahre nach dem Ende mit Einwilligung und Gewicht, mit Eintrag im Löschjournal', async () => {
    const id = await anlegen();
    const training = await anlegen('training', trainingRelationships.tina);
    await zurueckdatieren(id, 3 * 366);
    // Zwei Jahre nach dem Ende bleibt es.
    await zurueckdatieren(training, 2 * 365);
    await asPostgres('select public.apply_retention()');
    expect(
      await anzahl('select count(*) as n from public.nutrition_profiles where id = $1', [id]),
    ).toBe(0);
    expect(
      await anzahl(
        'select count(*) as n from public.nutrition_consent_records where profile_id = $1',
        [id],
      ),
    ).toBe(0);
    expect(
      await anzahl(
        'select count(*) as n from public.nutrition_weight_entries where profile_id = $1',
        [id],
      ),
    ).toBe(0);
    expect(
      await anzahl(
        `select count(*) as n from public.deletion_journal
          where target_table = 'nutrition_profiles' and target_id = $1
            and retention_class = 'ernaehrungsberatung'`,
        [id],
      ),
    ).toBe(1);
    expect(
      await anzahl('select count(*) as n from public.nutrition_profiles where id = $1', [training]),
    ).toBe(1);
    // Die Akte bleibt: Die Frist des Profils ist unabhängig von ihrer.
    expect(
      await anzahl('select count(*) as n from public.patients where id = $1', [patients.erika]),
    ).toBe(1);
    // Ein laufendes Profil fällt nie.
    const laufend = await anlegen('treatment', patients.max);
    await asPostgres('select public.apply_retention()');
    expect(
      await anzahl('select count(*) as n from public.nutrition_profiles where id = $1', [laufend]),
    ).toBe(1);
  });

  it('ein Legal Hold an der Akte hält; nach dem Restore fällt es erneut', async () => {
    const id = await anlegen();
    await zurueckdatieren(id, 3 * 366);
    await asPostgres(
      `insert into public.legal_holds (organization_id, subject_type, subject_id, reason, placed_by)
       values ($1, 'patient', $2, 'Synthetische Anfrage', $3)`,
      [organizationId, patients.erika, users.ownerTherapist],
    );
    await asPostgres('select public.apply_retention()');
    expect(
      await anzahl('select count(*) as n from public.nutrition_profiles where id = $1', [id]),
    ).toBe(1);

    await asPostgres('delete from public.legal_holds');
    await asPostgres('select public.apply_retention()');
    expect(
      await anzahl('select count(*) as n from public.nutrition_profiles where id = $1', [id]),
    ).toBe(0);
    // Restore: die Zeile ist wieder da - die Wiederanwendung nimmt sie erneut.
    await asPostgres(
      `insert into public.nutrition_profiles (id, organization_id, relationship_kind,
         relationship_id, patient_id, started_on, ended_on, ended_by, height_cm, formula_sex,
         activity_pal, goal, created_by)
       values ($1, $2, 'treatment', $3, $3, current_date - 1200, current_date - 1100, $4, 168,
               'female', 1.6, 'lose', $4)`,
      [id, organizationId, patients.erika, users.ownerTherapist],
    );
    await asPostgres('select public.reapply_deletion_journal()');
    expect(
      await anzahl('select count(*) as n from public.nutrition_profiles where id = $1', [id]),
    ).toBe(0);
  });

  it('fällt das Verhältnis früher, fällt das Profil mit ihm', async () => {
    await anlegen('training', trainingRelationships.tina);
    await asPostgres(
      `update public.training_relationships
          set contract_started_on = current_date - 5 * 366, contract_ended_on = current_date - 4 * 366
        where id = $1`,
      [trainingRelationships.tina],
    );
    await asPostgres('select public.apply_retention()');
    expect(
      await anzahl('select count(*) as n from public.training_relationships where id = $1', [
        trainingRelationships.tina,
      ]),
    ).toBe(0);
    expect(
      await anzahl(
        'select count(*) as n from public.nutrition_profiles where training_relationship_id = $1',
        [trainingRelationships.tina],
      ),
    ).toBe(0);
  });

  it('die Teillöschung des Trainingsverhältnisses unter Belegfrist nimmt auch ein laufendes Profil', async () => {
    // Ein nie beendetes Profil hat keinen eigenen Fristanker; es fällt mit
    // dem Verhältnis, auch wenn dessen Belege bleiben (ADR-027 Punkt 6).
    const id = await anlegen('training', trainingRelationships.tina);
    await asPostgres(
      'select app.reduce_training_relationship($1::uuid, extensions.gen_random_uuid(), now())',
      [trainingRelationships.tina],
    );
    for (const sql of [
      'select count(*) as n from public.nutrition_profiles where id = $1',
      'select count(*) as n from public.nutrition_consent_records where profile_id = $1',
      'select count(*) as n from public.nutrition_weight_entries where profile_id = $1',
    ]) {
      expect(await anzahl(sql, [id])).toBe(0);
    }
    expect(
      await anzahl(
        `select count(*) as n from public.deletion_journal
          where target_table = 'nutrition_profiles' and target_id = $1
            and retention_class = 'trainingsverhaeltnis'`,
        [id],
      ),
    ).toBe(1);
    expect(
      await anzahl('select count(*) as n from public.training_relationships where id = $1', [
        trainingRelationships.tina,
      ]),
    ).toBe(1);

    // Restore: die Zeile ist wieder da - die Wiederanwendung nimmt sie erneut.
    await asPostgres(
      `insert into public.nutrition_profiles (id, organization_id, relationship_kind,
         relationship_id, training_relationship_id, started_on, height_cm, formula_sex,
         activity_pal, goal, created_by)
       values ($1, $2, 'training', $3, $3, current_date - 10, 175, 'female', 1.6, 'gain', $4)`,
      [id, organizationId, trainingRelationships.tina, users.ownerTherapist],
    );
    await asPostgres('select public.reapply_deletion_journal()');
    expect(
      await anzahl('select count(*) as n from public.nutrition_profiles where id = $1', [id]),
    ).toBe(0);
  });

  it('steht vollständig in der Auskunft nach Art. 15 - nur das der Akte', async () => {
    const id = await anlegen('treatment', patients.erika, { notizen: 'Synthetische Notiz' });
    await anlegen('training', trainingRelationships.tina);
    const { rows } = await asUser<{
      daten: { tabellen: { nutrition_profiles: Profil[] } };
    }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as daten', [
      patients.erika,
    ]);
    const [profil, ...rest] = rows[0]!.daten.tabellen.nutrition_profiles;
    expect(rest).toEqual([]);
    expect(profil).toMatchObject({
      id,
      notes: 'Synthetische Notiz',
      consent: { state: 'granted' },
    });
    expect(profil!.weights).toHaveLength(1);
    expect(profil!.consent_history).toHaveLength(1);
    expect(profil!.targets.status).toBe('ok');
  });

  it('zwei laufende Profile sperren das Zusammenführen, ohne Zähler im Plan', async () => {
    await anlegen('treatment', patients.max);
    await anlegen('treatment', patients.erika);
    const { rows } = await asUser<{ plan: { blockers: string[] } }>(
      users.ownerTherapist,
      'select public.preview_patient_merge($1::uuid, $2::uuid) as plan',
      [patients.max, patients.erika],
    );
    expect(rows[0]!.plan.blockers).toContain('nutrition_profile_overlap');

    await asPostgres('delete from public.nutrition_profiles where patient_id = $1', [
      patients.erika,
    ]);
    const { rows: plan } = await asUser<{ plan: { blockers: string[]; counts: object } }>(
      users.ownerTherapist,
      'select public.preview_patient_merge($1::uuid, $2::uuid) as plan',
      [patients.max, patients.erika],
    );
    expect(plan[0]!.plan.blockers).not.toContain('nutrition_profile_overlap');
    // Kein Zähler: Den Vermerk lesen auch Rollen ohne die Fähigkeit.
    expect(Object.keys(plan[0]!.plan.counts)).not.toContain('nutrition_profiles');

    // Auch ein laufendes Profil am Trainingsverhältnis der bleibenden Person
    // sperrt: Maxens Profil zöge zu ihr, und sie hätte zwei (Zweitreview).
    await anlegen('training', trainingRelationships.erika);
    const { rows: training } = await asUser<{ plan: { blockers: string[] } }>(
      users.ownerTherapist,
      'select public.preview_patient_merge($1::uuid, $2::uuid) as plan',
      [patients.max, patients.erika],
    );
    expect(training[0]!.plan.blockers).toContain('nutrition_profile_overlap');
  });
});

/** Nach dem Zusammenführen hängt das Profil an der bleibenden Akte. */
describe('Ernährungsprofil: Zusammenführen (ERN-001)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await asPostgres('delete from public.nutrition_profiles');
  }, 120_000);

  it('zieht mit Einwilligung und Gewicht an die bleibende Akte', async () => {
    const id = await anlegen('treatment', patients.petra);
    const vorher = await anzahl(
      'select count(*) as n from public.nutrition_weight_entries where profile_id = $1',
      [id],
    );
    await asUserCommitted(
      users.ownerTherapist,
      'select public.merge_patients($1::uuid, $2::uuid) as erg',
      [patients.petra, patients.max],
    );
    const { rows } = await asPostgres<{ patient_id: string; relationship_id: string }>(
      'select patient_id, relationship_id from public.nutrition_profiles where id = $1',
      [id],
    );
    expect(rows).toEqual([{ patient_id: patients.max, relationship_id: patients.max }]);
    expect(
      await anzahl(
        'select count(*) as n from public.nutrition_weight_entries where profile_id = $1',
        [id],
      ),
    ).toBe(vorher);
  });
});

/** Zusammenführen neben einem gleichzeitigen Anlegen: dieselbe Sperre je Person. */
describe('Ernährungsprofil: Zusammenführen neben dem Anlegen (ERN-001)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await asPostgres('delete from public.nutrition_profiles');
  }, 120_000);

  it('wartet auf das Anlegen bei der bleibenden Person und sperrt dann', async () => {
    // Maxens Profil zöge zu Erika; währenddessen legt die Beratung eines an
    // Erikas Trainingsverhältnis an. Das Zusammenführen wartet auf diese
    // Sperre und sieht danach zwei laufende Profile (ADR-027 Punkt 1).
    await anlegen('treatment', patients.max);
    const ergebnis = await gleichzeitig(
      {
        konto: users.ownerTherapist,
        sql: ANLEGEN,
        params: parameter('training', trainingRelationships.erika, await heute()),
      },
      {
        konto: users.ownerTherapist,
        sql: 'select public.merge_patients($1::uuid, $2::uuid)',
        params: [patients.max, patients.erika],
      },
    );
    expect(ergebnis?.code).toBe('22023');
    expect(ergebnis?.message).toContain('nutrition_profile_overlap');
  });
});
