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
 * Das Trainingspaket (ANG-EPIC-002, ADR-009 Punkt 21, PROJECT_PRINCIPLES.md
 * 4.10 und 19).
 *
 *   * ANG-005: Das Paket ist eine Position der Preisliste mit Laufzeit, im
 *     Bereich training, ohne Heilmittel, steuerpflichtig zum Regelsatz
 *     (ANN-275). Die Kopie einer Preisliste nimmt die Laufzeit mit.
 *   * ANG-006: Das Paket haengt am Trainingsverhaeltnis und bringt genau eine
 *     Leistung zum Beginn mit (ANN-276), zum Preis der am Beginn geltenden
 *     Liste. Laufzeit nach Paragraf 188 BGB, keine Ueberschneidung, kein
 *     Vertragsende vor dem Paketende (ANN-277), nicht waehrend einer
 *     laufenden Behandlung derselben Person (ANN-278). Nur owner und office.
 */

const { users, organizationId, patients, trainingRelationships } = SEED;

/** Preisliste 2026 (in Kraft) und 2027 (Entwurf), supabase/seed.sql. */
const LISTE_2026 = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';
const ENTWURF_2027 = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002';
/** Pakete der Preisliste 2026 (supabase/seed.sql). */
const TP3 = 'cccccccc-cccc-4ccc-8ccc-000000000014';
const TP6 = 'cccccccc-cccc-4ccc-8ccc-000000000015';
/** Paket der Preisliste 2027 - ein Entwurf, also an keinem Tag gueltig. */
const TP3_2027 = 'cccccccc-cccc-4ccc-8ccc-000000000016';

const ANLEGEN = 'select public.create_training_package($1::uuid, $2::uuid, $3::date) as id';
const ENTFERNEN = 'select public.delete_training_package($1::uuid)';
const SICHT = 'select public.get_training_packages($1::uuid) as sicht';
const POSITIONEN = 'select * from public.list_training_package_items($1::date)';
const TRAININGSENTWURF = 'select public.create_training_invoice_draft($1::uuid, $2::date) as id';
const AUSSTELLEN = 'select public.issue_invoice($1::uuid) as nummer';
const DOKUMENT = 'select public.get_invoice($1::uuid) as rechnung';
const VERTRAGSENDE = 'select public.end_training_relationship($1::uuid, $2::date) as ende';

/** Ein Tag relativ zu heute in der Zeitzone der Praxis, als `YYYY-MM-DD`. */
async function tag(ausdruck: string): Promise<string> {
  const { rows } = await asPostgres<{ tag: string }>(
    `select to_char((${ausdruck})::date, 'YYYY-MM-DD') as tag
       from (select (now() at time zone 'Europe/Berlin')::date as heute) h`,
  );
  return rows[0]!.tag;
}

async function anlegen(
  verhaeltnis: string,
  position: string,
  beginn: string,
  konto: string = users.office,
): Promise<string> {
  const { rows } = await asUserCommitted<{ id: string }>(konto, ANLEGEN, [
    verhaeltnis,
    position,
    beginn,
  ]);
  return rows[0]!.id;
}

async function positionEinfuegen(werte: {
  area?: string;
  months?: number | null;
  treatment?: string;
  rate?: number;
  remedy?: string | null;
  kind?: string;
}) {
  return asPostgres(
    `insert into public.service_catalog_items (
       organization_id, catalog_version_id, sort_order, code, label, item_kind, remedy,
       unit_price_cents, tax_treatment, tax_rate_permille, service_area, package_months
     ) values ($1, $2, 99, 'XP', 'Probe', $3, $4, 10000, $5, $6, $7, $8)`,
    [
      organizationId,
      ENTWURF_2027,
      werte.kind ?? 'training_package',
      werte.remedy ?? null,
      werte.treatment ?? 'taxable',
      werte.rate ?? 190,
      werte.area ?? 'training',
      werte.months === undefined ? 3 : werte.months,
    ],
  );
}

