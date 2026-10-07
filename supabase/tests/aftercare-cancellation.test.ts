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
 * Das Nachsorge-Abo kündigen (ANG-003, PROJECT_PRINCIPLES.md 4.6, ADR-009
 * Punkt 21, ADR-023 Punkte 13, 19, 23).
 *
 *   * Die Kündigung wirkt zum Ende des laufenden Abo-Monats (ANN-270).
 *   * Die Praxis trägt eine Kündigung ein; die Person kündigt über den Knopf
 *     der Plattform (ANN-272). Herkunft und Vertretung stehen an der
 *     Kündigung.
 *   * Kündigen dürfen die Person selbst und ihre rechtliche Vertretung mit
 *     Vermögenssorge, nie die Begleitung (ANN-273).
 *   * Negativfälle: fremde Person, anderer Bereich, Praxiskonto, andere
 *     Organisation, gesperrter Zugang.
 */

const { users, platformAccesses, patients, organizationId } = SEED;
const ERIKA = platformAccesses.erikaBehandlung;
const ERIKA_TRAINING = platformAccesses.erikaTraining;
const PAULA = platformAccesses.paulaBegleitungMax;

const BERND = 'cafecafe-cafe-4afe-8afe-0000000000e1';
const KONTO_BERND = '99999999-9999-4999-8999-0000000000e1';

const PRAXIS = 'select public.cancel_aftercare_subscription($1::uuid) as ende';
const SICHT = 'select public.platform_aftercare($1::uuid) as abo';
const KNOPF = 'select public.cancel_platform_aftercare($1::uuid, $2::uuid) as bestaetigung';
const OFFEN = `select subscription_id, patient_id, cancelled_access_kind, cancelled_representative_name
                 from public.list_platform_aftercare_cancellations()`;

interface Abo {
  id: string;
  starts_on: string;
  ends_on: string | null;
  state: string;
  next_month_start: string | null;
  next_month_price_cents: number | null;
  cancel_effective_on: string | null;
  cancelled_via: string | null;
  can_cancel: boolean;
}

async function tag(ausdruck: string): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    `select to_char((${ausdruck})::date, 'YYYY-MM-DD') as tag`,
  );
  return rows[0]!.tag;
}

/** Abschluss vor zwei Tagen, Abo ab dann: Der Zugang ist lesbar. */
async function aboFuer(patientId: string, beginn?: string): Promise<string> {
  const abschluss = await tag('current_date - 2');
  await asPostgres(
    `update public.patients
        set care_started_on = least(care_started_on, $2::date),
            care_concluded_on = $2::date, care_concluded_at = now(), care_concluded_by = $3
      where id = $1`,
    [patientId, abschluss, users.ownerTherapist],
  );
  const { rows } = await asUserCommitted<{ id: string }>(
    users.office,
    'select public.create_aftercare_subscription($1::uuid, $2::date) as id',
    [patientId, beginn ?? abschluss],
  );
  return rows[0]!.id;
}

async function sicht(konto: string, zugang: string): Promise<Abo | null> {
  const { rows } = await asUser<{ abo: Abo | null }>(konto, SICHT, [zugang]);
  return rows[0]!.abo;
}

/** Bernd ist Betreuer für Erika, mit eigenem Konto. */
async function betreuung(vermoegen: boolean) {
  await asPostgres(
    `insert into auth.users (id, aud, role, email) values ($1, 'authenticated', 'authenticated', 'bernd.abo@patient.invalid')`,
    [KONTO_BERND],
  );
  await asPostgres(
    `insert into public.platform_accesses
       (id, organization_id, relationship_kind, relationship_id, patient_id, account_user_id,
        status, activated_at, access_kind, legal_basis, representative_name, proof_documents,
        health_scope, finance_scope, proof_recorded_by, proof_recorded_at, created_by)
     values ($1, $2, 'treatment', $3, $3, $4, 'active', now(), 'legal_representative',
             'guardianship', 'Bernd Betreuer', array['identity_document', 'guardianship_certificate'],
             true, $6, $5, now(), $5)`,
    [BERND, organizationId, patients.erika, KONTO_BERND, users.office, vermoegen],
  );
}

