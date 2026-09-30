import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabaseOhneTermine } from './helpers/db';

/**
 * TRN-007: Die Leistung haengt am Trainingsverhaeltnis (TRN-EPIC-003).
 *
 *   * Eine Trainingsleistung entsteht aus dem **durchgefuehrten**
 *     Trainingstermin (ANN-181) - ohne Dokumentation, ohne Ausfallhonorar.
 *   * Sie zeigt auf das Trainingsverhaeltnis und **nie** auf `patients`
 *     (ADR-021 Punkte 3 und 5) - schemaseitig, auch am Schreibweg vorbei.
 *   * Erfassen und Lesen bleiben bei owner und office. Weder die
 *     Trainingsbetreuung noch eine Behandlungsrolle kommt hinein - auch nicht,
 *     wer den Trainingstermin selbst betreut (ADR-021 Punkt 6).
 */

const { users, organizationId, patients, trainingRelationships } = SEED;

const STAFF_ANNA = '55555555-5555-4555-8555-000000000002';
const STAFF_TOM = '55555555-5555-4555-8555-000000000006';
const LOCATION = '33333333-3333-4333-8333-000000000001';

const KATALOG = {
  kg: 'cccccccc-cccc-4ccc-8ccc-000000000001',
  personalTraining: 'cccccccc-cccc-4ccc-8ccc-000000000009',
} as const;

const ERFASSEN = 'select public.record_billable_services($1::uuid, $2::jsonb) as n';
const OFFENE = 'select * from public.list_open_billable_appointments(100)';
const LEISTUNGEN = 'select * from public.list_billable_services(null, null, 200)';
const VORSCHLAG = 'select * from public.get_billable_service_draft($1::uuid)';

function pt(): string {
  return JSON.stringify([{ catalog_item_id: KATALOG.personalTraining, quantity: 1 }]);
}

