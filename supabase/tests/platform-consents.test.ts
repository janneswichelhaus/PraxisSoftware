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

const { users, platformAccesses, patients, organizationId } = SEED;
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
