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
 * Ernährung auf der Plattform (ERN-002, ADR-027 Punkte 2, 3, 5, 21; ADR-023
 * Punkte 13, 19, 22 bis 24).
 *
 *   * Die Person und ihre rechtliche Vertretung sehen die laufende Beratung
 *     am Verhältnis ihres Zugangs - mit fester Schlüsselliste, ohne Notizen.
 *   * Die Begleitung sieht nichts, auch nicht lesend.
 *   * Negativfälle nach Punkt 23: fremde Person, anderer Leistungsbereich,
 *     Zugang gesperrt und entzogen, Lesefrist, Praxiskonto, andere
 *     Organisation.
 *   * Zielgewicht nicht unter BMI 18,5; Tagebuch an nur mit Einwilligung;
 *     nach dem Widerruf kein Eintrag.
 */

const { users, patients, platformAccesses, organizationId } = SEED;
const erika = { konto: users.plattformErika, zugang: platformAccesses.erikaBehandlung };
/** Das Profil an Erikas Akte aus dem Seed. */
const PROFIL = 'f0f0f0f0-f0f0-4f0f-8f0f-000000000001';

const LESEN = 'select public.platform_nutrition($1::uuid) as daten';
const GEWICHT = 'select public.record_platform_nutrition_weight($1::uuid, $2::date, $3::numeric)';
const ZIELGEWICHT = 'select public.set_platform_nutrition_target_weight($1::uuid, $2::numeric)';
const TAGEBUCH = 'select public.set_platform_nutrition_diary($1::uuid, $2)';
const EINWILLIGUNG = 'select public.record_platform_nutrition_consent($1::uuid, $2, $3) as id';
const FASSUNG = '2026-10';

interface Sicht {
  today: string;
  can_write: boolean;
  can_grant: boolean;
  wording_version: string;
  target_weight_floor_kg: number;
  profile: Record<string, unknown> & {
    weights: { measured_on: string; weight_kg: number; source: string }[];
    consent: { state: string } | null;
    target_weight_kg: number | null;
    target_weight_source: string | null;
    diary_enabled: boolean;
    targets: { status: string };
  };
}

async function fehler(versuch: Promise<unknown>): Promise<string> {
  try {
    await versuch;
  } catch (e) {
    return String((e as { code?: string }).code ?? e);
  }
  return 'kein Fehler';
}

async function lesen(konto: string | null, zugang: string): Promise<Sicht | null> {
  const { rows } = await asUser<{ daten: Sicht | null }>(konto, LESEN, [zugang]);
  return rows[0]!.daten;
}

async function heute(zurueck = 0): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    'select (app.training_today($1::uuid) - $2::integer)::text as tag',
    [organizationId, zurueck],
  );
  return rows[0]!.tag;
}

