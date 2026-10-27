import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { KatalogPosition, KatalogVersion } from './api';

const fetchKatalogVersionen = vi.fn<() => Promise<KatalogVersion[]>>();
const fetchKatalogPositionen = vi.fn<(versionId: string) => Promise<KatalogPosition[]>>();
vi.mock('./api', () => ({
  fetchKatalogVersionen: () => fetchKatalogVersionen(),
  fetchKatalogPositionen: (versionId: string) => fetchKatalogPositionen(versionId),
}));

const { ladePosNummern } = await import('./posNummern');

function version(id: string, valid_from: string, published_at: string | null): KatalogVersion {
  return { id, label: id, valid_from, published_at, session_fee_cents: null };
}

function position(
  code: string,
  remedy: string | null,
  item_kind: KatalogPosition['item_kind'] = 'treatment',
): KatalogPosition {
  return {
    id: code,
    catalog_version_id: 'k2',
    sort_order: 1,
    code,
    label: code,
    item_kind,
    remedy,
    unit_price_cents: 3000,
    currency: 'EUR',
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
    service_area: 'therapy',
    package_months: null,
  };
}

describe('ladePosNummern', () => {
  beforeEach(() => {
    fetchKatalogVersionen.mockReset();
    fetchKatalogPositionen.mockReset();
  });

  it('nimmt die jüngste veröffentlichte Preisliste, die am Tag gilt', async () => {
    fetchKatalogVersionen.mockResolvedValue([
      version('k3', '2026-12-01', '2026-10-01T00:00:00Z'),
      version('k4', '2026-09-01', null),
      version('k2', '2026-07-01', '2026-06-01T00:00:00Z'),
      version('k1', '2026-01-01', '2026-01-01T00:00:00Z'),
    ]);
    fetchKatalogPositionen.mockResolvedValue([
      position('X0501', 'Krankengymnastik'),
      position('X9901', 'Krankengymnastik', 'absence_fee'),
      position('X9902', null),
    ]);

    const nummern = await ladePosNummern('2026-10-27');

    expect(fetchKatalogPositionen).toHaveBeenCalledWith('k2');
    expect([...nummern]).toEqual([['Krankengymnastik', 'X0501']]);
  });

  it('bleibt ohne gültige Preisliste leer, ohne Positionen zu laden', async () => {
    fetchKatalogVersionen.mockResolvedValue([version('k3', '2026-12-01', '2026-10-01T00:00:00Z')]);

    expect((await ladePosNummern('2026-10-27')).size).toBe(0);
    expect(fetchKatalogPositionen).not.toHaveBeenCalled();
  });
});
