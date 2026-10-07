import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  SEED,
  asPostgres,
  asUser,
  asUserCommitted,
  fremdeOrganisation,
  resetDatabaseOhneTermine,
} from './helpers/db';
import { erwarteAbgewiesenenLeseversuch } from './helpers/abgewiesen';

/**
 * Je Abo-Monat eine Leistung und eine Monatsrechnung (ANG-002, ADR-009
 * Punkte 4, 5, 15, 18 und 21).
 *
 *   * Ein Abo-Monat ist zu seinem Beginn fällig (ANN-270) und wird höchstens
 *     einmal erfasst - zum Preis der dann geltenden Preisliste.
 *   * Nicht vor dem Beginn, nicht nach dem Ende, nicht während einer neuen
 *     Behandlung (ANN-271), nicht ohne Preis.
 *   * Die Position der Preisliste ist steuerpflichtig zum Regelsatz (ANN-269);
 *     die Rechnung weist die Steuer aus und nennt den Zeitraum des Monats.
 *   * Nur owner und office; andere Rollen, eine andere Praxis und
 *     Plattformkonten nicht.
 */

const { users, patients, organizationId } = SEED;

/** Abo-Monat aus der Preisliste 2026 (supabase/seed.sql). */
const NSA = 'cccccccc-cccc-4ccc-8ccc-000000000010';
const KG = 'cccccccc-cccc-4ccc-8ccc-000000000001';
/** Erika, Krankengymnastik, 10 Termine (supabase/seed.sql). */
const GRUNDLAGE = '88888888-8888-4888-8888-000000000004';

const ERFASSEN = 'select public.record_aftercare_month($1::uuid, $2::date) as id';
const ZURUECK = 'select public.delete_aftercare_month($1::uuid)';
const FAELLIG = `select subscription_id, patient_id, unit_price_cents, blocker,
                        to_char(month_start, 'YYYY-MM-DD') as month_start,
                        to_char(month_end, 'YYYY-MM-DD') as month_end
                   from public.list_due_aftercare_months()`;
const ENTWURF = 'select public.create_invoice_draft($1::uuid, $2::date) as id';
const AUSSTELLEN = 'select public.issue_invoice($1::uuid) as nummer';
const DOKUMENT = 'select public.get_invoice($1::uuid) as rechnung';

interface Faellig {
  subscription_id: string;
  patient_id: string;
  month_start: string;
  month_end: string;
  unit_price_cents: number | null;
  blocker: string | null;
}

/** Ein Tag relativ zum ersten des laufenden Monats, als `YYYY-MM-DD`. */
async function tag(ausdruck: string): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    `select to_char((${ausdruck})::date, 'YYYY-MM-DD') as tag`,
  );
  return rows[0]!.tag;
}

async function abschliessen(patientId: string, tagX: string | null) {
  await asPostgres(
    `update public.patients
        set care_concluded_on = $2::date,
            care_concluded_at = case when $2::date is null then null else now() end,
            care_concluded_by = case when $2::date is null then null else $3::uuid end
      where id = $1`,
    [patientId, tagX, users.ownerTherapist],
  );
}

/**
 * Ein Abo direkt angelegt: Die Monatslogik braucht Beginne, die weiter
 * zurückliegen, als das Anlegen erlaubt (14 Tage, ANN-268 - geprüft in
 * aftercare-subscriptions.test.ts).
 */
