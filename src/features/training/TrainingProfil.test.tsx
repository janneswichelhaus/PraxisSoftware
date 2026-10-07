import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as ProfilApi from './profil-api';
import { renderWithProviders } from '@/test-utils';

const fetchProfil = vi.fn();
const saveProfil = vi.fn();

vi.mock('./profil-api', async (importOriginal) => {
  const actual = await importOriginal<typeof ProfilApi>();
  return {
    ...actual,
    fetchProfil: (id: string) => fetchProfil(id) as Promise<ProfilApi.Profilsicht | null>,
    saveProfil: (...args: unknown[]) => saveProfil(...args) as Promise<void>,
  };
});

const { TrainingProfil } = await import('./TrainingProfil');

const LEER: ProfilApi.Profilsicht = { health_consent: true, profile: null, takeovers: [] };

const STAND = '2026-10-07T10:00:00.123456+00:00';

describe('Voraussetzungen am Trainingsverhältnis (KND-005)', () => {
  beforeEach(() => {
    fetchProfil.mockReset();
    saveProfil.mockReset();
  });

  it('zeigt gefüllte Felder und die Übernahmen mit Herkunft', async () => {
    fetchProfil.mockResolvedValue({
      health_consent: true,
      profile: {
        goals: 'Wieder Treppen ohne Geländer',
        equipment: null,
        time_budget: null,
        places: null,
        limits: null,
        history: null,
        preferences: null,
        updated_at: STAND,
        updated_by_name: 'Tom Trainingsbetreuung',
      },
      takeovers: [
        {
          title: 'Belastungsgrenzen',
          body: 'Keine Sprünge bis Dezember.',
          offered_on: '2026-10-01',
          released_at: '2026-10-03T08:00:00Z',
        },
      ],
    });
    renderWithProviders(<TrainingProfil relationshipId="t1" darfSchreiben />);
    expect(await screen.findByText('Wieder Treppen ohne Geländer')).toBeInTheDocument();
    expect(screen.queryByText('Ausrüstung')).toBeNull();
    const uebernahmen = screen.getByRole('group', { name: 'Aus der Behandlung übernommen' });
    expect(within(uebernahmen).getByText('Keine Sprünge bis Dezember.')).toBeInTheDocument();
    expect(
      within(uebernahmen).getByText(
        /Angeboten am 01.10.2026, von der Person freigegeben am 03.10.2026/,
      ),
    ).toBeInTheDocument();
  });

  it('sagt, wenn keine Einwilligung vermerkt ist (ANN-264)', async () => {
    fetchProfil.mockResolvedValue({ ...LEER, health_consent: false });
    renderWithProviders(<TrainingProfil relationshipId="t1" darfSchreiben />);
    expect(await screen.findByText(/Keine Einwilligung zu Gesundheitsangaben/)).toBeInTheDocument();
  });

  it('speichert alle Felder mit dem erwarteten Stand', async () => {
    fetchProfil.mockResolvedValue(LEER);
    saveProfil.mockResolvedValue(undefined);
    renderWithProviders(<TrainingProfil relationshipId="t1" darfSchreiben />);
    await userEvent.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
    await userEvent.type(screen.getByLabelText('Ziele'), '  Treppen  ');
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(saveProfil).toHaveBeenCalledWith(
      't1',
      {
        goals: 'Treppen',
        equipment: '',
        time_budget: '',
        places: '',
        limits: '',
        history: '',
        preferences: '',
      },
      null,
    );
    expect(await screen.findByText('Gespeichert.')).toBeInTheDocument();
  });

  it('nennt einen Konflikt, statt still zu überschreiben', async () => {
    fetchProfil.mockResolvedValue(LEER);
    saveProfil.mockRejectedValue(new Error('Das Profil wurde inzwischen geändert.'));
    renderWithProviders(<TrainingProfil relationshipId="t1" darfSchreiben />);
    await userEvent.click(await screen.findByRole('button', { name: 'Bearbeiten' }));
    await userEvent.click(screen.getByRole('button', { name: 'Speichern' }));
    expect(await screen.findByText('Das Profil wurde inzwischen geändert.')).toBeInTheDocument();
  });

  it('bietet nach dem Vertragsende kein Bearbeiten an', async () => {
    fetchProfil.mockResolvedValue(LEER);
    renderWithProviders(<TrainingProfil relationshipId="t1" darfSchreiben={false} />);
    expect(await screen.findByText('Noch nichts eingetragen.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Bearbeiten' })).toBeNull();
  });
});
