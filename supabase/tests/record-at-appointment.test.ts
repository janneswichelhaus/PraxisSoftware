import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabaseOhneTermine } from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Termin abhaken: Heilmittel am eigenen Termin bestätigen (PRX-009, ANN-140).
 *
 * Behandelnde erfassen an ihrem eigenen Termin, owner und office an jedem;
 * zurücknehmen bleibt beim Büro. Die Regeln der Erfassung - nur aus
 * „dokumentiert" oder Gebührenanlass, Kontingent, keine Doppelerfassung -
 * gelten unverändert, weil derselbe Weg schreibt.
 */

const { users, organizationId, patients } = SEED;
const ANNA = '55555555-5555-4555-8555-000000000002';
const TIM = '55555555-5555-4555-8555-000000000004';
const LOCATION = '33333333-3333-4333-8333-000000000001';
/** Erika, Folgeverordnung: 10 Termine, Krankengymnastik 10 verordnet, 0 genutzt. */
const GRUNDLAGE = '88888888-8888-4888-8888-000000000004';
const POSITION = '99999999-9999-4999-8999-000000000005';
const KG = 'cccccccc-cccc-4ccc-8ccc-000000000001';

const VORSCHLAG = 'select * from public.get_billable_service_draft($1::uuid)';
const ERFASSEN = 'select public.record_billable_services($1::uuid, $2::jsonb) as anzahl';
const ENTFERNEN = 'select public.delete_billable_services($1::uuid) as anzahl';
const AM_TERMIN = 'select * from public.get_appointment_services($1::uuid)';
const KG_EINMAL = JSON.stringify([{ catalog_item_id: KG, quantity: 1 }]);

interface AmTermin {
  can_record: boolean;
  services: { code: string; label: string; quantity: number; status: string }[];
  recorded_by_name: string | null;
  basis_items: { remedy: string; prescribed_quantity: number; used_quantity: number }[] | null;
}

async function termin(
  staff: string,
  vorStunden: number,
  status: 'documented' | 'confirmed' = 'documented',
): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id, appointment_type, status,
       starts_at, ends_at, treatment_basis_id, completed_at, completed_by
     ) values (
       $1, $2, $3, $4, 'practice', $5,
       date_trunc('hour', now()) - make_interval(hours => $6::int),
       date_trunc('hour', now()) - make_interval(hours => $6::int - 1),
       $7,
       case when $5 = 'documented' then now() end,
       case when $5 = 'documented' then $8::uuid end
     ) returning id`,
    [
      organizationId,
      patients.erika,
      staff,
      LOCATION,
      status,
      vorStunden,
      GRUNDLAGE,
      users.ownerTherapist,
    ],
  );
  return rows[0]!.id;
}

async function genutzt(): Promise<number> {
  const { rows } = await asPostgres<{ used_quantity: number }>(
    'select used_quantity from public.treatment_base_items where id = $1',
    [POSITION],
  );
  return rows[0]!.used_quantity;
}

describe('Heilmittel am eigenen Termin bestätigen (PRX-009)', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('lässt die Therapeutin an ihrem eigenen Termin erfassen - vorbelegt aus der Verordnung', async () => {
    const id = await termin(ANNA, 3);

    const { rows: vorschlag } = await asUser<{ catalog_item_id: string; suggested: boolean }>(
      users.therapist,
      VORSCHLAG,
      [id],
    );
    expect(vorschlag.find((z) => z.catalog_item_id === KG)?.suggested).toBe(true);

    await asUserCommitted(users.therapist, ERFASSEN, [id, KG_EINMAL]);
    expect(await genutzt()).toBe(1);

    const { rows: protokoll } = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log
        where action = 'billable_service.recorded' and subject_id = $1`,
      [id],
    );
    expect(protokoll[0]!.context).toMatchObject({ recorded_by_role: 'treating' });
  });

  it('lässt die Teamleitung an ihrem eigenen Termin erfassen', async () => {
    const id = await termin(TIM, 3);
    await asUserCommitted(users.teamLead, ERFASSEN, [id, KG_EINMAL]);
    expect(await genutzt()).toBe(1);
  });

  it('weist die Therapeutin am Termin einer Kollegin ab - Vorschlag und Erfassen', async () => {
    const beiTim = await termin(TIM, 3);
    await expect(asUser(users.therapist, ERFASSEN, [beiTim, KG_EINMAL])).rejects.toThrow(
      /not allowed to record billable services/,
    );
    await erwarteAbgewiesenenLeseversuch(
      users.therapist,
      VORSCHLAG,
      [beiTim],
      'billable_services.read',
    );
    expect(await genutzt()).toBe(0);
  });

  it('lässt office weiter an jedem Termin erfassen und kennzeichnet es', async () => {
    const id = await termin(ANNA, 3);
    await asUserCommitted(users.office, ERFASSEN, [id, KG_EINMAL]);
    const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
      `select context from public.audit_log
        where action = 'billable_service.recorded' and subject_id = $1`,
      [id],
    );
    expect(rows[0]!.context).toMatchObject({ recorded_by_role: 'billing' });
  });

  it('lässt die Therapeutin nicht zurücknehmen - das bleibt beim Büro', async () => {
    const id = await termin(ANNA, 3);
    await asUserCommitted(users.therapist, ERFASSEN, [id, KG_EINMAL]);
    await expect(asUser(users.therapist, ENTFERNEN, [id])).rejects.toThrow(/not allowed/);
    expect(await genutzt()).toBe(1);

    await asUserCommitted(users.office, ENTFERNEN, [id]);
    expect(await genutzt()).toBe(0);
  });

  it('hält die Kopplung an die Dokumentation auch am eigenen Termin', async () => {
    const offen = await termin(ANNA, 3, 'confirmed');
    await expect(asUser(users.therapist, ERFASSEN, [offen, KG_EINMAL])).rejects.toThrow(
      /neither documented nor a fee occasion/,
    );
  });

  it('erfasst einen Termin nur einmal', async () => {
    const id = await termin(ANNA, 3);
    await asUserCommitted(users.therapist, ERFASSEN, [id, KG_EINMAL]);
    await expect(asUser(users.office, ERFASSEN, [id, KG_EINMAL])).rejects.toThrow(
      /already has billable services/,
    );
  });

  it('meldet ein ausgeschöpftes Kontingent', async () => {
    await asPostgres('update public.treatment_base_items set used_quantity = 10 where id = $1', [
      POSITION,
    ]);
    const id = await termin(ANNA, 3);
    await expect(asUser(users.therapist, ERFASSEN, [id, KG_EINMAL])).rejects.toThrow(
      /quantity exhausted/,
    );
  });

  it('weist die Trainingsbetreuung ab', async () => {
    const id = await termin(ANNA, 3);
    await expect(asUser(users.trainer, ERFASSEN, [id, KG_EINMAL])).rejects.toThrow(/not allowed/);
  });
});

