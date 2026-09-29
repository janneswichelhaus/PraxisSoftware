import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as WaitlistApi from './api';
import { renderWithProviders, testUser } from '@/test-utils';

const fetchWaitlist = vi.fn();
const withdrawWaitlistEntry = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof WaitlistApi>();
  return {
    ...actual,
    fetchWaitlist: (filter: WaitlistApi.ListFilter) =>
      fetchWaitlist(filter) as Promise<WaitlistApi.WaitlistEntry[]>,
    withdrawWaitlistEntry: (entry: WaitlistApi.WaitlistEntry) =>
      withdrawWaitlistEntry(entry) as Promise<void>,
  };
});

const { WaitlistPage } = await import('./WaitlistPage');

function testEntry(rest: Partial<WaitlistApi.WaitlistEntry> = {}): WaitlistApi.WaitlistEntry {
  return {
    id: 'e1',
    patient_id: 'p1',
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    phone: '+49 7071 0000005',
    phone_mobile: null,
    postal_code: '72070',
    treatment_basis_id: 'b1',
    treatment_basis_kind: 'follow_up',
    treatment_basis_issued_on: '2026-06-18',
    preferred_staff_member_id: 's1',
    preferred_staff_name: 'Anna Beispiel',
    appointment_type: 'home_visit',
    duration_minutes: 60,
    time_windows: [{ weekday: 1, from: '08:00', to: '12:00' }],
    earliest_on: null,
    needed_by: '2026-10-15',
    priority_reason: 'prescription_ending',
    note: 'Synthetisch: vormittags erreichbar',
    status: 'open',
    placed_appointment_id: null,
    created_at: '2026-09-20T08:00:00+00:00',
    updated_at: '2026-09-20T08:00:00+00:00',
    closed_at: null,
    ...rest,
  };
}

describe('WaitlistPage (PRX-001)', () => {
  beforeEach(() => {
    fetchWaitlist.mockReset();
    withdrawWaitlistEntry.mockReset();
  });

  it('zeigt Name, Wunsch, Grund, Frist, Notiz und die Nummer zum Anrufen', async () => {
    fetchWaitlist.mockResolvedValue([testEntry()]);
    renderWithProviders(<WaitlistPage user={testUser(['office'])} />);

    expect(await screen.findByRole('link', { name: 'Mustermann, Max' })).toHaveAttribute(
      'href',
      '/patienten/p1/termine',
    );
    expect(
      screen.getByText('Hausbesuch · 60 Min. · Mo 08:00–12:00 · bei Anna Beispiel'),
    ).toBeInTheDocument();
    expect(screen.getByText('Verordnung endet')).toBeInTheDocument();
    expect(screen.getByText(/bis spätestens/)).toBeInTheDocument();
    expect(screen.getByText(/vormittags erreichbar/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Anrufen: +49 7071 0000005' })).toHaveAttribute(
      'href',
      'tel:+4970710000005',
    );
  });

  it('bestätigt einen gerade eingeplanten Eintrag mit dem Weg zum Termin (BEF-071)', async () => {
    fetchWaitlist.mockResolvedValue([]);
    const termin = '0f0f0f0f-0000-4000-8000-000000000001';
    renderWithProviders(<WaitlistPage user={testUser(['office'])} />, `/warteliste?neu=${termin}`);
    expect(await screen.findByText(/Termin angelegt – der Eintrag ist eingeplant/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Termin öffnen' })).toHaveAttribute(
      'href',
      `/termine/${termin}`,
    );
  });

  it('sagt es, wenn niemand wartet', async () => {
    fetchWaitlist.mockResolvedValue([]);
    renderWithProviders(<WaitlistPage user={testUser(['office'])} />);
    expect(await screen.findByText('Niemand wartet')).toBeInTheDocument();
  });

  it('nimmt einen Eintrag erst nach Rückfrage von der Liste', async () => {
    fetchWaitlist.mockResolvedValue([testEntry()]);
    withdrawWaitlistEntry.mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderWithProviders(<WaitlistPage user={testUser(['office'])} />);

    await user.click(await screen.findByRole('button', { name: 'Von der Liste nehmen' }));
    expect(withdrawWaitlistEntry).not.toHaveBeenCalled();
    const buttons = screen.getAllByRole('button', { name: 'Von der Liste nehmen' });
    await user.click(buttons.at(-1)!);
    expect(withdrawWaitlistEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 'e1' }));
  });

  it('zeigt geschlossene Einträge ohne Anrufweg, mit dem Weg zum Termin', async () => {
    fetchWaitlist.mockImplementation((filter: string) =>
      Promise.resolve(
        filter === 'closed'
          ? [
              testEntry({
                status: 'placed',
                placed_appointment_id: 'a1',
                closed_at: '2026-09-25T10:00:00+00:00',
              }),
            ]
          : [],
      ),
    );
    const user = userEvent.setup();
    renderWithProviders(<WaitlistPage user={testUser(['office'])} />);
    await user.click(await screen.findByRole('button', { name: 'Geschlossen' }));

    expect(await screen.findByText('Eingeplant')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Zum Termin' })).toHaveAttribute('href', '/termine/a1');
    expect(screen.queryByRole('link', { name: /Anrufen/ })).not.toBeInTheDocument();
  });
});
