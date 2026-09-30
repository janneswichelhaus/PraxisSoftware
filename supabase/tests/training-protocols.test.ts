import { beforeEach, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabase } from './helpers/db';
import {
  erwarteAbgewiesenenLeseversuch,
  erwarteAbgewiesenenSchreibversuch,
} from './helpers/abgewiesen';

/**
 * TRN-EPIC-004: Das Trainingsprotokoll (TRN-009) und `documented` am
 * Trainingstermin (TRN-010).
 *
 *   * Das Protokoll ist ein Fachdatum des Trainingsverhaeltnisses, kein
 *     Eintrag nach ADR-016 (ADR-022 Punkt 7): eigene Tabelle, eigene
 *     Datenklasse, keine automatische Finalisierung (Punkt 6).
 *   * Schreiben, abschliessen, lesen: owner und trainer (ANN-184); nach dem
 *     Abschluss unveraenderlich (ANN-185).
 *   * Invariante: Ein Trainingstermin ist `documented` genau dann, wenn es ein
 *     abgeschlossenes Protokoll gibt (ADR-018 Punkt 3 nach ADR-022 Punkt 8).
 *   * Kein Durchgriff in beide Richtungen (ADR-021 Punkt 6).
 */

const { users, organizationId, trainingRelationships } = SEED;

const TOM = '55555555-5555-4555-8555-000000000006';
const PRAXIS = '33333333-3333-4333-8333-000000000001';
/** Tinas Trainingstermin heute, bestaetigt. */
const TRAINING_HEUTE = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000007';
/** Tinas Trainingstermin vorgestern, durchgefuehrt. */
const TRAINING_VORGESTERN = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000009';
/** Ein Behandlungstermin heute. */
const BEHANDLUNG_HEUTE = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';

const SPEICHERN =
  'select id, updated_at::text as updated_at from public.save_training_protocol($1::uuid, $2, $3::timestamptz)';
const ABSCHLIESSEN =
  'select public.finalize_training_protocol($1::uuid, $2, $3::timestamptz) as id';
const LESEN = 'select * from public.get_training_protocol($1::uuid)';
const LISTE = 'select * from public.list_training_protocols($1::uuid)';
const LAUF = 'select public.apply_retention() as anzahl';
const ABSAGEN = `select public.cancel_appointment($1::uuid, $2::timestamptz, 'other', null, null)`;
const NICHT_ANGETROFFEN = 'select public.record_no_show($1::uuid, $2::timestamptz, false)';

async function speichere(
  user: string,
  termin: string,
  text: string,
  stand: string | null = null,
): Promise<{ id: string; updated_at: string }> {
  const { rows } = await asUserCommitted<{ id: string; updated_at: string }>(user, SPEICHERN, [
    termin,
    text,
    stand,
  ]);
  return rows[0]!;
}

async function schliesseAb(
  user: string,
  termin: string,
  text: string,
  stand: string | null = null,
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(user, ABSCHLIESSEN, [termin, text, stand]);
  return rows[0]!.id;
}

async function protokoll(termin: string) {
  const { rows } = await asPostgres<{
    id: string;
    status: string;
    content: string;
    updated_at: string;
    finalized_by: string | null;
  }>(
    `select id, status, content, updated_at::text as updated_at, finalized_by
       from public.training_protocols where appointment_id = $1`,
    [termin],
  );
  return rows[0];
}

async function terminStatus(id: string): Promise<string | undefined> {
  const { rows } = await asPostgres<{ status: string }>(
    'select status from public.appointments where id = $1',
    [id],
  );
  return rows[0]?.status;
}

async function terminStand(id: string): Promise<string> {
  const { rows } = await asPostgres<{ t: string }>(
    'select updated_at::text as t from public.appointments where id = $1',
    [id],
  );
  return rows[0]!.t;
}

async function audit(action: string, subjectId: string) {
  const { rows } = await asPostgres<{ outcome: string; context: Record<string, unknown> }>(
    `select outcome, context from public.audit_log
     where action = $1 and subject_id = $2 order by occurred_at, id`,
    [action, subjectId],
  );
  return rows;
}

