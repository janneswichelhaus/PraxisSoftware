import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchRechnung = vi.fn();
const fetchEmpfaenger = vi.fn();
const setzeEmpfaenger = vi.fn();
const stelleRechnungAus = vi.fn();
const deleteEntwurf = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchRechnung: (id: string) => fetchRechnung(id) as Promise<BillingApi.Rechnungsansicht>,
    fetchEmpfaenger: (id: string) => fetchEmpfaenger(id) as Promise<BillingApi.Empfaenger[]>,
    setzeEmpfaenger: (...args: unknown[]) => setzeEmpfaenger(...args) as Promise<void>,
    stelleRechnungAus: (id: string) => stelleRechnungAus(id) as Promise<string>,
    deleteEntwurf: (id: string) => deleteEntwurf(id) as Promise<void>,
  };
});

const { InvoiceDetailPage } = await import('./InvoiceDetailPage');

function ansicht(
  rest: Partial<BillingApi.Rechnungsansicht> = {},
  dokument: Partial<BillingApi.Rechnungsdokument> = {},
): BillingApi.Rechnungsansicht {
  return {
    id: 'r1',
    status: 'draft',
    patient_id: 'p1',
    recipient_id: null,
    invoice_number: null,
    issued_on: null,
    due_on: null,
    ...rest,
    document: {
      schema_version: 1,
      period_month: '2026-08-01',
      currency: 'EUR',
      issuer: {
        legal_name: 'Test Praxis Tuebingen',
        street: 'Musterallee',
        house_number: '1',
        postal_code: '72070',
        city: 'Tuebingen',
        phone: null,
        email: null,
        tax_number: '86123/45678',
        vat_id: null,
        small_business: false,
        bank_name: null,
        account_holder: null,
        iban: 'DE02120300000000202051',
        bic: null,
        payment_term_days: 14,
      },
      recipient: {
        kind: 'self',
        name: 'Erika Beispiel',
        street: 'Testweg',
        house_number: '7',
        postal_code: '72072',
        city: 'Tuebingen',
        reference: null,
      },
      patient: { name: 'Erika Beispiel', date_of_birth: '1963-09-17' },
      treatment_bases: [
        { kind: 'first', issued_on: '2026-07-01', prescriber: 'Dr. Fiktiv Beispiel' },
      ],
      items: [
        {
          performed_on: '2026-08-03',
          code: 'KG',
          label: 'Krankengymnastik',
          item_kind: 'treatment',
          quantity: 1,
          unit_price_cents: 4500,
          line_total_cents: 4500,
          currency: 'EUR',
          tax_treatment: 'exempt_healthcare',
          tax_rate_permille: 0,
        },
      ],
      tax_groups: [
        {
          tax_treatment: 'exempt_healthcare',
          tax_rate_permille: 0,
          gross_cents: 4500,
          tax_cents: 0,
          net_cents: 4500,
        },
      ],
      totals: { total_cents: 4500, tax_total_cents: 0 },
      ...dokument,
    },
  };
}

