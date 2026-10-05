import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabase,
} from './helpers/db';

/**
 * Tarif und Honorarvereinbarung (ABR-030, ADR-009 Fassung 5 Punkte 5 und 22,
 * ANN-231).
 *
 *   * Der Tarif steht an der Preisliste und friert mit ihr ein.
 *   * Eine Vereinbarung mit der Person geht dem Tarif vor - am Leistungstag,
 *     nicht am Tag der Abfrage.
 *   * Eine Vereinbarung ist unveraenderlich; anlegen und entfernen darf nur
 *     owner, lesen owner und office.
 */

const { users, patients, organizationId } = SEED;

const KATALOG = {
  veroeffentlicht: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001',
  entwurf: 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002',
} as const;

const GILT =
  'select amount_cents, source, fee_agreement_id, valid_from::text from app.session_fee_on($1::uuid, $2::date)';
const ANLEGEN = 'select public.create_patient_fee_agreement($1::uuid, $2::date, $3::integer) as id';
const ENTFERNEN = 'select public.delete_patient_fee_agreement($1::uuid)';
const UEBERSICHT = 'select * from public.get_patient_session_fee($1::uuid)';
const TARIF = 'select public.set_service_catalog_session_fee($1::uuid, $2::integer)';

interface Gilt {
  amount_cents: number | null;
  source: string | null;
  fee_agreement_id: string | null;
  valid_from: string | null;
}

async function gilt(patient: string, tag: string): Promise<Gilt> {
  const { rows } = await asPostgres<Gilt>(GILT, [patient, tag]);
  return rows[0]!;
}