describe('Was am Termin erfasst ist (PRX-009)', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('zeigt der behandelnden Person Erfassung und Mengen der Grundlage, ohne Preise', async () => {
    const id = await termin(ANNA, 3);
    const { rows: vorher } = await asUser<AmTermin>(users.therapist, AM_TERMIN, [id]);
    expect(vorher[0]).toMatchObject({
      can_record: true,
      services: [],
      recorded_by_name: null,
      basis_items: [{ remedy: 'Krankengymnastik', prescribed_quantity: 10, used_quantity: 0 }],
    });

    await asUserCommitted(users.therapist, ERFASSEN, [id, KG_EINMAL]);

    const { rows } = await asUser<AmTermin>(users.therapist, AM_TERMIN, [id]);
    expect(rows[0]!.services).toHaveLength(1);
    expect(rows[0]!.services[0]).toMatchObject({ quantity: 1, status: 'billable' });
    expect(Object.keys(rows[0]!.services[0]!)).not.toContain('unit_price_cents');
    expect(rows[0]!.recorded_by_name).toBe('Anna Beispiel');
    expect(rows[0]!.basis_items![0]!.used_quantity).toBe(1);
  });

  it('lässt office jeden Termin lesen', async () => {
    const id = await termin(TIM, 3);
    const { rows } = await asUser<AmTermin>(users.office, AM_TERMIN, [id]);
    expect(rows[0]!.can_record).toBe(true);
  });

  it('weist die Therapeutin am fremden Termin und die Trainingsbetreuung protokolliert ab', async () => {
    const beiTim = await termin(TIM, 3);
    await erwarteAbgewiesenenLeseversuch(
      users.therapist,
      AM_TERMIN,
      [beiTim],
      'billable_services.read',
    );
    await erwarteAbgewiesenenLeseversuch(
      users.trainer,
      AM_TERMIN,
      [beiTim],
      'billable_services.read',
    );
  });
});
