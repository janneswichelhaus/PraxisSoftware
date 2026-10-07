import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as Api from './training-withdrawals-api';
import { renderWithProviders } from '@/test-utils';

const fetchTrainingswiderrufe = vi.fn();

vi.mock('./training-withdrawals-api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  fetchTrainingswiderrufe: () => fetchTrainingswiderrufe() as Promise<Api.Trainingswiderruf[]>,
}));

const { TrainingWithdrawals } = await import('./TrainingWithdrawals');

describe('Widerrufe in Offene Punkte (KND-004)', () => {
  it('nennt Person, Paket, Tag und wer widerrufen hat, mit Weg zum Verhältnis', async () => {
    fetchTrainingswiderrufe.mockResolvedValue([
      {
        contract_id: 'k1',
        training_relationship_id: 't1',
        given_name: 'Erika',
        family_name: 'Beispiel',
        withdrawn_on: '2026-10-08',
        package_label: 'Trainingspaket 3 Monate',
        withdrawn_access_kind: 'self',
        withdrawn_representative_name: null,
      },
    ]);
    renderWithProviders(<TrainingWithdrawals />);
    expect(await screen.findByText('Trainingsvertrag widerrufen (1)')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beispiel, Erika' })).toHaveAttribute(
      'href',
      `/training/t1?zurueck=${encodeURIComponent('/offen')}`,
    );
    expect(
      screen.getByText(/Trainingspaket 3 Monate: widerrufen am 08.10.2026, von der Person selbst/),
    ).toBeInTheDocument();
  });

  it('zeigt ohne Widerruf nichts', async () => {
    fetchTrainingswiderrufe.mockResolvedValue([]);
    const { container } = renderWithProviders(<TrainingWithdrawals />);
    await vi.waitFor(() => expect(fetchTrainingswiderrufe).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
