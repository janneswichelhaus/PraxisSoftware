import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import type * as BillingApi from './api';
import type { RoleKey } from '@/features/session/types';
import { renderWithProviders, testUser } from '@/test-utils';

const PATIENT = '66666666-6666-4666-8666-000000000001';

function rechnung(overrides: Partial<BillingApi.RechnungDerAkte> = {}): BillingApi.RechnungDerAkte {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
    status: 'issued',
    invoice_number: 'RG-2027-0001',
    period_month: '2027-04-01',
    issued_on: '2027-05-02',
    due_on: '2027-05-16',
    total_cents: 4500,
    paid_cents: 0,
    outstanding_cents: 4500,
    currency: 'EUR',
    payment_state: 'unpaid',
    overdue: false,
    cancelled: false,
    reminder_due: false,
    last_reminder_on: null,
    treatment_basis_id: null,
    ...overrides,
  };
}

const fetchRechnungenDerAkte = vi.fn();
vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof BillingApi>();
  return {
    ...actual,
    fetchRechnungenDerAkte: (id: string) =>
      fetchRechnungenDerAkte(id) as Promise<BillingApi.RechnungDerAkte[]>,
  };
});

const { RechnungenDerAkte } = await import('./RechnungenDerAkte');

function rendern(rollen: RoleKey[] = ['office']) {
  return renderWithProviders(
    <RechnungenDerAkte
      patientId={PATIENT}
      user={testUser(rollen)}
      hierher={`/patients/${PATIENT}/verordnungen`}
    />,
  );
}

describe('Rechnungen in der Akte (B1, BEF-151)', () => {
  beforeEach(() => {
    fetchRechnungenDerAkte.mockReset();
  });

  it('zeigt dem Büro, was abgerechnet, bezahlt und zu mahnen ist', async () => {
    fetchRechnungenDerAkte.mockResolvedValue([
      rechnung({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
        invoice_number: 'RG-1',
        overdue: true,
        reminder_due: true,
      }),
      rechnung({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
        invoice_number: 'RG-2',
        overdue: true,
        last_reminder_on: '2027-05-20',
      }),
      rechnung({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000003',
        invoice_number: 'RG-3',
        paid_cents: 4500,
        outstanding_cents: 0,
        payment_state: 'paid',
      }),
    ]);
    rendern();

    expect(screen.getByRole('heading', { name: 'Rechnungen' })).toBeInTheDocument();
    const zeilen = await screen.findAllByRole('link');
    expect(zeilen).toHaveLength(3);
    expect(zeilen[0]).toHaveTextContent('RG-1');
    expect(zeilen[0]).toHaveTextContent('Zu mahnen');
    expect(zeilen[0]).toHaveTextContent('45,00');
    expect(zeilen[1]).toHaveTextContent('Überfällig');
    expect(zeilen[1]).toHaveTextContent('erinnert am');
    expect(zeilen[2]).toHaveTextContent('Bezahlt');
    // Jede Zeile führt in die Rechnung - gemahnt und gebucht wird dort.
    expect(zeilen[0]).toHaveAttribute(
      'href',
      expect.stringContaining('/abrechnung/rechnungen/aaaaaaaa-aaaa-4aaa-8aaa-000000000001'),
    );
  });

  it('sagt, wenn es noch keine Rechnung gibt', async () => {
    fetchRechnungenDerAkte.mockResolvedValue([]);
    rendern(['owner']);
    expect(await screen.findByText('Noch keine Rechnung')).toBeInTheDocument();
  });

  it('fragt für Therapeut:innen gar nicht erst (ANN-139)', async () => {
    const { container } = rendern(['therapist']);
    await waitFor(() => expect(container).toBeEmptyDOMElement());
    expect(fetchRechnungenDerAkte).not.toHaveBeenCalled();
  });
});
