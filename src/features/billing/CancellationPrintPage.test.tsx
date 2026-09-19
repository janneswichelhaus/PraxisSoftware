import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as BillingApi from './api';
import { renderWithProviders } from '@/test-utils';
import { rechnungsansicht } from './testdaten';

const fetchRechnung = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchRechnung: (id: string) => fetchRechnung(id) as Promise<BillingApi.Rechnungsansicht>,
  };
});

const { CancellationPrintPage } = await import('./CancellationPrintPage');

function storniert(rest: Partial<BillingApi.Rechnungsansicht> = {}): BillingApi.Rechnungsansicht {
  return rechnungsansicht({
    status: 'issued',
    invoice_number: 'RG-2026-0001',
    issued_on: '2026-09-01',
    due_on: '2026-09-15',
    cancellation: {
      cancellation_number: 'RG-2026-0002',
      reason: 'Rechnung ging an die falsche Beihilfestelle',
      cancelled_on: '2026-09-18',
    },
    ...rest,
  });
}

function zeige(): void {
  renderWithProviders(<CancellationPrintPage />, '/abrechnung/rechnungen/r1/storno');
}

describe('Stornodokument', () => {
  beforeEach(() => {
    fetchRechnung.mockReset();
  });

  it('nennt eigene Nummer, Datum und die aufgehobene Rechnung', async () => {
    // Das Storno ist ein eigenes Dokument mit eigener Nummer (ADR-009
    // Punkt 9, ANN-079) — kein Vermerk auf der Rechnung.
    fetchRechnung.mockResolvedValue(storniert());
    zeige();

    expect(
      await screen.findByRole('heading', { name: 'Stornierung der Rechnung RG-2026-0001' }),
    ).toBeInTheDocument();
    expect(screen.getByText('RG-2026-0002')).toBeInTheDocument();
    expect(screen.getByText('18.09.2026')).toBeInTheDocument();
    expect(screen.getByText(/vollständig\s+storniert/)).toBeInTheDocument();
  });

  it('trägt den Grund auf das Blatt', async () => {
    fetchRechnung.mockResolvedValue(storniert());
    zeige();

    expect(
      await screen.findByText('Rechnung ging an die falsche Beihilfestelle'),
    ).toBeInTheDocument();
  });

  it('weist die enthaltene Umsatzsteuer aus, wenn die Rechnung eine trug', async () => {
    // Sie ist es, die beim Empfänger rückgängig zu machen ist.
    fetchRechnung.mockResolvedValue(
      rechnungsansicht(
        {
          status: 'issued',
          invoice_number: 'RG-2026-0005',
          cancellation: {
            cancellation_number: 'RG-2026-0006',
            reason: 'Falscher Satz',
            cancelled_on: '2026-09-18',
          },
        },
        { totals: { total_cents: 6000, tax_total_cents: 958 } },
      ),
    );
    zeige();

    expect(await screen.findByText(/Umsatzsteuer in Höhe von/)).toBeInTheDocument();
    expect(screen.getByText(/9,58 €/)).toBeInTheDocument();
  });

  it('nennt die Korrekturrechnung, sobald es eine gibt', async () => {
    fetchRechnung.mockResolvedValue(
      storniert({ correction_invoice_id: 'r9', correction_invoice_number: 'RG-2026-0007' }),
    );
    zeige();

    expect(await screen.findByText(/RG-2026-0007 neu\s+abgerechnet/)).toBeInTheDocument();
  });

  it('zeigt kein Blatt, wo nichts storniert wurde', async () => {
    fetchRechnung.mockResolvedValue(
      rechnungsansicht({ status: 'issued', invoice_number: 'RG-2026-0001' }),
    );
    zeige();

    expect(await screen.findByText(/Diese Rechnung ist nicht storniert/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stornodokument drucken' })).toBeNull();
  });
});