/** Ein Trainingstermin im laufenden Monat, am Verhaeltnis, ohne Patientin. */
async function trainingstermin(
  opts: {
    stunde?: number;
    status?: 'confirmed' | 'completed';
    verhaeltnis?: string;
    staff?: string;
  } = {},
): Promise<string> {
  const status = opts.status ?? 'completed';
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, kind, training_relationship_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at, completed_at, completed_by
     ) values (
       $1, 'training', $2, $3, $4, 'practice', $5,
       (date_trunc('month', now() at time zone 'Europe/Berlin')
          + make_interval(hours => $6::int)) at time zone 'Europe/Berlin',
       (date_trunc('month', now() at time zone 'Europe/Berlin')
          + make_interval(hours => $6::int + 1)) at time zone 'Europe/Berlin',
       case when $5 = 'completed' then now() end,
       case when $5 = 'completed' then $7::uuid end
     ) returning id`,
    [
      organizationId,
      opts.verhaeltnis ?? trainingRelationships.tina,
      opts.staff ?? STAFF_TOM,
      LOCATION,
      status,
      opts.stunde ?? 30,
      users.trainer,
    ],
  );
  return rows[0]!.id;
}

describe('TRN-007: Leistung am Trainingsverhaeltnis', () => {
  beforeEach(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  describe('Erfassen', () => {
    it('erfasst am durchgefuehrten Trainingstermin eine Leistung am Verhaeltnis, nicht an der Akte', async () => {
      const termin = await trainingstermin();

      const { rows } = await asUserCommitted<{ n: number }>(users.office, ERFASSEN, [termin, pt()]);
      expect(rows[0]?.n).toBe(1);

      const { rows: zeilen } = await asPostgres<{
        patient_id: string | null;
        training_relationship_id: string | null;
        service_area: string;
        treatment_base_item_id: string | null;
      }>(
        `select patient_id, training_relationship_id, service_area, treatment_base_item_id
         from public.billable_services where appointment_id = $1`,
        [termin],
      );
      expect(zeilen).toEqual([
        {
          patient_id: null,
          training_relationship_id: trainingRelationships.tina,
          service_area: 'training',
          treatment_base_item_id: null,
        },
      ]);
    });

    it('protokolliert das Verhaeltnis und keine Patientenkennung', async () => {
      const termin = await trainingstermin();
      await asUserCommitted(users.office, ERFASSEN, [termin, pt()]);

      const { rows } = await asPostgres<{ context: Record<string, unknown> }>(
        `select context from public.audit_log
         where action = 'billable_service.recorded' and subject_id = $1`,
        [termin],
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.context.training_relationship_id).toBe(trainingRelationships.tina);
      expect(rows[0]?.context).not.toHaveProperty('patient_id');
    });

    it('wartet, bis der Termin stattgefunden hat (ANN-181)', async () => {
      const termin = await trainingstermin({ status: 'confirmed' });
      await expect(asUser(users.office, ERFASSEN, [termin, pt()])).rejects.toThrow(
        /training appointment has not taken place/,
      );
    });

    it('nimmt am Trainingstermin keine Behandlungsposition an', async () => {
      const termin = await trainingstermin();
      await expect(
        asUser(users.office, ERFASSEN, [
          termin,
          JSON.stringify([{ catalog_item_id: KATALOG.kg, quantity: 1 }]),
        ]),
      ).rejects.toThrow(/does not belong to the catalog version/);
    });

    it('bietet am Trainingstermin nur Trainingspositionen an, ohne Vorbelegung', async () => {
      const termin = await trainingstermin();
      const { rows } = await asUser<{ code: string; service_area: string; suggested: boolean }>(
        users.office,
        VORSCHLAG,
        [termin],
      );
      expect(rows.map((zeile) => zeile.code)).toEqual(['PT']);
      expect(rows.every((zeile) => zeile.service_area === 'training' && !zeile.suggested)).toBe(
        true,
      );
    });

    it('laesst die Erfassung zuruecknehmen', async () => {
      const termin = await trainingstermin();
      await asUserCommitted(users.office, ERFASSEN, [termin, pt()]);

      const { rows } = await asUserCommitted<{ n: number }>(
        users.office,
        'select public.delete_billable_services($1::uuid) as n',
        [termin],
      );
      expect(rows[0]?.n).toBe(1);
    });
  });

  describe('kein Durchgriff (ADR-021 Punkt 6)', () => {
    it('laesst die Trainingsbetreuung nicht erfassen, auch nicht am eigenen Termin', async () => {
      const termin = await trainingstermin({ staff: STAFF_TOM });
      await expect(asUser(users.trainer, ERFASSEN, [termin, pt()])).rejects.toThrow(
        /not allowed to record billable services/,
      );
    });

    it('zeigt der Trainingsbetreuung keine Arbeitsliste der Abrechnung', async () => {
      await trainingstermin();
      const { rows } = await asUser(users.trainer, OFFENE);
      expect(rows).toEqual([]);
    });

    it('oeffnet einer Behandlungsrolle keinen Weg ueber den eigenen Trainingstermin', async () => {
      // Anna ist therapist. Betreut sie einen Trainingstermin (etwa mit einer
      // zweiten Rolle), gilt die Ausnahme aus PRX-009 dort nicht: Sie galt dem
      // Heilmittel am eigenen **Behandlungs**termin (ANN-140).
      const termin = await trainingstermin({ staff: STAFF_ANNA });

      await expect(asUser(users.therapist, ERFASSEN, [termin, pt()])).rejects.toThrow(
        /not allowed to record billable services/,
      );
      const { rows } = await asUser(users.therapist, VORSCHLAG, [termin]);
      expect(rows).toEqual([]);
    });
  });

  describe('schemaseitig: je Bereich genau ein Verhaeltnis', () => {
    it('weist eine Trainingsleistung mit Patientenbezug ab - auch am Schreibweg vorbei', async () => {
      const termin = await trainingstermin();
      await expect(
        asPostgres(
          `insert into public.billable_services (
             organization_id, patient_id, training_relationship_id, appointment_id,
             catalog_item_id, performed_on
           ) values ($1, $2, $3, $4, $5, current_date)`,
          [
            organizationId,
            patients.erika,
            trainingRelationships.tina,
            termin,
            KATALOG.personalTraining,
          ],
        ),
      ).rejects.toThrow();
    });

    it('weist eine Trainingsleistung ohne Verhaeltnis ab', async () => {
      const termin = await trainingstermin();
      await expect(
        asPostgres(
          `insert into public.billable_services (
             organization_id, appointment_id, catalog_item_id, performed_on
           ) values ($1, $2, $3, current_date)`,
          [organizationId, termin, KATALOG.personalTraining],
        ),
      ).rejects.toThrow();
    });

    it('weist ein fremdes Verhaeltnis ab: Die Leistung gehoert zum Verhaeltnis ihres Termins', async () => {
      const termin = await trainingstermin({ verhaeltnis: trainingRelationships.tina });
      await expect(
        asPostgres(
          `insert into public.billable_services (
             organization_id, training_relationship_id, appointment_id,
             catalog_item_id, performed_on
           ) values ($1, $2, $3, $4, current_date)`,
          [organizationId, trainingRelationships.erika, termin, KATALOG.personalTraining],
        ),
      ).rejects.toThrow(/does not belong to the relationship of its appointment/);
    });

    it('haelt die Constraint auch ohne Trigger', async () => {
      const termin = await trainingstermin();
      await asUserCommitted(users.office, ERFASSEN, [termin, pt()]);

      await asPostgres(
        'alter table public.billable_services disable trigger billable_services_area_matches_context',
      );
      try {
        await expect(
          asPostgres(
            'update public.billable_services set patient_id = $1 where appointment_id = $2',
            [patients.erika, termin],
          ),
        ).rejects.toThrow(/billable_services_party/);
      } finally {
        await asPostgres(
          'alter table public.billable_services enable trigger billable_services_area_matches_context',
        );
      }
    });
  });

  describe('die Listen', () => {
    it('fuehrt den durchgefuehrten Trainingstermin mit dem Namen aus dem Training', async () => {
      const erledigt = await trainingstermin({ stunde: 30 });
      const geplant = await trainingstermin({ stunde: 34, status: 'confirmed' });

      const { rows } = await asUser<{
        appointment_id: string;
        patient_id: string | null;
        training_relationship_id: string | null;
        service_area: string;
        patient_name: string;
      }>(users.office, OFFENE);

      const training = rows.filter((zeile) => zeile.service_area === 'training');
      expect(training.map((zeile) => zeile.appointment_id)).toEqual([erledigt]);
      expect(training[0]).toMatchObject({
        patient_id: null,
        training_relationship_id: trainingRelationships.tina,
        patient_name: 'Tina Trainingskundin',
      });
      expect(rows.map((zeile) => zeile.appointment_id)).not.toContain(geplant);
    });

    it('fuehrt auch bei einer Person mit Akte keine Patientenkennung am Trainingstermin', async () => {
      // Erika hat beide Verhaeltnisse (ADR-021 Punkt 1). Ihr Trainingstermin
      // verraet die Akte nicht - weder in der Arbeitsliste noch in der Leistung.
      const termin = await trainingstermin({ verhaeltnis: trainingRelationships.erika });
      await asUserCommitted(users.office, ERFASSEN, [termin, pt()]);

      const { rows } = await asUser<{
        appointment_id: string;
        patient_id: string | null;
        training_relationship_id: string | null;
        service_area: string;
      }>(users.office, LEISTUNGEN);
      const zeile = rows.find((z) => z.appointment_id === termin);
      expect(zeile).toMatchObject({
        patient_id: null,
        training_relationship_id: trainingRelationships.erika,
        service_area: 'training',
      });
    });
  });
});
