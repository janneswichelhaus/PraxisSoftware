import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  abgefangen,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Einwilligungen in der Behandlung über die Plattform (POR-016; ADR-023
 * Punkte 13, 19, 23, 24; DSN-001 D2; PAT-006; ADR-017 Punkt 36; ANN-261 bis
 * ANN-263).
 *
 * Erteilen und widerrufen die Person selbst und ihre rechtliche Vertretung,
 * nie die Begleitung. Der Vermerk steht in derselben Tabelle wie die der
 * Praxis, mit Herkunft und Textfassung. Den Widerruf behält die Person selbst
 * nach der Lesefrist.
 */

const { users, platformAccesses, patients, organizationId, trainingRelationships } = SEED;
const ERIKA = platformAccesses.erikaBehandlung;
const PAULA = platformAccesses.paulaBegleitungMax;
const FASSUNG = '2026-10';

const BERND = 'cafecafe-cafe-4afe-8afe-0000000000d1';
const KONTO_BERND = '99999999-9999-4999-8999-0000000000d1';
const FOTO = 'abababab-abab-4bab-8bab-0000000000d1';

const LISTE = 'select * from public.platform_consents($1::uuid)';
const SCHREIBEN =
  'select public.record_platform_consent($1::uuid, $2::text, $3::boolean, $4::text) as id';
const WIDERRUFE = 'select * from public.list_platform_consent_withdrawals()';

interface Stand {
  purpose: string;
  state: string;
  occurred_on: Date | null;
  source: string | null;
  can_grant: boolean;
}

async function stand(konto: string, zugang: string): Promise<Stand[]> {
  return (await asUser<Stand>(konto, LISTE, [zugang])).rows;
}

async function schreiben(
  konto: string,
  zugang: string,
  zweck: string,
  erteilen: boolean,
  fassung = FASSUNG,
) {
  return asUserCommitted<{ id: string }>(konto, SCHREIBEN, [zugang, zweck, erteilen, fassung]);
}

/** Bernd ist Betreuer für Max, mit eigenem Konto. */
async function betreuung() {
  await asPostgres(
    `insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', 'bernd@patient.invalid')`,
    [KONTO_BERND],
  );
  await asPostgres(
    `insert into public.platform_accesses
       (id, organization_id, relationship_kind, relationship_id, patient_id, account_user_id,
        status, activated_at, access_kind, legal_basis, representative_name, proof_documents,
        health_scope, finance_scope, proof_recorded_by, proof_recorded_at, created_by)
     values ($1, $2, 'treatment', $3, $3, $4, 'active', now(), 'legal_representative',
             'guardianship', 'Bernd Betreuer', array['identity_document', 'guardianship_certificate'],
             true, false, $5, now(), $5)`,
    [BERND, organizationId, patients.max, KONTO_BERND, users.office],
  );
}