async function abo(beginn: string): Promise<string> {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.aftercare_subscriptions (organization_id, patient_id, starts_on, created_by)
     values ($1, $2, $3::date, $4) returning id`,
    [organizationId, patients.erika, beginn, users.office],
  );
  return rows[0]!.id;
}

/** Ein Behandlungstermin Erikas, `stundenZurueck` vor jetzt. */
async function termin(
  stundenZurueck: number,
  status = 'documented',
  grundlage: string | null = null,
) {
  const { rows } = await asPostgres<{ id: string }>(
    `insert into public.appointments (
       organization_id, patient_id, staff_member_id, location_id, appointment_type, status,
       starts_at, ends_at, completed_at, completed_by, treatment_basis_id,
       cancelled_at, cancelled_by, cancellation_reason
     ) values ($1, $2, '55555555-5555-4555-8555-000000000002',
               '33333333-3333-4333-8333-000000000001', 'practice', $3,
               now() - make_interval(hours => $4), now() - make_interval(hours => $4 - 1),
               case when $3 = 'documented' then now() end,
               case when $3 = 'documented' then $5::uuid end, $6,
               case when $3 = 'cancelled' then now() end,
               case when $3 = 'cancelled' then $5::uuid end,
               case when $3 = 'cancelled' then 'patient_request' end)
     returning id`,
    [organizationId, patients.erika, status, stundenZurueck, users.ownerTherapist, grundlage],
  );
  return rows[0]!.id;
}

async function erfassen(aboId: string, monat: string, konto: string = users.office) {
  const { rows } = await asUserCommitted<{ id: string }>(konto, ERFASSEN, [aboId, monat]);
  return rows[0]!.id;
}

describe('Abo-Monate (ANG-002)', () => {
  let vormonat: string;
  let diesermonat: string;
  let naechster: string;

  beforeAll(async () => {
    await resetDatabaseOhneTermine();
    await fremdeOrganisation();
    vormonat = await tag("date_trunc('month', current_date) - interval '1 month'");
    diesermonat = await tag("date_trunc('month', current_date)");
    naechster = await tag("date_trunc('month', current_date) + interval '1 month'");
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.invoice_cancellations');
    await asPostgres('delete from public.invoice_items');
    await asPostgres('delete from public.invoices');
    await asPostgres('delete from public.invoice_number_series');
    await asPostgres('delete from public.billable_services');
    await asPostgres('delete from public.aftercare_subscriptions');
    await asPostgres('delete from public.appointments');
    await asPostgres('update public.treatment_base_items set used_quantity = 0');
    await abschliessen(patients.erika, vormonat);
  });

  describe('Erfassen', () => {
    it('erfasst einen begonnenen Monat zum Preis der Liste, ohne Termin', async () => {
      const id = await abo(vormonat);
      const leistung = await erfassen(id, vormonat);
      const { rows } = await asPostgres<{
        appointment_id: string | null;
        catalog_item_id: string;
        performed_on: string;
        service_area: string;
        patient_id: string;
        betrag: string;
      }>(
        `select appointment_id, catalog_item_id, to_char(performed_on, 'YYYY-MM-DD') as performed_on,
                service_area, patient_id, app.billable_service_amount(id) as betrag
           from public.billable_services where id = $1`,
        [leistung],
      );
      expect(rows[0]).toEqual({
        appointment_id: null,
        catalog_item_id: NSA,
        performed_on: vormonat,
        service_area: 'therapy',
        patient_id: patients.erika,
        betrag: '3900',
      });
    });

    it('erfasst jeden Monat höchstens einmal (ADR-009 Punkt 4)', async () => {
      const id = await abo(vormonat);
      await erfassen(id, vormonat);
      await expect(erfassen(id, vormonat)).rejects.toThrow(/already recorded/);
    });

    it('weist einen Monat ab, der noch nicht begonnen hat (ANN-270)', async () => {
      const id = await abo(vormonat);
      await expect(erfassen(id, naechster)).rejects.toThrow(/not_due/);
    });

    it('weist einen Tag ab, der kein Beginn eines Abo-Monats ist', async () => {
      const id = await abo(vormonat);
      const zweiter = await tag(
        "(date_trunc('month', current_date) - interval '1 month')::date + 1",
      );
      await expect(erfassen(id, zweiter)).rejects.toThrow(/not_a_month/);
    });

    it('weist einen Monat nach dem Ende des Abos ab', async () => {
      const id = await abo(vormonat);
      await asPostgres(
        `update public.aftercare_subscriptions
            set ends_on = $2::date - 1, cancelled_at = now(), cancelled_on = $2::date - 5,
                cancelled_via = 'practice'
          where id = $1`,
        [id, diesermonat],
      );
      await expect(erfassen(id, diesermonat)).rejects.toThrow(/after_end/);
      await expect(erfassen(id, vormonat)).resolves.toBeTruthy();
    });

    it('berechnet keinen Monat, während die Behandlung wieder läuft (ANN-271)', async () => {
      const id = await abo(vormonat);
      await abschliessen(patients.erika, null);
      await expect(erfassen(id, vormonat)).rejects.toThrow(/care_open/);
    });

    it('berechnet keinen Monat, in dem behandelt wurde – auch nach dem nächsten Abschluss (Zweitreview B1)', async () => {
      const id = await abo(vormonat);
      // Wiederaufnahme, ein Termin heute, dann wieder abgeschlossen.
      await termin(2);
      await expect(erfassen(id, diesermonat)).rejects.toThrow(/care_during_month/);
      // Der Vormonat ohne Termin bleibt erfassbar.
      await expect(erfassen(id, vormonat)).resolves.toBeTruthy();
    });

    it('zählt einen abgesagten Termin nicht als Behandlung', async () => {
      const id = await abo(vormonat);
      await termin(2, 'cancelled');
      await expect(erfassen(id, diesermonat)).resolves.toBeTruthy();
    });

    it('weist einen Monat ab, für den keine Preisliste einen Abo-Monat nennt', async () => {
      // Die Liste 2026 ist veroeffentlicht und unveraenderlich; ein Monat vor
      // ihrem Beginn hat keine Liste.
      await asPostgres(`update public.patients set care_started_on = '2025-11-01' where id = $1`, [
        patients.erika,
      ]);
      await abschliessen(patients.erika, '2025-12-01');
      const id = await abo('2025-12-01');
      await expect(erfassen(id, '2025-12-01')).rejects.toThrow(/no_price/);
    });

    it('bucht den Abo-Monat nie an einen Termin', async () => {
      const { rows: termin } = await asPostgres<{ id: string }>(
        `insert into public.appointments (
           organization_id, patient_id, staff_member_id, location_id, appointment_type, status,
           starts_at, ends_at, completed_at, completed_by
         ) values ($1, $2, '55555555-5555-4555-8555-000000000002',
                   '33333333-3333-4333-8333-000000000001', 'practice', 'documented',
                   now() - interval '3 hours', now() - interval '2 hours', now(), $3)
         returning id`,
        [organizationId, patients.erika, users.ownerTherapist],
      );
      await expect(
        asPostgres(
          `insert into public.billable_services
             (organization_id, patient_id, appointment_id, catalog_item_id, performed_on)
           values ($1, $2, $3, $4, current_date)`,
          [organizationId, patients.erika, termin[0]!.id, NSA],
        ),
      ).rejects.toThrow(/not billed at an appointment/);
      // Und eine Position vom Termin nie ohne Termin.
      await expect(
        asPostgres(
          `insert into public.billable_services
             (organization_id, patient_id, appointment_id, catalog_item_id, performed_on)
           values ($1, $2, null, $3, current_date)`,
          [organizationId, patients.erika, KG],
        ),
      ).rejects.toThrow(/billable_services_source|only an aftercare month/);
    });

    it('lässt nur owner und office erfassen', async () => {
      const id = await abo(vormonat);
      for (const konto of [
        users.therapist,
        users.teamLead,
        users.trainer,
        users.patientMax,
        users.plattformErika,
      ]) {
        await expect(asUser(konto, ERFASSEN, [id, vormonat])).rejects.toThrow(/not allowed/);
      }
      const fremd = await fremdeOrganisation();
      await expect(asUser(fremd.owner, ERFASSEN, [id, vormonat])).rejects.toThrow(/not found/);
      await expect(erfassen(id, vormonat, users.ownerTherapist)).resolves.toBeTruthy();
    });

    it('nimmt eine Erfassung zurück, solange sie auf keiner Rechnung steht', async () => {
      const id = await abo(vormonat);
      const leistung = await erfassen(id, vormonat);
      const { rows } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        vormonat,
      ]);
      await expect(asUser(users.office, ZURUECK, [leistung])).rejects.toThrow(/on an invoice/);
      await asUserCommitted(users.office, 'select public.delete_invoice_draft($1::uuid)', [
        rows[0]!.id,
      ]);
      await expect(asUser(users.therapist, ZURUECK, [leistung])).rejects.toThrow(/not allowed/);
      await asUserCommitted(users.office, ZURUECK, [leistung]);
      const { rows: rest } = await asPostgres('select 1 from public.billable_services');
      expect(rest).toHaveLength(0);
    });

    it('entfernt ein Abo mit erfasstem Monat nicht mehr als Fehlanlage', async () => {
      const id = await abo(vormonat);
      await erfassen(id, vormonat);
      await expect(
        asUser(users.office, 'select public.delete_aftercare_subscription($1::uuid)', [id]),
      ).rejects.toThrow(/has recorded months/);
    });
  });

  describe('Fällige Monate', () => {
    it('nennt begonnene Monate ohne Leistung, mit Preis und Hindernis', async () => {
      const id = await abo(vormonat);
      let { rows } = await asUser<Faellig>(users.office, FAELLIG);
      expect(rows.map((r) => [r.month_start, r.unit_price_cents, r.blocker])).toEqual([
        [vormonat, 3900, null],
        [diesermonat, 3900, null],
      ]);
      expect(rows[0]!.month_end).toBe(await tag(`date '${diesermonat}' - 1`));

      await erfassen(id, vormonat);
      ({ rows } = await asUser<Faellig>(users.office, FAELLIG));
      expect(rows.map((r) => r.month_start)).toEqual([diesermonat]);

      await abschliessen(patients.erika, null);
      ({ rows } = await asUser<Faellig>(users.office, FAELLIG));
      expect(rows.map((r) => r.blocker)).toEqual(['care_open']);
    });

    it('weist andere Rollen mit Eintrag ab', async () => {
      await erwarteAbgewiesenenLeseversuch(users.therapist, FAELLIG, [], 'aftercare.read');
    });

    it('zeigt einer anderen Praxis nichts', async () => {
      await abo(vormonat);
      const fremd = await fremdeOrganisation();
      const { rows } = await asUser<Faellig>(fremd.owner, FAELLIG);
      expect(rows).toEqual([]);
    });
  });

  describe('Monatsrechnung', () => {
    it('bündelt den Abo-Monat nach Kalendermonat und weist die Steuer aus (ANN-269)', async () => {
      const id = await abo(vormonat);
      await erfassen(id, vormonat);

      const { rows: kandidaten } = await asUser<{
        patient_id: string;
        period_month: string;
        treatment_basis_id: string | null;
        total_cents: number;
      }>(users.office, 'select * from public.list_invoice_candidates(100)');
      expect(kandidaten.filter((k) => k.patient_id === patients.erika)).toEqual([
        expect.objectContaining({ treatment_basis_id: null, total_cents: 3900 }),
      ]);

      const { rows: entwurf } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        vormonat,
      ]);
      await asUserCommitted(users.office, AUSSTELLEN, [entwurf[0]!.id]);
      const { rows } = await asUser<{
        rechnung: {
          document: {
            service_area: string;
            service_period: { from: string; to: string };
            items: Array<Record<string, unknown>>;
            tax_groups: Array<Record<string, unknown>>;
            totals: { total_cents: number; tax_total_cents: number };
          };
        };
      }>(users.office, DOKUMENT, [entwurf[0]!.id]);
      const dokument = rows[0]!.rechnung.document;
      const ende = await tag(`date '${diesermonat}' - 1`);
      expect(dokument.service_area).toBe('therapy');
      expect(dokument.service_period).toEqual({ from: vormonat, to: ende });
      expect(dokument.items).toEqual([
        expect.objectContaining({
          item_kind: 'aftercare_month',
          code: 'NSA',
          performed_on: vormonat,
          period_until: ende,
          line_total_cents: 3900,
          tax_treatment: 'taxable',
          tax_rate_permille: 190,
        }),
      ]);
      // 39,00 EUR brutto, 19 % enthalten: 6,23 EUR.
      expect(dokument.totals).toEqual({ total_cents: 3900, tax_total_cents: 623 });
      expect(dokument.tax_groups).toEqual([
        expect.objectContaining({ tax_treatment: 'taxable', tax_cents: 623, net_cents: 3277 }),
      ]);

      const { rows: stand } = await asPostgres<{ status: string }>(
        'select status from public.billable_services where aftercare_subscription_id = $1',
        [id],
      );
      expect(stand[0]!.status).toBe('invoiced');
    });
  });

  describe('Storno und Verordnung (Zweitreview H6)', () => {
    it('nimmt den Abo-Monat in die Korrekturrechnung nach einem Storno', async () => {
      const id = await abo(vormonat);
      await erfassen(id, vormonat);
      const { rows: entwurf } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        vormonat,
      ]);
      await asUserCommitted(users.office, AUSSTELLEN, [entwurf[0]!.id]);
      await asUserCommitted(users.office, 'select public.cancel_invoice($1::uuid, $2)', [
        entwurf[0]!.id,
        'Falscher Empfänger',
      ]);
      const { rows: korrektur } = await asUserCommitted<{ id: string }>(
        users.office,
        'select public.create_correction_draft($1::uuid) as id',
        [entwurf[0]!.id],
      );
      const { rows } = await asPostgres<{ code: string }>(
        `select c.code from public.invoice_items it
           join public.billable_services b on b.id = it.billable_service_id
           join public.service_catalog_items c on c.id = b.catalog_item_id
          where it.invoice_id = $1`,
        [korrektur[0]!.id],
      );
      expect(rows.map((r) => r.code)).toEqual(['NSA']);
    });

    it('hält Abo-Monat und Verordnung auf getrennten Rechnungen', async () => {
      await asPostgres(
        `update public.patients set care_concluded_on = null,
                          care_concluded_at = null, care_concluded_by = null where id = $1`,
        [patients.erika],
      );
      const behandlung = await termin(24 * 40, 'documented', GRUNDLAGE);
      await asPostgres(
        `insert into public.billable_services
           (organization_id, patient_id, appointment_id, catalog_item_id, performed_on)
         select organization_id, patient_id, id, $2, (starts_at at time zone 'Europe/Berlin')::date
           from public.appointments where id = $1`,
        [behandlung, KG],
      );
      await abschliessen(patients.erika, vormonat);
      const id = await abo(vormonat);
      await erfassen(id, vormonat);

      const { rows: basis } = await asUserCommitted<{ id: string }>(
        users.office,
        'select public.create_invoice_draft_for_basis($1::uuid) as id',
        [GRUNDLAGE],
      );
      const codes = async (rechnung: string) =>
        (
          await asPostgres<{ code: string }>(
            `select c.code from public.invoice_items it
               join public.billable_services b on b.id = it.billable_service_id
               join public.service_catalog_items c on c.id = b.catalog_item_id
              where it.invoice_id = $1`,
            [rechnung],
          )
        ).rows.map((r) => r.code);
      expect(await codes(basis[0]!.id)).toEqual(['KG']);

      const { rows: monat } = await asUserCommitted<{ id: string }>(users.office, ENTWURF, [
        patients.erika,
        vormonat,
      ]);
      expect(await codes(monat[0]!.id)).toEqual(['NSA']);

      // Ein Abo-Monat auf der Rechnung einer Verordnung wird abgewiesen.
      await asPostgres('delete from public.invoice_items where invoice_id = $1', [monat[0]!.id]);
      await asPostgres(
        `insert into public.invoice_items (organization_id, invoice_id, billable_service_id, sort_order)
         select organization_id, $1, id, 9 from public.billable_services
          where aftercare_subscription_id = $2`,
        [basis[0]!.id, id],
      );
      await expect(
        asPostgres('select app.assert_invoice_items_match_basis($1::uuid)', [basis[0]!.id]),
      ).rejects.toThrow(/do not belong to the treatment basis/);
    });
  });

  describe('Preisliste', () => {
    it('lässt den Abo-Monat nur steuerpflichtig, im Bereich Behandlung und einmal je Liste zu', async () => {
      const { rows: version } = await asUserCommitted<{ id: string }>(
        users.ownerTherapist,
        `select public.create_service_catalog_version('Probe', '2028-01-01'::date) as id`,
      );
      const schreiben = (zeilen: unknown[]) =>
        asUser(
          users.ownerTherapist,
          'select public.write_service_catalog_items($1::uuid, $2::jsonb)',
          [version[0]!.id, JSON.stringify(zeilen)],
        );
      const abo = {
        code: 'NSA',
        label: 'Nachsorge-Abo (Monat)',
        item_kind: 'aftercare_month',
        unit_price_cents: 3900,
        tax_treatment: 'taxable',
        tax_rate_permille: 190,
      };
      await expect(schreiben([abo])).resolves.toBeTruthy();
      await expect(
        schreiben([{ ...abo, tax_treatment: 'exempt_healthcare', tax_rate_permille: 0 }]),
      ).rejects.toThrow(/service_catalog_items_aftercare_month/);
      await expect(schreiben([{ ...abo, service_area: 'training' }])).rejects.toThrow(
        /service_catalog_items_aftercare_month/,
      );
      await expect(schreiben([abo, { ...abo, code: 'NSA2' }])).rejects.toThrow(
        /service_catalog_items_version_aftercare_key/,
      );
    });
  });
});
