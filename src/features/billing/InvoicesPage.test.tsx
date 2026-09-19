import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchKandidaten = vi.fn();
const fetchRechnungen = vi.fn();
const fetchOffenePosten = vi.fn();
const createEntwurf = vi.fn();
const bucheZahlung = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchKandidaten: () => fetchKandidaten() as Promise<BillingApi.Kandidat[]>,
    fetchRechnungen: () => fetchRechnungen() as Promise<BillingApi.Rechnung[]>,
    fetchOffenePosten: () => fetchOffenePosten() as Promise<BillingApi.OffenerPosten[]>,
    createEntwurf: (...args: unknown[]) => createEntwurf(...args) as Promise<string>,
    bucheZahlung: (...args: unknown[]) => bucheZahlung(...args) as Promise<void>,
  };
});

const { InvoicesPage } = await import('./InvoicesPage');

function kandidat(rest: Partial<BillingApi.Kandidat> = {}): BillingApi.Kandidat {
  return {
    patient_id: 'p1',
    patient_name: 'Erika Beispiel',
    period_month: '2026-08-01',
    service_count: 3,
    total_cents: 13_500,
    currency: 'EUR',
    has_draft: false,
    ...rest,
  };
}

function rechnung(rest: Partial<BillingApi.Rechnung> = {}): BillingApi.Rechnung {
  return {
    id: 'r1',
    status: 'issued',
    invoice_number: 'RG-2026-0001',
    period_month: '2026-08-01',
    issued_on: '2026-09-01',
    due_on: '2026-09-15',
    patient_id: 'p1',
    patient_name: 'Erika Beispiel',
    recipient_name: 'Erika Beispiel',
    recipient_kind: 'self',
    total_cents: 13_500,
    currency: 'EUR',
    item_count: 3,
    paid_cents: 0,
    outstanding_cents: 13_500,
    payment_state: 'unpaid',
    overdue: false,
    ...rest,
  };
}

function posten(rest: Partial<BillingApi.OffenerPosten> = {}): BillingApi.OffenerPosten {
  return {
    id: 'r1',
    invoice_number: 'RG-2026-0001',
    patient_id: 'p1',
    patient_name: 'Erika Beispiel',
    recipient_name: 'Erika Beispiel',
    period_month: '2026-08-01',
    issued_on: '2026-09-01',
    due_on: '2026-09-15',
    total_cents: 13_500,
    paid_cents: 0,
    outstanding_cents: 13_500,
    currency: 'EUR',
    overdue: false,
    open_total_cents: 13_500,
    ...rest,
  };
}

