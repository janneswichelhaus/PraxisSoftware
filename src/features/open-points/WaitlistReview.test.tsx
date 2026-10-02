import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as WaitlistApi from '@/features/waitlist/api';
import { renderWithProviders } from '@/test-utils';

/** „Warteliste prüfen" in Offene Punkte (ABN-018, BEF-108, ANN-220). */

const fetchWaitlist = vi.fn();
const confirmWaitlistEntry = vi.fn();

vi.mock('@/features/waitlist/api', async (importOriginal) => ({
  ...(await importOriginal<typeof WaitlistApi>()),
  fetchWaitlist: () => fetchWaitlist() as Promise<WaitlistApi.WaitlistEntry[]>,
  confirmWaitlistEntry: (e: unknown) => confirmWaitlistEntry(e) as Promise<void>,
}));

const { WaitlistReview } = await import('./WaitlistReview');

function eintrag(rest: Partial<WaitlistApi.WaitlistEntry>): WaitlistApi.WaitlistEntry {
  return {
    id: 'w1',
    patient_id: 'p1',
    patient_given_name: 'Max',
    patient_family_name: 'Mustermann',
    phone: null,
    phone_mobile: null,
    postal_code: null,
    treatment_basis_id: null,
    treatment_basis_kind: null,
    treatment_basis_issued_on: null,
    preferred_staff_member_id: null,
    preferred_staff_name: null,
    appointment_type: 'home_visit',
    duration_minutes: 60,
    time_windows: [],
    earliest_on: null,
    needed_by: null,
    priority_reason: 'patient_wish',
    note: null,
    status: 'open',
    placed_appointment_id: null,
    created_at: '2026-07-01T08:00:00Z',
    updated_at: '2026-07-01T08:00:00Z',
    closed_at: null,
    review_due: true,
    ...rest,
  };
}

describe('WaitlistReview', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmWaitlistEntry.mockResolvedValue(undefined);
  });

  it('zeigt nur zu prüfende Einträge und bestätigt sie als noch aktuell', async () => {
    fetchWaitlist.mockResolvedValue([
      eintrag({}),
      eintrag({ id: 'w2', patient_family_name: 'Frisch', review_due: false }),
    ]);
    const user = userEvent.setup();
    renderWithProviders(<WaitlistReview timeZone="Europe/Berlin" />);

    expect(await screen.findByText('Warteliste prüfen (1)')).toBeInTheDocument();
    expect(screen.getByText('Unverändert seit 01.07.2026')).toBeInTheDocument();
    expect(screen.queryByText(/Frisch/)).toBeNull();

    await user.click(screen.getByRole('button', { name: /Noch aktuell/ }));
    await waitFor(() =>
      expect(confirmWaitlistEntry).toHaveBeenCalledWith(expect.objectContaining({ id: 'w1' })),
    );
  });

  it('sagt in einem Satz, wenn nichts zu prüfen ist', async () => {
    fetchWaitlist.mockResolvedValue([eintrag({ review_due: false })]);
    renderWithProviders(<WaitlistReview timeZone="Europe/Berlin" />);
    expect(await screen.findByText('Kein Eintrag wartet auf eine Prüfung.')).toBeInTheDocument();
  });
});
