import { beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Unter „Ich": wer für mich Zugang hat (POR-007, ADR-023 Punkte 13, 14, 23).
 *
 * Die Person selbst und ihre rechtliche Vertretung sehen die Vertretungen
 * des Verhältnisses und beenden eine Begleitung — das ist der Widerruf der
 * Einwilligung. Eine rechtliche Vertretung beendet nur die Praxis. Die
 * Begleitung selbst darf beides nicht.
 */

const { users, platformAccesses, patients, organizationId } = SEED;
const LISTE = 'select * from public.platform_representatives($1::uuid)';
const BEENDEN = 'select public.end_platform_companion($1::uuid, $2::uuid) as ok';
const PAULA = platformAccesses.paulaBegleitungMax;

const KONTO_MAX = '99999999-9999-4999-8999-0000000000d1';
const KONTO_BERND = '99999999-9999-4999-8999-0000000000d2';
const MAX_SELBST = 'cafecafe-cafe-4afe-8afe-0000000000d1';
const BERND = 'cafecafe-cafe-4afe-8afe-0000000000d2';

async function konto(id: string, email: string) {
  await asPostgres(
    `insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', $2)`,
    [id, email],
  );
}

/** Max bekommt seinen eigenen Zugang, Bernd die Betreuung - direkt eingetragen. */
async function aufbauen() {
  await konto(KONTO_MAX, 'max.selbst@patient.invalid');
  await konto(KONTO_BERND, 'bernd@patient.invalid');
  await asPostgres(
    `insert into public.platform_accesses
       (id, organization_id, relationship_kind, relationship_id, patient_id, account_user_id,
        status, activated_at, created_by)
     values ($1, $2, 'treatment', $3, $3, $4, 'active', now(), $5)`,
    [MAX_SELBST, organizationId, patients.max, KONTO_MAX, users.office],
  );
  await asPostgres(
    `insert into public.platform_accesses
       (id, organization_id, relationship_kind, relationship_id, patient_id, account_user_id,
        status, activated_at, access_kind, legal_basis, representative_name, proof_documents,
        guardianship_health_scope, proof_recorded_by, proof_recorded_at, created_by)
     values ($1, $2, 'treatment', $3, $3, $4, 'active', now(), 'legal_representative',
             'guardianship', 'Bernd Betreuer', array['identity_document', 'guardianship_certificate'],
             true, $5, now(), $5)`,
    [BERND, organizationId, patients.max, KONTO_BERND, users.office],
  );
}

async function zugang(id: string) {
  const { rows } = await asPostgres<{
    status: string;
    revoked_reason: string | null;
    revoked_by: string | null;
  }>('select status, revoked_reason, revoked_by from public.platform_accesses where id = $1', [id]);
  return rows[0];
}

describe('Wer für mich Zugang hat (Punkt 14)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await aufbauen();
  }, 120_000);

  it('zeigt der Person ihre Vertretungen, ohne Konto und Nachweis, und protokolliert nicht', async () => {
    const { rows } = await asUserCommitted<Record<string, unknown>>(KONTO_MAX, LISTE, [MAX_SELBST]);
    expect(rows).toEqual([
      expect.objectContaining({
        access_id: PAULA,
        access_kind: 'companion',
        representative_name: 'Paula Mustermann',
        status: 'active',
        can_end: true,
      }),
      expect.objectContaining({
        access_id: BERND,
        access_kind: 'legal_representative',
        legal_basis: 'guardianship',
        can_end: false,
      }),
    ]);
    expect(Object.keys(rows[0]!).sort()).toEqual([
      'access_id',
      'access_kind',
      'can_end',
      'legal_basis',
      'representative_name',
      'since',
      'status',
    ]);
    const log = await asPostgres(
      `select 1 from public.audit_log where action = 'platform_representation.read'`,
    );
    expect(log.rows).toEqual([]);
  });

  it('die Person beendet eine Begleitung: Widerruf mit Grund und Protokoll', async () => {
    const { rows } = await asUserCommitted<{ ok: boolean }>(KONTO_MAX, BEENDEN, [
      MAX_SELBST,
      PAULA,
    ]);
    expect(rows[0]?.ok).toBe(true);
    expect(await zugang(PAULA)).toEqual({
      status: 'revoked',
      revoked_reason: 'consent_withdrawn',
      revoked_by: KONTO_MAX,
    });
    const log = await asPostgres<{ actor_kind: string; subject_id: string; context: unknown }>(
      `select actor_kind, subject_id, context from public.audit_log
        where action = 'platform_access.revoked'`,
    );
    expect(log.rows).toEqual([
      {
        actor_kind: 'platform',
        subject_id: PAULA,
        context: expect.objectContaining({
          surface: 'platform',
          reason: 'consent_withdrawn',
          platform_access_id: MAX_SELBST,
        }) as unknown,
      },
    ]);
    // Paula sieht ab der nächsten Anfrage nichts mehr (Punkt 18).
    expect(
      (await asUser(users.plattformPaula, 'select * from public.platform_context()')).rows,
    ).toEqual([]);
  });

  it('eine rechtliche Vertretung beendet nur die Praxis', async () => {
    const { rows } = await asUserCommitted<{ ok: boolean }>(KONTO_MAX, BEENDEN, [
      MAX_SELBST,
      BERND,
    ]);
    expect(rows[0]?.ok).toBe(false);
    expect((await zugang(BERND))?.status).toBe('active');
  });

  it('die rechtliche Vertretung sieht und beendet die Begleitung, protokolliert als Vertretung', async () => {
    const liste = await asUserCommitted<{ access_id: string }>(KONTO_BERND, LISTE, [BERND]);
    expect(liste.rows.map((z) => z.access_id)).toEqual([PAULA]);
    const gelesen = await asPostgres<{ actor_kind: string; context: Record<string, unknown> }>(
      `select actor_kind, context from public.audit_log where action = 'platform_representation.read'`,
    );
    expect(gelesen.rows).toEqual([
      {
        actor_kind: 'representative',
        context: expect.objectContaining({
          view: 'representatives',
          platform_access_id: BERND,
        }) as unknown,
      },
    ]);

    const { rows } = await asUserCommitted<{ ok: boolean }>(KONTO_BERND, BEENDEN, [BERND, PAULA]);
    expect(rows[0]?.ok).toBe(true);
    const log = await asPostgres<{ actor_kind: string }>(
      `select actor_kind from public.audit_log where action = 'platform_access.revoked'`,
    );
    expect(log.rows).toEqual([{ actor_kind: 'representative' }]);
  });

  it('die Begleitung sieht keine anderen Vertretungen und beendet keine', async () => {
    expect((await asUser(users.plattformPaula, LISTE, [PAULA])).rows).toEqual([]);
    for (const ziel of [PAULA, BERND]) {
      const { rows } = await asUserCommitted<{ ok: boolean }>(users.plattformPaula, BEENDEN, [
        PAULA,
        ziel,
      ]);
      expect(rows[0]?.ok).toBe(false);
    }
    expect((await zugang(PAULA))?.status).toBe('active');
  });

  it.each([
    ['fremde Person', () => users.plattformTina],
    ['Praxiskonto', () => users.office],
    ['andere Person mit eigenem Zugang', () => users.plattformErika],
  ])('%s: nichts zu sehen, nichts zu beenden', async (_fall, wer) => {
    expect((await asUser(wer(), LISTE, [MAX_SELBST])).rows).toEqual([]);
    const { rows } = await asUserCommitted<{ ok: boolean }>(wer(), BEENDEN, [MAX_SELBST, PAULA]);
    expect(rows[0]?.ok).toBe(false);
    expect((await zugang(PAULA))?.status).toBe('active');
  });

  it('anderes Verhältnis: der eigene Zugang zum Training beendet keine Begleitung der Behandlung', async () => {
    // Erikas Trainingszugang kennt Max' Begleitung nicht.
    const { rows } = await asUserCommitted<{ ok: boolean }>(users.plattformErika, BEENDEN, [
      platformAccesses.erikaTraining,
      PAULA,
    ]);
    expect(rows[0]?.ok).toBe(false);
  });

  it.each([
    [
      'gesperrt',
      `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
    ],
    [
      'entzogen',
      `update public.platform_accesses
          set status = 'revoked', revoked_at = now(), revoked_reason = 'practice' where id = $1`,
    ],
  ])('eigener Zugang %s: nichts zu sehen, nichts zu beenden', async (_fall, aendern) => {
    await asPostgres(aendern, [MAX_SELBST]);
    expect((await asUser(KONTO_MAX, LISTE, [MAX_SELBST])).rows).toEqual([]);
    const { rows } = await asUserCommitted<{ ok: boolean }>(KONTO_MAX, BEENDEN, [
      MAX_SELBST,
      PAULA,
    ]);
    expect(rows[0]?.ok).toBe(false);
  });

  it('abgelaufene Lesefrist: nichts zu sehen, nichts zu beenden (D2)', async () => {
    await asPostgres(
      `update public.patients
          set care_concluded_on = current_date - 40, care_concluded_at = now(),
              care_concluded_by = $2::uuid
        where id = $1`,
      [patients.max, users.therapist],
    );
    expect((await asUser(KONTO_MAX, LISTE, [MAX_SELBST])).rows).toEqual([]);
    const { rows } = await asUserCommitted<{ ok: boolean }>(KONTO_MAX, BEENDEN, [
      MAX_SELBST,
      PAULA,
    ]);
    expect(rows[0]?.ok).toBe(false);
  });
});

describe('Zweitreview: beendete und fremde Vertretungen unter Ich', () => {
  beforeEach(async () => {
    await resetDatabase();
    await aufbauen();
  }, 120_000);

  it('zeigt ein mit 18 beendetes Sorgerecht nicht mehr (Punkt 15)', async () => {
    const SARA = 'cafecafe-cafe-4afe-8afe-0000000000d3';
    await asPostgres(
      `update public.patient_contact_details set date_of_birth = current_date - interval '17 years'
        where patient_id = $1`,
      [patients.max],
    );
    await asPostgres(
      `insert into public.platform_accesses
         (id, organization_id, relationship_kind, relationship_id, patient_id, status, access_kind,
          legal_basis, representative_name, proof_documents, proof_recorded_by, proof_recorded_at,
          created_by)
       values ($1, $2, 'treatment', $3, $3, 'invited', 'legal_representative', 'custody',
               'Sara Sorge', array['identity_document', 'custody_proof'], $4, now(), $4)`,
      [SARA, organizationId, patients.max, users.office],
    );
    await asPostgres(
      `insert into public.platform_access_invitations
         (organization_id, platform_access_id, purpose, channel, code_hash, expires_at, created_by)
       values ($1, $2, 'activate', 'on_site', repeat('a', 64), now() + interval '7 days', $3)`,
      [organizationId, SARA, users.office],
    );
    // Max ist minderjährig: der eigene Zugang wäre so nicht entstanden, für
    // die Liste zählt hier nur das Ende des Sorgerechts.
    await asPostgres(
      `update public.patient_contact_details set date_of_birth = current_date - interval '18 years' - interval '1 day'
        where patient_id = $1`,
      [patients.max],
    );
    const { rows } = await asUser<{ access_id: string }>(KONTO_MAX, LISTE, [MAX_SELBST]);
    expect(rows.map((z) => z.access_id)).not.toContain(SARA);
  });

  it('beendet eine schon entzogene Begleitung nicht ein zweites Mal', async () => {
    await asPostgres(
      `update public.platform_accesses
          set status = 'revoked', revoked_at = now(), revoked_reason = 'practice' where id = $1`,
      [PAULA],
    );
    const { rows } = await asUserCommitted<{ ok: boolean }>(KONTO_MAX, BEENDEN, [
      MAX_SELBST,
      PAULA,
    ]);
    expect(rows[0]?.ok).toBe(false);
    expect((await zugang(PAULA))?.revoked_reason).toBe('practice');
  });

  it('eigener Zugang nur eingeladen: nichts zu sehen, nichts zu beenden', async () => {
    await asPostgres(
      `update public.platform_accesses set status = 'invited', account_user_id = null, activated_at = null
        where id = $1`,
      [MAX_SELBST],
    );
    expect((await asUser(KONTO_MAX, LISTE, [MAX_SELBST])).rows).toEqual([]);
    const { rows } = await asUserCommitted<{ ok: boolean }>(KONTO_MAX, BEENDEN, [
      MAX_SELBST,
      PAULA,
    ]);
    expect(rows[0]?.ok).toBe(false);
  });

  it('andere Organisation: das Konto der fremden owner:in sieht und beendet nichts', async () => {
    const fremd = await fremdeOrganisation();
    expect((await asUser(fremd.owner, LISTE, [MAX_SELBST])).rows).toEqual([]);
    const { rows } = await asUserCommitted<{ ok: boolean }>(fremd.owner, BEENDEN, [
      MAX_SELBST,
      PAULA,
    ]);
    expect(rows[0]?.ok).toBe(false);
  });
});