describe('Ernährung auf der Plattform: Lesen und Grenzen (ERN-002)', () => {
  beforeAll(async () => {
    await resetDatabase();
    await fremdeOrganisation();
  }, 120_000);

  it('zeigt der Person ihre Beratung mit fester Schlüsselliste, ohne Notizen', async () => {
    const sicht = await lesen(erika.konto, erika.zugang);
    expect(sicht).toMatchObject({
      can_write: true,
      can_grant: false,
      wording_version: FASSUNG,
      // 168 cm: 18,5 × 1,68² = 52,21 kg, aufgerundet 52,3 kg.
      target_weight_floor_kg: 52.3,
    });
    expect(Object.keys(sicht!.profile).sort()).toEqual(
      [
        'activity_pal',
        'body_fat_percent',
        'consent',
        'diary_changed_at',
        'diary_enabled',
        'ended_on',
        'formula_sex',
        'goal',
        'height_cm',
        'started_on',
        'target_weight_kg',
        'target_weight_source',
        'targets',
        'weights',
      ].sort(),
    );
    expect(JSON.stringify(sicht)).not.toContain('Frühstück');
    expect(sicht!.profile.consent).toEqual({
      state: 'granted',
      occurred_on: await heute(21),
      source: 'practice',
    });
    expect(sicht!.profile.weights).toHaveLength(3);
    expect(sicht!.profile.targets.status).toBe('ok');
  });

  it('anderer Leistungsbereich, fremde Person, Praxiskonto, fremde Organisation: nichts', async () => {
    // Erikas Training: dort läuft keine Beratung - die der Akte bleibt dort.
    expect(await lesen(erika.konto, platformAccesses.erikaTraining)).toEqual({ profile: null });
    expect(await lesen(users.plattformTina, erika.zugang)).toBeNull();
    for (const konto of [users.ownerTherapist, users.office, users.therapist]) {
      expect(await lesen(konto, erika.zugang)).toBeNull();
      expect(await fehler(asUser(konto, GEWICHT, [erika.zugang, await heute(), 70]))).toBe('42501');
    }
    const fremd = await fremdeOrganisation();
    expect(await lesen(fremd.owner, erika.zugang)).toBeNull();
    expect(await lesen(null, erika.zugang)).toBeNull();
    expect(
      await fehler(asUser(users.plattformTina, GEWICHT, [erika.zugang, await heute(), 70])),
    ).toBe('42501');
    expect(
      await fehler(
        asUser(erika.konto, GEWICHT, [platformAccesses.erikaTraining, await heute(), 70]),
      ),
    ).toBe('P0002');
  });

  it('die Begleitung sieht nichts und schreibt nichts (ADR-027 Punkt 3)', async () => {
    await asUserCommitted(
      users.ownerTherapist,
      `select public.create_nutrition_profile('treatment', $1::uuid, $2::date, 180::smallint,
         80::numeric, 'male', 1.4::numeric, 'maintain', null::numeric, null::numeric, null)`,
      [patients.max, await heute()],
    );
    const paula = platformAccesses.paulaBegleitungMax;
    expect(await lesen(users.plattformPaula, paula)).toBeNull();
    for (const [sql, werte] of [
      [GEWICHT, [paula, await heute(), 70]],
      [ZIELGEWICHT, [paula, 75]],
      [TAGEBUCH, [paula, true]],
      [EINWILLIGUNG, [paula, false, FASSUNG]],
      // Erst das Recht, dann die Eingabe: auch leer kein Hinweis aufs Profil.
      [TAGEBUCH, [paula, null]],
      [EINWILLIGUNG, [paula, null, FASSUNG]],
    ] as const) {
      expect(await fehler(asUser(users.plattformPaula, sql, [...werte]))).toBe('42501');
    }
    const { rows } = await asUser<{ daten: Record<string, unknown> | null }>(
      users.plattformPaula,
      'select public.platform_export($1::uuid) as daten',
      [paula],
    ).catch(() => ({ rows: [{ daten: null }] }));
    expect(rows[0]!.daten).toBeNull();
  });

  it('gesperrter und entzogener Zugang: nichts', async () => {
    for (const zustand of ['locked', 'revoked'] as const) {
      try {
        await asPostgres(
          `update public.platform_accesses
              set status = $2,
                  locked_at = case when $2 = 'locked' then now() end,
                  locked_by = case when $2 = 'locked' then $3::uuid end,
                  revoked_at = case when $2 = 'revoked' then now() end,
                  revoked_by = case when $2 = 'revoked' then $3::uuid end,
                  revoked_reason = case when $2 = 'revoked' then 'practice' end
            where id = $1`,
          [erika.zugang, zustand, users.office],
        );
        expect(await lesen(erika.konto, erika.zugang)).toBeNull();
        expect(await fehler(asUser(erika.konto, GEWICHT, [erika.zugang, await heute(), 70]))).toBe(
          '42501',
        );
      } finally {
        await resetDatabase();
        await fremdeOrganisation();
      }
    }
  });

  it('in der Lesefrist liest die Person, schreibt nicht, widerruft aber', async () => {
    try {
      await asPostgres(
        `update public.patients
            set care_concluded_on = current_date - 2, care_concluded_at = now(),
                care_concluded_by = $2::uuid
          where id = $1`,
        [patients.erika, users.therapist],
      );
      const sicht = await lesen(erika.konto, erika.zugang);
      expect(sicht).toMatchObject({ can_write: false, can_grant: false });
      expect(await fehler(asUser(erika.konto, GEWICHT, [erika.zugang, await heute(), 70]))).toBe(
        '42501',
      );
      expect(await fehler(asUser(erika.konto, ZIELGEWICHT, [erika.zugang, 70]))).toBe('42501');
      await asUserCommitted(erika.konto, EINWILLIGUNG, [erika.zugang, false, FASSUNG]);
      expect(await fehler(asUser(erika.konto, EINWILLIGUNG, [erika.zugang, true, FASSUNG]))).toBe(
        '42501',
      );
    } finally {
      await resetDatabase();
      await fremdeOrganisation();
    }
  });
});