describe('Nachsorge-Abo kündigen (ANG-003)', () => {
  beforeEach(async () => {
    await resetDatabase();
  }, 120_000);

  describe('Praxis', () => {
    it('trägt eine Kündigung zum Ende des laufenden Abo-Monats ein', async () => {
      const beginn = await tag('current_date - 2');
      const id = await aboFuer(patients.erika, beginn);
      const { rows } = await asUserCommitted<{ ende: Date }>(users.office, PRAXIS, [id]);
      const erwartet = await tag(`(date '${beginn}' + interval '1 month')::date - 1`);
      const { rows: zeile } = await asPostgres<Record<string, unknown>>(
        `select to_char(ends_on, 'YYYY-MM-DD') as ends_on, cancelled_via, cancelled_by,
                cancelled_platform_access_id, to_char(cancelled_on, 'YYYY-MM-DD') as cancelled_on
           from public.aftercare_subscriptions where id = $1`,
        [id],
      );
      expect(rows[0]!.ende).toBeTruthy();
      expect(zeile[0]).toEqual({
        ends_on: erwartet,
        cancelled_via: 'practice',
        cancelled_by: users.office,
        cancelled_platform_access_id: null,
        cancelled_on: await tag('current_date'),
      });
    });

    it('beendet ein Abo vor seinem Beginn, bevor ein Monat entsteht', async () => {
      const id = await aboFuer(patients.erika, await tag('current_date + 10'));
      await asUserCommitted(users.office, PRAXIS, [id]);
      const { rows } = await asPostgres<{ vor_beginn: boolean }>(
        `select ends_on = starts_on - 1 as vor_beginn from public.aftercare_subscriptions where id = $1`,
        [id],
      );
      expect(rows[0]!.vor_beginn).toBe(true);
    });

    it('kündigt nicht zweimal', async () => {
      const id = await aboFuer(patients.erika);
      await asUserCommitted(users.office, PRAXIS, [id]);
      await expect(asUser(users.office, PRAXIS, [id])).rejects.toThrow(/already cancelled/);
    });

    it('lässt nur owner und office eintragen, nur in der eigenen Praxis', async () => {
      const id = await aboFuer(patients.erika);
      for (const konto of [users.therapist, users.teamLead, users.trainer, users.plattformErika]) {
        await expect(asUser(konto, PRAXIS, [id])).rejects.toThrow(/not allowed/);
      }
      const fremd = await fremdeOrganisation();
      await expect(asUser(fremd.owner, PRAXIS, [id])).rejects.toThrow(/not found/);
    });
  });

  describe('Plattform', () => {
    it('zeigt der Person ihr Abo mit nächstem Monat, Preis und Knopf', async () => {
      const beginn = await tag('current_date - 2');
      await aboFuer(patients.erika, beginn);
      const abo = await sicht(users.plattformErika, ERIKA);
      expect(abo).toMatchObject({
        starts_on: beginn,
        ends_on: null,
        state: 'running',
        next_month_start: await tag(`date '${beginn}' + interval '1 month'`),
        next_month_price_cents: 3900,
        cancel_effective_on: await tag(`(date '${beginn}' + interval '1 month')::date - 1`),
        can_cancel: true,
      });
    });

    it('kündigt über den Knopf mit Bestätigung, Herkunft und Offene Punkte', async () => {
      const id = await aboFuer(patients.erika);
      const { rows } = await asUserCommitted<{
        bestaetigung: { ends_on: string; cancelled_at: string; cancelled_on: string };
      }>(users.plattformErika, KNOPF, [ERIKA, id]);
      const bestaetigung = rows[0]!.bestaetigung;
      expect(bestaetigung.cancelled_on).toBe(await tag('current_date'));
      expect(bestaetigung.cancelled_at).toBeTruthy();

      const abo = await sicht(users.plattformErika, ERIKA);
      expect(abo).toMatchObject({
        state: 'ending',
        ends_on: bestaetigung.ends_on,
        cancelled_via: 'platform',
        can_cancel: false,
        next_month_start: null,
      });

      const { rows: zeile } = await asPostgres<Record<string, unknown>>(
        `select cancelled_via, cancelled_platform_access_id, cancelled_access_kind, cancelled_by
           from public.aftercare_subscriptions where id = $1`,
        [id],
      );
      expect(zeile[0]).toEqual({
        cancelled_via: 'platform',
        cancelled_platform_access_id: ERIKA,
        cancelled_access_kind: 'self',
        cancelled_by: users.plattformErika,
      });

      const { rows: offen } = await asUser<Record<string, unknown>>(users.office, OFFEN);
      expect(offen).toEqual([
        {
          subscription_id: id,
          patient_id: patients.erika,
          cancelled_access_kind: 'self',
          cancelled_representative_name: null,
        },
      ]);
      // Andere Rollen sehen die Liste nicht.
      expect((await asUser(users.therapist, OFFEN)).rows).toEqual([]);

      await expect(asUser(users.plattformErika, KNOPF, [ERIKA, id])).rejects.toThrow(
        /already cancelled/,
      );
    });

    it('rechtliche Vertretung mit Vermögenssorge kündigt, protokolliert und mit Namen', async () => {
      const id = await aboFuer(patients.erika);
      await betreuung(true);
      expect((await sicht(KONTO_BERND, BERND))?.can_cancel).toBe(true);
      await asUserCommitted(KONTO_BERND, KNOPF, [BERND, id]);
      const { rows } = await asPostgres<Record<string, unknown>>(
        `select cancelled_access_kind, cancelled_representative_name
           from public.aftercare_subscriptions where id = $1`,
        [id],
      );
      expect(rows[0]).toEqual({
        cancelled_access_kind: 'legal_representative',
        cancelled_representative_name: 'Bernd Betreuer',
      });
      const protokoll = await asPostgres<{ context: Record<string, unknown> }>(
        `select context from public.audit_log
          where actor_user_id = $1 and action = 'platform_representation.read'`,
        [KONTO_BERND],
      );
      expect(protokoll.rows.map((r) => r.context['view'])).toContain('aftercare_cancelled');
    });

    it('rechtliche Vertretung ohne Vermögenssorge sieht nichts und kündigt nicht (ANN-273)', async () => {
      const id = await aboFuer(patients.erika);
      await betreuung(false);
      expect(await sicht(KONTO_BERND, BERND)).toBeNull();
      expect(
        (await abgefangen(asUserCommitted(KONTO_BERND, KNOPF, [BERND, id])))?.message,
      ).toContain('not allowed');
    });

    it('Begleitung kündigt nie, auch wenn sie Rechnungen sieht (ANN-273)', async () => {
      const id = await aboFuer(patients.max);
      // Paula mit Einwilligung zu Rechnungen: Die Art und der Nachweis eines
      // Zugangs sind fest, deshalb hier im Aufbau neu gesetzt.
      await asPostgres('alter table public.platform_accesses disable trigger user');
      try {
        await asPostgres('update public.platform_accesses set finance_scope = true where id = $1', [
          PAULA,
        ]);
      } finally {
        await asPostgres('alter table public.platform_accesses enable trigger user');
      }
      expect((await sicht(users.plattformPaula, PAULA))?.can_cancel).toBe(false);
      expect(
        (await abgefangen(asUserCommitted(users.plattformPaula, KNOPF, [PAULA, id])))?.message,
      ).toContain('not allowed');
      const { rows } = await asPostgres<{ ends_on: string | null }>(
        'select ends_on from public.aftercare_subscriptions where id = $1',
        [id],
      );
      expect(rows[0]!.ends_on).toBeNull();
    });

    it('fremde Person, anderer Bereich, gesperrt, Praxiskonto, andere Organisation: nichts', async () => {
      const id = await aboFuer(patients.erika);
      // Tina mit Erikas Zugang.
      expect(await sicht(users.plattformTina, ERIKA)).toBeNull();
      expect(
        (await abgefangen(asUserCommitted(users.plattformTina, KNOPF, [ERIKA, id])))?.message,
      ).toContain('not allowed');
      // Erikas Trainingszugang kennt das Abo der Behandlung nicht (§4.8).
      expect(await sicht(users.plattformErika, ERIKA_TRAINING)).toBeNull();
      expect(
        (await abgefangen(asUserCommitted(users.plattformErika, KNOPF, [ERIKA_TRAINING, id])))
          ?.message,
      ).toContain('not allowed');
      // Ein Praxiskonto hat keine Plattform.
      expect(await sicht(users.office, ERIKA)).toBeNull();
      // Max' Abo über Erikas Zugang: fremdes Abo.
      const fremdesAbo = await aboFuer(patients.max);
      expect(
        (await abgefangen(asUserCommitted(users.plattformErika, KNOPF, [ERIKA, fremdesAbo])))
          ?.message,
      ).toContain('not allowed');
      // Gesperrter Zugang.
      await asPostgres(
        `update public.platform_accesses set status = 'locked', locked_at = now() where id = $1`,
        [ERIKA],
      );
      expect(await sicht(users.plattformErika, ERIKA)).toBeNull();
      expect(
        (await abgefangen(asUserCommitted(users.plattformErika, KNOPF, [ERIKA, id])))?.message,
      ).toContain('not allowed');
      const fremd = await fremdeOrganisation();
      expect(await sicht(fremd.owner, ERIKA)).toBeNull();
      const { rows } = await asPostgres<{ n: number }>(
        'select count(*)::int as n from public.aftercare_subscriptions where ends_on is not null',
      );
      expect(rows[0]!.n).toBe(0);
    });

    it('ohne Abo: nichts', async () => {
      expect(await sicht(users.plattformErika, ERIKA)).toBeNull();
    });
  });
});
