import { describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
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
  it('nennt Person, Laufzeit und Ende und führt zum Paket, zurück zur Gruppe', async () => {
    fetchEndingTrainingPackages.mockResolvedValue([
      {
        training_relationship_id: ERIKA,
        given_name: 'Erika',
        family_name: 'Beispiel',
        package_months: 6,
        ends_on: '2026-11-04',
        care_open: true,
      },
      {
        training_relationship_id: TINA,
        given_name: 'Tina',
        family_name: 'Trainingskundin',
        package_months: 1,
        ends_on: '2026-11-20',
        care_open: false,
      },
    ]);
    const { container } = renderWithProviders(<EndingTrainingPackages />);

    expect(
      await screen.findByRole('heading', { name: 'Trainingspaket endet (2)' }),
    ).toBeInTheDocument();
    const links = screen.getAllByRole('link');
    expect(links.map((l) => l.textContent)).toEqual([
      expect.stringMatching(/^Beispiel, Erika/),
      expect.stringMatching(/^Trainingskundin, Tina/),
    ]);
    expect(links[1]).toHaveAttribute(
      'href',
      `/training/${TINA}?bereich=vertraege&zurueck=%2Foffen%23trainingspaket-endet#trainingspaket`,
    );
    expect(screen.getByText('Paket über 6 Monate · endet am 04.11.2026')).toBeInTheDocument();
    expect(screen.getByText('Paket über 1 Monat · endet am 20.11.2026')).toBeInTheDocument();
    // Sprungziel für die Kennzahl und den Rückweg.
    expect(container.querySelector('#trainingspaket-endet')).not.toBeNull();
  });

  it('sagt, wo erst nach der Behandlung ein Paket beginnen kann (ANN-278)', async () => {
    fetchEndingTrainingPackages.mockResolvedValue([
      {
        training_relationship_id: ERIKA,
        given_name: 'Erika',
        family_name: 'Beispiel',
        package_months: 6,
        ends_on: '2026-11-04',
        care_open: true,
      },
      {
        training_relationship_id: TINA,
        given_name: 'Tina',
        family_name: 'Trainingskundin',
        package_months: 1,
        ends_on: '2026-11-20',
        care_open: false,
      },
    ]);
    renderWithProviders(<EndingTrainingPackages />);
    const [erika, tina] = await screen.findAllByRole('link');
    expect(within(erika!).getByText('Noch in Behandlung')).toBeInTheDocument();
    expect(within(tina!).queryByText('Noch in Behandlung')).toBeNull();
  });

  it('liegt unter dem Präfix, das „Paket anlegen“ erneuert', async () => {
    // Trainingspaket.tsx (Abrechnung) darf diesen Schlüssel nicht importieren und erneuert
    // deshalb alles unter `open-points`.
    const { ENDING_TRAINING_PACKAGES_KEY } = await import('./ending-training-packages-api');
    expect(ENDING_TRAINING_PACKAGES_KEY[0]).toBe('open-points');
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
    expect(await screen.findByText('Endende Trainingspakete nicht geladen.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Trainingspaket endet' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });
});
