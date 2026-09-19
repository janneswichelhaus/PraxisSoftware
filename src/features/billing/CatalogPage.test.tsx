import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchKatalogVersionen = vi.fn();
const fetchKatalogPositionen = vi.fn();
const createKatalogVersion = vi.fn();
const writeKatalogPositionen = vi.fn();
const publishKatalogVersion = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchKatalogVersionen: () => fetchKatalogVersionen() as Promise<BillingApi.KatalogVersion[]>,
    fetchKatalogPositionen: (id: string) =>
      fetchKatalogPositionen(id) as Promise<BillingApi.KatalogPosition[]>,
    createKatalogVersion: (...args: unknown[]) => createKatalogVersion(...args) as Promise<string>,
    writeKatalogPositionen: (...args: unknown[]) =>
      writeKatalogPositionen(...args) as Promise<void>,
    publishKatalogVersion: (id: string) => publishKatalogVersion(id) as Promise<void>,
  };
});

const { CatalogPage } = await import('./CatalogPage');

function version(
  id: string,
  rest: Partial<BillingApi.KatalogVersion> = {},
): BillingApi.KatalogVersion {
  return {
    id,
    label: 'Preisliste 2026',
    valid_from: '2026-01-01',
    published_at: '2025-12-20T08:00:00Z',
    ...rest,
  };
}

function position(
  id: string,
  rest: Partial<BillingApi.KatalogPosition> = {},
): BillingApi.KatalogPosition {
  return {
    id,
    catalog_version_id: 'v1',
    sort_order: 1,
    code: 'KG',
    label: 'Krankengymnastik',
    item_kind: 'treatment',
    remedy: 'Krankengymnastik',
    unit_price_cents: 4500,
    currency: 'EUR',
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
    ...rest,
  };
}

describe('CatalogPage', () => {
  beforeEach(() => {
    fetchKatalogVersionen.mockReset();
    fetchKatalogPositionen.mockReset();
    createKatalogVersion.mockReset();
    writeKatalogPositionen.mockReset();
    publishKatalogVersion.mockReset();
    fetchKatalogPositionen.mockResolvedValue([position('p1')]);
  });

  it('nennt Preis und Steuerkennzeichen je Position', async () => {
    fetchKatalogVersionen.mockResolvedValue([version('v1')]);

    renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

    expect(await screen.findByText('45,00 €')).toBeInTheDocument();
    expect(screen.getByText(/Heilbehandlung, umsatzsteuerfrei/)).toBeInTheDocument();
  });

  it('zeigt eine in Kraft gesetzte Preisliste ohne jede Schaltflaeche zum Aendern', async () => {
    fetchKatalogVersionen.mockResolvedValue([version('v1')]);

    renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

    expect(await screen.findByText('45,00 €')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entwurf speichern' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'In Kraft setzen' })).not.toBeInTheDocument();
    expect(screen.getByText(/unveränderlich/)).toBeInTheDocument();
  });

  it('macht einen Entwurf bearbeitbar und setzt ihn in Kraft', async () => {
    const nutzer = userEvent.setup();
    fetchKatalogVersionen.mockResolvedValue([
      version('v2', { published_at: null, label: 'Entwurf 2027' }),
    ]);
    publishKatalogVersion.mockResolvedValue(undefined);

    renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

    expect(await screen.findByRole('button', { name: 'Entwurf speichern' })).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'In Kraft setzen' }));
    // Die Rueckfrage sagt, was unumkehrbar wird, bevor sie es tut.
    expect(screen.getByText(/unveränderlich/)).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'In Kraft setzen' }));

    expect(publishKatalogVersion).toHaveBeenCalledWith('v2');
  });

  it('weist eine Position ohne gueltigen Preis zurueck, bevor gespeichert wird', async () => {
    const nutzer = userEvent.setup();
    fetchKatalogVersionen.mockResolvedValue([version('v2', { published_at: null })]);

    renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

    const preis = await screen.findByLabelText(/Preis/);
    await nutzer.clear(preis);
    await nutzer.type(preis, 'viel');

    expect(screen.getByText('Preis ist keine gültige Zahl.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Entwurf speichern' })).toBeDisabled();
    expect(writeKatalogPositionen).not.toHaveBeenCalled();
  });

  it('bietet dem Office keine Pflege an - die Grenze zieht der Server', async () => {
    fetchKatalogVersionen.mockResolvedValue([version('v2', { published_at: null })]);

    renderWithProviders(<CatalogPage user={testUser(['office'])} />, '/abrechnung/katalog');

    expect(await screen.findByText('45,00 €')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Neue Preisliste' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entwurf speichern' })).not.toBeInTheDocument();
  });

  it('legt eine neue Preisliste als Kopie der geltenden an', async () => {
    const nutzer = userEvent.setup();
    fetchKatalogVersionen.mockResolvedValue([version('v1')]);
    createKatalogVersion.mockResolvedValue('v9');

    renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

    await nutzer.click(await screen.findByRole('button', { name: 'Neue Preisliste' }));
    await nutzer.type(screen.getByLabelText(/Bezeichnung/), 'Preisliste 2027');
    await nutzer.click(screen.getByRole('button', { name: 'Entwurf anlegen' }));

    expect(createKatalogVersion).toHaveBeenCalledWith('Preisliste 2027', expect.any(String), 'v1');
  });

  it('sagt, dass ohne Preisliste keine Leistung erfasst werden kann', async () => {
    fetchKatalogVersionen.mockResolvedValue([]);

    renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

    const leer = await screen.findByText('Noch keine Preisliste');
    expect(leer).toBeInTheDocument();
    expect(screen.getByText(/lässt sich keine Leistung erfassen/)).toBeInTheDocument();
  });

  it('trennt Entwurf und geltende Liste sichtbar', async () => {
    fetchKatalogVersionen.mockResolvedValue([
      version('v2', { published_at: null, label: 'Preisliste 2027', valid_from: '2027-01-01' }),
      version('v1'),
    ]);

    renderWithProviders(<CatalogPage user={testUser(['owner'])} />, '/abrechnung/katalog');

    const liste = await screen.findByRole('list');
    expect(within(liste).getByText('Entwurf')).toBeInTheDocument();
    expect(within(liste).getByText('In Kraft')).toBeInTheDocument();
  });
});
