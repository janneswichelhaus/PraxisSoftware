import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as Api from './ending-training-packages-api';
import { renderWithProviders } from '@/test-utils';

const fetchEndingTrainingPackages = vi.fn<() => Promise<Api.EndingTrainingPackage[]>>();

vi.mock('./ending-training-packages-api', async (importOriginal) => ({
  ...(await importOriginal<typeof Api>()),
  fetchEndingTrainingPackages: () => fetchEndingTrainingPackages(),
}));

const { EndingTrainingPackages } = await import('./EndingTrainingPackages');

const TINA = 'eeeeeeee-eeee-4eee-8eee-000000000001';
const ERIKA = 'eeeeeeee-eeee-4eee-8eee-000000000002';

describe('Trainingspakete ohne Anschluss in Offene Punkte (ANN-834)', () => {
  it('nennt Person, Laufzeit und Ende und führt zu den Verträgen mit Rückweg', async () => {
    fetchEndingTrainingPackages.mockResolvedValue([
      {
        training_relationship_id: ERIKA,
        given_name: 'Erika',
        family_name: 'Beispiel',
        package_months: 6,
        ends_on: '2026-11-04',
      },
      {
        training_relationship_id: TINA,
        given_name: 'Tina',
        family_name: 'Trainingskundin',
        package_months: 1,
        ends_on: '2026-11-20',
      },
    ]);
    renderWithProviders(<EndingTrainingPackages />);

    expect(
      await screen.findByRole('heading', { name: 'Trainingspaket endet (2)' }),
    ).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringMatching(/^Beispiel, Erika/),
      expect.stringMatching(/^Trainingskundin, Tina/),
    ]);
    expect(links[0]).toHaveAttribute(
      'href',
      `/training/${ERIKA}?bereich=vertraege&zurueck=%2Foffen`,
    );
    expect(screen.getByText('Paket über 6 Monate · endet am 04.11.2026')).toBeInTheDocument();
    expect(screen.getByText('Paket über 1 Monat · endet am 20.11.2026')).toBeInTheDocument();
  });

  it('zeigt ohne endendes Paket nichts', async () => {
    fetchEndingTrainingPackages.mockResolvedValue([]);
    const { container } = renderWithProviders(<EndingTrainingPackages />);
    await vi.waitFor(() => expect(fetchEndingTrainingPackages).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('sagt es, wenn die Liste nicht lädt, mit erneutem Versuch', async () => {
    fetchEndingTrainingPackages.mockRejectedValue(new Error('Netz'));
    renderWithProviders(<EndingTrainingPackages />);
    expect(
      await screen.findByText('Die endenden Trainingspakete konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trainingspaket endet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });
});
