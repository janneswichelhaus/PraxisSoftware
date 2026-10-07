import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as Api from './aftercare-cancellations-api';
import { renderWithProviders } from '@/test-utils';

const fetchAboKuendigungen = vi.fn();

vi.mock('./aftercare-cancellations-api', async (importOriginal) => {
  const actual = await importOriginal<typeof Api>();
  return {
    ...actual,
    fetchAboKuendigungen: () => fetchAboKuendigungen() as Promise<Api.AboKuendigung[]>,
  };
});

const { AftercareCancellations } = await import('./AftercareCancellations');

describe('Kündigungen des Nachsorge-Abos in Offene Punkte (ANG-003)', () => {
  it('nennt Person, Herkunft und Ende', async () => {
    fetchAboKuendigungen.mockResolvedValue([
      {
        subscription_id: 'a1',
        patient_id: 'p1',
        given_name: 'Erika',
        family_name: 'Beispiel',
        cancelled_on: '2026-10-07',
        ends_on: '2026-10-31',
        cancelled_access_kind: 'legal_representative',
        cancelled_representative_name: 'Bernd Betreuer',
      },
    ]);
    renderWithProviders(<AftercareCancellations />);
    expect(await screen.findByRole('link', { name: 'Beispiel, Erika' })).toBeInTheDocument();
    expect(
      screen.getByText(
        /Gekündigt am 07.10.2026, von Bernd Betreuer \(rechtliche Vertretung\) – endet am 31.10.2026/,
      ),
    ).toBeInTheDocument();
  });

  it('zeigt ohne Kündigung nichts', async () => {
    fetchAboKuendigungen.mockResolvedValue([]);
    const { container } = renderWithProviders(<AftercareCancellations />);
    await vi.waitFor(() => expect(fetchAboKuendigungen).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