describe('InvoiceDetailPage', () => {
  beforeEach(() => {
    fetchRechnung.mockReset();
    fetchEmpfaenger.mockReset();
    setzeEmpfaenger.mockReset();
    stelleRechnungAus.mockReset();
    deleteEntwurf.mockReset();
    fetchEmpfaenger.mockResolvedValue([]);
    setzeEmpfaenger.mockResolvedValue(undefined);
    stelleRechnungAus.mockResolvedValue('RG-2026-0001');
  });

  it('nennt den Entwurf ohne Nummer und sagt, wann sie entsteht', async () => {
    fetchRechnung.mockResolvedValue(ansicht());

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    expect(await screen.findByRole('heading', { name: 'Rechnungsentwurf' })).toBeInTheDocument();
    expect(screen.getByText(/Die Nummer entsteht beim Ausstellen/)).toBeInTheDocument();
  });

  it('zeigt Leistungen, Summe und die Behandlungsgrundlage ohne Diagnose', async () => {
    fetchRechnung.mockResolvedValue(ansicht());

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    expect(await screen.findByText(/1 × Krankengymnastik \(KG\)/)).toBeInTheDocument();
    expect(screen.getByText('Gesamtbetrag')).toBeInTheDocument();
    expect(
      screen.getByText(/Erstverordnung vom 01.07.2026 · Dr. Fiktiv Beispiel/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ohne Diagnose/)).toBeInTheDocument();
  });

  it('weist die enthaltene Umsatzsteuer aus, wenn es eine gibt', async () => {
    fetchRechnung.mockResolvedValue(
      ansicht(
        {},
        {
          tax_groups: [
            {
              tax_treatment: 'taxable',
              tax_rate_permille: 190,
              gross_cents: 6000,
              tax_cents: 958,
              net_cents: 5042,
            },
          ],
          totals: { total_cents: 6000, tax_total_cents: 958 },
        },
      ),
    );

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    expect(
      await screen.findByText(/darin enthaltene Umsatzsteuer 9,58 € \(19 %\)/),
    ).toBeInTheDocument();
  });

  it('nennt den Hinweis nach Par. 19 UStG, wenn keine Umsatzsteuer ausgewiesen wird', async () => {
    const daten = ansicht();
    daten.document.issuer.small_business = true;
    fetchRechnung.mockResolvedValue(daten);

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    expect(await screen.findByText(/§ 19 UStG/)).toBeInTheDocument();
  });

  it('stellt den Entwurf auf Wunsch aus', async () => {
    const nutzer = userEvent.setup();
    fetchRechnung.mockResolvedValue(ansicht());

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    await nutzer.click(await screen.findByRole('button', { name: 'Rechnung ausstellen' }));

    expect(stelleRechnungAus).toHaveBeenCalledWith('r1');
  });

  it('fragt vor dem Verwerfen nach und nennt die Folge', async () => {
    const nutzer = userEvent.setup();
    fetchRechnung.mockResolvedValue(ansicht());
    deleteEntwurf.mockResolvedValue(undefined);

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    await nutzer.click(await screen.findByRole('button', { name: 'Entwurf verwerfen' }));
    expect(screen.getByText(/es entsteht also keine Lücke/)).toBeInTheDocument();

    await nutzer.click(screen.getByRole('button', { name: 'Verwerfen' }));
    expect(deleteEntwurf).toHaveBeenCalledWith('r1');
  });

  it('waehlt einen hinterlegten Empfaenger', async () => {
    const nutzer = userEvent.setup();
    fetchRechnung.mockResolvedValue(ansicht());
    fetchEmpfaenger.mockResolvedValue([
      {
        id: 'e1',
        recipient_kind: 'aid_authority',
        name: 'Beihilfestelle Testland',
        street: null,
        house_number: null,
        postal_code: null,
        city: null,
        reference: 'BH-1',
        is_default: false,
      },
    ]);

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    // Erst warten, bis die hinterlegten Empfänger geladen sind — vorher steht
    // in der Auswahl nur die Patientin selbst.
    await screen.findByRole('option', { name: /Beihilfestelle Testland/ });
    await nutzer.selectOptions(screen.getByLabelText(/Rechnung geht an/), 'e1');

    expect(setzeEmpfaenger).toHaveBeenCalledWith('r1', 'e1');
  });

  it('bietet an der ausgestellten Rechnung nichts mehr zum Aendern an', async () => {
    fetchRechnung.mockResolvedValue(
      ansicht({
        status: 'issued',
        invoice_number: 'RG-2026-0001',
        issued_on: '2026-09-01',
        due_on: '2026-09-15',
      }),
    );

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    expect(await screen.findByRole('heading', { name: 'RG-2026-0001' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechnung ausstellen' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Entwurf verwerfen' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Rechnung geht an/)).not.toBeInTheDocument();
  });

  it('zeigt der Therapeutin keine Entwurfsaktionen (ANN-076)', async () => {
    fetchRechnung.mockResolvedValue(ansicht());

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['therapist'])} />,
      '/abrechnung/rechnungen/r1',
    );

    expect(await screen.findByText(/1 × Krankengymnastik/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Rechnung ausstellen' })).not.toBeInTheDocument();
  });

  it('sagt es, wenn die Praxis-Stammdaten fehlen', async () => {
    const { KeineStammdaten } = await import('./api');
    fetchRechnung.mockRejectedValue(new KeineStammdaten());

    renderWithProviders(
      <InvoiceDetailPage user={testUser(['office'])} />,
      '/abrechnung/rechnungen/r1',
    );

    expect(await screen.findByText(/noch keine Praxis-Stammdaten erfasst/)).toBeInTheDocument();
  });
});
