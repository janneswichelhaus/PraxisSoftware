import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as BillingApi from './api';
import { KeineStammdaten } from './api';
import { renderWithProviders } from '@/test-utils';
import { rechnungsansicht } from './testdaten';
import { zeigeMitRouten } from './testumgebung';

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

  it('nennt die Person im Training nicht behandelt (TRN-008)', async () => {
    const ansicht = storniert({ patient_id: null, invoice_number: 'TR-2026-0001' });
    ansicht.document = {
      ...ansicht.document,
      service_area: 'training',
      patient: { name: 'Tina Trainingskundin', date_of_birth: null },
      treatment_bases: [],
    };
    fetchRechnung.mockResolvedValue(ansicht);
    zeige();

    expect(await screen.findByText('Leistung für')).toBeInTheDocument();
    expect(screen.queryByText('Behandelte Person')).not.toBeInTheDocument();
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

  describe('UXR-010', () => {
    function zeigeMitRoute() {
      return zeigeMitRouten(
        [{ path: '/abrechnung/rechnungen/:invoiceId/storno', element: <CancellationPrintPage /> }],
        '/abrechnung/rechnungen/r1/storno',
      );
    }

    it('führt auch ohne Storno zurück zur Rechnung (ABR-30, ABR-33, WRT-07)', async () => {
      fetchRechnung.mockResolvedValue(
        rechnungsansicht({ status: 'issued', invoice_number: 'RG-2026-0001' }),
      );
      zeigeMitRoute();

      expect(
        await screen.findByText(/Ein Stornodokument entsteht erst mit dem Storno – auf/),
      ).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Zurück zur Rechnung/ })).toHaveAttribute(
        'href',
        '/abrechnung/rechnungen/r1',
      );
    });

    it('führt bei fehlenden Stammdaten dorthin (ABR-17)', async () => {
      fetchRechnung.mockRejectedValue(new KeineStammdaten());
      zeigeMitRoute();

      expect(await screen.findByRole('link', { name: 'Zu den Praxisstammdaten' })).toHaveAttribute(
        'href',
        '/abrechnung/stammdaten',
      );
      expect(screen.getByRole('link', { name: /Zurück zur Rechnung/ })).toBeInTheDocument();
    });

    it('bietet beim Ladefehler einen nächsten Schritt statt einer Ratefrage (WRT-01)', async () => {
      fetchRechnung.mockRejectedValue(new Error('Netz weg'));
      zeige();

      expect(
        await screen.findByText('Bitte die Verbindung prüfen und erneut versuchen.'),
      ).toBeInTheDocument();
      expect(screen.queryByText(/angemeldet/)).toBeNull();
    });

    it('trägt denselben Briefkopf wie die Rechnung (ABR-22, ABR-B05, ABR-34)', async () => {
      fetchRechnung.mockResolvedValue(storniert());
      zeige();

      const titel = await screen.findByRole('heading', {
        name: 'Stornierung der Rechnung RG-2026-0001',
      });
      expect(titel).toHaveClass('text-h4', 'font-bold');
      expect(screen.getByText('Stornonummer')).toHaveClass('w-40', 'shrink-0');
      expect(screen.getByAltText('Own Motion').parentElement).toHaveClass('print:min-h-[33mm]');
    });

    it('nennt im Kleingedruckten keinen „Datensatz" (WRT-02)', async () => {
      fetchRechnung.mockResolvedValue(storniert());
      zeige();

      const hinweis = await screen.findByText(/legt sie nicht ab/);
      expect(hinweis.textContent).not.toMatch(/Datensatz/);
      expect(hinweis.textContent).toMatch(/in der Anwendung/);
    });
  });
});
