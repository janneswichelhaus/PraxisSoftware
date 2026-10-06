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
 * Eigene Termine auf der Plattform (POR-008, DSN-001 4.1, ADR-023 Punkte 19,
 * 22, 23, 24).
 *
 * Die Projektion liefert nur die Termine des Verhältnisses hinter einem
 * lesbaren Zugang, mit fester Spaltenliste. Jeder Negativfall aus Punkt 23
 * bekommt dieselbe Antwort: keine Zeile.
 */

const { users, platformAccesses, patients, trainingRelationships, organizationId } = SEED;
const TERMINE = 'select * from public.platform_appointments($1::uuid)';

interface Zeile {
  id: string;
  starts_at: string;
  status: string;
  appointment_type: string;
  staff_name: string | null;
  location_name: string | null;
  visit_street: string | null;
}

async function termine(konto: string, zugang: string) {
  return (await asUser<Zeile>(konto, TERMINE, [zugang])).rows;
}

/** Ein Trainingstermin fuer Erika, damit ihr zweiter Bereich etwas zeigt. */
async function erikaTraining() {
  await asPostgres(
    `insert into public.appointments
       (id, organization_id, kind, training_relationship_id, staff_member_id, location_id,
        appointment_type, status, starts_at, ends_at, created_by)
     values ('aaaaaaaa-aaaa-4aaa-8aaa-0000000009e1', $1, 'training', $2,
             '55555555-5555-4555-8555-000000000006', '33333333-3333-4333-8333-000000000001',
             'practice', 'confirmed', now() + interval '3 days', now() + interval '3 days 1 hour',
             $3)`,
    [organizationId, trainingRelationships.erika, users.office],
  );
}

