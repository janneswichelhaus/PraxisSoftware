import { describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as WaitlistApi from './api';
import { renderWithProviders } from '@/test-utils';

const fetchWaitlistMatches = vi.fn();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof WaitlistApi>()),
  fetchWaitlistMatches: (slot: WaitlistApi.FreeSlot) =>
    fetchWaitlistMatches(slot) as Promise<WaitlistApi.WaitlistMatch[]>,
}));

const { WaitlistMatches } = await import('./WaitlistMatches');

const SLOT = { staffMemberId: 's1', date: '2099-10-05', start: '09:00', end: '10:00' };

describe('WaitlistMatches (PRX-004)', () => {
  it('zeigt, wer passt, mit Nummer und dem Weg ins vorbelegte Formular', async () => {
    fetchWaitlistMatches.mockResolvedValue([
      {
        id: 'e1',
        patient_id: 'p1',
        patient_given_name: 'Max',
        patient_family_name: 'Mustermann',
        phone: '+49 7071 0000005',
        phone_mobile: null,
        treatment_basis_id: 'b1',
        appointment_type: 'home_visit',
        duration_minutes: 45,
        time_windows: [],
        needed_by: null,
        priority_reason: 'prescription_ending',
        territory_status: 'match',
        updated_at: '2026-09-28T08:00:00+00:00',
      },
    ]);
    renderWithProviders(<WaitlistMatches slot={SLOT} back="/termine/t1" />);

    expect(await screen.findByText('Passt von der Warteliste (1)')).toBeInTheDocument();
    expect(screen.getByText('Mustermann, Max')).toBeInTheDocument();
    expect(screen.getByText('Im Gebietstag')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Anrufen: +49 7071 0000005' })).toBeInTheDocument();
    const href = screen.getByRole('link', { name: 'Übernehmen' }).getAttribute('href') ?? '';
    const [pfad, query] = href.split('?');
    expect(pfad).toBe('/patienten/p1/termine/neu');
    expect(Object.fromEntries(new URLSearchParams(query))).toMatchObject({
      datum: '2099-10-05',
      beginn: '09:00',
      ende: '09:45',
      art: 'home_visit',
      person: 's1',
      dauer: '45',
      verordnung: 'b1',
      warteliste: 'e1',
      zurueck: '/termine/t1',
    });
  });

  it('bleibt stumm, wenn niemand passt', async () => {
    fetchWaitlistMatches.mockResolvedValue([]);
    const { container } = renderWithProviders(<WaitlistMatches slot={SLOT} back="/" />);
    await vi.waitFor(() => expect(fetchWaitlistMatches).toHaveBeenCalled());
    expect(container).toBeEmptyDOMElement();
  });
});
