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

const { SammeldruckPage } = await import('./SammeldruckPage');

const A = 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001';
const B = 'bbbbbbbb-bbbb-4bbb-8bbb-000000000002';

function ausgestellt(id: string, nummer: string): BillingApi.Rechnungsansicht {
  return rechnungsansicht(
    { id, status: 'issued', invoice_number: nummer, issued_on: '2026-10-01', due_on: '2026-10-15' },
    { invoice_number: nummer, issued_on: '2026-10-01', due_on: '2026-10-15' },
  );
}

describe('Sammeldruck nach dem Lauf (K13)', () => {
  beforeEach(() => {
    fetchRechnung.mockReset();
    fetchRechnung.mockImplementation((id: string) =>
      Promise.resolve(ausgestellt(id, id === A ? 'RG-2026-0001' : 'RG-2026-0002')),
    );
  });

  it('setzt jede Rechnung auf ein eigenes Blatt, mit einem Knopf für alle', async () => {
    renderWithProviders(<SammeldruckPage />, `/abrechnung/druck?rechnungen=${A},${B}`);

    expect(
      await screen.findByRole('heading', { name: 'Rechnung RG-2026-0001' }),
    ).toBeInTheDocument();
    const zweite = screen.getByRole('heading', { name: 'Rechnung RG-2026-0002' });
    expect(zweite.closest('.print\\:break-before-page')).not.toBeNull();
    expect(screen.getAllByRole('button', { name: /drucken/ })).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'Alle 2 drucken' })).toBeInTheDocument();
  });

  it('lädt nur Kennungen, keine anderen Werte aus der Adresse', async () => {
    renderWithProviders(
      <SammeldruckPage />,
      `/abrechnung/druck?rechnungen=${A},Erika%20Beispiel,${A}`,
    );

    expect(
      await screen.findByRole('heading', { name: 'Rechnung RG-2026-0001' }),
    ).toBeInTheDocument();
    expect(fetchRechnung).toHaveBeenCalledTimes(1);
    expect(fetchRechnung).toHaveBeenCalledWith(A);
  });

  it('sagt ohne Kennung, wann gedruckt wird', async () => {
    renderWithProviders(<SammeldruckPage />, '/abrechnung/druck');
    expect(await screen.findByText('Keine Rechnung zum Drucken.')).toBeInTheDocument();
    expect(fetchRechnung).not.toHaveBeenCalled();
  });
});
