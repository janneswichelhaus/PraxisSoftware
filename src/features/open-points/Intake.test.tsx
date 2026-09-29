import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as IntakeApi from './intake-api';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchIntakeChecklist = vi.fn();
const fetchOpenIntakes = vi.fn();

vi.mock('./intake-api', async (importOriginal) => ({
  ...(await importOriginal<typeof IntakeApi>()),
  fetchIntakeChecklist: (id: string) =>
    fetchIntakeChecklist(id) as Promise<IntakeApi.IntakeChecklist>,
  fetchOpenIntakes: () => fetchOpenIntakes() as Promise<IntakeApi.OpenIntake[]>,
}));

const { IntakeHint } = await import('./IntakeHint');
const { OpenIntakes } = await import('./OpenIntakes');

const LENA = '66666666-6666-4666-8666-0000000000e1';

describe('IntakeHint (PRX-013)', () => {
  beforeEach(() => {
    fetchIntakeChecklist.mockReset();
  });

  it('nennt im Aktenkopf die offenen Punkte als Wege in die Akte', async () => {
    fetchIntakeChecklist.mockResolvedValue([
      { item: 'prescription_photo', state: 'not_needed' },
      { item: 'anamnesis', state: 'done' },
      { item: 'privacy', state: 'open' },
      { item: 'finding', state: 'open' },
      { item: 'treatment_table', state: 'open' },
    ]);
    renderWithProviders(
      <IntakeHint patientId={LENA} aktiv user={testUser(['office'])} />,
      `/patienten/${LENA}/termine`,
    );

    expect(await screen.findByText('Erstaufnahme offen:')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Befund' })).toHaveAttribute(
      'href',
      `/patienten/${LENA}/befund?zurueck=${encodeURIComponent(`/patienten/${LENA}/termine`)}`,
    );
    expect(screen.getByRole('link', { name: 'Datenschutz und Vertrag' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Liege' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Anamnesebogen' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Verordnungsfoto' })).toBeNull();
  });

  it('schweigt, wenn alles erledigt ist', async () => {
    fetchIntakeChecklist.mockResolvedValue([{ item: 'anamnesis', state: 'done' }]);
    const { container } = renderWithProviders(
      <IntakeHint patientId={LENA} aktiv user={testUser(['office'])} />,
    );
    await vi.waitFor(() => expect(fetchIntakeChecklist).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });

  it('fragt fuer eine Person ausserhalb der Versorgung und fuer die Trainingsbetreuung nicht', () => {
    renderWithProviders(<IntakeHint patientId={LENA} aktiv={false} user={testUser(['office'])} />);
    renderWithProviders(<IntakeHint patientId={LENA} aktiv user={testUser(['trainer'])} />);
    expect(fetchIntakeChecklist).not.toHaveBeenCalled();
  });
});

describe('OpenIntakes (PRX-013)', () => {
  it('fuehrt je Person die offenen Punkte in die Akte', async () => {
    fetchOpenIntakes.mockResolvedValue([
      {
        patient_id: LENA,
        patient_given_name: 'Lena',
        patient_family_name: 'Aufnahme',
        open_items: ['anamnesis', 'finding'],
      },
    ]);
    renderWithProviders(<OpenIntakes />);

    expect(await screen.findByRole('link', { name: 'Aufnahme, Lena' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Erstaufnahme offen (1)' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Anamnesebogen' })).toHaveAttribute(
      'href',
      `/patienten/${LENA}/befund?zurueck=%2Foffen`,
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
