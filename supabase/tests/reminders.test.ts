import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asAnon, asPostgres, asUser, fremdeOrganisation, resetDatabase } from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Erinnerungen am Rezeptende und an den vergessenen Abschluss (PRX-016,
 * ANN-146). Beide Listen fragen nur; geprüft wird, wer darauf steht und wer
 * nicht, dazu Rollen und Mandantengrenze.
 */
const { users, organizationId } = SEED;

const ANNA = '55555555-5555-4555-8555-000000000002';
const LOCATION = '33333333-3333-4333-8333-000000000001';
const PROBST = '77777777-7777-4777-8777-000000000001';

const ENDEND = 'select * from public.list_ending_prescriptions()';
const OHNE_ABSCHLUSS = 'select * from public.list_care_without_conclusion()';

const LENA = '66666666-6666-4666-8666-0000000000d1';

async function person(): Promise<void> {
  await asPostgres(`
    insert into public.persons (id, organization_id, given_name, family_name)
      values ('44444444-4444-4444-8444-0000000000d1', '${organizationId}', 'Lena', 'Erinnerung');
    insert into public.patients (id, organization_id, person_id)
      values ('${LENA}', '${organizationId}', '44444444-4444-4444-8444-0000000000d1');
  `);
}

async function verordnung(
  menge: number,
  art: 'first' | 'self_pay' = 'first',
  ausgestellt = '2026-09-01',
): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.treatment_bases
       (organization_id, patient_id, prescriber_id, treatment_basis_kind, issued_on, appointment_count)
     values ($1::uuid, $2::uuid, case when $3 = 'self_pay' then null else $4::uuid end, $3, $5::date, $6)
     returning id`,
    [organizationId, LENA, art, PROBST, ausgestellt, menge],
  );
  return rows[0]!.id;
}

async function termin(grundlage: string | null, tageAbHeute: number): Promise<void> {
  await asPostgres(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id, treatment_basis_id,
       appointment_type, status, starts_at, ends_at
     ) values (
       $1, $2, $3, $4, $5, 'practice', 'confirmed',
       date_trunc('hour', now()) + make_interval(days => $6::int, hours => 3),
       date_trunc('hour', now()) + make_interval(days => $6::int, hours => 3, mins => 45)
     )`,
    [organizationId, LENA, ANNA, LOCATION, grundlage, tageAbHeute],
  );
}

async function endend(konto: string = users.office): Promise<string[]> {
  return (await asUser<{ treatment_basis_id: string }>(konto, ENDEND)).rows.map(
    (r) => r.treatment_basis_id,
  );
}

async function ohneAbschluss(konto: string = users.therapist): Promise<string[]> {
  return (await asUser<{ patient_id: string }>(konto, OHNE_ABSCHLUSS)).rows.map(
    (r) => r.patient_id,
  );
}

