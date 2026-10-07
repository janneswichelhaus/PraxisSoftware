import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as TrainingApi from './api';
import type { TrainingConsentRecord } from './api';
import { renderWithProviders } from '@/test-utils';

/**
 * Einwilligung zu Gesundheitsangaben am Trainingsverhältnis (POR-017):
 * Stand in Worten mit Herkunft, Vermerk vom Papier nur für wer schreibt.
 */

const listTrainingConsents = vi.fn();
const recordTrainingConsent = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof TrainingApi>()),
  listTrainingConsents: (...args: unknown[]) =>
    listTrainingConsents(...args) as Promise<TrainingConsentRecord[]>,
  recordTrainingConsent: (...args: unknown[]) => recordTrainingConsent(...args) as Promise<void>,
}));

const { TrainingEinwilligung } = await import('./TrainingEinwilligung');

const TINA = 'eeeeeeee-eeee-4eee-8eee-000000000001';

function vermerk(extra: Partial<TrainingConsentRecord>): TrainingConsentRecord {
  return {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
    record_kind: 'consent_granted',
    occurred_on: '2026-10-01',
    recorded_at: '2026-10-01T09:00:00Z',
    source: 'practice',
    platform_access_kind: null,
    representative_name: null,
    ...extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  recordTrainingConsent.mockResolvedValue(undefined);
});

describe('TrainingEinwilligung (POR-017)', () => {
  it('ohne Vermerk: nicht erteilt, und die Einwilligung wird erst nach Rückfrage vermerkt', async () => {
    const nutzer = userEvent.setup();
    listTrainingConsents.mockResolvedValue([]);
    renderWithProviders(
      <TrainingEinwilligung relationshipId={TINA} darfSchreiben zeitzone="Europe/Berlin" />,
    );
    expect(await screen.findByText('Nicht erteilt')).toBeInTheDocument();
    await nutzer.click(screen.getByRole('button', { name: 'Einwilligung vermerken' }));
    expect(screen.getByLabelText('Unterschrieben am')).toBeInTheDocument();
    const knoepfe = screen.getAllByRole('button', { name: 'Einwilligung vermerken' });
    await nutzer.click(knoepfe.at(-1)!);
    await waitFor(() =>
      expect(recordTrainingConsent).toHaveBeenCalledWith(
        TINA,
        'consent_granted',
        expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      ),
    );
  });

  it('Widerruf über die Plattform: sagt wer und was jetzt gilt', async () => {
    listTrainingConsents.mockResolvedValue([
      vermerk({}),
      vermerk({
        id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000002',
        record_kind: 'consent_withdrawn',
        occurred_on: '2026-10-06',
        recorded_at: '2026-10-06T09:00:00Z',
        source: 'platform',
        platform_access_kind: 'self',
      }),
    ]);
    renderWithProviders(
      <TrainingEinwilligung relationshipId={TINA} darfSchreiben={false} zeitzone="Europe/Berlin" />,
    );
    expect(await screen.findByText(/Widerrufen am .* \(Plattform\)/)).toBeInTheDocument();
    expect(screen.getByText('Auf der Plattform von der Person selbst.')).toBeInTheDocument();
    expect(screen.getByText(/Keine neuen Angaben zur Gesundheit festhalten/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('erteilt: bietet den Widerruf an', async () => {
    listTrainingConsents.mockResolvedValue([vermerk({})]);
    renderWithProviders(
      <TrainingEinwilligung relationshipId={TINA} darfSchreiben zeitzone="Europe/Berlin" />,
    );
    expect(await screen.findByRole('button', { name: 'Widerruf vermerken' })).toBeInTheDocument();
  });
});
