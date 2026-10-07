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
 * Das Trainingsangebot aus der Akte (KND-002, PROJECT_PRINCIPLES.md 4.10,
 * ADR-021 Punkte 3, 5 und 7).
 *
 *   * Anbieten duerfen die Rollen der Akte (ANN-282), nie die
 *     Trainingsbetreuung und nie ein Plattformkonto.
 *   * Bis zu fuenf Uebergabeangaben, wortwoertlich von der Praxis (ANN-283).
 *   * 14 Tage gueltig, hoechstens bis zum Beginn; Beginn ab heute, bis 90 Tage
 *     voraus, nicht vor dem Abschluss; je Akte ein offenes Angebot (ANN-284).
 *   * Das Angebot zieht beim Zusammenfuehren mit und steht in der Auskunft.
 */

const { users, patients, organizationId } = SEED;

/** Pakete der Preisliste 2026 (supabase/seed.sql). */
const TP3 = 'cccccccc-cccc-4ccc-8ccc-000000000014';
/** Paket der Preisliste 2027 - ein Entwurf, also an keinem Tag gueltig. */
const TP3_2027 = 'cccccccc-cccc-4ccc-8ccc-000000000016';

const ANBIETEN =
  'select public.create_training_offer($1::uuid, $2::uuid, $3::date, $4::jsonb, $5::boolean) as id';
const ZURUECKZIEHEN = 'select public.withdraw_training_offer($1::uuid)';
const SICHT = 'select public.get_patient_training_offers($1::uuid) as sicht';
const PAKETE = 'select * from public.list_training_offer_packages($1::date)';

const UEBERGABE = [
  { title: 'Belastungsgrenzen', body: 'Kniebeuge bis 90 Grad, keine Sprünge bis Dezember.' },
  { title: 'Vorgeschichte', body: 'Vordere Kreuzbandplastik links im März.' },
];

interface Sicht {
  today: string;
  care_concluded_on: string | null;
  has_own_access: boolean;
  offers: Array<{
    id: string;
    state: string;
    label: string;
    starts_on: string;
    valid_until: string;
    handover_items: Array<{ title: string; body: string }>;
    offers_contact: boolean;
    created_by_name: string | null;
    withdrawn_at: string | null;
  }>;
}

async function tag(ausdruck: string): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    `select to_char((${ausdruck})::date, 'YYYY-MM-DD') as tag
       from (select (now() at time zone 'Europe/Berlin')::date as heute) h`,
  );
  return rows[0]!.tag;
}

async function anbieten(
  beginn: string,
  konto: string = users.therapist,
  patient: string = patients.erika,
  uebergabe: unknown = UEBERGABE,
  kontakt = true,
  paket = TP3,
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, ANBIETEN, [
    patient,
    paket,
    beginn,
    JSON.stringify(uebergabe),
    kontakt,
  ]);
  return rows[0]!.id;
}

async function sicht(konto: string, patient: string = patients.erika): Promise<Sicht | null> {
  const { rows } = await asUser<{ sicht: Sicht | null }>(konto, SICHT, [patient]);
  return rows[0]!.sicht;
}

