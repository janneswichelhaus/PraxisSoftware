import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithProviders } from '@/test-utils';

// Die 6-Stunden-Rückfrage des Servers wird zur Leiste; „Trotzdem“ schickt denselben Auftrag bestätigt.
const rpc = vi.fn();
const from = vi.fn(() => ({
  select: () => ({ gte: () => ({ lte: () => Promise.resolve({ data: [], error: null }) }) }),
}));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ rpc, from }) }));

const { usePausen } = await import('./usePausen');

const AUFTRAG = { staffMemberId: 'anna', datum: '2027-05-12', planVonMinute: 720, vonMinute: 600 };

function Probe() {
  const pausen = usePausen({ von: '2027-05-10', bis: '2027-05-16' }, true);
  return (
    <>
      <button type="button" onClick={() => pausen.verschieben(AUFTRAG)}>
        Ziehen
      </button>
      {pausen.leiste}
    </>
  );
}

describe('usePausen', () => {
  it('fragt nach mehr als 6 Stunden am Stück nach und verschiebt erst auf „Trotzdem“', async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { message: 'more_than_six_hours_in_a_row' } })
      .mockResolvedValueOnce({ data: 'moved', error: null });
    renderWithProviders(<Probe />);

    await userEvent.click(screen.getByRole('button', { name: 'Ziehen' }));
    const leiste = await screen.findByRole('alertdialog', { name: 'Pause' });
    expect(leiste).toHaveTextContent('Danach: Mehr als 6 Std. am Stück ohne Pause (§ 4 ArbZG).');
    expect(rpc).toHaveBeenLastCalledWith(
      'set_break_placement',
      expect.objectContaining({ p_confirmed: false, p_starts_at: '10:00' }),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Trotzdem verschieben' }));
    expect(rpc).toHaveBeenLastCalledWith(
      'set_break_placement',
      expect.objectContaining({ p_confirmed: true, p_starts_at: '10:00' }),
    );
    expect(screen.queryByTestId('pausen-leiste')).not.toBeInTheDocument();
  });

  it('meldet eine Abweisung und schließt auf Wunsch', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: 'break overlaps appointment' } });
    renderWithProviders(<Probe />);

    await userEvent.click(screen.getByRole('button', { name: 'Ziehen' }));
    expect(await screen.findByRole('status', { name: 'Pause' })).toHaveTextContent(
      'Dort liegt ein Termin.',
    );
    await userEvent.click(screen.getByRole('button', { name: 'Schließen' }));
    expect(screen.queryByTestId('pausen-leiste')).not.toBeInTheDocument();
  });
});
