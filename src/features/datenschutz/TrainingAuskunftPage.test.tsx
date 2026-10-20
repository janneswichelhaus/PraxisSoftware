import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as DatenschutzApi from './api';
import type * as TrainingApi from '@/features/training/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

const VERHAELTNIS = 'eeeeeeee-eeee-4eee-8eee-000000000001';

const fetchTrainingAuskunft = vi.fn();
const getTrainingClient = vi.fn();
const sichereAlsDatei = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof DatenschutzApi>();
  return {
    ...actual,
    fetchTrainingAuskunft: (id: string) =>
      fetchTrainingAuskunft(id) as Promise<DatenschutzApi.Auskunft>,
  };
});

vi.mock('./datei', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  sichereAlsDatei: (name: string, inhalt: string) => sichereAlsDatei(name, inhalt) as void,
}));

vi.mock('@/features/training/api', async (importOriginal) => {
  const actual = await importOriginal<typeof TrainingApi>();
  return { ...actual, getTrainingClient: (id: string) => getTrainingClient(id) as unknown };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useParams: () => ({ relationshipId: VERHAELTNIS }),
}));

const { TrainingAuskunftPage } = await import('./TrainingAuskunftPage');

function kopie(): DatenschutzApi.Auskunft {
  return {
    erstellt_am: '2026-10-20T01:00:00+00:00',
    organisation: 'Test Praxis Tuebingen',
    training_relationship_id: VERHAELTNIS,
    rechtsgrundlage: 'Art. 15 Abs. 3 DSGVO',
    tabellen: {
      persons: [{ given_name: 'Tina', family_name: 'Training' }],
      training_contracts: [{ package_label: '3 Monate' }],
      training_protocols: [{ content: 'Synthetisch.' }, { content: 'Synthetisch 2.' }],
      payments: [],
    },
    nicht_enthalten: [{ was: 'Daten einer Behandlung', grund: 'Eigenes Rechtsverhältnis.' }],
  };
}

/**
 * Auskunft zum Trainingsverhältnis (BEF-182): wie an der Akte erst auf
 * Knopfdruck - jede Kopie wird protokolliert (ADR-010 Punkt 2).
 */
describe('TrainingAuskunftPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchTrainingAuskunft.mockResolvedValue(kopie());
    getTrainingClient.mockResolvedValue({
      id: VERHAELTNIS,
      given_name: 'Tina',
      family_name: 'Training',
    });
  });

  it('erstellt die Kopie erst auf Knopfdruck und beschriftet die Abschnitte des Trainings', async () => {
    renderWithProviders(<TrainingAuskunftPage />, `/training/${VERHAELTNIS}/auskunft`);
    const knopf = await screen.findByRole('button', { name: 'Auskunft erstellen' });
    expect(screen.getByText('Tina Training')).toBeInTheDocument();
    expect(fetchTrainingAuskunft).not.toHaveBeenCalled();

    await userEvent.click(knopf);
    expect(await screen.findByText('Trainingsprotokolle')).toBeInTheDocument();
    expect(screen.getByText('2 Einträge')).toBeInTheDocument();
    expect(screen.getByText('Trainingsverträge')).toBeInTheDocument();
    expect(screen.getByText('Daten einer Behandlung:')).toBeInTheDocument();
    // Was nicht enthalten ist, steht auf Abruf (Regel 6, Design-Review).
    expect(screen.getByText('Nicht enthalten').closest('details')).not.toHaveAttribute('open');
    expect(fetchTrainingAuskunft).toHaveBeenCalledWith(VERHAELTNIS);
    // Nach dem Erstellen tritt der Knopf zurück; die Datei trägt die Kennung
    // des Verhältnisses, keinen Namen.
    expect(screen.getByRole('button', { name: 'Neu erstellen' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Kopie herunterladen' }));
    expect(sichereAlsDatei).toHaveBeenCalledWith(
      'auskunft-20261020-eeeeeeee.json',
      expect.stringContaining('"training_relationship_id"'),
    );
  });

  it('sagt, wenn es das Verhältnis nicht gibt, und erstellt nichts', async () => {
    getTrainingClient.mockResolvedValue(null);
    renderWithProviders(<TrainingAuskunftPage />, `/training/${VERHAELTNIS}/auskunft`);
    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Auskunft erstellen' })).toBeNull();
  });

  it('ist barrierefrei', async () => {
    renderWithProviders(<TrainingAuskunftPage />, `/training/${VERHAELTNIS}/auskunft`);
    await screen.findByRole('button', { name: 'Auskunft erstellen' });
    await pruefeBarrierefreiheit(document.body);
  });
});