describe('Trainingsangebot aus der Akte (KND-002)', () => {
  beforeAll(async () => {
    await resetDatabase();
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.training_offers');
    await asPostgres(
      `update public.patients set care_concluded_on = null, care_concluded_at = null,
              care_concluded_by = null where id = any($1::uuid[])`,
      [[patients.erika, patients.petra]],
    );
  });

  describe('Anbieten', () => {
    it.each([
      ['Therapeut:in', users.therapist],
      ['owner', users.ownerTherapist],
      ['Teamleitung', users.teamLead],
      ['Büro', users.office],
    ])('hält ein Angebot fest: %s (ANN-282)', async (_rolle, konto) => {
      const beginn = await tag('heute + 30');
      const id = await anbieten(beginn, konto);
      const s = await sicht(users.office);
      expect(s!.offers).toHaveLength(1);
      expect(s!.offers[0]).toMatchObject({
        id,
        state: 'open',
        starts_on: beginn,
        valid_until: await tag('heute + 14'),
        handover_items: UEBERGABE,
        offers_contact: true,
        withdrawn_at: null,
      });
      // ANN-285 (4.8): Die Akte kennt keine Annahme.
      expect(s!.offers[0]).not.toHaveProperty('accepted_at');
      expect(s!.offers[0]!.label).toMatch(/3 Monate/);
    });

    it('gilt höchstens bis zum Beginn (ANN-284)', async () => {
      const beginn = await tag('heute + 3');
      await anbieten(beginn);
      expect((await sicht(users.office))!.offers[0]!.valid_until).toBe(beginn);
    });

    it.each([
      ['Trainingsbetreuung', users.trainer],
      ['Plattformkonto', users.plattformErika],
    ])('weist %s ab', async (_wer, konto) => {
      await expect(anbieten(await tag('heute + 30'), konto)).rejects.toThrow(/not allowed/);
    });

    it('weist eine Akte einer fremden Praxis ab', async () => {
      const fremd = await fremdeOrganisation();
      await expect(anbieten(await tag('heute + 30'), users.office, fremd.patient)).rejects.toThrow(
        /patient not found/,
      );
    });

    it.each([
      ['in der Vergangenheit', 'heute - 1'],
      ['mehr als 90 Tage voraus', 'heute + 91'],
    ])('weist einen Beginn %s ab (ANN-284)', async (_name, ausdruck) => {
      await expect(anbieten(await tag(ausdruck))).rejects.toThrow(/within the next 90 days/);
    });

    it('weist einen Beginn vor dem Abschluss der Versorgung ab', async () => {
      await asPostgres(
        `update public.patients set care_concluded_on = $2::date, care_concluded_at = now(),
                care_concluded_by = $3 where id = $1`,
        [patients.erika, await tag('heute + 5'), users.ownerTherapist],
      );
      await expect(anbieten(await tag('heute + 4'))).rejects.toThrow(/before care is concluded/);
      await expect(anbieten(await tag('heute + 5'))).resolves.toBeTruthy();
    });

    it('verlangt ein Paket der Preisliste, die am Beginn gilt', async () => {
      await expect(
        anbieten(await tag('heute + 30'), users.office, patients.erika, [], false, TP3_2027),
      ).rejects.toThrow(/not in the price list/);
    });

    it.each([
      ['sechs Angaben', Array.from({ length: 6 }, (_, i) => ({ title: `T${i}`, body: 'x' }))],
      ['eine zu lange Überschrift', [{ title: 'x'.repeat(81), body: 'x' }]],
      ['einen leeren Text', [{ title: 'Grenzen', body: '' }]],
      ['ein weiteres Feld', [{ title: 'Grenzen', body: 'x', befund: 'y' }]],
      ['keine Liste', { title: 'Grenzen', body: 'x' }],
    ])('weist %s ab (ANN-283)', async (_name, uebergabe) => {
      await expect(
        anbieten(await tag('heute + 30'), users.office, patients.erika, uebergabe),
      ).rejects.toThrow(/handover items invalid/);
    });

    it('nimmt ein Angebot ohne Übergabeangaben an', async () => {
      await anbieten(await tag('heute + 30'), users.office, patients.erika, [], false);
      expect((await sicht(users.office))!.offers[0]!.handover_items).toEqual([]);
    });

    it('lässt je Akte nur ein offenes Angebot zu', async () => {
      const id = await anbieten(await tag('heute + 30'));
      await expect(anbieten(await tag('heute + 31'))).rejects.toThrow(/open training offer exists/);
      await asUserCommitted(users.therapist, ZURUECKZIEHEN, [id]);
      await expect(anbieten(await tag('heute + 31'))).resolves.toBeTruthy();
    });

    it('lässt nach einem abgelaufenen Angebot ein neues zu', async () => {
      await anbieten(await tag('heute + 30'));
      await asPostgres(
        `update public.training_offers set valid_until = (now() at time zone 'Europe/Berlin')::date - 1`,
      );
      expect((await sicht(users.office))!.offers[0]!.state).toBe('expired');
      await expect(anbieten(await tag('heute + 30'))).resolves.toBeTruthy();
    });
  });

  describe('Zurückziehen', () => {
    it('zieht ein offenes Angebot zurück', async () => {
      const id = await anbieten(await tag('heute + 30'));
      await asUserCommitted(users.office, ZURUECKZIEHEN, [id]);
      const s = await sicht(users.therapist);
      expect(s!.offers[0]!.state).toBe('withdrawn');
      expect(s!.offers[0]!.withdrawn_at).not.toBeNull();
      await expect(asUser(users.office, ZURUECKZIEHEN, [id])).rejects.toThrow(/not open/);
    });

    it('verrät eine Annahme weder in der Sicht noch beim Zurückziehen (ANN-285)', async () => {
      const id = await anbieten(await tag('heute + 30'));
      await asPostgres('update public.training_offers set accepted_at = now() where id = $1', [id]);
      expect((await sicht(users.therapist))!.offers[0]!.state).toBe('open');
      await expect(anbieten(await tag('heute + 31'))).rejects.toThrow(/open training offer exists/);
      await expect(asUserCommitted(users.therapist, ZURUECKZIEHEN, [id])).resolves.toBeDefined();
      expect((await sicht(users.therapist))!.offers[0]!.state).toBe('withdrawn');
    });

    it('steht nach der Gültigkeit als abgelaufen, angenommen oder nicht', async () => {
      const id = await anbieten(await tag('heute + 30'));
      await asPostgres(
        `update public.training_offers
            set accepted_at = now(), valid_until = (now() at time zone 'Europe/Berlin')::date - 1
          where id = $1`,
        [id],
      );
      expect((await sicht(users.therapist))!.offers[0]!.state).toBe('expired');
      const { rows } = await asUser<{ daten: { tabellen: { training_offers: object[] } } }>(
        users.ownerTherapist,
        'select public.export_patient_record($1::uuid) as daten',
        [patients.erika],
      );
      expect(rows[0]!.daten.tabellen.training_offers[0]).not.toHaveProperty('accepted_at');
    });

    it('weist Trainingsbetreuung und fremde Praxis ab', async () => {
      const id = await anbieten(await tag('heute + 30'));
      await expect(asUser(users.trainer, ZURUECKZIEHEN, [id])).rejects.toThrow(/not allowed/);
      const fremd = await fremdeOrganisation();
      await expect(asUser(fremd.owner, ZURUECKZIEHEN, [id])).rejects.toThrow(/not found/);
    });
  });

  describe('Sicht der Akte', () => {
    it('nennt, ob die Person ein eigenes Konto hat', async () => {
      expect((await sicht(users.therapist, patients.erika))!.has_own_access).toBe(true);
      expect((await sicht(users.therapist, patients.max))!.has_own_access).toBe(false);
    });

    it('zeigt der Trainingsbetreuung, einem Plattformkonto und einer fremden Praxis nichts', async () => {
      await anbieten(await tag('heute + 30'));
      expect(await sicht(users.trainer)).toBeNull();
      expect(await sicht(users.plattformErika)).toBeNull();
      const fremd = await fremdeOrganisation();
      expect(await sicht(fremd.owner)).toBeNull();
    });

    it('zeigt die Pakete der Preisliste nur den Rollen der Akte', async () => {
      const beginn = await tag('heute + 30');
      const { rows } = await asUser<{ label: string }>(users.therapist, PAKETE, [beginn]);
      expect(rows.map((r) => r.label)).toHaveLength(2);
      expect((await asUser(users.trainer, PAKETE, [beginn])).rows).toEqual([]);
      expect((await asUser(users.plattformErika, PAKETE, [beginn])).rows).toEqual([]);
    });
  });

  describe('Mit der Akte', () => {
    it('steht in der Auskunft (Art. 15)', async () => {
      await anbieten(await tag('heute + 30'));
      const { rows } = await asUser<{
        daten: { tabellen: { training_offers: Array<{ handover_items: unknown }> } };
      }>(users.ownerTherapist, 'select public.export_patient_record($1::uuid) as daten', [
        patients.erika,
      ]);
      expect(rows[0]!.daten.tabellen.training_offers).toEqual([
        expect.objectContaining({ handover_items: UEBERGABE }),
      ]);
    });

    it('zieht beim Zusammenführen mit und sperrt zwei offene Angebote', async () => {
      const petra = await anbieten(await tag('heute + 30'), users.office, patients.petra);
      await anbieten(await tag('heute + 30'));
      const plan = async () =>
        (
          await asPostgres<{ plan: { blockers: string[]; counts: Record<string, number> } }>(
            'select app.patient_merge_plan($1::uuid, $2::uuid, $3::uuid) as plan',
            [organizationId, patients.petra, patients.erika],
          )
        ).rows[0]!.plan;
      expect((await plan()).blockers).toContain('training_offer_overlap');
      expect((await plan()).counts['training_offers']).toBe(1);

      await asUserCommitted(users.office, ZURUECKZIEHEN, [petra]);
      expect((await plan()).blockers).not.toContain('training_offer_overlap');
      await asUserCommitted(
        users.ownerTherapist,
        'select public.merge_patients($1::uuid, $2::uuid)',
        [patients.petra, patients.erika],
      );
      const { rows } = await asPostgres<{ n: number }>(
        'select count(*)::int as n from public.training_offers where patient_id = $1',
        [patients.erika],
      );
      expect(rows[0]!.n).toBe(2);
    });

    it('fällt mit der Akte (Fremdschlüssel mit Kaskade)', async () => {
      const { rows } = await asPostgres<{ fk: string }>(
        `select confdeltype as fk from pg_constraint
          where conrelid = 'public.training_offers'::regclass and contype = 'f'
            and confrelid = 'public.patients'::regclass`,
      );
      expect(rows[0]!.fk).toBe('c');
    });
  });
});