describe('Trainingspaket in der Preisliste (ANG-005)', () => {
  beforeAll(async () => {
    await resetDatabaseOhneTermine();
  }, 120_000);

  it('fuehrt der Seed je Preisliste zwei Pakete mit Laufzeit', async () => {
    const { rows } = await asPostgres<{ code: string; package_months: number }>(
      `select code, package_months from public.service_catalog_items
        where catalog_version_id = $1 and item_kind = 'training_package' order by code`,
      [LISTE_2026],
    );
    expect(rows).toEqual([
      { code: 'TP3', package_months: 3 },
      { code: 'TP6', package_months: 6 },
    ]);
  });

  it('nimmt ein Paket im Training mit Regelsatz an', async () => {
    await expect(positionEinfuegen({})).resolves.toBeDefined();
    await asPostgres(`delete from public.service_catalog_items where code = 'XP'`);
  });

  it.each([
    ['ohne Laufzeit', { months: null }],
    ['im Bereich der Behandlung', { area: 'therapy' }],
    ['mit Heilmittel', { remedy: 'Krankengymnastik' }],
    ['mit ermaessigtem Satz', { rate: 70 }],
    ['als nicht steuerbar', { treatment: 'not_taxable', rate: 0 }],
  ])('weist ein Paket %s ab (ANN-275)', async (_name, werte) => {
    await expect(positionEinfuegen(werte)).rejects.toThrow(
      /service_catalog_items_training_package|training_is_not_healthcare|tax_rate|reduced/,
    );
  });

  it('weist eine Laufzeit an einer anderen Positionsart ab', async () => {
    await expect(
      positionEinfuegen({ kind: 'treatment', months: 3, treatment: 'taxable' }),
    ).rejects.toThrow(/service_catalog_items_training_package/);
  });

  it('weist eine Laufzeit ueber 24 Monate ab', async () => {
    await expect(positionEinfuegen({ months: 25 })).rejects.toThrow(/package_months/);
  });

  it('schreibt die Laufzeit ueber den Schreibweg der Preisliste und kopiert sie mit', async () => {
    await asUser(users.ownerTherapist, 'select public.write_service_catalog_items($1, $2::jsonb)', [
      ENTWURF_2027,
      JSON.stringify([
        {
          code: 'TP12',
          label: 'Trainingspaket 12 Monate',
          item_kind: 'training_package',
          unit_price_cents: 130000,
          tax_treatment: 'taxable',
          tax_rate_permille: 190,
          service_area: 'training',
          package_months: 12,
        },
      ]),
    ]);
    const kopie = await asUserCommitted<{ id: string }>(
      users.ownerTherapist,
      `select public.create_service_catalog_version('Kopie', '2029-01-01', $1) as id`,
      [LISTE_2026],
    );
    const { rows } = await asPostgres<{ package_months: number }>(
      `select package_months from public.service_catalog_items
        where catalog_version_id = $1 and item_kind = 'training_package' order by code`,
      [kopie.rows[0]!.id],
    );
    expect(rows.map((r) => r.package_months)).toEqual([3, 6]);
  });
});