describe('Verordnung endet (PRX-016)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await person();
  }, 120_000);

  it('nennt eine ganz verplante Verordnung, deren letzter Termin in vierzehn Tagen liegt', async () => {
    const id = await verordnung(2);
    await termin(id, 3);
    await termin(id, 10);
    expect(await endend()).toContain(id);
  });

  it('nennt sie noch nicht, wenn der letzte Termin weiter weg ist oder Termine fehlen', async () => {
    const weit = await verordnung(2, 'first', '2026-09-01');
    await termin(weit, 3);
    await termin(weit, 30);
    expect(await endend()).not.toContain(weit);

    await asPostgres('delete from public.appointments where patient_id = $1', [LENA]);
    await asPostgres('delete from public.treatment_bases where patient_id = $1', [LENA]);
    const luecke = await verordnung(5);
    await termin(luecke, 3);
    expect(await endend()).not.toContain(luecke);
  });

  it('nennt eine genutzte Verordnung, deren Termine alle stattgefunden haben', async () => {
    // Genutzt zaehlt seit ABN-001 durchgefuehrte Termine (ANN-210): Drei
    // Termine in der Vergangenheit, alle abgeschlossen, kein kommender.
    const id = await verordnung(3);
    for (const tage of [-21, -14, -7]) await termin(id, tage);
    await asPostgres(
      `update public.appointments
          set status = 'completed', completed_at = ends_at, completed_by = $2
        where treatment_basis_id = $1`,
      [id, users.therapist],
    );
    expect(await endend()).toContain(id);
  });

  it('nennt eine Verordnung nicht nur wegen der Leistungsmenge ihrer Positionen', async () => {
    // Die genutzte Menge einer Position ist eine Groesse der Abrechnung
    // (ANN-073) und sagt nichts darueber, ob Termine stattgefunden haben.
    const id = await verordnung(3);
    await asPostgres(
      `insert into public.treatment_base_items
         (organization_id, treatment_basis_id, sort_order, remedy, prescribed_quantity, used_quantity)
       values ($1::uuid, $2::uuid, 1, 'Krankengymnastik', 3, 3)`,
      [organizationId, id],
    );
    expect(await endend()).not.toContain(id);
  });

  it('schweigt bei Anschluss, beim Selbstzahler und nach dem Abschluss', async () => {
    const alt = await verordnung(1, 'first', '2026-08-01');
    await termin(alt, 2);
    await verordnung(10, 'first', '2026-09-20');
    expect(await endend()).not.toContain(alt);

    await asPostgres('delete from public.appointments where patient_id = $1', [LENA]);
    await asPostgres('delete from public.treatment_bases where patient_id = $1', [LENA]);
    const selbst = await verordnung(1, 'self_pay');
    await termin(selbst, 2);
    expect(await endend()).not.toContain(selbst);

    await asPostgres('delete from public.appointments where patient_id = $1', [LENA]);
    await asPostgres('delete from public.treatment_bases where patient_id = $1', [LENA]);
    const zu = await verordnung(1);
    await termin(zu, 2);
    await asPostgres(
      `update public.patients set care_concluded_on = current_date, care_concluded_at = now(), care_concluded_by = $2 where id = $1`,
      [LENA, users.therapist],
    );
    expect(await endend()).not.toContain(zu);
  });

  it('sagt, ob eine Empfehlung vorliegt - nicht, was darin steht', async () => {
    const id = await verordnung(1);
    await termin(id, 2);
    const ohne = await asUser<{ has_recommendation: boolean }>(users.office, ENDEND);
    expect(ohne.rows[0]!.has_recommendation).toBe(false);
    expect(Object.keys(ohne.rows[0]!)).not.toContain('follow_up_recommendation');

    await asPostgres(
      `update public.treatment_bases set follow_up_recommendation = 'Synthetisch: weiter' where id = $1`,
      [id],
    );
    const mit = await asUser<{ has_recommendation: boolean }>(users.office, ENDEND);
    expect(mit.rows[0]!.has_recommendation).toBe(true);
  });

  it('zeigt die Liste den vier Praxisrollen und weist die anderen protokolliert ab', async () => {
    const id = await verordnung(1);
    await termin(id, 2);
    for (const konto of [users.ownerTherapist, users.therapist, users.teamLead, users.office]) {
      expect(await endend(konto), konto).toContain(id);
    }
    for (const konto of [users.trainer, users.patientMax]) {
      await erwarteAbgewiesenenLeseversuch(konto, ENDEND, [], 'treatment_bases.read');
    }
    const fremd = await fremdeOrganisation();
    expect(await endend(fremd.owner)).toEqual([]);
    await expect(asAnon(ENDEND)).rejects.toThrow(/permission denied/i);
  });
});

describe('Versorgung ohne Abschluss (PRX-016)', () => {
  beforeEach(async () => {
    await resetDatabase();
    await person();
  }, 120_000);

  it('fragt nach sechs Monaten ohne Termin und ohne kommenden', async () => {
    await termin(null, -200);
    expect(await ohneAbschluss()).toContain(LENA);
  });

  it('fragt nicht bei einem juengeren oder einem kommenden Termin', async () => {
    await termin(null, -200);
    await termin(null, -30);
    expect(await ohneAbschluss()).not.toContain(LENA);

    await asPostgres('delete from public.appointments where patient_id = $1', [LENA]);
    await termin(null, -200);
    await termin(null, 5);
    expect(await ohneAbschluss()).not.toContain(LENA);
  });

  it('zaehlt ohne Termin die Anlage der Akte', async () => {
    expect(await ohneAbschluss()).not.toContain(LENA);
    await asPostgres(
      `update public.patients set created_at = now() - interval '7 months' where id = $1`,
      [LENA],
    );
    expect(await ohneAbschluss()).toContain(LENA);
  });

  it('fragt nicht nach einem Abschluss, der schon da ist', async () => {
    await termin(null, -200);
    await asPostgres(
      `update public.patients set care_concluded_on = current_date, care_concluded_at = now(), care_concluded_by = $2 where id = $1`,
      [LENA, users.therapist],
    );
    expect(await ohneAbschluss()).not.toContain(LENA);
  });

  it('zeigt die Liste nur den Rollen, die abschliessen duerfen', async () => {
    await termin(null, -200);
    for (const konto of [users.ownerTherapist, users.therapist, users.teamLead]) {
      expect(await ohneAbschluss(konto), konto).toContain(LENA);
    }
    for (const konto of [users.office, users.trainer, users.patientMax]) {
      await erwarteAbgewiesenenLeseversuch(konto, OHNE_ABSCHLUSS, [], 'patient_directory.read');
    }
    const fremd = await fremdeOrganisation();
    expect(await ohneAbschluss(fremd.owner)).not.toContain(LENA);
    await expect(asAnon(OHNE_ABSCHLUSS)).rejects.toThrow(/permission denied/i);
  });
});
