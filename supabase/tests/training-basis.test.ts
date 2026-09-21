import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, resetDatabase, tagInTagen } from './helpers/db';

/**
 * Die Trainingsgrundlage (CAL-025, ADR-022 Punkt 5).
 *
 * Eine EIGENE Klammer neben der Behandlungsgrundlage, keine dritte Bauart
 * davon. Die Tests halten die vier Unterschiede fest, die ADR-022 als Grund
 * dafuer nennt - andere Datenklasse, andere Frist, anderer Rollenschnitt,
 * andere Planungsmechanik - und den Satz, der die Klammer optional macht:
 * Pflicht ist das Verhaeltnis, nicht die Klammer.
 *
 * Schreibwege gibt es bewusst keine; sie entstehen mit dem Trainingsbereich
 * (E18 Schritt 7). Geprueft wird deshalb das Schema und die Policy.
 */

const { organizationId, users, patients, trainingRelationships } = SEED;

const TOM = '55555555-5555-4555-8555-000000000006';
const STANDORT = '33333333-3333-4333-8333-000000000001';
const TAG = tagInTagen(75);

async function klammer(
  verhaeltnis: string = trainingRelationships.tina,
  anzahl: number | null = 10,
): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.training_bases
       (organization_id, training_relationship_id, started_on, agreed_quantity)
     values ($1, $2, current_date, $3) returning id`,
    [organizationId, verhaeltnis, anzahl],
  );
  return rows[0]!.id;
}

async function trainingstermin(
  grundlage: string | null,
  verhaeltnis: string = trainingRelationships.tina,
  beginn = '09:00',
): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, training_relationship_id, training_basis_id,
       staff_member_id, location_id, appointment_type, kind,
       starts_at, ends_at
     ) values (
       $1, $2, $3, $4, $5, 'practice', 'training',
       ($6::date + $7::time) at time zone 'Europe/Berlin',
       ($6::date + $7::time) at time zone 'Europe/Berlin' + interval '1 hour'
     ) returning id`,
    [organizationId, verhaeltnis, grundlage, TOM, STANDORT, TAG, beginn],
  );
  return rows[0]!.id;
}