describe('Einwilligungen in der Behandlung über die Plattform (POR-016)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('zeigt je Zweck den Stand und schreibt Erteilung und Widerruf mit Herkunft und Fassung', async () => {
    expect((await stand(users.plattformErika, ERIKA)).map((s) => [s.purpose, s.state])).toEqual([
      ['email_contact', 'open'],
      ['prescriber_report', 'open'],
      ['patient_photos', 'open'],
    ]);

    await schreiben(users.plattformErika, ERIKA, 'email_contact', true);
    const erteilt = await stand(users.plattformErika, ERIKA);
    expect(erteilt[0]).toEqual(
      expect.objectContaining({ state: 'granted', source: 'platform', can_grant: true }),
    );

    await schreiben(users.plattformErika, ERIKA, 'email_contact', false);
    expect((await stand(users.plattformErika, ERIKA))[0]!.state).toBe('withdrawn');

    // Nachweis am Datensatz: wer, über welchen Zugang, welche Fassung.
    const { rows } = await asPostgres<Record<string, unknown>>(
      `select record_kind, source, platform_access_id, platform_access_kind, representative_name,
              wording_version, recorded_by
         from public.patient_privacy_records where patient_id = $1 order by recorded_at`,
      [patients.erika],
    );
    expect(rows.filter((r) => r.source === 'platform')).toEqual([
      expect.objectContaining({
        record_kind: 'consent_granted',
        platform_access_id: ERIKA,
        platform_access_kind: 'self',
        representative_name: null,
        wording_version: FASSUNG,
        recorded_by: users.plattformErika,
      }),
      expect.objectContaining({ record_kind: 'consent_withdrawn', platform_access_kind: 'self' }),
    ]);

    // Die Praxis liest denselben Stand über ihre RLS.
    const praxis = await asUser<{ source: string }>(
      users.office,
      `select source from public.patient_privacy_records where patient_id = $1 and source = 'platform'`,
      [patients.erika],
    );
    expect(praxis.rows).toHaveLength(2);

    // Die Person selbst wird beim Schreiben nicht protokolliert (ADR-010 Fassung 3).
    const protokoll = await asPostgres(`select 1 from public.audit_log where actor_user_id = $1`, [
      users.plattformErika,
    ]);
    expect(protokoll.rows).toEqual([]);
  });

  it('weist doppelte Erteilung, Widerruf ohne Erteilung, alte Fassung und fremde Zwecke ab', async () => {
    await schreiben(users.plattformErika, ERIKA, 'prescriber_report', true);
    const doppelt = await abgefangen(
      schreiben(users.plattformErika, ERIKA, 'prescriber_report', true),
    );
    expect(doppelt?.message).toContain('consent already granted');
    const ohne = await abgefangen(schreiben(users.plattformErika, ERIKA, 'email_contact', false));
    expect(ohne?.message).toContain('no consent to withdraw');
    const alt = await abgefangen(
      schreiben(users.plattformErika, ERIKA, 'email_contact', true, '2025-01'),
    );
    expect(alt?.message).toContain('wording outdated');
    const fremd = await abgefangen(
      schreiben(users.plattformErika, ERIKA, 'training_health_data', true),
    );
    expect(fremd?.message).toContain('unknown purpose');
    // Ein Papier der Praxis zählt: Hat die Praxis erteilt vermerkt, widerruft
    // die Person auf der Plattform.
    await asUserCommitted(
      users.office,
      `select public.record_patient_privacy_entry($1::uuid, 'consent_granted', 'email_contact', null, current_date)`,
      [patients.erika],
    );
    expect((await stand(users.plattformErika, ERIKA))[0]).toEqual(
      expect.objectContaining({ state: 'granted', source: 'practice' }),
    );
    await schreiben(users.plattformErika, ERIKA, 'email_contact', false);
    expect((await stand(users.plattformErika, ERIKA))[0]!.state).toBe('withdrawn');
  });

  it('der Widerruf der Fotoeinwilligung löscht die Fotos sofort (ADR-017 Punkt 36)', async () => {
    await asUserCommitted(
      users.office,
      `select public.record_patient_privacy_entry($1::uuid, 'consent_granted', 'patient_photos', null, current_date)`,
      [patients.erika],
    );
    await asPostgres(
      `insert into public.patient_files
         (id, organization_id, patient_id, document_type, display_name, mime_type, byte_size,
          checksum_sha256, status, confirmed_at, uploaded_by)
       values ($1, $2, $3, 'patientenfoto', 'Foto.jpg', 'image/jpeg', 2345, $4, 'ready', now(), $5)`,
      [FOTO, organizationId, patients.erika, 'a'.repeat(64), users.therapist],
    );
    await schreiben(users.plattformErika, ERIKA, 'patient_photos', false);
    const { rows } = await asPostgres('select 1 from public.patient_files where id = $1', [FOTO]);
    expect(rows).toEqual([]);
    const journal = await asPostgres<{ retention_class: string }>(
      `select retention_class from public.deletion_journal where target_id = $1`,
      [FOTO],
    );
    expect(journal.rows).toEqual([{ retention_class: 'patientenfoto' }]);
  });

  it('rechtliche Vertretung: erteilt mit ihrem Namen am Vermerk, protokolliert als Vertretung', async () => {
    await betreuung();
    await schreiben(KONTO_BERND, BERND, 'prescriber_report', true);
    const { rows } = await asPostgres<Record<string, unknown>>(
      `select platform_access_kind, representative_name from public.patient_privacy_records
        where patient_id = $1 and source = 'platform'`,
      [patients.max],
    );
    expect(rows).toEqual([
      { platform_access_kind: 'legal_representative', representative_name: 'Bernd Betreuer' },
    ]);
    const protokoll = await asPostgres<{ actor_kind: string; context: Record<string, unknown> }>(
      `select actor_kind, context from public.audit_log
        where actor_user_id = $1 and action = 'platform_representation.read'`,
      [KONTO_BERND],
    );
    expect(protokoll.rows).toContainEqual(
      expect.objectContaining({
        actor_kind: 'representative',
        context: expect.objectContaining({ view: 'consent_granted' }) as unknown,
      }),
    );
  });

  it('Begleitung: sieht nichts und schreibt nichts (Punkt 13)', async () => {
    expect(await stand(users.plattformPaula, PAULA)).toEqual([]);
    const fehler = await abgefangen(schreiben(users.plattformPaula, PAULA, 'email_contact', true));
    expect(fehler?.message).toContain('not allowed');
  });

  it('fremde Person, anderer Bereich, Praxiskonto, andere Organisation: nichts', async () => {
    // Tina mit Erikas Zugang.
    expect(await stand(users.plattformTina, ERIKA)).toEqual([]);
    expect(
      (await abgefangen(schreiben(users.plattformTina, ERIKA, 'email_contact', true)))?.message,
    ).toContain('not allowed');
    // Praxiskonto.
    expect(await stand(users.office, ERIKA)).toEqual([]);
    expect(
      (await abgefangen(schreiben(users.office, ERIKA, 'email_contact', true)))?.message,
    ).toContain('not allowed');
    // Andere Organisation.
    const fremd = await fremdeOrganisation();
    expect(await stand(fremd.owner, ERIKA)).toEqual([]);
    expect(
      (await abgefangen(schreiben(fremd.owner, ERIKA, 'email_contact', true)))?.message,
    ).toContain('not allowed');
    // Kein Vermerk entstanden.
    const { rows } = await asPostgres(
      `select 1 from public.patient_privacy_records where source = 'platform'`,
    );
    expect(rows).toEqual([]);
  });

  it('eingeladen, gesperrt, entzogen: nichts', async () => {
    for (const [status, extra] of [
      ['locked', 'locked_at = now()'],
      ['revoked', "revoked_at = now(), revoked_reason = 'practice', revoked_by = created_by"],
    ] as const) {
      await resetDatabase();
      await asPostgres(
        `update public.platform_accesses set status = '${status}', ${extra} where id = $1`,
        [ERIKA],
      );
      expect(await stand(users.plattformErika, ERIKA)).toEqual([]);
      expect(
        (await abgefangen(schreiben(users.plattformErika, ERIKA, 'email_contact', true)))?.message,
      ).toContain('not allowed');
    }
    await resetDatabase();
    await asPostgres(
      `update public.platform_accesses set status = 'invited', account_user_id = null where id = $1`,
      [ERIKA],
    );
    expect(await stand(users.plattformErika, ERIKA)).toEqual([]);
    expect(
      (await abgefangen(schreiben(users.plattformErika, ERIKA, 'email_contact', true)))?.message,
    ).toContain('not allowed');
  }, 360_000);

  it('nach der Lesefrist: die Person selbst widerruft weiter, erteilt aber nicht (D2, ANN-261)', async () => {
    await schreiben(users.plattformErika, ERIKA, 'email_contact', true);
    await asPostgres(
      `update public.patients
          set care_concluded_on = current_date - 40, care_concluded_at = now(),
              care_concluded_by = $2::uuid
        where id = $1`,
      [patients.erika, users.ownerTherapist],
    );
    const nachher = await stand(users.plattformErika, ERIKA);
    expect(nachher[0]).toEqual(expect.objectContaining({ state: 'granted', can_grant: false }));
    const erteilen = await abgefangen(
      schreiben(users.plattformErika, ERIKA, 'prescriber_report', true),
    );
    expect(erteilen?.message).toContain('not allowed');
    await schreiben(users.plattformErika, ERIKA, 'email_contact', false);
    expect((await stand(users.plattformErika, ERIKA))[0]!.state).toBe('withdrawn');
  });

  it('nach der Lesefrist: eine Vertretung kann nichts mehr', async () => {
    await betreuung();
    await schreiben(KONTO_BERND, BERND, 'email_contact', true);
    await asPostgres(
      `update public.patients
          set care_concluded_on = current_date - 40, care_concluded_at = now(),
              care_concluded_by = $2::uuid
        where id = $1`,
      [patients.max, users.ownerTherapist],
    );
    expect(await stand(KONTO_BERND, BERND)).toEqual([]);
    const fehler = await abgefangen(schreiben(KONTO_BERND, BERND, 'email_contact', false));
    expect(fehler?.message).toContain('not allowed');
  });

  it('Offene Punkte: Widerrufe der letzten 14 Tage für die Kartei, sonst nichts (ANN-263)', async () => {
    await schreiben(users.plattformErika, ERIKA, 'email_contact', true);
    await schreiben(users.plattformErika, ERIKA, 'email_contact', false);
    const buero = await asUser<{ purpose: string; family_name: string; patient_id: string }>(
      users.office,
      WIDERRUFE,
    );
    expect(buero.rows).toEqual([
      expect.objectContaining({
        purpose: 'email_contact',
        patient_id: patients.erika,
        family_name: 'Beispiel',
      }),
    ]);
    // Die Trainingsbetreuung liest die Kartei nicht, die Plattform schon gar nicht.
    expect((await asUser(users.trainer, WIDERRUFE)).rows).toEqual([]);
    expect((await asUser(users.plattformErika, WIDERRUFE)).rows).toEqual([]);
    const fremd = await fremdeOrganisation();
    expect((await asUser(fremd.owner, WIDERRUFE)).rows).toEqual([]);
    // Nach 14 Tagen nicht mehr.
    await asPostgres(
      `update public.patient_privacy_records set recorded_at = now() - interval '15 days'
        where source = 'platform'`,
    );
    expect((await asUser(users.office, WIDERRUFE)).rows).toEqual([]);
  });

  it('die Tabelle hält die Form: Plattform nur mit Zugang und Fassung, Praxis ohne', async () => {
    const ohneFassung = await abgefangen(
      asPostgres(
        `insert into public.patient_privacy_records
           (organization_id, patient_id, record_kind, purpose, occurred_on, source,
            platform_access_id, platform_access_kind)
         values ($1, $2, 'consent_granted', 'email_contact', current_date, 'platform', $3, 'self')`,
        [organizationId, patients.erika, ERIKA],
      ),
    );
    expect(ohneFassung).not.toBeNull();
    const vertretungOhneName = await abgefangen(
      asPostgres(
        `insert into public.patient_privacy_records
           (organization_id, patient_id, record_kind, purpose, occurred_on, source,
            platform_access_id, platform_access_kind, wording_version)
         values ($1, $2, 'consent_granted', 'email_contact', current_date, 'platform', $3,
                 'legal_representative', '2026-10')`,
        [organizationId, patients.erika, ERIKA],
      ),
    );
    expect(vertretungOhneName).not.toBeNull();
  });
});

