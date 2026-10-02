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
 * ABN-007 (BEF-098): Der behandlungsrelevante Hinweis aus einer Verordnung hat
 * wieder einen klinischen Ort. Schreiben die behandelnden Rollen, lesen alle,
 * die Dokumentation lesen - auch das Büro (ADR-004 Fassung 2).
 */

const { users, patients } = SEED;
const VERORDNUNG = '88888888-8888-4888-8888-000000000002';
const SELBSTZAHLER = '88888888-8888-4888-8888-000000000005';

const SETZEN =
  'select public.set_treatment_basis_clinical_note($1::uuid, $2, $3::timestamptz) as stand';
const KLINISCH =
  'select id, prescriber_note, note from public.list_patient_treatment_bases_clinical($1::uuid)';

async function stand(id: string): Promise<string> {
  const { rows } = await asPostgres<{ stand: string }>(
    `select to_char(updated_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"+00"') as stand
       from public.treatment_bases where id = $1`,
    [id],
  );
  return rows[0]!.stand;
}

async function hinweis(id: string): Promise<string | null> {
  const { rows } = await asPostgres<{ prescriber_note: string | null }>(
    'select prescriber_note from public.treatment_bases where id = $1',
    [id],
  );
  return rows[0]!.prescriber_note;
}

describe('Behandlungsrelevanter Hinweis an der Verordnung', () => {
  beforeEach(resetDatabase);

  it('lässt die Therapeut:in den Hinweis setzen und das Büro ihn lesen', async () => {
    await asUserCommitted(users.therapist, SETZEN, [
      VERORDNUNG,
      '  Synthetisch: keine Belastung über 20 kg.  ',
      await stand(VERORDNUNG),
    ]);
    expect(await hinweis(VERORDNUNG)).toBe('Synthetisch: keine Belastung über 20 kg.');

    const { rows } = await asUserCommitted<{ id: string; prescriber_note: string | null }>(
      users.office,
      KLINISCH,
      [patients.max],
    );
    expect(rows.find((r) => r.id === VERORDNUNG)?.prescriber_note).toBe(
      'Synthetisch: keine Belastung über 20 kg.',
    );
  });

  it('hält den Hinweis getrennt von den organisatorischen Anmerkungen', async () => {
    const vorher = await asPostgres<{ note: string | null }>(
      'select note from public.treatment_bases where id = $1',
      [VERORDNUNG],
    );
    await asUserCommitted(users.teamLead, SETZEN, [
      VERORDNUNG,
      'Synthetisch: Therapieziel Treppensteigen.',
      await stand(VERORDNUNG),
    ]);
    const nachher = await asPostgres<{ note: string | null }>(
      'select note from public.treatment_bases where id = $1',
      [VERORDNUNG],
    );
    expect(nachher.rows[0]!.note).toBe(vorher.rows[0]!.note);
  });

  it.each([['office'], ['ownerOhneBehandlung']] as const)(
    'lässt %s nicht schreiben',
    async (wer) => {
      const vorher = await hinweis(VERORDNUNG);
      let konto: string = users.office;
      if (wer === 'ownerOhneBehandlung') {
        // Ein reiner owner-Zugang liest die Akte, schreibt aber nicht klinisch.
        await asPostgres(
          `delete from public.user_roles where user_id = $1 and role_key <> 'owner'`,
          [users.ownerTherapist],
        );
        konto = users.ownerTherapist;
      }
      await expect(
        asUser(konto, SETZEN, [VERORDNUNG, 'Synthetisch.', await stand(VERORDNUNG)]),
      ).rejects.toThrow(/not allowed to write clinical treatment basis notes/);
      expect(await hinweis(VERORDNUNG)).toBe(vorher);
    },
  );

  it('weist Trainingsbetreuung, Plattformkonto und fremde Organisation ab (Zweitreview B8)', async () => {
    for (const konto of [users.trainer, users.plattformErika]) {
      await expect(
        asUser(konto, SETZEN, [VERORDNUNG, 'Synthetisch.', await stand(VERORDNUNG)]),
      ).rejects.toThrow(/not allowed to write clinical treatment basis notes/);
    }
    const fremd = await fremdeOrganisation();
    await expect(
      asUser(fremd.owner, SETZEN, [VERORDNUNG, 'Synthetisch.', await stand(VERORDNUNG)]),
    ).rejects.toThrow(
      /not allowed to write clinical treatment basis notes|treatment basis not found/,
    );
  });

  it('setzt am Selbstzahler keinen Hinweis', async () => {
    await expect(
      asUser(users.therapist, SETZEN, [SELBSTZAHLER, 'Synthetisch.', await stand(SELBSTZAHLER)]),
    ).rejects.toThrow(/self-pay basis carries no clinical note/);
  });

  it('leert den Hinweis mit einem leeren Text und weist einen veralteten Stand ab', async () => {
    await asUserCommitted(users.therapist, SETZEN, [
      VERORDNUNG,
      'Synthetisch.',
      await stand(VERORDNUNG),
    ]);
    await expect(
      asUser(users.therapist, SETZEN, [VERORDNUNG, '', '2000-01-01T00:00:00Z']),
    ).rejects.toThrow(/changed meanwhile/);
    await asUserCommitted(users.therapist, SETZEN, [VERORDNUNG, '   ', await stand(VERORDNUNG)]);
    expect(await hinweis(VERORDNUNG)).toBeNull();
  });

  it('weist einen Text über 2000 Zeichen ab', async () => {
    await expect(
      asUser(users.therapist, SETZEN, [VERORDNUNG, 'x'.repeat(2001), await stand(VERORDNUNG)]),
    ).rejects.toThrow(/too long/);
  });

  it('protokolliert die Änderung ohne den Text', async () => {
    await asUserCommitted(users.therapist, SETZEN, [
      VERORDNUNG,
      'Synthetisch: Belastungsgrenze.',
      await stand(VERORDNUNG),
    ]);
    const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log
        where action = 'treatment_basis.updated' and subject_id = $1
        order by occurred_at desc limit 1`,
      [VERORDNUNG],
    );
    expect(rows[0]!.context).toMatchObject({
      field: 'prescriber_note',
      cleared: false,
      patient_id: patients.max,
    });
    expect(JSON.stringify(rows[0]!.context)).not.toContain('Belastungsgrenze');
  });

  it('nutzt für die klinische Sicht das eine Leserecht der Dokumentation', async () => {
    const { rows } = await asPostgres<{ gleich: boolean }>(
      `select pg_get_functiondef('app.can_read_treatment_basis_clinical()'::regprocedure)
                like '%app.can_read_treatment_note()%' as gleich`,
    );
    expect(rows[0]!.gleich).toBe(true);
  });
});