describe('platform_appointments (POR-008)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  it('zeigt der Person ihre Behandlungstermine mit fester Spaltenliste', async () => {
    const zeilen = await termine(users.plattformErika, platformAccesses.erikaBehandlung);
    expect(zeilen.length).toBeGreaterThanOrEqual(4);
    // Nur Erikas Termine, keiner von Max.
    const eigene = await asPostgres<{ id: string }>(
      `select id from public.appointments where patient_id = $1`,
      [patients.erika],
    );
    expect(zeilen.every((z) => eigene.rows.some((e) => e.id === z.id))).toBe(true);
    expect(zeilen.map((z) => z.id)).not.toContain('aaaaaaaa-aaaa-4aaa-8aaa-000000000001');
    // Feste Spaltenliste (Punkt 22): keine Notiz, keine Grundlage, kein Gebuehrenanlass.
    expect(Object.keys(zeilen[0]!).sort()).toEqual([
      'appointment_type',
      'ends_at',
      'id',
      'late_notice',
      'location_name',
      'open_request_kind',
      'staff_name',
      'starts_at',
      'status',
      'visit_city',
      'visit_house_number',
      'visit_postal_code',
      'visit_street',
    ]);
    const heute = zeilen.find((z) => z.id === 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002')!;
    expect(heute.status).toBe('completed');
    expect(heute.staff_name).toBe('Anna Beispiel');
    expect(heute.visit_street).toBe('Testweg');
    expect(heute.location_name).toBeNull();
  });

  it('zeigt im Training nur die Trainingstermine des Verhaeltnisses (4.8)', async () => {
    await erikaTraining();
    const training = await termine(users.plattformErika, platformAccesses.erikaTraining);
    expect(training.map((z) => z.id)).toEqual(['aaaaaaaa-aaaa-4aaa-8aaa-0000000009e1']);
    expect(training[0]!.location_name).toBe('Hauptstandort Tuebingen');
    // Der Behandlungszugang sieht den Trainingstermin nicht.
    const behandlung = await termine(users.plattformErika, platformAccesses.erikaBehandlung);
    expect(behandlung.map((z) => z.id)).not.toContain('aaaaaaaa-aaaa-4aaa-8aaa-0000000009e1');
    // Tina sieht ihre eigenen drei, nicht Erikas.
    const tina = await termine(users.plattformTina, platformAccesses.tinaTraining);
    expect(tina.map((z) => z.id).sort()).toEqual([
      'aaaaaaaa-aaaa-4aaa-8aaa-000000000007',
      'aaaaaaaa-aaaa-4aaa-8aaa-000000000008',
      'aaaaaaaa-aaaa-4aaa-8aaa-000000000009',
    ]);
  });

  it('uebersetzt dokumentiert und abgerechnet in durchgefuehrt, laesst Absagen Absagen', async () => {
    await asPostgres(
      `update public.appointments set status = 'documented'
        where id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002'`,
    );
    await asPostgres(
      `update public.appointments
          set status = 'invoiced', fee_basis = null, completed_at = null, completed_by = null
        where id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000118'`,
    );
    const zeilen = await termine(users.plattformErika, platformAccesses.erikaBehandlung);
    expect(zeilen.find((z) => z.id === 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002')!.status).toBe(
      'completed',
    );
    expect(zeilen.find((z) => z.id === 'aaaaaaaa-aaaa-4aaa-8aaa-000000000118')!.status).toBe(
      'completed',
    );
  });

  it('laesst Termine aelter als zwoelf Monate weg (ANN-248)', async () => {
    await asPostgres(
      `update public.appointments set starts_at = starts_at - interval '13 months',
              ends_at = ends_at - interval '13 months', completed_at = null, completed_by = null,
              status = 'cancelled', cancelled_at = now(), cancelled_by = $1
        where id = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000118'`,
      [users.office],
    );
    const zeilen = await termine(users.plattformErika, platformAccesses.erikaBehandlung);
    expect(zeilen.map((z) => z.id)).not.toContain('aaaaaaaa-aaaa-4aaa-8aaa-000000000118');
  });

  it('fremde Person: ein anderes Konto bekommt ueber diesen Zugang nichts', async () => {
    expect(await termine(users.plattformTina, platformAccesses.erikaBehandlung)).toEqual([]);
  });

  it('Begleitung liest mit und wird protokolliert, die Person selbst nicht (Punkt 24)', async () => {
    const paula = await asUserCommitted<Zeile>(users.plattformPaula, TERMINE, [
      platformAccesses.paulaBegleitungMax,
    ]);
    expect(paula.rows.map((z) => z.id)).toContain('aaaaaaaa-aaaa-4aaa-8aaa-000000000001');
    await asUserCommitted<Zeile>(users.plattformErika, TERMINE, [platformAccesses.erikaBehandlung]);
    const { rows } = await asPostgres<{ actor_user_id: string; context: Record<string, unknown> }>(
      `select actor_user_id, context from public.audit_log
        where action = 'platform_representation.read' and context ->> 'view' = 'appointments'`,
    );
    expect(rows).toEqual([
      expect.objectContaining({
        actor_user_id: users.plattformPaula,
        context: expect.objectContaining({
          platform_access_id: platformAccesses.paulaBegleitungMax,
        }),
      }),
    ]);
  });

  it('gesperrt, entzogen, eingeladen: keine Zeile (Punkt 18)', async () => {
    await asPostgres(
      `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
      [platformAccesses.erikaBehandlung],
    );
    expect(await termine(users.plattformErika, platformAccesses.erikaBehandlung)).toEqual([]);
    await asPostgres(
      `update public.platform_accesses
          set status = 'revoked', locked_at = null, revoked_at = now(), revoked_reason = 'practice'
        where id = $1`,
      [platformAccesses.erikaBehandlung],
    );
    expect(await termine(users.plattformErika, platformAccesses.erikaBehandlung)).toEqual([]);
  });

  it('abgelaufene Lesefrist: keine Zeile (D2)', async () => {
    await asPostgres(
      `update public.patients
          set care_concluded_on = current_date - 40, care_concluded_at = now(),
              care_concluded_by = $2::uuid
        where id = $1`,
      [patients.erika, users.therapist],
    );
    expect(await termine(users.plattformErika, platformAccesses.erikaBehandlung)).toEqual([]);
  });

  it('Praxiskonto und andere Organisation: keine Zeile', async () => {
    expect(await termine(users.therapist, platformAccesses.erikaBehandlung)).toEqual([]);
    const fremd = await fremdeOrganisation();
    expect(await termine(fremd.owner, platformAccesses.erikaBehandlung)).toEqual([]);
    expect((await asUser(null, TERMINE, [platformAccesses.erikaBehandlung])).rows).toEqual([]);
  });
});