const TINA = platformAccesses.tinaTraining;
const VERMERKEN = 'select public.record_training_consent_entry($1::uuid, $2::text, $3::date) as id';

describe('Einwilligung im Training (POR-017)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('die Kundin erteilt und widerruft; das Training liest den Stand, die Behandlung nicht', async () => {
    expect((await stand(users.plattformTina, TINA)).map((s) => [s.purpose, s.state])).toEqual([
      ['training_health_data', 'open'],
    ]);
    await schreiben(users.plattformTina, TINA, 'training_health_data', true);
    expect((await stand(users.plattformTina, TINA))[0]).toEqual(
      expect.objectContaining({ state: 'granted', source: 'platform' }),
    );

    const lesen = `select record_kind, source, platform_access_kind, wording_version
                     from public.training_consent_records where training_relationship_id = $1`;
    for (const konto of [users.trainer, users.office, users.ownerTherapist]) {
      expect((await asUser(konto, lesen, [trainingRelationships.tina])).rows).toEqual([
        {
          record_kind: 'consent_granted',
          source: 'platform',
          platform_access_kind: 'self',
          wording_version: FASSUNG,
        },
      ]);
    }
    // Kein Durchgriff (ADR-021 Punkt 6): Behandlungsrollen ohne Training sehen nichts.
    for (const konto of [users.therapist, users.teamLead, users.plattformTina]) {
      expect((await asUser(konto, lesen, [trainingRelationships.tina])).rows).toEqual([]);
    }

    await schreiben(users.plattformTina, TINA, 'training_health_data', false);
    const trainer = await asUser<{ relationship_kind: string; training_relationship_id: string }>(
      users.trainer,
      WIDERRUFE,
    );
    expect(trainer.rows).toEqual([
      expect.objectContaining({
        relationship_kind: 'training',
        training_relationship_id: trainingRelationships.tina,
        purpose: 'training_health_data',
      }),
    ]);
    // Die Behandlungsseite erfährt vom Widerruf im Training nichts.
    expect((await asUser(users.therapist, WIDERRUFE)).rows).toEqual([]);
  });

  it('Zwecke bleiben im eigenen Bereich (§4.8)', async () => {
    const imTraining = await abgefangen(
      schreiben(users.plattformErika, platformAccesses.erikaTraining, 'email_contact', true),
    );
    expect(imTraining?.message).toContain('unknown purpose');
    const inDerBehandlung = await abgefangen(
      schreiben(users.plattformErika, ERIKA, 'training_health_data', true),
    );
    expect(inDerBehandlung?.message).toContain('unknown purpose');
    // Erikas Training und Erikas Behandlung haben je ihren eigenen Stand.
    await schreiben(
      users.plattformErika,
      platformAccesses.erikaTraining,
      'training_health_data',
      true,
    );
    expect((await stand(users.plattformErika, ERIKA)).map((s) => s.state)).toEqual([
      'open',
      'open',
      'open',
    ]);
  });

  it('die Praxis vermerkt vom Papier: wer das Training schreibt, und nur nach den Regeln', async () => {
    await asUserCommitted(users.trainer, VERMERKEN, [
      trainingRelationships.tina,
      'consent_granted',
      '2026-10-01',
    ]);
    expect((await stand(users.plattformTina, TINA))[0]).toEqual(
      expect.objectContaining({ state: 'granted', source: 'practice' }),
    );
    const doppelt = await abgefangen(
      asUser(users.office, VERMERKEN, [
        trainingRelationships.tina,
        'consent_granted',
        '2026-10-02',
      ]),
    );
    expect(doppelt?.message).toContain('consent already granted');
    const zukunft = await abgefangen(
      asUser(users.office, VERMERKEN, [
        trainingRelationships.tina,
        'consent_withdrawn',
        '2999-01-01',
      ]),
    );
    expect(zukunft?.message).toContain('future');
    const vorher = await abgefangen(
      asUser(users.office, VERMERKEN, [
        trainingRelationships.tina,
        'consent_withdrawn',
        '2026-09-01',
      ]),
    );
    expect(vorher?.message).toContain('withdrawal before consent');
    for (const konto of [users.therapist, users.teamLead, users.plattformTina]) {
      const fehler = await abgefangen(
        asUser(konto, VERMERKEN, [trainingRelationships.tina, 'consent_withdrawn', '2026-10-05']),
      );
      expect(fehler?.message).toMatch(/not allowed|not found/);
    }
    const fremd = await fremdeOrganisation();
    const fremdOwner = await abgefangen(
      asUser(fremd.owner, VERMERKEN, [
        trainingRelationships.tina,
        'consent_withdrawn',
        '2026-10-05',
      ]),
    );
    expect(fremdOwner).not.toBeNull();
  });

  it('fällt mit dem Trainingsverhältnis (Datenklasse Trainingsverhältnis)', async () => {
    await schreiben(users.plattformTina, TINA, 'training_health_data', true);
    const { rows } = await asPostgres<{ class_key: string; deletion_mode: string }>(
      `select class_key, deletion_mode from public.retention_assignments
        where table_name = 'training_consent_records'`,
    );
    expect(rows).toEqual([
      { class_key: 'trainingsverhaeltnis', deletion_mode: 'ueber_elterndatensatz' },
    ]);
  });
});

