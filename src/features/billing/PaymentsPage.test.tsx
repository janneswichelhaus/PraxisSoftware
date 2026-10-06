import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';
import { zeigeMitRouten } from './testumgebung';

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
    total_count: 1,
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

  describe('UXR-010', () => {
    it('führt über die Nummer zur Rechnung und nimmt den Rückweg mit (ABR-25, ABR-29)', async () => {
      // Die Nummer sieht aus wie ein Link und ist 44 px hoch; „Zurück" auf der
      // Rechnung führt wieder hierher statt zu „Rechnungen".
      fetchZahlungen.mockResolvedValue([zahlung()]);

      renderWithProviders(<PaymentsPage user={testUser(['office'])} />, '/abrechnung/zahlungen');

      const link = await screen.findByRole('link', { name: 'RG-2026-0001' });
      expect(link).toHaveAttribute(
        'href',
        '/abrechnung/rechnungen/r1?zurueck=%2Fabrechnung%2Fzahlungen',
      );
      expect(link.className).toMatch(/\btext-accent\b/);
      expect(link.className).toMatch(/\bunderline\b/);
      expect(link.className).toMatch(/\bmin-h-11\b/);
    });

    it('lädt nach dem Storno auch die Rechnung und ihre Zahlungen neu (ABR-01)', async () => {
      // Aus der Rechnung kommt der offene Betrag; ohne sie neu zu laden stand
      // nach dem Storno weiter der alte da. Der Aufruf selbst bleibt derselbe.
      const nutzer = userEvent.setup();
      fetchZahlungen.mockResolvedValue([zahlung()]);

      const { client } = zeigeMitRouten(
        [
          {
            path: '/abrechnung/zahlungen',
            element: <PaymentsPage user={testUser(['office'])} />,
          },
        ],
        '/abrechnung/zahlungen',
      );
      const neuLaden = vi.spyOn(client, 'invalidateQueries');

      await nutzer.click(await screen.findByRole('button', { name: 'Stornieren' }));
      await nutzer.type(screen.getByLabelText('Grund'), 'Doppelt erfasst');
      await nutzer.click(screen.getByRole('button', { name: 'Storno buchen' }));

      await waitFor(() =>
        expect(neuLaden).toHaveBeenCalledWith({ queryKey: ['rechnungszahlungen', 'r1'] }),
      );
      expect(storniereZahlung).toHaveBeenCalledWith('z1', 'Doppelt erfasst');
      expect(neuLaden).toHaveBeenCalledWith({ queryKey: ['rechnung', 'r1'] });
      expect(neuLaden).toHaveBeenCalledWith({ queryKey: ['zahlungen'] });
      expect(neuLaden).toHaveBeenCalledWith({ queryKey: ['offene-posten'] });
    });

    it('bietet beim Ladefehler einen nächsten Schritt statt einer Ratefrage (WRT-01)', async () => {
      const nutzer = userEvent.setup();
      fetchZahlungen.mockRejectedValueOnce(new Error('Netz weg'));

      renderWithProviders(<PaymentsPage user={testUser(['office'])} />, '/abrechnung/zahlungen');

      expect(
        await screen.findByText('Bitte die Verbindung prüfen und erneut versuchen.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/angemeldet/)).toBeNull();

      fetchZahlungen.mockResolvedValue([zahlung()]);
      await nutzer.click(screen.getByRole('button', { name: 'Erneut versuchen' }));

      expect(await screen.findByRole('link', { name: 'RG-2026-0001' })).toBeInTheDocument();
    });
  });
});

describe('PaymentsPage: gekürzte Liste (ABR-034, BEF-061)', () => {
  it('sagt, dass nur die neuesten Zahlungen stehen', async () => {
    fetchZahlungen.mockResolvedValue([zahlung({ total_count: 250 })]);
    renderWithProviders(<PaymentsPage user={testUser(['office'])} />, '/abrechnung/zahlungen');
    expect(await screen.findByText('Die 1 neuesten von 250 Zahlungen')).toBeInTheDocument();
  });
});
