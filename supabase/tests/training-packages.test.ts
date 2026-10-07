import { beforeAll, describe, expect, it } from 'vitest';
import { SEED, asPostgres, asUser, asUserCommitted, resetDatabaseOhneTermine } from './helpers/db';

/**
 * Das Trainingspaket (ANG-EPIC-002, ADR-009 Punkt 21, PROJECT_PRINCIPLES.md
 * 4.10 und 19).
 *
 *   * ANG-005: Das Paket ist eine Position der Preisliste mit Laufzeit, im
 *     Bereich training, ohne Heilmittel, steuerpflichtig zum Regelsatz
 *     (ANN-275). Die Kopie einer Preisliste nimmt die Laufzeit mit.
 */

const { users, organizationId } = SEED;

/** Preisliste 2026 (in Kraft) und 2027 (Entwurf), supabase/seed.sql. */
const LISTE_2026 = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000001';
const ENTWURF_2027 = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002';

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
