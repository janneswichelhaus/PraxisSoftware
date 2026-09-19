import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchZahlungen = vi.fn();
const storniereZahlung = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchZahlungen: () => fetchZahlungen() as Promise<BillingApi.ZahlungMitRechnung[]>,
    storniereZahlung: (...args: unknown[]) => storniereZahlung(...args) as Promise<void>,
  };
});

const { PaymentsPage } = await import('./PaymentsPage');

function zahlung(rest: Partial<BillingApi.ZahlungMitRechnung> = {}): BillingApi.ZahlungMitRechnung {
  return {
    id: 'z1',
    invoice_id: 'r1',
    invoice_number: 'RG-2026-0001',
    patient_name: 'Erika Beispiel',
    recipient_name: 'Erika Beispiel',
    direction: 'incoming',
    amount_cents: 4500,
    currency: 'EUR',
    paid_on: '2026-09-05',
    method: 'bank_transfer',
    note: null,
    voided_at: null,
    void_reason: null,
    ...rest,
  };
}

describe('PaymentsPage', () => {
  beforeEach(() => {
    fetchZahlungen.mockReset();
    storniereZahlung.mockReset();
    fetchZahlungen.mockResolvedValue([]);
    storniereZahlung.mockResolvedValue(undefined);
  });

  it('ist keine Vorschau mehr', async () => {
    fetchZahlungen.mockResolvedValue([zahlung()]);

    renderWithProviders(<PaymentsPage user={testUser(['office'])} />, '/abrechnung/zahlungen');

    expect(await screen.findByText('RG-2026-0001')).toBeInTheDocument();
    expect(screen.queryByText(/Vorschau/)).not.toBeInTheDocument();
  });

  it('sagt beim leeren Stand, wo gebucht wird', async () => {
    renderWithProviders(<PaymentsPage user={testUser(['office'])} />, '/abrechnung/zahlungen');

    expect(await screen.findByText('Noch keine Zahlung')).toBeInTheDocument();
  });

  it('nennt eine Rueckzahlung als solche und mit Vorzeichen', async () => {
    fetchZahlungen.mockResolvedValue([zahlung({ direction: 'refund', amount_cents: 1500 })]);

    renderWithProviders(<PaymentsPage user={testUser(['office'])} />, '/abrechnung/zahlungen');

    expect(await screen.findByText('Rückzahlung')).toBeInTheDocument();
    expect(screen.getByText('−15,00 €')).toBeInTheDocument();
  });

  it('laesst eine stornierte Buchung mit ihrem Grund stehen', async () => {
    fetchZahlungen.mockResolvedValue([
      zahlung({ voided_at: '2026-09-06T10:00:00Z', void_reason: 'Doppelt erfasst' }),
    ]);

    renderWithProviders(<PaymentsPage user={testUser(['office'])} />, '/abrechnung/zahlungen');

    expect(await screen.findByText('Storniert')).toBeInTheDocument();
    expect(screen.getByText(/storniert: Doppelt erfasst/)).toBeInTheDocument();
    // Was schon storniert ist, lässt sich nicht noch einmal stornieren.
    expect(screen.queryByRole('button', { name: 'Stornieren' })).not.toBeInTheDocument();
  });

  it('storniert nur mit Grund', async () => {
    const nutzer = userEvent.setup();
    fetchZahlungen.mockResolvedValue([zahlung()]);

    renderWithProviders(<PaymentsPage user={testUser(['office'])} />, '/abrechnung/zahlungen');

    await nutzer.click(await screen.findByRole('button', { name: 'Stornieren' }));
    await nutzer.click(screen.getByRole('button', { name: 'Storno buchen' }));

    expect(storniereZahlung).not.toHaveBeenCalled();
    expect(screen.getByText(/Bitte einen Grund angeben/)).toBeInTheDocument();

    await nutzer.type(screen.getByLabelText('Grund'), 'Doppelt erfasst');
    await nutzer.click(screen.getByRole('button', { name: 'Storno buchen' }));

    expect(storniereZahlung).toHaveBeenCalledWith('z1', 'Doppelt erfasst');
  });

  it('bietet der Therapeutin kein Stornieren an (ANN-076)', async () => {
    fetchZahlungen.mockResolvedValue([zahlung()]);

    renderWithProviders(<PaymentsPage user={testUser(['therapist'])} />, '/abrechnung/zahlungen');

    expect(await screen.findByText('RG-2026-0001')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Stornieren' })).not.toBeInTheDocument();
  });
});
