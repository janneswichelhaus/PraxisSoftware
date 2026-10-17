import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, screen } from '@testing-library/react';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { renderWithProviders } from '@/test-utils';
import type * as ReimbursementsApi from './api';

/**
 * Ladestrom im Eingang (ORG-008): je Monat ohne Antrag ein fertiger Betrag
 * und „Beantragen“ mit vorgewähltem Monat; ohne Vorschlag nichts.
 */

const fetchElectricitySuggestions = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof ReimbursementsApi>();
  return {
    ...actual,
    fetchElectricitySuggestions: () => fetchElectricitySuggestions() as unknown,
  };
});

const { LadestromVorschlaege } = await import('./LadestromVorschlaege');

beforeEach(() => {
  fetchElectricitySuggestions.mockReset().mockResolvedValue([
    { month: '2026-09-01', working_minutes: 9_600, amount_cents: 639 },
    { month: '2026-08-01', working_minutes: 7_230, amount_cents: 481 },
  ]);
});

describe('LadestromVorschlaege', () => {
  it('zeigt je Monat den Betrag und führt mit vorgewähltem Monat in den Antrag', async () => {
    const { container } = renderWithProviders(<LadestromVorschlaege rueckweg="/betrieb" />);
    expect(await screen.findByText('Ladestrom September 2026')).toBeInTheDocument();
    expect(screen.getByText('160 h Arbeitszeit')).toBeInTheDocument();
    expect(screen.getByText('6,39 €')).toBeInTheDocument();
    expect(screen.getByText('120,5 h Arbeitszeit')).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: 'Beantragen: Ladestrom September 2026' }),
    ).toHaveAttribute(
      'href',
      '/betrieb/erstattungen/beantragen?monat=2026-09-01&zurueck=%2Fbetrieb',
    );
    expect(screen.getByRole('link', { name: 'Beantragen: Ladestrom August 2026' })).toHaveAttribute(
      'href',
      '/betrieb/erstattungen/beantragen?monat=2026-08-01&zurueck=%2Fbetrieb',
    );
    await act(() => pruefeBarrierefreiheit(container));
  });

  it('zeigt ohne Vorschlag nichts', async () => {
    fetchElectricitySuggestions.mockResolvedValue([]);
    const { container } = renderWithProviders(<LadestromVorschlaege rueckweg="/betrieb" />);
    await act(() => Promise.resolve());
    expect(fetchElectricitySuggestions).toHaveBeenCalled();
    expect(container).toBeEmptyDOMElement();
  });

  it('sagt es, wenn der Ladestrom nicht berechnet werden konnte', async () => {
    fetchElectricitySuggestions.mockRejectedValue(new Error('kaputt'));
    renderWithProviders(<LadestromVorschlaege rueckweg="/betrieb" />);
    expect(
      await screen.findByText('Der Ladestrom konnte nicht berechnet werden.'),
    ).toBeInTheDocument();
  });
});
