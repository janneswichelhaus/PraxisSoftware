import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as Api from './vertraege-api';
import { renderWithProviders } from '@/test-utils';

const fetchVertraege = vi.fn();

vi.mock('./vertraege-api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  fetchVertraege: (id: string) => fetchVertraege(id) as Promise<Api.Kontovertrag[] | null>,
}));

const { TrainingVertraege } = await import('./TrainingVertraege');

const VERTRAG: Api.Kontovertrag = {
  id: 'k1',
  concluded_at: '2026-10-06T22:15:00Z',
  concluded_on: '2026-10-07',
  package_label: 'Trainingspaket 3 Monate',
  price_cents: 39000,
  currency: 'EUR',
  starts_on: '2026-10-27',
  ends_on: '2027-01-26',
  wording_version: '2026-10',
  early_start_requested: false,
  withdrawal_ends_on: '2026-10-21',
  withdrawn_on: null,
  withdrawn_access_kind: null,
  withdrawn_representative_name: null,
};

describe('Im Konto geschlossene Verträge am Verhältnis (KND-004)', () => {
  it('nennt Buchung, Fassung und Widerrufsfrist', async () => {
    fetchVertraege.mockResolvedValue([VERTRAG]);
    renderWithProviders(<TrainingVertraege relationshipId="t1" />);
    expect(
      await screen.findByText(/Gebucht am 07.10.2026 · Belehrung Fassung 2026-10/),
    ).toBeInTheDocument();
    expect(screen.getByText('Widerruf möglich bis 21.10.2026')).toBeInTheDocument();
  });

  it('hebt einen Widerruf hervor und sagt, was zu tun ist (ANN-290)', async () => {
    fetchVertraege.mockResolvedValue([
      { ...VERTRAG, withdrawn_on: '2026-10-08', withdrawn_access_kind: 'self' },
    ]);
    renderWithProviders(<TrainingVertraege relationshipId="t1" />);
    expect(
      await screen.findByText(/Widerrufen am 08.10.2026. Bitte Paket und Zahlung abwickeln./),
    ).toBeInTheDocument();
  });
});
