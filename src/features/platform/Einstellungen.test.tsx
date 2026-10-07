import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as PlattformApi from './api';
import type { Einstiegsstand, Plattformzugang } from './api';
import { renderWithProviders } from '@/test-utils';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';

/**
 * „Ich → Einstellungen" (POR-020): Schriftgröße auf dem Gerät, und was die
 * Praxis eingestellt hat - ohne Namen der Mitarbeitenden.
 */

const ladeEinstieg = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof PlattformApi>()),
  ladeEinstieg: (...args: unknown[]) => ladeEinstieg(...args) as Promise<Einstiegsstand | null>,
}));

const { Einstellungen } = await import('./Einstellungen');
const { gespeicherteSchriftgroesse } = await import('./schriftgroesse');

const ZUGANG: Plattformzugang = {
  access_id: 'cafecafe-cafe-4afe-8afe-000000000002',
  organization_name: 'Test Praxis Tuebingen',
  relationship_kind: 'treatment',
  status: 'active',
  readable: true,
  read_until: null,
  access_kind: 'self',
  represented_name: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  ladeEinstieg.mockResolvedValue({
    pending: false,
    finished_at: null,
    skipped_at: '2026-10-03T09:00:00Z',
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Einstellungen (POR-020)', () => {
  it('zeigt, dass die Praxis den Einstieg übersprungen hat - ohne Namen', async () => {
    const { container } = renderWithProviders(<Einstellungen zugaenge={[ZUGANG]} />);
    expect(
      await screen.findByText(/Die Praxis hat den Einstieg am .* übersprungen/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Ihre Einwilligungen hat sie dabei nicht berührt/)).toBeInTheDocument();
    expect(screen.getByText(/mit „Sie“ an/)).toBeInTheDocument();
    await pruefeBarrierefreiheit(container);
  });

  it('merkt sich die Schriftgröße auf dem Gerät', async () => {
    const nutzer = userEvent.setup();
    renderWithProviders(<Einstellungen zugaenge={[ZUGANG]} />);
    expect(screen.getByRole('radio', { name: /Normal/ })).toBeChecked();
    await nutzer.click(screen.getByRole('radio', { name: /Sehr groß/ }));
    expect(screen.getByRole('radio', { name: /Sehr groß/ })).toBeChecked();
    expect(window.localStorage.getItem('plattform-schriftgroesse')).toBe('sehr-gross');
    expect(gespeicherteSchriftgroesse()).toBe('sehr-gross');
  });

  it('ohne Speicher des Browsers gilt „Normal", und die Seite bleibt benutzbar', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('gesperrt');
    });
    expect(gespeicherteSchriftgroesse()).toBe('normal');
    renderWithProviders(<Einstellungen zugaenge={[ZUGANG]} />);
    expect(screen.getByRole('radio', { name: /Normal/ })).toBeChecked();
  });
});
