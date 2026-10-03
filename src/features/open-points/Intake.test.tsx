import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as IntakeApi from './intake-api';
import { renderWithProviders } from '@/test-utils';

const fetchIntakeChecklist = vi.fn();
const fetchOpenIntakes = vi.fn();

vi.mock('./intake-api', async (importOriginal) => ({
  ...(await importOriginal<typeof IntakeApi>()),
  fetchIntakeChecklist: (id: string) =>
    fetchIntakeChecklist(id) as Promise<IntakeApi.IntakeChecklist>,
  fetchOpenIntakes: () => fetchOpenIntakes() as Promise<IntakeApi.OpenIntake[]>,
}));

const { OpenIntakes } = await import('./OpenIntakes');

const LENA = '66666666-6666-4666-8666-0000000000e1';

describe('OpenIntakes (PRX-013)', () => {
  it('fuehrt je Person die offenen Punkte in die Akte', async () => {
    fetchOpenIntakes.mockResolvedValue([
      {
        patient_id: LENA,
        patient_given_name: 'Lena',
        patient_family_name: 'Aufnahme',
        open_items: ['prescription_photo', 'registration_form'],
      },
    ]);
    renderWithProviders(<OpenIntakes />);

    expect(await screen.findByRole('link', { name: 'Aufnahme, Lena' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Erstaufnahme offen (1)' })).toBeInTheDocument();
    // AKTE-007: Der Anmeldebogen steht in den Stammdaten, das Foto an den
    // Behandlungsgrundlagen (ANN-224).
    expect(screen.getByRole('link', { name: 'Anmeldebogen' })).toHaveAttribute(
      'href',
      `/patienten/${LENA}/stammdaten?zurueck=%2Foffen#anmeldebogen`,
    );
    expect(screen.getByRole('link', { name: 'Verordnungsfoto' })).toHaveAttribute(
      'href',
      `/patienten/${LENA}/verordnungen?zurueck=%2Foffen`,
    );
  });

  it('sagt, wenn alles vollstaendig ist', async () => {
    fetchOpenIntakes.mockResolvedValue([]);
    renderWithProviders(<OpenIntakes />);
    expect(
      await screen.findByText('Bei allen in Versorgung ist die Erstaufnahme vollständig.'),
    ).toBeInTheDocument();
  });
});