describe('Tarif und Honorarvereinbarung', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.patient_fee_agreements');
  });

  describe('Welches Honorar gilt', () => {
    it('nimmt ohne Vereinbarung den Tarif der am Leistungstag gueltigen Preisliste', async () => {
      const g = await gilt(patients.max, '2026-03-02');
      expect(g).toMatchObject({ amount_cents: 14000, source: 'tariff', fee_agreement_id: null });
      expect(g.valid_from).toBe('2026-01-01');
    });

    it('liefert nichts vor der ersten Preisliste', async () => {
      const g = await gilt(patients.max, '2025-06-01');
      expect(g.amount_cents).toBeNull();
      expect(g.source).toBeNull();
    });

    it('laesst die Vereinbarung ab ihrem ersten Tag dem Tarif vorgehen', async () => {
      const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, ANLEGEN, [
        patients.max,
        '2026-05-01',
        12000,
      ]);
      expect(await gilt(patients.max, '2026-04-30')).toMatchObject({
        amount_cents: 14000,
        source: 'tariff',
      });
      expect(await gilt(patients.max, '2026-05-01')).toMatchObject({
        amount_cents: 12000,
        source: 'agreement',
        fee_agreement_id: rows[0]!.id,
      });
      // Gilt nur fuer diese Person.
      expect(await gilt(patients.erika, '2026-05-01')).toMatchObject({ source: 'tariff' });
    });

    it('nimmt bei mehreren Vereinbarungen die juengste bis zum Leistungstag', async () => {
      await asUserCommitted(users.ownerTherapist, ANLEGEN, [patients.max, '2026-02-01', 11000]);
      await asUserCommitted(users.ownerTherapist, ANLEGEN, [patients.max, '2026-07-01', 13000]);
      expect((await gilt(patients.max, '2026-06-30')).amount_cents).toBe(11000);
      expect((await gilt(patients.max, '2026-07-01')).amount_cents).toBe(13000);
    });

    it('verlangt einen Betrag und weist zwei Vereinbarungen ab demselben Tag ab', async () => {
      await asUserCommitted(users.ownerTherapist, ANLEGEN, [patients.max, '2026-02-01', 11000]);
      await expect(
        asUserCommitted(users.ownerTherapist, ANLEGEN, [patients.max, '2026-02-01', 9000]),
      ).rejects.toThrow(/already exists/);
      await expect(
        asUserCommitted(users.ownerTherapist, ANLEGEN, [patients.max, '2026-03-01', -1]),
      ).rejects.toThrow(/out of range/);
      await expect(
        asUserCommitted(users.ownerTherapist, ANLEGEN, [patients.max, null, 9000]),
      ).rejects.toThrow(/valid_from/);
    });
  });

  describe('Unveraenderlich', () => {
    it('weist jede Aenderung an Betrag oder Beginn ab, auch am Schreibpfad vorbei', async () => {
      await asUserCommitted(users.ownerTherapist, ANLEGEN, [patients.max, '2026-02-01', 11000]);
      await expect(
        asPostgres('update public.patient_fee_agreements set session_fee_cents = 1'),
      ).rejects.toThrow(/immutable/);
      await expect(
        asPostgres(`update public.patient_fee_agreements set valid_from = '2026-01-01'`),
      ).rejects.toThrow(/immutable/);
    });

    it('friert den Tarif mit der veroeffentlichten Preisliste ein', async () => {
      await expect(
        asUserCommitted(users.ownerTherapist, TARIF, [KATALOG.veroeffentlicht, 9000]),
      ).rejects.toThrow(/immutable/);
      await expect(
        asPostgres(
          'update public.service_catalog_versions set session_fee_cents = 1 where id = $1',
          [KATALOG.veroeffentlicht],
        ),
      ).rejects.toThrow(/immutable/);
    });

    it('setzt den Tarif am Entwurf und nimmt ihn in eine Kopie mit', async () => {
      await asUserCommitted(users.ownerTherapist, TARIF, [KATALOG.entwurf, 15000]);
      const { rows: neu } = await asUserCommitted<{ id: string }>(
        users.ownerTherapist,
        "select public.create_service_catalog_version('Kopie', '2031-01-01', $1) as id",
        [KATALOG.entwurf],
      );
      const { rows } = await asPostgres<{ session_fee_cents: number }>(
        'select session_fee_cents from public.service_catalog_versions where id = $1',
        [neu[0]!.id],
      );
      await asPostgres('delete from public.service_catalog_versions where id = $1', [neu[0]!.id]);
      expect(rows[0]!.session_fee_cents).toBe(15000);
      await asUserCommitted(users.ownerTherapist, TARIF, [KATALOG.entwurf, 14500]);
    });
  });

  describe('Wer darf', () => {
    it('laesst nur owner eine Vereinbarung anlegen und entfernen', async () => {
      for (const konto of [users.therapist, users.office, users.teamLead, users.trainer]) {
        await expect(
          asUserCommitted(konto, ANLEGEN, [patients.max, '2026-02-01', 11000]),
        ).rejects.toThrow(/not allowed/);
      }
      const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, ANLEGEN, [
        patients.max,
        '2026-02-01',
        11000,
      ]);
      await expect(asUserCommitted(users.office, ENTFERNEN, [rows[0]!.id])).rejects.toThrow(
        /not allowed/,
      );
      await asUserCommitted(users.ownerTherapist, ENTFERNEN, [rows[0]!.id]);
      const { rows: rest } = await asPostgres('select 1 from public.patient_fee_agreements');
      expect(rest).toHaveLength(0);
    });

    it('laesst nur owner den Tarif setzen', async () => {
      await expect(asUserCommitted(users.office, TARIF, [KATALOG.entwurf, 1])).rejects.toThrow(
        /not allowed/,
      );
    });

    it('zeigt owner und office das geltende Honorar und die Vereinbarungen', async () => {
      await asUserCommitted(users.ownerTherapist, ANLEGEN, [patients.max, '2026-02-01', 11000]);
      for (const konto of [users.ownerTherapist, users.office]) {
        const { rows } = await asUser<{
          current_cents: number;
          current_source: string;
          agreements: { session_fee_cents: number; created_by_name: string }[];
        }>(konto, UEBERSICHT, [patients.max]);
        expect(rows[0]!.current_cents).toBe(11000);
        expect(rows[0]!.current_source).toBe('agreement');
        expect(rows[0]!.agreements).toHaveLength(1);
        expect(rows[0]!.agreements[0]!.session_fee_cents).toBe(11000);
      }
    });

    it('zeigt den uebrigen Rollen und Patientenkonten nichts', async () => {
      for (const konto of [users.therapist, users.teamLead, users.trainer, users.patientMax]) {
        const { rows } = await asUser(konto, UEBERSICHT, [patients.max]);
        expect(rows).toHaveLength(0);
      }
    });

    it('gibt keine Tabellenrechte', async () => {
      await expect(
        asUser(users.ownerTherapist, 'select * from public.patient_fee_agreements'),
      ).rejects.toThrow(/permission denied/);
      await expect(
        asUser(users.ownerTherapist, GILT, [patients.max, '2026-03-02']),
      ).rejects.toThrow(/permission denied/);
    });

    it('laesst ein Patientenkonto weder anlegen noch den Tarif setzen', async () => {
      await expect(
        asUserCommitted(users.patientMax, ANLEGEN, [patients.max, '2026-02-01', 11000]),
      ).rejects.toThrow(/not allowed/);
      await expect(asUserCommitted(users.patientMax, TARIF, [KATALOG.entwurf, 1])).rejects.toThrow(
        /not allowed/,
      );
    });

    it('entfernt und setzt nichts in einer anderen Praxis', async () => {
      const { rows } = await asUserCommitted<{ id: string }>(users.ownerTherapist, ANLEGEN, [
        patients.max,
        '2026-02-01',
        11000,
      ]);
      const fremd = await fremdeOrganisation();
      await expect(asUserCommitted(fremd.owner, ENTFERNEN, [rows[0]!.id])).rejects.toThrow(
        /not found/,
      );
      await expect(asUserCommitted(fremd.owner, TARIF, [KATALOG.entwurf, 1])).rejects.toThrow(
        /not found/,
      );
      const { rows: rest } = await asPostgres('select 1 from public.patient_fee_agreements');
      expect(rest).toHaveLength(1);
    });

    it('legt keine Vereinbarung fuer eine Akte einer anderen Praxis an', async () => {
      const fremd = await fremdeOrganisation();
      await expect(
        asUserCommitted(users.ownerTherapist, ANLEGEN, [fremd.patient, '2026-02-01', 11000]),
      ).rejects.toThrow(/patient not found/);
      const { rows } = await asUser(users.ownerTherapist, UEBERSICHT, [fremd.patient]);
      expect(rows).toHaveLength(0);
    });
  });

  describe('Mit der Akte', () => {
    it('steht in der Auskunft', async () => {
      await asUserCommitted(users.ownerTherapist, ANLEGEN, [patients.max, '2026-02-01', 11000]);
      const { rows } = await asUser<{ daten: { tabellen: { fee_agreements: unknown[] } } }>(
        users.ownerTherapist,
        'select public.export_patient_record($1::uuid) as daten',
        [patients.max],
      );
      expect(rows[0]!.daten.tabellen.fee_agreements).toHaveLength(1);
    });

    it('zieht beim Zusammenfuehren mit und sperrt zwei Vereinbarungen ab demselben Tag', async () => {
      await asUserCommitted(users.ownerTherapist, ANLEGEN, [patients.petra, '2026-02-01', 11000]);
      await asUserCommitted(users.ownerTherapist, ANLEGEN, [patients.max, '2026-02-01', 12000]);
      const { rows: plan } = await asPostgres<{
        plan: { blockers: string[]; counts: Record<string, number> };
      }>('select app.patient_merge_plan($1::uuid, $2::uuid, $3::uuid) as plan', [
        organizationId,
        patients.petra,
        patients.max,
      ]);
      expect(plan[0]!.plan.blockers).toContain('fee_agreement_overlap');
      expect(plan[0]!.plan.counts.fee_agreements).toBe(1);

      await asPostgres('delete from public.patient_fee_agreements where patient_id = $1', [
        patients.max,
      ]);
      const { rows: frei } = await asPostgres<{ plan: { blockers: string[] } }>(
        'select app.patient_merge_plan($1::uuid, $2::uuid, $3::uuid) as plan',
        [organizationId, patients.petra, patients.max],
      );
      expect(frei[0]!.plan.blockers).not.toContain('fee_agreement_overlap');
    });
  });
});