/**
 * Befunde aus dem Zweitreview: der Widerruf in allen Negativfällen
 * (ADR-023 Punkt 23), das Training gesperrt und nach der Lesefrist, die
 * fremde Organisation an der Trainingstabelle, die Zeit nach der Sperre und
 * die Herkunft in der Kopie nach Art. 15.
 */
describe('Widerruf und Training: Negativfälle und Nachweis (Zweitreview)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  async function praxisErteilt(patientId: string, zweck = 'email_contact') {
    await asUserCommitted(
      users.office,
      `select public.record_patient_privacy_entry($1::uuid, 'consent_granted', $2::text, null, current_date)`,
      [patientId, zweck],
    );
  }

  async function standDerAkte(patientId: string): Promise<string | undefined> {
    const { rows } = await asPostgres<{ record_kind: string }>(
      `select record_kind from public.patient_privacy_records
        where patient_id = $1 and purpose = 'email_contact'
        order by recorded_at desc, id desc limit 1`,
      [patientId],
    );
    return rows[0]?.record_kind;
  }

  it('Begleitung, fremde Person, Praxiskonto, andere Organisation widerrufen nicht', async () => {
    await praxisErteilt(patients.max);
    await praxisErteilt(patients.erika);
    const fremd = await fremdeOrganisation();
    for (const [konto, zugang] of [
      [users.plattformPaula, PAULA],
      [users.plattformTina, ERIKA],
      [users.office, ERIKA],
      [fremd.owner, ERIKA],
    ] as const) {
      const fehler = await abgefangen(schreiben(konto, zugang, 'email_contact', false));
      expect(fehler?.message, konto).toContain('not allowed');
    }
    expect(await standDerAkte(patients.max)).toBe('consent_granted');
    expect(await standDerAkte(patients.erika)).toBe('consent_granted');
  });

  it('eingeladen, gesperrt, entzogen widerrufen nicht', async () => {
    for (const fall of [
      `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
      `update public.platform_accesses set status = 'revoked', revoked_at = now(),
              revoked_reason = 'practice', revoked_by = created_by where id = $1`,
      `update public.platform_accesses set status = 'invited', account_user_id = null where id = $1`,
    ]) {
      await resetDatabase();
      await praxisErteilt(patients.erika);
      await asPostgres(fall, [ERIKA]);
      const fehler = await abgefangen(
        schreiben(users.plattformErika, ERIKA, 'email_contact', false),
      );
      expect(fehler?.message).toContain('not allowed');
      expect(await standDerAkte(patients.erika)).toBe('consent_granted');
    }
  }, 360_000);

  it('Training gesperrt: nichts; nach der Lesefrist: widerrufen ja, erteilen nein', async () => {
    await schreiben(users.plattformTina, TINA, 'training_health_data', true);
    await asPostgres(
      `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
      [TINA],
    );
    expect(await stand(users.plattformTina, TINA)).toEqual([]);
    const gesperrt = await abgefangen(
      schreiben(users.plattformTina, TINA, 'training_health_data', false),
    );
    expect(gesperrt?.message).toContain('not allowed');

    await asPostgres(
      `update public.platform_accesses set status = 'active', locked_at = null where id = $1`,
      [TINA],
    );
    await asPostgres(
      `update public.training_relationships set contract_ended_on = current_date - 40 where id = $1`,
      [trainingRelationships.tina],
    );
    expect((await stand(users.plattformTina, TINA))[0]).toEqual(
      expect.objectContaining({ state: 'granted', can_grant: false }),
    );
    await schreiben(users.plattformTina, TINA, 'training_health_data', false);
    const erteilen = await abgefangen(
      schreiben(users.plattformTina, TINA, 'training_health_data', true),
    );
    expect(erteilen?.message).toContain('not allowed');
  });

  it('die Trainingstabelle bleibt in ihrer Organisation (RLS)', async () => {
    await schreiben(users.plattformTina, TINA, 'training_health_data', true);
    const fremd = await fremdeOrganisation();
    const { rows } = await asUser(
      fremd.owner,
      'select 1 from public.training_consent_records where training_relationship_id = $1',
      [trainingRelationships.tina],
    );
    expect(rows).toEqual([]);
  });

  it('ein neuer Vermerk ist der jüngste, auch neben einem später begonnenen (Wettlauf)', async () => {
    // Ein gleichzeitiger Aufruf, der später begann und vorher schrieb, trägt
    // eine Zeit nach dem Beginn dieser Transaktion - hier als Zeile in der
    // Zukunft nachgestellt, je Tabelle.
    await asPostgres(
      `insert into public.patient_privacy_records
         (organization_id, patient_id, record_kind, purpose, occurred_on, recorded_at)
       values ($1, $2, 'consent_granted', 'email_contact', current_date, now() + interval '2 seconds')`,
      [organizationId, patients.erika],
    );
    await asPostgres(
      `insert into public.training_consent_records
         (organization_id, training_relationship_id, record_kind, purpose, occurred_on, recorded_at)
       values ($1, $2, 'consent_granted', 'training_health_data', current_date,
               now() + interval '2 seconds')`,
      [organizationId, trainingRelationships.tina],
    );
    await schreiben(users.plattformErika, ERIKA, 'email_contact', false);
    await schreiben(users.plattformTina, TINA, 'training_health_data', false);
    expect(await standDerAkte(patients.erika)).toBe('consent_withdrawn');
    expect((await stand(users.plattformTina, TINA))[0]!.state).toBe('withdrawn');

    // Ebenso der Weg der Praxis (record_patient_privacy_entry, record_training_consent_entry).
    await asPostgres(
      `insert into public.patient_privacy_records
         (organization_id, patient_id, record_kind, purpose, occurred_on, recorded_at)
       values ($1, $2, 'consent_granted', 'email_contact', current_date, now() + interval '4 seconds')`,
      [organizationId, patients.erika],
    );
    await asUserCommitted(
      users.office,
      `select public.record_patient_privacy_entry($1::uuid, 'consent_withdrawn', 'email_contact', null, current_date)`,
      [patients.erika],
    );
    expect(await standDerAkte(patients.erika)).toBe('consent_withdrawn');
    await asPostgres(
      `insert into public.training_consent_records
         (organization_id, training_relationship_id, record_kind, purpose, occurred_on, recorded_at)
       values ($1, $2, 'consent_granted', 'training_health_data', current_date,
               now() + interval '4 seconds')`,
      [organizationId, trainingRelationships.tina],
    );
    await asUserCommitted(
      users.trainer,
      `select public.record_training_consent_entry($1::uuid, 'consent_withdrawn', current_date)`,
      [trainingRelationships.tina],
    );
    expect((await stand(users.plattformTina, TINA))[0]!.state).toBe('withdrawn');
  });

  it('die Kopie der Akte nach Art. 15 nennt Herkunft, Vertretung und Textfassung', async () => {
    await schreiben(users.plattformErika, ERIKA, 'email_contact', true);
    const { rows } = await asUserCommitted<{ akte: { tabellen: Record<string, unknown[]> } }>(
      users.ownerTherapist,
      'select public.export_patient_record($1::uuid) as akte',
      [patients.erika],
    );
    expect(rows[0]!.akte.tabellen['patient_privacy_records']).toContainEqual(
      expect.objectContaining({
        source: 'platform',
        platform_access_kind: 'self',
        representative_name: null,
        wording_version: FASSUNG,
      }),
    );
  });
});
