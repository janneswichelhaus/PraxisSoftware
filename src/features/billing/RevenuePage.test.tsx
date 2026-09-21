import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { renderWithProviders } from '@/test-utils';

const fetchEinnahmen = vi.fn();
const fetchEinnahmenjahre = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchEinnahmen: (...args: unknown[]) =>
      fetchEinnahmen(...args) as Promise<BillingApi.Einnahmenzeile[]>,
    fetchEinnahmenjahre: () => fetchEinnahmenjahre() as Promise<number[]>,
  };
});

const { RevenuePage } = await import('./RevenuePage');

function zeile(rest: Partial<BillingApi.Einnahmenzeile> = {}): BillingApi.Einnahmenzeile {
  return {
    basis: 'cash',
    year: 2026,
    service_area: 'therapy',
    tax_treatment: 'exempt_healthcare',
    tax_rate_permille: 0,
    currency: 'EUR',
    gross_cents: 4500,
    tax_cents: 0,
    net_cents: 4500,
    document_count: 1,
    ...rest,
  };
}

async function waehleGrundlage(label: string) {
  await userEvent.selectOptions(screen.getByLabelText('Grundlage'), [
    screen.getByRole('option', { name: label }),
  ]);
}

describe('RevenuePage', () => {
  beforeEach(() => {
    fetchEinnahmen.mockReset();
    fetchEinnahmenjahre.mockReset();
    fetchEinnahmen.mockResolvedValue([]);
    fetchEinnahmenjahre.mockResolvedValue([2026, 2025]);
  });

  it('waehlt keine Grundlage vor und zeigt ohne sie keine Zahl', async () => {
    fetchEinnahmen.mockResolvedValue([zeile()]);

    renderWithProviders(<RevenuePage />, '/abrechnung/auswertung');

    expect(await screen.findByText('Noch keine Grundlage gewählt')).toBeInTheDocument();
    expect(screen.queryByText('45,00 €')).not.toBeInTheDocument();
    // Die Wahl liegt bei der Steuerberatung (B9): Ohne Auswahl fragt die
    // Seite den Server gar nicht erst.
    expect(fetchEinnahmen).not.toHaveBeenCalled();
  });

  it('nennt die gewaehlte Grundlage an der Summe', async () => {
    fetchEinnahmen.mockResolvedValue([zeile()]);

    renderWithProviders(<RevenuePage />, '/abrechnung/auswertung');
    await waehleGrundlage('Zufluss');

    expect(await screen.findByText(/Summe Behandlung · Zufluss/)).toBeInTheDocument();
    expect(fetchEinnahmen).toHaveBeenCalledWith('cash', 2026);
  });

  it('fragt beim Wechsel der Grundlage neu und mischt nichts', async () => {
    fetchEinnahmen.mockResolvedValue([zeile()]);

    renderWithProviders(<RevenuePage />, '/abrechnung/auswertung');
    await waehleGrundlage('Zufluss');
    expect(await screen.findByText(/Summe Behandlung · Zufluss/)).toBeInTheDocument();

    await waehleGrundlage('Rechnungsstellung');

    expect(await screen.findByText(/Summe Behandlung · Rechnungsstellung/)).toBeInTheDocument();
    expect(screen.queryByText(/Summe Behandlung · Zufluss/)).not.toBeInTheDocument();
    expect(fetchEinnahmen).toHaveBeenLastCalledWith('accrual', 2026);
  });

  it('fuehrt die Bereiche getrennt und summiert nie darueber', async () => {
    fetchEinnahmen.mockResolvedValue([
      zeile({ gross_cents: 4500, net_cents: 4500 }),
      zeile({
        service_area: 'training',
        tax_treatment: 'taxable',
        tax_rate_permille: 190,
        gross_cents: 8000,
        tax_cents: 1277,
        net_cents: 6723,
      }),
    ]);

    renderWithProviders(<RevenuePage />, '/abrechnung/auswertung');
    await waehleGrundlage('Zufluss');

    expect(await screen.findByText(/Summe Behandlung · Zufluss/)).toBeInTheDocument();
    expect(screen.getByText(/Summe Training · Zufluss/)).toBeInTheDocument();
    // 45,00 + 80,00 stuenden zusammen bei 125,00 - genau diese Zahl darf es
    // nicht geben (ADR-009 Punkt 19).
    expect(screen.queryByText('125,00 €')).not.toBeInTheDocument();
  });

  it('schluesselt innerhalb des Bereichs nach Kennzeichen und Satz auf', async () => {
    fetchEinnahmen.mockResolvedValue([
      zeile(),
      zeile({
        tax_treatment: 'taxable',
        tax_rate_permille: 190,
        gross_cents: 6000,
        tax_cents: 958,
        net_cents: 5042,
        document_count: 2,
      }),
    ]);

    renderWithProviders(<RevenuePage />, '/abrechnung/auswertung');
    await waehleGrundlage('Rechnungsstellung');

    expect(await screen.findByText('Heilbehandlung, umsatzsteuerfrei')).toBeInTheDocument();
    expect(screen.getByText('Umsatzsteuerpflichtig · 19 %')).toBeInTheDocument();
    expect(
      screen.getByText(/enthaltene Umsatzsteuer 9,58 € · netto 50,42 € · 2 Dokumente/),
    ).toBeInTheDocument();
  });

  it('sagt beim leeren Jahr, dass nichts vorliegt - und behauptet keine Null', async () => {
    renderWithProviders(<RevenuePage />, '/abrechnung/auswertung');
    await waehleGrundlage('Zufluss');

    expect(await screen.findByText('Keine Zahlen in diesem Jahr')).toBeInTheDocument();
  });

  it('bietet nur Jahre an, in denen etwas liegt', async () => {
    renderWithProviders(<RevenuePage />, '/abrechnung/auswertung');

    // Erst warten, bis die Jahre da sind: Vorher steht dort ein Gedankenstrich
    // und kein erfundenes Jahr.
    await screen.findByRole('option', { name: '2026' });

    const jahre = screen.getByLabelText('Jahr');
    expect([...jahre.querySelectorAll('option')].map((o) => o.textContent)).toEqual([
      '2026',
      '2025',
    ]);
  });

  it('nennt sich keinen Abschluss', async () => {
    renderWithProviders(<RevenuePage />, '/abrechnung/auswertung');

    expect(await screen.findByText(/Kein steuerlicher Abschluss/)).toBeInTheDocument();
    expect(screen.getByText(/ersetzt keine Gewinnermittlung/)).toBeInTheDocument();
  });
});