describe('InvoicesPage', () => {
  beforeEach(() => {
    fetchKandidaten.mockReset();
    fetchRechnungen.mockReset();
    fetchOffenePosten.mockReset();
    createEntwurf.mockReset();
    bucheZahlung.mockReset();
    fetchKandidaten.mockResolvedValue([]);
    fetchRechnungen.mockResolvedValue([]);
    fetchOffenePosten.mockResolvedValue([]);
    bucheZahlung.mockResolvedValue(undefined);
  });

  it('buendelt Abzurechnendes nach Person und Monat', async () => {
    fetchKandidaten.mockResolvedValue([kandidat()]);

    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    expect(await screen.findByText('Erika Beispiel')).toBeInTheDocument();
    expect(screen.getByText('August 2026')).toBeInTheDocument();
    expect(screen.getByText(/3 Leistungen · 135,00 €/)).toBeInTheDocument();
  });

  it('legt einen Entwurf fuer genau diesen Monat an', async () => {
    const nutzer = userEvent.setup();
    fetchKandidaten.mockResolvedValue([kandidat()]);
    createEntwurf.mockResolvedValue('neu-1');

    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    await nutzer.click(await screen.findByRole('button', { name: 'Entwurf anlegen' }));

    expect(createEntwurf).toHaveBeenCalledWith('p1', '2026-08-01');
  });

  it('bietet keinen zweiten Entwurf fuer denselben Monat an', async () => {
    fetchKandidaten.mockResolvedValue([kandidat({ has_draft: true })]);

    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    expect(await screen.findByText(/bereits ein Entwurf/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entwurf anlegen' })).not.toBeInTheDocument();
  });

  it('zeigt der Therapeutin keine Schaltflaeche zum Anlegen (ANN-076)', async () => {
    fetchKandidaten.mockResolvedValue([kandidat()]);

    renderWithProviders(<InvoicesPage user={testUser(['therapist'])} />, '/abrechnung');

    expect(await screen.findByText('Erika Beispiel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entwurf anlegen' })).not.toBeInTheDocument();
  });

  it('nennt den Entwurf ohne Nummer und die ausgestellte Rechnung mit', async () => {
    fetchRechnungen.mockResolvedValue([
      rechnung(),
      rechnung({
        id: 'r2',
        status: 'draft',
        invoice_number: null,
        issued_on: null,
        due_on: null,
      }),
    ]);

    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    expect(await screen.findByText('RG-2026-0001')).toBeInTheDocument();
    expect(screen.getByText('Ohne Nummer')).toBeInTheDocument();
    expect(screen.getByText('Ausgestellt')).toBeInTheDocument();
    expect(screen.getByText('Entwurf')).toBeInTheDocument();
  });

  it('nennt einen fremden Empfaenger mit seiner Art', async () => {
    fetchRechnungen.mockResolvedValue([
      rechnung({ recipient_kind: 'guardian', recipient_name: 'Betreuungsbuero Fiktiv GmbH' }),
    ]);

    renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

    expect(
      await screen.findByText(/Betreuungsbuero Fiktiv GmbH \(Betreuung\)/),
    ).toBeInTheDocument();
  });

  describe('Offene Posten (ABR-004)', () => {
    it('stehen ohne einen einzigen Tap auf der Seite, mit ihrer Summe', async () => {
      // OPTIMIERUNG.md: "Offene Posten sehen: 0 Taps auf der Einstiegsseite".
      fetchOffenePosten.mockResolvedValue([
        posten({ outstanding_cents: 4500, open_total_cents: 9000 }),
        posten({
          id: 'r2',
          invoice_number: 'RG-2026-0002',
          outstanding_cents: 4500,
          open_total_cents: 9000,
        }),
      ]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      expect(await screen.findByText('RG-2026-0001')).toBeInTheDocument();
      expect(screen.getByText(/2 Rechnungen · 90,00 € offen/)).toBeInTheDocument();
    });

    it('nimmt die Summe vom Server und addiert die Zeilen nicht selbst', async () => {
      // Die Liste ist gekuerzt, die Summe gilt trotzdem fuer alle offenen
      // Posten - deshalb steht sie an der Zeile und wird nicht gerechnet.
      fetchOffenePosten.mockResolvedValue([
        posten({ outstanding_cents: 4500, open_total_cents: 120_000 }),
      ]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      expect(await screen.findByText(/1\.200,00 € offen/)).toBeInTheDocument();
    });

    it('kennzeichnet eine ueberfaellige Rechnung', async () => {
      fetchOffenePosten.mockResolvedValue([posten({ overdue: true })]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      expect(await screen.findByText('Überfällig')).toBeInTheDocument();
    });

    it('bucht eine Zahlung mit dem offenen Betrag als Vorbelegung', async () => {
      const nutzer = userEvent.setup();
      fetchOffenePosten.mockResolvedValue([posten({ outstanding_cents: 4500 })]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      await nutzer.click(await screen.findByRole('button', { name: 'Zahlung buchen' }));
      expect(screen.getByLabelText('Betrag')).toHaveValue('45,00');

      await nutzer.click(screen.getByRole('button', { name: 'Zahlung buchen' }));

      expect(bucheZahlung).toHaveBeenCalledWith(
        expect.objectContaining({ invoiceId: 'r1', betragCent: 4500, richtung: 'incoming' }),
      );
    });

    it('nimmt eine Teilzahlung im selben Formular entgegen', async () => {
      const nutzer = userEvent.setup();
      fetchOffenePosten.mockResolvedValue([posten({ outstanding_cents: 4500 })]);

      renderWithProviders(<InvoicesPage user={testUser(['office'])} />, '/abrechnung');

      await nutzer.click(await screen.findByRole('button', { name: 'Zahlung buchen' }));
      await nutzer.clear(screen.getByLabelText('Betrag'));
      await nutzer.type(screen.getByLabelText('Betrag'), '20,00');
      await nutzer.click(screen.getByRole('button', { name: 'Zahlung buchen' }));

      expect(bucheZahlung).toHaveBeenCalledWith(expect.objectContaining({ betragCent: 2000 }));
    });

    it('bietet der Therapeutin kein Buchen an (ANN-076)', async () => {
      fetchOffenePosten.mockResolvedValue([posten()]);

      renderWithProviders(<InvoicesPage user={testUser(['therapist'])} />, '/abrechnung');

      expect(await screen.findByText('RG-2026-0001')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Zahlung buchen' })).not.toBeInTheDocument();
    });
  });
});
