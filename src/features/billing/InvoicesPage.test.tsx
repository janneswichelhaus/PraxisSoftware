import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as BillingApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchKandidaten = vi.fn();
const fetchRechnungen = vi.fn();
const createEntwurf = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchKandidaten: () => fetchKandidaten() as Promise<BillingApi.Kandidat[]>,
    fetchRechnungen: () => fetchRechnungen() as Promise<BillingApi.Rechnung[]>,
    createEntwurf: (...args: unknown[]) => createEntwurf(...args) as Promise<string>,
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
    ...rest,
  };
}

describe('InvoicesPage', () => {
  beforeEach(() => {
    fetchKandidaten.mockReset();
    fetchRechnungen.mockReset();
    createEntwurf.mockReset();
    fetchKandidaten.mockResolvedValue([]);
    fetchRechnungen.mockResolvedValue([]);
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
});