/** Ein weiterer Trainingstermin Tinas, in `tage` Tagen, bestaetigt. */
async function trainingstermin(tage: number): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, kind, training_relationship_id, staff_member_id, location_id,
       appointment_type, status, starts_at, ends_at
     ) values (
       $1, 'training', $2, $3, $4, 'practice', 'confirmed',
       ((current_date + $5::int) + time '07:00') at time zone 'Europe/Berlin',
       ((current_date + $5::int) + time '08:00') at time zone 'Europe/Berlin'
     ) returning id`,
    [organizationId, trainingRelationships.tina, TOM, PRAXIS, tage],
  );
  return rows[0]!.id;
}

describe('TRN-009: Trainingsprotokoll', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  describe('schemaseitig', () => {
    it('ordnet die Tabelle der Datenklasse des Trainingsverhaeltnisses zu', async () => {
      const { rows } = await asPostgres<{ class_key: string; deletion_mode: string }>(
        `select class_key, deletion_mode from public.retention_assignments
          where table_name = 'training_protocols'`,
      );
      expect(rows).toEqual([
        { class_key: 'trainingsverhaeltnis', deletion_mode: 'ueber_elterndatensatz' },
      ]);
    });

    it('laesst keinen direkten Zugriff an den Funktionen vorbei zu', async () => {
      await expect(
        asUser(users.trainer, 'select * from public.training_protocols'),
      ).rejects.toThrow(/permission denied/i);
      await expect(
        asUser(
          users.trainer,
          `insert into public.training_protocols
             (organization_id, training_relationship_id, appointment_id, content, created_by, updated_by)
           values ($1, $2, $3, 'x', $4, $4)`,
          [organizationId, trainingRelationships.tina, TRAINING_HEUTE, users.trainer],
        ),
      ).rejects.toThrow(/permission denied/i);
    });

    it('haengt kein Protokoll an einen Behandlungstermin - auch am Schreibweg vorbei', async () => {
      await expect(
        asPostgres(
          `insert into public.training_protocols
             (organization_id, training_relationship_id, appointment_id, content, created_by, updated_by)
           values ($1, $2, $3, 'x', $4, $4)`,
          [organizationId, trainingRelationships.tina, BEHANDLUNG_HEUTE, users.trainer],
        ),
      ).rejects.toThrow(/requires a training appointment/);
    });

    it('haengt kein Protokoll an den Termin eines anderen Verhaeltnisses', async () => {
      await expect(
        asPostgres(
          `insert into public.training_protocols
             (organization_id, training_relationship_id, appointment_id, content, created_by, updated_by)
           values ($1, $2, $3, 'x', $4, $4)`,
          [organizationId, trainingRelationships.erika, TRAINING_HEUTE, users.trainer],
        ),
      ).rejects.toThrow(/requires a training appointment/);
    });
  });

  describe('Entwurf', () => {
    it('legt an, liest und aendert mit erwartetem Stand - protokolliert ohne Inhalt', async () => {
      const erst = await speichere(users.trainer, TRAINING_HEUTE, 'Kniebeugen 3 x 10');
      expect(erst.id).toBeTruthy();

      const angelegt = await audit('training_protocol.created', erst.id);
      expect(angelegt).toHaveLength(1);
      expect(angelegt[0]!.context).toEqual({
        surface: 'web',
        appointment_id: TRAINING_HEUTE,
        training_relationship_id: trainingRelationships.tina,
      });

      const { rows } = await asUserCommitted<{ status: string; content: string }>(
        users.trainer,
        LESEN,
        [TRAINING_HEUTE],
      );
      expect(rows).toEqual([
        expect.objectContaining({ status: 'draft', content: 'Kniebeugen 3 x 10' }),
      ]);
      expect(await audit('training_protocol.viewed', erst.id)).toHaveLength(1);

      await expect(
        asUser(users.trainer, SPEICHERN, [TRAINING_HEUTE, 'Zweiter Stand', null]),
      ).rejects.toThrow(/expected updated_at is required/);
      await expect(
        asUser(users.trainer, SPEICHERN, [TRAINING_HEUTE, 'Zweiter Stand', '2000-01-01T00:00:00Z']),
      ).rejects.toThrow(/changed meanwhile/);

      const zweit = await speichere(
        users.ownerTherapist,
        TRAINING_HEUTE,
        'Kniebeugen 3 x 12',
        erst.updated_at,
      );
      expect(zweit.id).toBe(erst.id);
      expect((await protokoll(TRAINING_HEUTE))?.content).toBe('Kniebeugen 3 x 12');
      const geaendert = await audit('training_protocol.updated', erst.id);
      expect(geaendert).toHaveLength(1);
      expect(JSON.stringify(geaendert)).not.toContain('Kniebeugen');

      // Der Termin bleibt, wo er war: Ein Entwurf dokumentiert nichts.
      expect(await terminStatus(TRAINING_HEUTE)).toBe('confirmed');
    });

    it('weist leeren und zu langen Text ab', async () => {
      await expect(
        asUser(users.trainer, SPEICHERN, [TRAINING_HEUTE, ' \n\t ', null]),
      ).rejects.toThrow(/must not be empty/);
      await expect(
        asUser(users.trainer, SPEICHERN, [TRAINING_HEUTE, 'x'.repeat(20001), null]),
      ).rejects.toThrow(/too long/);
    });

    it('protokolliert keine abgesagte und keine nicht angetroffene Einheit', async () => {
      const abgesagt = await trainingstermin(3);
      await asUserCommitted(users.ownerTherapist, ABSAGEN, [abgesagt, await terminStand(abgesagt)]);
      await expect(asUser(users.trainer, SPEICHERN, [abgesagt, 'Text', null])).rejects.toThrow(
        /cancelled appointment cannot be protocolled/,
      );
      await expect(asUser(users.trainer, ABSCHLIESSEN, [abgesagt, 'Text', null])).rejects.toThrow(
        /cancelled appointment cannot be protocolled/,
      );

      const nicht = await trainingstermin(-1);
      await asUserCommitted(users.ownerTherapist, NICHT_ANGETROFFEN, [
        nicht,
        await terminStand(nicht),
      ]);
      await expect(asUser(users.trainer, SPEICHERN, [nicht, 'Text', null])).rejects.toThrow(
        /no-show appointment cannot be protocolled/,
      );
    });

    it('verhindert Absage und Nichtantreffen, solange ein Protokoll am Termin haengt', async () => {
      await speichere(users.trainer, TRAINING_HEUTE, 'Aufwaermen');
      await expect(
        asUser(users.ownerTherapist, ABSAGEN, [TRAINING_HEUTE, await terminStand(TRAINING_HEUTE)]),
      ).rejects.toThrow(/training protocol exists/);
      await expect(
        asUser(users.ownerTherapist, NICHT_ANGETROFFEN, [
          TRAINING_HEUTE,
          await terminStand(TRAINING_HEUTE),
        ]),
      ).rejects.toThrow(/training protocol exists/);
    });

    it('bleibt von der automatischen Finalisierung unberuehrt (ADR-022 Punkt 6)', async () => {
      await speichere(users.trainer, TRAINING_VORGESTERN, 'Entwurf von vorgestern');
      await asPostgres(
        `update public.training_protocols
            set created_at = now() - interval '10 days', updated_at = now() - interval '10 days'
          where appointment_id = $1`,
        [TRAINING_VORGESTERN],
      );
      await asPostgres('select public.finalize_overdue_treatment_notes()');
      expect((await protokoll(TRAINING_VORGESTERN))?.status).toBe('draft');
      expect(await terminStatus(TRAINING_VORGESTERN)).toBe('completed');
    });
  });

  describe('Abschluss und documented (TRN-010, ADR-018 Punkt 3)', () => {
    it('schliesst den Entwurf ab und setzt den Termin im selben Vorgang auf documented', async () => {
      const entwurf = await speichere(users.trainer, TRAINING_HEUTE, 'Entwurf');
      const id = await schliesseAb(
        users.trainer,
        TRAINING_HEUTE,
        'Rudern 4 x 8, Plank 3 x 30 s',
        entwurf.updated_at,
      );
      expect(id).toBe(entwurf.id);

      const p = await protokoll(TRAINING_HEUTE);
      expect(p).toMatchObject({
        status: 'final',
        content: 'Rudern 4 x 8, Plank 3 x 30 s',
        finalized_by: users.trainer,
      });
      expect(await terminStatus(TRAINING_HEUTE)).toBe('documented');
      expect(await audit('training_protocol.finalized', id)).toHaveLength(1);

      const dokumentiert = await audit('appointment.documented', TRAINING_HEUTE);
      expect(dokumentiert).toHaveLength(1);
      expect(dokumentiert[0]!.context).toMatchObject({
        kind: 'training',
        training_relationship_id: trainingRelationships.tina,
      });
    });

    it('legt ohne Entwurf gleich abgeschlossen an - auch am durchgefuehrten Termin', async () => {
      const id = await schliesseAb(users.ownerTherapist, TRAINING_VORGESTERN, 'Zirkel, 40 min');
      expect((await protokoll(TRAINING_VORGESTERN))?.status).toBe('final');
      expect(await terminStatus(TRAINING_VORGESTERN)).toBe('documented');
      expect(await audit('training_protocol.created', id)).toHaveLength(1);
      expect(await audit('training_protocol.finalized', id)).toHaveLength(1);
    });

    it('ist danach unveraenderlich - ueber jeden Weg (ANN-185)', async () => {
      await schliesseAb(users.trainer, TRAINING_HEUTE, 'Fertig');
      const stand = (await protokoll(TRAINING_HEUTE))!.updated_at;

      await expect(
        asUser(users.trainer, SPEICHERN, [TRAINING_HEUTE, 'Neu', stand]),
      ).rejects.toThrow(/finalized training protocol cannot be changed/);
      await expect(
        asUser(users.trainer, ABSCHLIESSEN, [TRAINING_HEUTE, 'Neu', stand]),
      ).rejects.toThrow(/finalized training protocol cannot be changed/);
      await expect(
        asPostgres(
          `update public.training_protocols set content = 'Neu' where appointment_id = $1`,
          [TRAINING_HEUTE],
        ),
      ).rejects.toThrow(/finalized training protocol cannot be changed/);
      await expect(
        asPostgres(
          `update public.training_protocols
              set status = 'draft', finalized_at = null, finalized_by = null
            where appointment_id = $1`,
          [TRAINING_HEUTE],
        ),
      ).rejects.toThrow(/finalized training protocol cannot be changed/);
      expect((await protokoll(TRAINING_HEUTE))?.content).toBe('Fertig');
    });

    it('oeffnet einen dokumentierten Trainingstermin nicht wieder', async () => {
      await schliesseAb(users.trainer, TRAINING_HEUTE, 'Fertig');
      await expect(
        asUser(users.trainer, 'select public.reopen_appointment($1::uuid, $2::timestamptz)', [
          TRAINING_HEUTE,
          await terminStand(TRAINING_HEUTE),
        ]),
      ).rejects.toThrow(/appointment is not completed/);
    });

    it('setzt documented am Trainingstermin nie ohne abgeschlossenes Protokoll', async () => {
      await expect(
        asPostgres(`update public.appointments set status = 'documented' where id = $1`, [
          TRAINING_HEUTE,
        ]),
      ).rejects.toThrow(/documented only by a finalized training protocol/);

      await speichere(users.trainer, TRAINING_HEUTE, 'Nur Entwurf');
      await expect(
        asPostgres(`update public.appointments set status = 'documented' where id = $1`, [
          TRAINING_HEUTE,
        ]),
      ).rejects.toThrow(/documented only by a finalized training protocol/);
    });

    it('haelt die Invariante in beide Richtungen ueber den ganzen Bestand', async () => {
      await schliesseAb(users.trainer, TRAINING_HEUTE, 'Eins');
      await speichere(users.trainer, TRAINING_VORGESTERN, 'Zwei, nur Entwurf');

      const { rows } = await asPostgres<{ id: string; status: string; abgeschlossen: boolean }>(
        `select a.id, a.status,
                exists (select 1 from public.training_protocols p
                         where p.appointment_id = a.id and p.status = 'final') as abgeschlossen
           from public.appointments a
          where a.kind = 'training'`,
      );
      expect(rows.length).toBeGreaterThan(2);
      for (const zeile of rows) {
        expect(zeile.status === 'documented').toBe(zeile.abgeschlossen);
      }
    });

    it('rechnet den dokumentierten Trainingstermin weiter ab (ANN-181)', async () => {
      await schliesseAb(users.trainer, TRAINING_VORGESTERN, 'Abgerechnet');
      const { rows } = await asUserCommitted<{ n: number }>(
        users.office,
        'select public.record_billable_services($1::uuid, $2::jsonb) as n',
        [
          TRAINING_VORGESTERN,
          JSON.stringify([
            { catalog_item_id: 'cccccccc-cccc-4ccc-8ccc-000000000009', quantity: 1 },
          ]),
        ],
      );
      expect(Number(rows[0]!.n)).toBe(1);
    });
  });

  describe('Abschliessen am Trainingstermin (TRN-010, ANN-186)', () => {
    const ABSCHLUSS = 'select public.complete_appointment($1::uuid, $2::timestamptz) as id';
    const OEFFNEN = 'select public.reopen_appointment($1::uuid, $2::timestamptz) as id';

    it('laesst die Trainingsbetreuung ihre Einheit abschliessen und wieder oeffnen', async () => {
      await asUserCommitted(users.trainer, ABSCHLUSS, [
        TRAINING_HEUTE,
        await terminStand(TRAINING_HEUTE),
      ]);
      expect(await terminStatus(TRAINING_HEUTE)).toBe('completed');
      const abgeschlossen = await audit('appointment.completed', TRAINING_HEUTE);
      expect(abgeschlossen).toHaveLength(1);
      expect(abgeschlossen[0]!.context).toMatchObject({
        kind: 'training',
        training_relationship_id: trainingRelationships.tina,
      });

      await asUserCommitted(users.trainer, OEFFNEN, [
        TRAINING_HEUTE,
        await terminStand(TRAINING_HEUTE),
      ]);
      expect(await terminStatus(TRAINING_HEUTE)).toBe('confirmed');
      expect((await audit('appointment.reopened', TRAINING_HEUTE))[0]!.context).toMatchObject({
        kind: 'training',
        from_status: 'completed',
      });
    });

    it('fuehrt vom durchgefuehrten Termin mit dem Protokoll nach documented', async () => {
      await asUserCommitted(users.office, ABSCHLUSS, [
        TRAINING_HEUTE,
        await terminStand(TRAINING_HEUTE),
      ]);
      await schliesseAb(users.trainer, TRAINING_HEUTE, 'Nach dem Abschluss');
      expect(await terminStatus(TRAINING_HEUTE)).toBe('documented');
      await expect(
        asUser(users.trainer, OEFFNEN, [TRAINING_HEUTE, await terminStand(TRAINING_HEUTE)]),
      ).rejects.toThrow(/appointment is not completed/);
    });

    it('findet fuer die Trainingsbetreuung keinen Behandlungstermin', async () => {
      await expect(
        asUser(users.trainer, ABSCHLUSS, [BEHANDLUNG_HEUTE, await terminStand(BEHANDLUNG_HEUTE)]),
      ).rejects.toThrow(/appointment not found/);
    });

    it('findet fuer therapist und team_lead keinen Trainingstermin', async () => {
      for (const user of [users.therapist, users.teamLead]) {
        for (const sql of [ABSCHLUSS, OEFFNEN]) {
          await expect(
            asUser(user, sql, [TRAINING_VORGESTERN, await terminStand(TRAINING_VORGESTERN)]),
          ).rejects.toThrow(/appointment not found/);
        }
      }
      expect(await terminStatus(TRAINING_VORGESTERN)).toBe('completed');
    });

    it('weist ein Patientenkonto ab', async () => {
      await expect(
        asUser(users.patientMax, ABSCHLUSS, [TRAINING_HEUTE, await terminStand(TRAINING_HEUTE)]),
      ).rejects.toThrow(/not allowed to complete appointments/);
    });
  });

  describe('Einheiten einer Kundin', () => {
    it('listet die Protokolle neueste zuerst und protokolliert jedes gezeigte', async () => {
      const heute = await speichere(users.trainer, TRAINING_HEUTE, 'Heute');
      const vorgestern = await schliesseAb(users.trainer, TRAINING_VORGESTERN, 'Vorgestern');

      const { rows } = await asUserCommitted<{ id: string; status: string; content: string }>(
        users.trainer,
        LISTE,
        [trainingRelationships.tina],
      );
      expect(rows.map((r) => [r.id, r.status, r.content])).toEqual([
        [heute.id, 'draft', 'Heute'],
        [vorgestern, 'final', 'Vorgestern'],
      ]);
      expect(await audit('training_protocol.viewed', heute.id)).toHaveLength(1);
      expect(await audit('training_protocol.viewed', vorgestern)).toHaveLength(1);

      // Erika trainiert auch, hat aber kein Protokoll: nichts von Tina.
      const { rows: erika } = await asUser(users.trainer, LISTE, [trainingRelationships.erika]);
      expect(erika).toEqual([]);
    });

    it('findet ein unbekanntes Verhaeltnis nicht', async () => {
      await expect(
        asUser(users.trainer, LISTE, ['eeeeeeee-eeee-4eee-8eee-0000000000ab']),
      ).rejects.toThrow(/training relationship not found/);
    });
  });

  describe('kein Durchgriff (ADR-021 Punkt 6, ANN-184)', () => {
    it.each([
      ['therapist', users.therapist],
      ['team_lead', users.teamLead],
      ['office', users.office],
      ['Patientenkonto', users.patientMax],
    ])('%s schreibt kein Protokoll und schliesst keines ab', async (_rolle, user) => {
      await erwarteAbgewiesenenSchreibversuch(
        user,
        SPEICHERN,
        [TRAINING_HEUTE, 'Versuch', null],
        'training_protocol.updated',
      );
      await erwarteAbgewiesenenSchreibversuch(
        user,
        ABSCHLIESSEN,
        [TRAINING_HEUTE, 'Versuch', null],
        'training_protocol.finalized',
      );
      expect(await protokoll(TRAINING_HEUTE)).toBeUndefined();
      expect(await terminStatus(TRAINING_HEUTE)).toBe('confirmed');
    });

    it.each([
      ['therapist', users.therapist],
      ['team_lead', users.teamLead],
      ['office', users.office],
      ['Patientenkonto', users.patientMax],
    ])('%s liest kein Protokoll', async (_rolle, user) => {
      await schliesseAb(users.trainer, TRAINING_HEUTE, 'Geheim');
      await erwarteAbgewiesenenLeseversuch(
        user,
        LESEN,
        [TRAINING_HEUTE],
        'training_protocol.viewed',
      );
      await erwarteAbgewiesenenLeseversuch(
        user,
        LISTE,
        [trainingRelationships.tina],
        'training_protocol.viewed',
      );
    });

    it('findet ueber den Protokollweg keinen Behandlungstermin', async () => {
      for (const sql of [SPEICHERN, ABSCHLIESSEN]) {
        await expect(
          asUser(users.ownerTherapist, sql, [BEHANDLUNG_HEUTE, 'Text', null]),
        ).rejects.toThrow(/appointment not found/);
      }
      await expect(asUser(users.ownerTherapist, LESEN, [BEHANDLUNG_HEUTE])).rejects.toThrow(
        /appointment not found/,
      );
    });

    it('laesst die Trainingsbetreuung keine Behandlungsdokumentation am Trainingstermin anlegen', async () => {
      await expect(
        asUser(users.trainer, 'select public.create_treatment_note($1::uuid, $2)', [
          TRAINING_HEUTE,
          'Befund',
        ]),
      ).rejects.toThrow(/not allowed|not found|cannot be documented/);
    });

    it('ohne Sitzung bleibt es bei der Ausnahme', async () => {
      for (const [sql, params] of [
        [SPEICHERN, [TRAINING_HEUTE, 'x', null]],
        [ABSCHLIESSEN, [TRAINING_HEUTE, 'x', null]],
        [LESEN, [TRAINING_HEUTE]],
        [LISTE, [trainingRelationships.tina]],
      ] as const) {
        await expect(asUser(null, sql, [...params])).rejects.toThrow(/not authenticated/);
      }
    });
  });

  describe('Loeschlauf', () => {
    async function vertragEndeteVorVierJahren(): Promise<void> {
      await asPostgres(
        `update public.training_relationships
            set contract_started_on = (current_date - interval '6 years')::date,
                contract_ended_on   = (current_date - interval '4 years')::date,
                status              = 'inactive'
          where id = $1`,
        [trainingRelationships.tina],
      );
    }

    it('loescht die Protokolle mit dem Verhaeltnis und fuehrt sie im Journal', async () => {
      const id = await schliesseAb(users.trainer, TRAINING_VORGESTERN, 'Weg damit');
      await vertragEndeteVorVierJahren();

      await asPostgres(LAUF);

      const { rows } = await asPostgres<{ n: number }>(
        'select count(*)::int as n from public.training_protocols where id = $1',
        [id],
      );
      expect(rows[0]!.n).toBe(0);
      const { rows: journal } = await asPostgres<{ retention_class: string }>(
        `select retention_class from public.deletion_journal
          where target_table = 'training_protocols' and target_id = $1`,
        [id],
      );
      expect(journal).toEqual([{ retention_class: 'trainingsverhaeltnis' }]);
    });

    it('nimmt in der Teilloeschung auch das Protokoll am abgerechneten Termin (ANN-183)', async () => {
      const id = await schliesseAb(users.trainer, TRAINING_VORGESTERN, 'Abgerechnet');
      await asUserCommitted(
        users.office,
        'select public.record_billable_services($1::uuid, $2::jsonb) as n',
        [
          TRAINING_VORGESTERN,
          JSON.stringify([
            { catalog_item_id: 'cccccccc-cccc-4ccc-8ccc-000000000009', quantity: 1 },
          ]),
        ],
      );
      const { rows: entwurf } = await asUserCommitted<{ id: string }>(
        users.office,
        `select public.create_training_invoice_draft($1::uuid,
           date_trunc('month', (now() at time zone 'Europe/Berlin'))::date - 0) as id`,
        [trainingRelationships.tina],
      );
      // Am Schreibweg vorbei wie in training-invoices.test.ts: ausgestellt vor
      // vier Jahren, die Belegfrist laeuft noch.
      await asPostgres(
        `update public.invoices
            set status = 'issued',
                invoice_number = 'TR-TEST-P',
                issued_on = (current_date - interval '4 years')::date,
                issued_at = now(),
                due_on = (current_date - interval '4 years')::date + 14,
                total_cents = 7500,
                tax_total_cents = 1197,
                currency = 'EUR',
                snapshot = jsonb_build_object('schema_version', 3)
          where id = $1`,
        [entwurf[0]!.id],
      );
      await vertragEndeteVorVierJahren();

      await asPostgres(LAUF);

      const { rows } = await asPostgres<{ protokoll: number; termin: string | null }>(
        `select (select count(*)::int from public.training_protocols where id = $1) as protokoll,
                (select status from public.appointments where id = $2) as termin`,
        [id, TRAINING_VORGESTERN],
      );
      // Der Termin traegt die Leistung und bleibt als Tatsache stehen; was in
      // der Einheit geschah, ist kein Beleg.
      expect(rows[0]).toEqual({ protokoll: 0, termin: 'documented' });

      // Nach einem Restore faellt das Protokoll erneut.
      await asPostgres(
        `insert into public.training_protocols
           (id, organization_id, training_relationship_id, appointment_id, status, content,
            created_by, updated_by, finalized_at, finalized_by)
         values ($1, $2, $3, $4, 'final', 'Aus dem Backup', $5, $5, now(), $5)`,
        [id, organizationId, trainingRelationships.tina, TRAINING_VORGESTERN, users.trainer],
      );
      await asPostgres('select public.reapply_deletion_journal()');
      const { rows: nachher } = await asPostgres<{ n: number }>(
        'select count(*)::int as n from public.training_protocols where id = $1',
        [id],
      );
      expect(nachher[0]!.n).toBe(0);
    });
  });
});