describe('Trainingspaket am Trainingsverhaeltnis (ANG-006)', () => {
  let heute: string;

  beforeAll(async () => {
    await resetDatabaseOhneTermine();
    await fremdeOrganisation();
    heute = await tag('heute');
  }, 120_000);

  beforeEach(async () => {
    await asPostgres('delete from public.invoice_cancellations');
    await asPostgres('delete from public.invoice_items');
    await asPostgres('delete from public.invoices');
    await asPostgres('delete from public.invoice_number_series');
    await asPostgres('delete from public.billable_services');
    await asPostgres('delete from public.training_packages');
    await asPostgres(
      `update public.training_relationships set contract_ended_on = null, status = 'active'`,
    );
    await asPostgres(
      'update public.patients set care_concluded_on = null, care_concluded_at = null, care_concluded_by = null',
    );
  });

  describe('Laufzeit (ANN-277)', () => {
    it('rechnet nach Paragraf 188 BGB vom Beginn aus', async () => {
      const { rows } = await asPostgres<{ drei: string; sechs: string; mitte: string }>(
        `select to_char(app.training_package_ends_on('2027-01-31', 3), 'YYYY-MM-DD') as drei,
                to_char(app.training_package_ends_on('2027-08-31', 6), 'YYYY-MM-DD') as sechs,
                to_char(app.training_package_ends_on('2027-03-15', 3), 'YYYY-MM-DD') as mitte`,
      );
      expect(rows[0]).toEqual({ drei: '2027-04-30', sechs: '2028-02-29', mitte: '2027-06-14' });
    });
  });

  describe('Anlegen', () => {
    it('legt Paket und genau eine Leistung zum Beginn an (ANN-276)', async () => {
      const id = await anlegen(trainingRelationships.tina, TP3, heute);

      const { rows: paket } = await asPostgres<{ ends_on: string; created_by: string }>(
        `select to_char(ends_on, 'YYYY-MM-DD') as ends_on, created_by
           from public.training_packages where id = $1`,
        [id],
      );
      expect(paket[0]!.ends_on).toBe(await tag(`app.training_package_ends_on(heute, 3)`));
      expect(paket[0]!.created_by).toBe(users.office);

      const { rows: leistung } = await asPostgres<Record<string, unknown>>(
        `select service_area, training_relationship_id, patient_id, appointment_id,
                catalog_item_id, quantity, to_char(performed_on, 'YYYY-MM-DD') as performed_on,
                status
           from public.billable_services where training_package_id = $1`,
        [id],
      );
      expect(leistung).toEqual([
        {
          service_area: 'training',
          training_relationship_id: trainingRelationships.tina,
          patient_id: null,
          appointment_id: null,
          catalog_item_id: TP3,
          quantity: 1,
          performed_on: heute,
          status: 'billable',
        },
      ]);
    });

    it('nimmt auch owner', async () => {
      await expect(
        anlegen(trainingRelationships.tina, TP6, heute, users.ownerTherapist),
      ).resolves.toBeTruthy();
    });

    it.each([
      ['Therapeutin', users.therapist],
      ['Teamleitung', users.teamLead],
      ['Trainingsbetreuung', users.trainer],
      ['Patientenkonto', users.patientErika],
      ['Plattformkonto', users.plattformTina],
    ])('weist %s ab', async (_name, konto) => {
      await expect(
        asUser(konto, ANLEGEN, [trainingRelationships.tina, TP3, heute]),
      ).rejects.toThrow(/not allowed to manage training packages/);
    });

    it('findet ein Verhaeltnis einer anderen Praxis nicht', async () => {
      const fremd = await fremdeOrganisation();
      await expect(
        asUser(fremd.owner, ANLEGEN, [trainingRelationships.tina, TP3, heute]),
      ).rejects.toThrow(/training relationship not found/);
    });

    it('weist eine Position ab, die keine Paketposition der am Beginn gueltigen Liste ist', async () => {
      await expect(
        asUser(users.office, ANLEGEN, [trainingRelationships.tina, TP3_2027, heute]),
      ).rejects.toThrow(/not in the price list valid on/);
      await expect(
        asUser(users.office, ANLEGEN, [
          trainingRelationships.tina,
          'cccccccc-cccc-4ccc-8ccc-000000000009',
          heute,
        ]),
      ).rejects.toThrow(/not in the price list valid on/);
    });

    it('beginnt hoechstens 14 Tage zurueck', async () => {
      await expect(
        asUser(users.office, ANLEGEN, [trainingRelationships.tina, TP3, await tag('heute - 15')]),
      ).rejects.toThrow(/cannot start: too_early/);
      await expect(
        anlegen(trainingRelationships.tina, TP3, await tag('heute - 14')),
      ).resolves.toBeTruthy();
    });

    it('beginnt nicht vor dem Vertragsbeginn', async () => {
      await asPostgres(
        `update public.training_relationships set contract_started_on = $2::date where id = $1`,
        [trainingRelationships.tina, await tag('heute + 10')],
      );
      try {
        await expect(
          asUser(users.office, ANLEGEN, [trainingRelationships.tina, TP3, heute]),
        ).rejects.toThrow(/cannot start: before_contract/);
      } finally {
        await asPostgres(
          `update public.training_relationships set contract_started_on = '2026-03-02' where id = $1`,
          [trainingRelationships.tina],
        );
      }
    });

    it('nicht an einem beendeten Verhaeltnis', async () => {
      await asPostgres(
        `update public.training_relationships
            set contract_ended_on = $2::date, status = 'inactive' where id = $1`,
        [trainingRelationships.tina, heute],
      );
      await expect(
        asUser(users.office, ANLEGEN, [trainingRelationships.tina, TP3, heute]),
      ).rejects.toThrow(/cannot start: ended/);
    });

    it('ueberschneidet sich nie mit einem anderen Paket desselben Verhaeltnisses', async () => {
      await anlegen(trainingRelationships.tina, TP3, heute);
      await expect(
        asUser(users.office, ANLEGEN, [trainingRelationships.tina, TP3, await tag('heute + 30')]),
      ).rejects.toThrow(/already covers this period/);
      // Nach dem Ende geht das naechste.
      const danach = await tag('app.training_package_ends_on(heute, 3) + 1');
      await expect(anlegen(trainingRelationships.tina, TP3, danach)).resolves.toBeTruthy();
    });

    describe('nicht waehrend einer Behandlung derselben Person (ANN-278)', () => {
      it('weist ab, solange Erikas Versorgung laeuft', async () => {
        await expect(
          asUser(users.office, ANLEGEN, [trainingRelationships.erika, TP3, heute]),
        ).rejects.toThrow(/cannot start: care_open/);
      });

      it('beginnt fruehestens am Abschluss der Versorgung', async () => {
        await asPostgres(
          `update public.patients
              set care_concluded_on = $2::date, care_concluded_at = now(), care_concluded_by = $3
            where id = $1`,
          [patients.erika, await tag('heute - 3'), users.ownerTherapist],
        );
        await expect(
          asUser(users.office, ANLEGEN, [trainingRelationships.erika, TP3, await tag('heute - 4')]),
        ).rejects.toThrow(/cannot start: before_care_end/);
        await expect(
          anlegen(trainingRelationships.erika, TP3, await tag('heute - 3')),
        ).resolves.toBeTruthy();
      });

      it('gilt nicht fuer eine Person ohne Akte', async () => {
        await expect(anlegen(trainingRelationships.tina, TP3, heute)).resolves.toBeTruthy();
      });
    });

    it('haelt die Leistung an Position, Verhaeltnis und Beginn des Pakets', async () => {
      const id = await anlegen(trainingRelationships.tina, TP3, heute);
      // Eine zweite Leistung zum selben Paket: Doppelabrechnung (ADR-009 Punkt 4).
      await expect(
        asPostgres(
          `insert into public.billable_services
             (organization_id, training_relationship_id, training_package_id, catalog_item_id, performed_on)
           values ($1, $2, $3, $4, $5::date)`,
          [organizationId, trainingRelationships.tina, id, TP3, heute],
        ),
      ).rejects.toThrow(/billable_services_training_package_key/);
      // Eine andere Position oder ein anderes Verhaeltnis.
      await asPostgres('delete from public.billable_services where training_package_id = $1', [id]);
      await expect(
        asPostgres(
          `insert into public.billable_services
             (organization_id, training_relationship_id, training_package_id, catalog_item_id, performed_on)
           values ($1, $2, $3, $4, $5::date)`,
          [organizationId, trainingRelationships.tina, id, TP6, heute],
        ),
      ).rejects.toThrow(/does not match its training package/);
      await expect(
        asPostgres(
          `insert into public.billable_services
             (organization_id, training_relationship_id, training_package_id, catalog_item_id, performed_on)
           values ($1, $2, $3, $4, $5::date)`,
          [organizationId, trainingRelationships.erika, id, TP3, heute],
        ),
      ).rejects.toThrow(/does not match its training package/);
    });
  });

  describe('Rechnung', () => {
    it('stellt das Paket ueber den Monatsentwurf mit Zeitraum und Regelsatz aus', async () => {
      const id = await anlegen(trainingRelationships.tina, TP3, heute);
      const { rows: entwurf } = await asUserCommitted<{ id: string }>(
        users.office,
        TRAININGSENTWURF,
        [trainingRelationships.tina, heute],
      );
      await asUserCommitted(users.office, AUSSTELLEN, [entwurf[0]!.id]);
      const { rows } = await asUser<{
        rechnung: {
          document: {
            service_area: string;
            service_period: { from: string; to: string };
            items: Array<Record<string, unknown>>;
            totals: { total_cents: number; tax_total_cents: number };
          };
        };
      }>(users.office, DOKUMENT, [entwurf[0]!.id]);
      const dokument = rows[0]!.rechnung.document;
      const ende = await tag('app.training_package_ends_on(heute, 3)');
      expect(dokument.service_area).toBe('training');
      expect(dokument.service_period).toEqual({ from: heute, to: ende });
      expect(dokument.items).toEqual([
        expect.objectContaining({
          item_kind: 'training_package',
          code: 'TP3',
          quantity: 1,
          performed_on: heute,
          period_until: ende,
          line_total_cents: 39000,
          tax_treatment: 'taxable',
          tax_rate_permille: 190,
        }),
      ]);
      // 390,00 EUR brutto, 19 % enthalten: 62,27 EUR.
      expect(dokument.totals).toEqual({ total_cents: 39000, tax_total_cents: 6227 });

      // Auf der Rechnung: kein Entfernen mehr.
      await expect(asUser(users.office, ENTFERNEN, [id])).rejects.toThrow(
        /training package is on an invoice/,
      );
    });

    it('behaelt den Preis, mit dem das Paket begann (ADR-009 Punkt 5)', async () => {
      const id = await anlegen(trainingRelationships.tina, TP3, heute);
      // Eine Position einer veroeffentlichten Liste ist unveraenderlich; eine
      // neue Liste legt eine neue Position an, die Leistung zeigt auf die alte.
      const { rows } = await asPostgres<{ catalog_item_id: string }>(
        'select catalog_item_id from public.billable_services where training_package_id = $1',
        [id],
      );
      expect(rows[0]!.catalog_item_id).toBe(TP3);
    });
  });

  describe('Entfernen einer Fehlanlage', () => {
    it('entfernt Paket und Leistung, solange nichts abgerechnet ist', async () => {
      const id = await anlegen(trainingRelationships.tina, TP3, heute);
      await asUserCommitted(users.office, ENTFERNEN, [id]);
      const { rows } = await asPostgres<{ n: string }>(
        `select (select count(*) from public.training_packages where id = $1)
              + (select count(*) from public.billable_services where training_package_id = $1) as n`,
        [id],
      );
      expect(rows[0]!.n).toBe('0');
    });

    it('nicht auf einem Rechnungsentwurf', async () => {
      const id = await anlegen(trainingRelationships.tina, TP3, heute);
      await asUserCommitted(users.office, TRAININGSENTWURF, [trainingRelationships.tina, heute]);
      await expect(asUser(users.office, ENTFERNEN, [id])).rejects.toThrow(
        /training package is on an invoice/,
      );
    });

    it('weist andere Rollen und eine andere Praxis ab', async () => {
      const id = await anlegen(trainingRelationships.tina, TP3, heute);
      await expect(asUser(users.trainer, ENTFERNEN, [id])).rejects.toThrow(/not allowed/);
      await expect(asUser(users.therapist, ENTFERNEN, [id])).rejects.toThrow(/not allowed/);
      const fremd = await fremdeOrganisation();
      await expect(asUser(fremd.owner, ENTFERNEN, [id])).rejects.toThrow(
        /training package not found/,
      );
    });
  });

  describe('Vertragsende (ANN-277)', () => {
    it('endet nicht vor dem letzten Tag eines Pakets', async () => {
      await anlegen(trainingRelationships.tina, TP3, await tag('heute - 2'));
      await expect(
        asUser(users.office, VERTRAGSENDE, [trainingRelationships.tina, heute]),
      ).rejects.toThrow(/runs beyond the contract end/);
    });

    it('endet nach dem Paket wie bisher', async () => {
      await asPostgres(
        `insert into public.training_packages
           (organization_id, training_relationship_id, catalog_item_id, starts_on, ends_on)
         values ($1, $2, $3, $4::date - 100, $4::date - 10)`,
        [organizationId, trainingRelationships.tina, TP3, heute],
      );
      const { rows } = await asUserCommitted<{ ende: string }>(users.office, VERTRAGSENDE, [
        trainingRelationships.tina,
        heute,
      ]);
      expect(rows[0]!.ende).toBeTruthy();
    });
  });

  describe('Sicht am Verhaeltnis', () => {
    it('zeigt Pakete mit Preis, Zeitraum, Stand und Hindernis', async () => {
      await anlegen(trainingRelationships.tina, TP3, heute);
      const { rows } = await asUser<{ sicht: Record<string, unknown> }>(users.office, SICHT, [
        trainingRelationships.tina,
      ]);
      const sicht = rows[0]!.sicht as {
        today: string;
        start_blocker: string | null;
        packages: Array<Record<string, unknown>>;
      };
      expect(sicht.today).toBe(heute);
      expect(sicht.start_blocker).toBeNull();
      expect(sicht.packages).toEqual([
        expect.objectContaining({
          code: 'TP3',
          package_months: 3,
          price_cents: 39000,
          starts_on: heute,
          state: 'running',
          invoiced: false,
          created_by_name: 'Olivia Office',
        }),
      ]);
    });

    it('nennt fuer Erika die laufende Behandlung als Hindernis (ANN-278)', async () => {
      const { rows } = await asUser<{ sicht: { start_blocker: string } }>(users.office, SICHT, [
        trainingRelationships.erika,
      ]);
      expect(rows[0]!.sicht.start_blocker).toBe('care_open');
    });

    it('weist die Trainingsbetreuung mit Eintrag ab', async () => {
      await erwarteAbgewiesenenLeseversuch(
        users.trainer,
        `select s from public.get_training_packages($1::uuid) s where s is not null`,
        [trainingRelationships.tina],
        'training_packages.read',
      );
    });

    it('liefert fuer eine andere Praxis nichts', async () => {
      const fremd = await fremdeOrganisation();
      const { rows } = await asUser<{ sicht: unknown }>(fremd.owner, SICHT, [
        trainingRelationships.tina,
      ]);
      expect(rows[0]!.sicht).toBeNull();
    });

    it('listet die Pakete der Preisliste eines Tags, nur fuer owner und office', async () => {
      const { rows } = await asUser<{ code: string; package_months: number }>(
        users.office,
        POSITIONEN,
        [heute],
      );
      expect(rows.map((r) => [r.code, r.package_months])).toEqual([
        ['TP3', 3],
        ['TP6', 6],
      ]);
      await erwarteAbgewiesenenLeseversuch(
        users.trainer,
        POSITIONEN,
        [heute],
        'training_packages.read',
      );
    });
  });
});