describe('Trainingsgrundlage', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  describe('Eine eigene Klammer, keine dritte Bauart (ADR-022 Punkt 5)', () => {
    it('traegt keine klinischen Felder', async () => {
      // Keine Diagnose, keine Leitsymptomatik, kein Therapieziel, keine
      // Verordner:in. Die Liste steht hier vollstaendig, damit ein spaeterer
      // Zusatz auffaellt, statt still hineinzuwachsen.
      const { rows } = await asPostgres<{ column_name: string }>(
        `select column_name from information_schema.columns
          where table_schema = 'public' and table_name = 'training_bases'
          order by column_name`,
      );
      expect(rows.map((r) => r.column_name)).toEqual([
        'agreed_quantity',
        'created_at',
        'created_by',
        'id',
        'organization_id',
        'started_on',
        'status',
        'training_relationship_id',
        'updated_at',
        'updated_by',
      ]);
    });

    it('zeigt auf das Verhaeltnis und auf keine Behandlungsdaten (ADR-021 Punkt 3)', async () => {
      const { rows } = await asPostgres<{ referenziert: string }>(`
        select distinct ccu.table_name as referenziert
        from information_schema.table_constraints tc
        join information_schema.constraint_column_usage ccu
          on ccu.constraint_name = tc.constraint_name and ccu.table_schema = tc.table_schema
        where tc.constraint_type = 'FOREIGN KEY'
          and tc.table_schema = 'public'
          and tc.table_name = 'training_bases'
        order by 1
      `);
      expect(rows.map((r) => r.referenziert)).toEqual(['organizations', 'training_relationships']);
    });

    it('laesst die Behandlungsgrundlage unveraendert (ADR-020 gilt fort)', async () => {
      // ADR-022 loest ADR-020 nicht ab. `treatment_basis_kind` kennt deshalb
      // weiterhin genau die zwei Bauarten und keine dritte.
      const { rows } = await asPostgres<{ definition: string }>(
        `select pg_get_constraintdef(oid) as definition
           from pg_constraint
          where conrelid = 'public.treatment_bases'::regclass
            and pg_get_constraintdef(oid) like '%treatment_basis_kind%'`,
      );
      expect(rows[0]?.definition).not.toContain('training');
    });
  });

  describe('Pflicht ist das Verhaeltnis, nicht die Klammer (ADR-022 Punkt 5)', () => {
    it('laesst die Einzelstunde ohne Klammer zu', async () => {
      await expect(trainingstermin(null)).resolves.toBeTruthy();
    });

    it('laesst eine Klammer ohne vereinbarte Anzahl zu', async () => {
      // Ein Pflichtfeld mit Vorbelegung 1 machte aus jeder Einzelstunde eine
      // Vereinbarung ueber einen Termin, die niemand getroffen hat.
      const id = await klammer(trainingRelationships.tina, null);
      const { rows } = await asPostgres<{ agreed_quantity: number | null }>(
        `select agreed_quantity from public.training_bases where id = $1`,
        [id],
      );
      expect(rows[0]?.agreed_quantity).toBeNull();
    });

    it('verbindet Termin und Klammer', async () => {
      const grundlage = await klammer();
      const id = await trainingstermin(grundlage);
      const { rows } = await asPostgres<{ training_basis_id: string }>(
        `select training_basis_id from public.appointments where id = $1`,
        [id],
      );
      expect(rows[0]?.training_basis_id).toBe(grundlage);
    });
  });

  describe('Die Klammer gehoert demselben Verhaeltnis wie der Termin', () => {
    it('verweigert die Klammer eines fremden Verhaeltnisses', async () => {
      // Erikas Klammer an Tinas Termin waere der Durchgriff im Kleinen: Zwei
      // Personen unter einer Planung, ohne dass es jemand sieht.
      const fremd = await klammer(trainingRelationships.erika);
      await expect(trainingstermin(fremd, trainingRelationships.tina)).rejects.toThrow(
        /appointments_training_basis_fkey/,
      );
    });

    it('verweigert die Klammer an einem Behandlungstermin', async () => {
      const grundlage = await klammer();
      await expect(
        asPostgres(
          `insert into public.appointments (
             organization_id, patient_id, training_basis_id, staff_member_id,
             location_id, appointment_type, kind, starts_at, ends_at
           ) values (
             $1, $2, $3, $4, $5, 'practice', 'therapy',
             ($6::date + time '15:00') at time zone 'Europe/Berlin',
             ($6::date + time '16:00') at time zone 'Europe/Berlin'
           )`,
          [
            organizationId,
            patients.max,
            grundlage,
            '55555555-5555-4555-8555-000000000002',
            STANDORT,
            TAG,
          ],
        ),
      ).rejects.toThrow(/appointments_training_basis_(scope|fkey)/);
    });
  });

  describe('Rollenschnitt: die Klammer folgt dem Verhaeltnis (ADR-021 Punkt 6)', () => {
    it('zeigt sie owner, trainer und office', async () => {
      await klammer();
      for (const konto of [users.ownerTherapist, users.trainer, users.office]) {
        const { rows } = await asUser(konto, `select id from public.training_bases`);
        expect(rows.length).toBe(1);
      }
    });

    it('zeigt sie den therapeutischen Rollen nicht', async () => {
      // Der offene Zugriff aller Therapeut:innen auf alle Akten gilt
      // INNERHALB des Behandlungsverhaeltnisses (PROJECT_PRINCIPLES.md §4.2)
      // und begruendet keinen Zugriff auf Trainingsdaten.
      await klammer();
      for (const konto of [users.therapist, users.teamLead, users.patientMax]) {
        const { rows } = await asUser(konto, `select id from public.training_bases`);
        expect(rows).toEqual([]);
      }
    });

    it('laesst niemanden schreiben - auch nicht die Trainingsrolle', async () => {
      // Schreibwege entstehen mit dem Trainingsbereich, nicht auf Vorrat
      // (ADR-014).
      await expect(
        asUser(
          users.trainer,
          `insert into public.training_bases
             (organization_id, training_relationship_id, started_on)
           values ($1, $2, current_date)`,
          [organizationId, trainingRelationships.tina],
        ),
      ).rejects.toThrow(/permission denied/i);
    });
  });

  describe('Aufbewahrung (ADR-008, ADR-021 Punkt 4)', () => {
    it('haengt an der Datenklasse des Verhaeltnisses und nicht an der Akte', async () => {
      const { rows } = await asPostgres<{ class_key: string; deletion_mode: string }>(
        `select class_key, deletion_mode from public.retention_assignments
          where table_name = 'training_bases'`,
      );
      expect(rows).toEqual([
        { class_key: 'trainingsverhaeltnis', deletion_mode: 'ueber_elterndatensatz' },
      ]);
    });
  });
});
