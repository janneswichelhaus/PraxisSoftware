import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Das Voraussetzungsprofil im Training (KND-005, IDEA-LZK-004, ADR-021
 * Punkte 4, 6, 7 und 10).
 *
 *   * Schreiben owner und Trainingsbetreuung, lesen dazu das Büro (ANN-287,
 *     seit ABN-030 BEF-137); nie Behandlung oder Plattform. Jedes Lesen steht
 *     im Auditlog.
 *   * Gespeichert wird mit dem erwarteten Stand (§13).
 *   * Übernahmen aus der Behandlung sind Kopien und ändern sich nicht.
 */

const { users, trainingRelationships, organizationId } = SEED;
const TINA = trainingRelationships.tina;

const LESEN = 'select public.get_training_profile($1::uuid) as profil';
const SPEICHERN =
  'select public.save_training_profile($1::uuid, $2::jsonb, $3::timestamptz)::text as stand';

interface Profil {
  health_consent: boolean;
  profile: Record<string, string | null> | null;
  takeovers: Array<{ title: string; body: string; offered_on: string }>;
}

async function lesen(konto: string = users.trainer): Promise<Profil | null> {
  const { rows } = await asUser<{ profil: Profil | null }>(konto, LESEN, [TINA]);
  return rows[0]!.profil;
}

async function speichern(
  felder: Record<string, unknown>,
  erwartet: string | null = null,
  konto: string = users.trainer,
): Promise<string> {
  // Als Text: Der Stand traegt Mikrosekunden, ein Date nur Millisekunden.
  const { rows } = await asUserCommitted<{ stand: string }>(konto, SPEICHERN, [
    TINA,
    JSON.stringify(felder),
    erwartet,
  ]);
  return rows[0]!.stand;
}

describe('Voraussetzungsprofil (KND-005)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.training_takeovers');
    await asPostgres('delete from public.training_profiles');
  });

  it('legt das Profil an und ändert es mit dem erwarteten Stand', async () => {
    const stand = await speichern({
      goals: 'Wieder Treppen ohne Geländer',
      equipment: 'Theraband',
    });
    let profil = await lesen();
    expect(profil!.profile).toMatchObject({
      goals: 'Wieder Treppen ohne Geländer',
      equipment: 'Theraband',
      limits: null,
      updated_by_name: 'Tom Trainingsbetreuung',
    });
    await speichern({ goals: 'Treppen', equipment: '' }, stand, users.ownerTherapist);
    profil = await lesen(users.ownerTherapist);
    expect(profil!.profile).toMatchObject({ goals: 'Treppen', equipment: null });
  });

  it('überschreibt einen geänderten Stand nicht still (§13)', async () => {
    await speichern({ goals: 'A' });
    await expect(speichern({ goals: 'B' }, null)).rejects.toThrow(/changed meanwhile/);
    await expect(speichern({ goals: 'B' }, '2020-01-01T00:00:00Z')).rejects.toThrow(
      /changed meanwhile/,
    );
  });

  it.each([
    ['ein unbekanntes Feld', { befund: 'x' }],
    ['eine Zahl', { goals: 3 }],
    ['einen zu langen Text', { goals: 'x'.repeat(1001) }],
  ])('weist %s ab', async (_name, felder) => {
    await expect(speichern(felder)).rejects.toThrow(/invalid|check constraint/);
  });

  it('schreibt nach dem Vertragsende nicht mehr', async () => {
    await asPostgres(
      `update public.training_relationships
          set contract_ended_on = contract_started_on, status = 'inactive' where id = $1`,
      [TINA],
    );
    await expect(speichern({ goals: 'A' })).rejects.toThrow(/has ended/);
    await asPostgres(
      `update public.training_relationships set contract_ended_on = null, status = 'active' where id = $1`,
      [TINA],
    );
  });

  it.each([
    ['Büro', users.office],
    ['Therapeut:in', users.therapist],
    ['Teamleitung', users.teamLead],
    ['Plattformkonto', users.plattformTina],
  ])('lässt %s nicht schreiben (ANN-287)', async (_wer, konto) => {
    await expect(speichern({ goals: 'A' }, null, konto)).rejects.toThrow(/not allowed/);
  });

  it.each([
    ['Therapeut:in', users.therapist],
    ['Teamleitung', users.teamLead],
  ])('weist %s beim Lesen mit Eintrag ab (ADR-021 Punkt 6)', async (_wer, konto) => {
    await erwarteAbgewiesenenLeseversuch(
      konto,
      'select p from public.get_training_profile($1::uuid) p where p is not null',
      [TINA],
      'training_relationship.viewed',
    );
  });

  it('weist ein Plattformkonto ab und zeigt einer fremden Praxis nichts', async () => {
    await expect(lesen(users.plattformTina)).rejects.toThrow(/not allowed/);
    const fremd = await fremdeOrganisation();
    expect(await lesen(fremd.owner)).toBeNull();
  });

  it.each([
    ['Trainingsbetreuung', users.trainer],
    ['Büro (ABN-030, BEF-137)', users.office],
  ])('protokolliert jedes Lesen: %s (ADR-021 Punkt 8)', async (_wer, konto) => {
    const { rows: gelesen } = await asUserCommitted<{ profil: Profil | null }>(konto, LESEN, [
      TINA,
    ]);
    expect(gelesen[0]!.profil).not.toBeNull();
    const { rows } = await asPostgres<{ context: { view: string } }>(
      `select context from public.audit_log
        where action = 'training_relationship.viewed' and subject_id = $1 and actor_user_id = $2
        order by occurred_at desc limit 1`,
      [TINA, konto],
    );
    expect(rows[0]!.context.view).toBe('profile');
  });

  it('zeigt Übernahmen in ihrer Reihenfolge und lässt sie unverändert', async () => {
    await asPostgres(
      `insert into public.training_takeovers
         (organization_id, training_relationship_id, position, title, body, offered_on,
          released_platform_access_id)
       values ($1, $2, 2, 'Vorgeschichte', 'Kreuzband links', current_date, $3),
              ($1, $2, 1, 'Belastungsgrenzen', 'Keine Sprünge', current_date, $3)`,
      [organizationId, TINA, SEED.platformAccesses.tinaTraining],
    );
    const profil = await lesen();
    expect(profil!.takeovers.map((k) => k.title)).toEqual(['Belastungsgrenzen', 'Vorgeschichte']);
    await expect(
      asPostgres(`update public.training_takeovers set body = 'anders'`),
    ).rejects.toThrow(/immutable/);
  });

  it('nennt den Stand der Einwilligung zu Gesundheitsangaben (ANN-264)', async () => {
    expect((await lesen())!.health_consent).toBe(false);
  });
});
