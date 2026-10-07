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
 * Einstieg mit Überspringen (POR-019; IDEA-LZK-005; ADR-023 Punkte 6, 19,
 * 22, 23; ANN-266).
 *
 * Die Person beendet ihren Einstieg selbst; die Praxis kann ihn für sie
 * überspringen - mit Nachweis am Zugang, nie mit einer Einwilligung.
 */

const { users, platformAccesses } = SEED;
const ERIKA = platformAccesses.erikaBehandlung;
const TINA = platformAccesses.tinaTraining;
const PAULA = platformAccesses.paulaBegleitungMax;

const STAND = 'select * from public.platform_onboarding($1::uuid)';
const BEENDEN = 'select public.finish_platform_onboarding($1::uuid) as ok';
const UEBERSPRINGEN = 'select public.skip_platform_onboarding($1::uuid) as ok';
const PRAXIS = 'select * from public.get_platform_onboarding($1::uuid)';

async function offen(konto: string, zugang: string): Promise<boolean | undefined> {
  return (await asUser<{ pending: boolean }>(konto, STAND, [zugang])).rows[0]?.pending;
}

describe('Einstieg mit Überspringen (POR-019)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('steht aus, bis die Person ihn beendet - einmal', async () => {
    expect(await offen(users.plattformErika, ERIKA)).toBe(true);
    // Seed: Tina und Paula haben ihn hinter sich.
    expect(await offen(users.plattformTina, TINA)).toBe(false);
    expect(await offen(users.plattformPaula, PAULA)).toBe(false);

    const erst = await asUserCommitted<{ ok: boolean }>(users.plattformErika, BEENDEN, [ERIKA]);
    expect(erst.rows[0]!.ok).toBe(true);
    expect(await offen(users.plattformErika, ERIKA)).toBe(false);
    const noch = await asUserCommitted<{ ok: boolean }>(users.plattformErika, BEENDEN, [ERIKA]);
    expect(noch.rows[0]!.ok).toBe(false);
    // Erikas Training hat seinen eigenen Einstieg (ANN-266).
    expect(await offen(users.plattformErika, platformAccesses.erikaTraining)).toBe(true);
  });

  it('die Praxis überspringt: Nachweis am Zugang, keine Einwilligung, kein Name für die Person', async () => {
    const { rows } = await asUserCommitted<{ ok: boolean }>(users.office, UEBERSPRINGEN, [ERIKA]);
    expect(rows[0]!.ok).toBe(true);

    const person = await asUser<Record<string, unknown>>(users.plattformErika, STAND, [ERIKA]);
    expect(person.rows[0]).toEqual(expect.objectContaining({ pending: false, finished_at: null }));
    expect(Object.keys(person.rows[0]!)).not.toContain('skipped_by_name');

    const praxis = await asUser<{ skipped_by_name: string }>(users.therapist, PRAXIS, [ERIKA]);
    expect(praxis.rows[0]!.skipped_by_name).toBe('Olivia Office');

    // Einwilligungen bleiben offen.
    const einwilligungen = await asUser<{ state: string }>(
      users.plattformErika,
      'select state from public.platform_consents($1::uuid)',
      [ERIKA],
    );
    expect(einwilligungen.rows.every((e) => e.state === 'open')).toBe(true);
    const vermerke = await asPostgres(
      `select 1 from public.patient_privacy_records where patient_id = $1`,
      [SEED.patients.erika],
    );
    expect(vermerke.rows).toEqual([]);
    // Kein Auditeintrag (ADR-010 Fassung 3).
    const protokoll = await asPostgres(
      `select 1 from public.audit_log where subject_id = $1 or context->>'platform_access_id' = $1::text`,
      [ERIKA],
    );
    expect(protokoll.rows).toEqual([]);
    // Zweimal überspringen ändert nichts.
    const zweimal = await asUserCommitted<{ ok: boolean }>(users.office, UEBERSPRINGEN, [ERIKA]);
    expect(zweimal.rows[0]!.ok).toBe(false);
  });

  it('überspringen dürfen nur, die den Zugang verwalten', async () => {
    // Training: die Behandlungsrollen nicht, die Trainingsbetreuung schon.
    for (const konto of [users.therapist, users.teamLead]) {
      const fehler = await abgefangen(
        asUser(konto, UEBERSPRINGEN, [platformAccesses.erikaTraining]),
      );
      expect(fehler?.message).toContain('not allowed');
    }
    const trainer = await asUserCommitted<{ ok: boolean }>(users.trainer, UEBERSPRINGEN, [
      platformAccesses.erikaTraining,
    ]);
    expect(trainer.rows[0]!.ok).toBe(true);
    // Behandlung: die Trainingsbetreuung nicht.
    const fehler = await abgefangen(asUser(users.trainer, UEBERSPRINGEN, [ERIKA]));
    expect(fehler?.message).toContain('not allowed');
    // Plattformkonto und andere Organisation nicht.
    for (const konto of [users.plattformErika, (await fremdeOrganisation()).owner]) {
      const nein = await abgefangen(asUser(konto, UEBERSPRINGEN, [ERIKA]));
      expect(nein?.message).toContain('not allowed');
    }
    // Ein entzogener Zugang nicht.
    await asPostgres(
      `update public.platform_accesses set status = 'revoked', revoked_at = now(),
              revoked_reason = 'practice', revoked_by = created_by where id = $1`,
      [ERIKA],
    );
    const entzogen = await abgefangen(asUser(users.office, UEBERSPRINGEN, [ERIKA]));
    expect(entzogen?.message).toContain('not live');
  });

  it('fremde Person, Praxiskonto, gesperrt: kein Stand, kein Beenden', async () => {
    expect((await asUser(users.plattformTina, STAND, [ERIKA])).rows).toEqual([]);
    expect((await asUser(users.office, STAND, [ERIKA])).rows).toEqual([]);
    const tina = await abgefangen(asUser(users.plattformTina, BEENDEN, [ERIKA]));
    expect(tina?.message).toContain('not allowed');
    await asPostgres(
      `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
      [ERIKA],
    );
    expect((await asUser(users.plattformErika, STAND, [ERIKA])).rows).toEqual([]);
    const gesperrt = await abgefangen(asUser(users.plattformErika, BEENDEN, [ERIKA]));
    expect(gesperrt?.message).toContain('not allowed');
    // Den Stand für die Praxis liest kein Plattformkonto und keine fremde Praxis.
    expect((await asUser(users.plattformErika, PRAXIS, [ERIKA])).rows).toEqual([]);
    expect((await asUser((await fremdeOrganisation()).owner, PRAXIS, [ERIKA])).rows).toEqual([]);
  });
});