describe('Ernährung auf der Plattform: Schreiben (ERN-002)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('Gewicht eines je Tag; der jüngste Eintrag des Tages gilt', async () => {
    await asUserCommitted(erika.konto, GEWICHT, [erika.zugang, await heute(), 72.9]);
    await asUserCommitted(erika.konto, GEWICHT, [erika.zugang, await heute(), 72.7]);
    const sicht = await lesen(erika.konto, erika.zugang);
    expect(sicht!.profile.weights[0]).toEqual({
      measured_on: await heute(),
      weight_kg: 72.7,
      source: 'platform',
    });
    expect(sicht!.profile.weights).toHaveLength(4);
    expect(await fehler(asUser(erika.konto, GEWICHT, [erika.zugang, await heute(-1), 72]))).toBe(
      '22023',
    );
    expect(await fehler(asUser(erika.konto, GEWICHT, [erika.zugang, await heute(30), 72]))).toBe(
      '22023',
    );
    expect(await fehler(asUser(erika.konto, GEWICHT, [erika.zugang, await heute(), 10]))).toBe(
      '23514',
    );
    // In der Praxis steht, dass die Person eingetragen hat.
    const { rows } = await asPostgres<{ source: string; platform_access_kind: string }>(
      `select source, platform_access_kind from public.nutrition_weight_entries
        where profile_id = $1 and measured_on = $2::date`,
      [PROFIL, await heute()],
    );
    expect(rows).toEqual([{ source: 'platform', platform_access_kind: 'self' }]);
  });

  it('Zielgewicht frei wählbar, aber nicht unter BMI 18,5 (Punkt 21)', async () => {
    expect(await fehler(asUser(erika.konto, ZIELGEWICHT, [erika.zugang, 52]))).toBe('22023');
    await asUserCommitted(erika.konto, ZIELGEWICHT, [erika.zugang, 52.3]);
    let sicht = await lesen(erika.konto, erika.zugang);
    expect(sicht!.profile).toMatchObject({
      target_weight_kg: 52.3,
      target_weight_source: 'person',
    });
    await asUserCommitted(erika.konto, ZIELGEWICHT, [erika.zugang, null]);
    sicht = await lesen(erika.konto, erika.zugang);
    expect(sicht!.profile).toMatchObject({ target_weight_kg: null, target_weight_source: null });
  });

  it('Tagebuch: an nur mit Einwilligung, aus immer; von Anfang an aus', async () => {
    expect((await lesen(erika.konto, erika.zugang))!.profile.diary_enabled).toBe(false);
    await asUserCommitted(erika.konto, TAGEBUCH, [erika.zugang, true]);
    expect((await lesen(erika.konto, erika.zugang))!.profile.diary_enabled).toBe(true);
    await asUserCommitted(erika.konto, EINWILLIGUNG, [erika.zugang, false, FASSUNG]);
    expect(await fehler(asUser(erika.konto, TAGEBUCH, [erika.zugang, true]))).toBe('42501');
    await asUserCommitted(erika.konto, TAGEBUCH, [erika.zugang, false]);
    const { rows } = await asPostgres<{ diary_enabled: boolean; diary_changed_by_kind: string }>(
      'select diary_enabled, diary_changed_by_kind from public.nutrition_profiles where id = $1',
      [PROFIL],
    );
    expect(rows).toEqual([{ diary_enabled: false, diary_changed_by_kind: 'self' }]);
  });

  it('Widerruf hält alles an; erneut erteilen öffnet; Fassung des Texts zählt', async () => {
    expect(await fehler(asUser(erika.konto, EINWILLIGUNG, [erika.zugang, false, '2020-01']))).toBe(
      '22023',
    );
    expect(await fehler(asUser(erika.konto, EINWILLIGUNG, [erika.zugang, true, FASSUNG]))).toBe(
      '23514',
    );
    await asUserCommitted(erika.konto, EINWILLIGUNG, [erika.zugang, false, FASSUNG]);
    const sicht = await lesen(erika.konto, erika.zugang);
    expect(sicht).toMatchObject({ can_write: false, can_grant: true });
    expect(sicht!.profile.consent).toMatchObject({ state: 'withdrawn', source: 'platform' });
    expect(await fehler(asUser(erika.konto, GEWICHT, [erika.zugang, await heute(), 70]))).toBe(
      '42501',
    );
    expect(await fehler(asUser(erika.konto, ZIELGEWICHT, [erika.zugang, 70]))).toBe('42501');
    // Die Beratung sieht den Widerruf in Offene Punkte - nur sie.
    const { rows: liste } = await asUser<{ purpose: string; patient_id: string }>(
      users.ownerTherapist,
      'select purpose, patient_id from public.list_platform_consent_withdrawals()',
    );
    expect(liste).toContainEqual({ purpose: 'nutrition_counselling', patient_id: patients.erika });
    for (const konto of [users.office, users.therapist, users.trainer]) {
      const { rows } = await asUser<{ purpose: string }>(
        konto,
        'select purpose from public.list_platform_consent_withdrawals()',
      );
      expect(rows.map((r) => r.purpose)).not.toContain('nutrition_counselling');
    }
    await asUserCommitted(erika.konto, EINWILLIGUNG, [erika.zugang, true, FASSUNG]);
    await asUserCommitted(erika.konto, GEWICHT, [erika.zugang, await heute(), 70]);
    const { rows } = await asPostgres<{
      record_kind: string;
      source: string;
      wording_version: string;
    }>(
      `select record_kind, source, wording_version from public.nutrition_consent_records
        where profile_id = $1 order by recorded_at`,
      [PROFIL],
    );
    expect(rows).toEqual([
      { record_kind: 'consent_granted', source: 'practice', wording_version: null },
      { record_kind: 'consent_withdrawn', source: 'platform', wording_version: FASSUNG },
      { record_kind: 'consent_granted', source: 'platform', wording_version: FASSUNG },
    ]);
  });

  it('eine beendete Beratung zeigt die Plattform nicht mehr', async () => {
    await asPostgres(
      'update public.nutrition_profiles set ended_on = current_date, ended_by = $2 where id = $1',
      [PROFIL, users.ownerTherapist],
    );
    expect(await lesen(erika.konto, erika.zugang)).toEqual({ profile: null });
    expect(await fehler(asUser(erika.konto, GEWICHT, [erika.zugang, await heute(), 70]))).toBe(
      'P0002',
    );
  });

  it('die rechtliche Vertretung handelt wie die Person; das steht im Protokoll', async () => {
    const BERND = 'cafecafe-cafe-4afe-8afe-0000000000e2';
    const KONTO = '99999999-9999-4999-8999-0000000000e2';
    await asPostgres(
      `insert into auth.users (id, aud, role, email)
       values ($1, 'authenticated', 'authenticated', 'bernd.ernaehrung@patient.invalid')`,
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
    expect((await lesen(KONTO, BERND))!.can_write).toBe(true);
    await asUserCommitted(KONTO, GEWICHT, [BERND, await heute(), 73.2]);
    await asUserCommitted(KONTO, EINWILLIGUNG, [BERND, false, FASSUNG]);
    const { rows: einw } = await asPostgres<{ representative_name: string }>(
      `select representative_name from public.nutrition_consent_records
        where profile_id = $1 and source = 'platform'`,
      [PROFIL],
    );
    expect(einw).toEqual([{ representative_name: 'Bernd Betreuer' }]);
    const { rows } = await asPostgres<{ view: string }>(
      `select context ->> 'view' as view from public.audit_log
        where actor_user_id = $1 and action = 'platform_representation.read' order by occurred_at`,
      [KONTO],
    );
    // Höchstens ein Eintrag je Tag und Akte (ADR-010 Punkt 16): der erste
    // Vorgang des Tages.
    expect(rows.map((r) => r.view)).toEqual(['nutrition_weight']);
    // Die Person selbst liest ohne Protokolleintrag (ADR-023 Punkt 24).
    await asUserCommitted(erika.konto, LESEN, [erika.zugang]);
    const { rows: selbst } = await asPostgres<{ n: string }>(
      `select count(*) as n from public.audit_log
        where actor_user_id = $1 and action = 'platform_representation.read'`,
      [erika.konto],
    );
    expect(Number(selbst[0]!.n)).toBe(0);
  });

  it('steht im eigenen Export, ohne Notizen (Art. 20)', async () => {
    const { rows } = await asUser<{ daten: { nutrition: Record<string, unknown>[] } }>(
      erika.konto,
      'select public.platform_export($1::uuid) as daten',
      [erika.zugang],
    );
    expect(rows[0]!.daten.nutrition).toHaveLength(1);
    expect(rows[0]!.daten.nutrition[0]).toMatchObject({ goal: 'lose', height_cm: 168 });
    expect(JSON.stringify(rows[0]!.daten.nutrition)).not.toContain('Frühstück');
    // Das Training derselben Person trägt nichts davon (§4.8).
    const { rows: training } = await asUser<{ daten: { nutrition: unknown[] } }>(
      erika.konto,
      'select public.platform_export($1::uuid) as daten',
      [platformAccesses.erikaTraining],
    );
    expect(training[0]!.daten.nutrition).toEqual([]);
  });
});
