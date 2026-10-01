import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as SlotApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as PatientsApi from '@/features/patients/api';
import type * as WaitlistApi from '@/features/waitlist/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';

const PATIENT = '66666666-6666-4666-8666-000000000001';
const ENTRY = '99999999-9999-4999-8999-000000000001';

const findFreeSlots = vi.fn();
const fetchWaitlist = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof SlotApi>()),
  findFreeSlots: (p: SlotApi.SearchParams) => findFreeSlots(p) as Promise<SlotApi.Slot[]>,
  rateSlotTravel: () => Promise.resolve([]),
}));
vi.mock('@/features/patients/api', async (importOriginal) => ({
  ...(await importOriginal<typeof PatientsApi>()),
  fetchPatient: () =>
    Promise.resolve(testPatient({ id: PATIENT, given_name: 'Max', family_name: 'Mustermann' })),
}));
vi.mock('@/features/waitlist/api', async (importOriginal) => ({
  ...(await importOriginal<typeof WaitlistApi>()),
  fetchWaitlist: (f: string, p: string) =>
    fetchWaitlist(f, p) as Promise<WaitlistApi.WaitlistEntry[]>,
}));
vi.mock('@/features/appointments/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AppointmentsApi>()),
  fetchAssignableTherapists: () =>
    Promise.resolve([{ staff_member_id: 's1', display_name: 'Anna Beispiel' }]),
}));

// Der Testrouter kennt nur `*`; die Kennung kommt deshalb hier herein.
vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useParams: () => ({ patientId: PATIENT }),
}));

const { SlotSearchPage } = await import('./SlotSearchPage');

const SLOT: SlotApi.Slot = {
  staff_member_id: 's1',
  staff_name: 'Anna Beispiel',
  slot_date: '2099-10-05',
  start_time: '09:00',
  end_time: '09:45',
  territory_status: 'match',
  prev_appointment_id: null,
  prev_lat: null,
  prev_lon: null,
  next_appointment_id: null,
  next_lat: null,
  next_lon: null,
  target_lat: null,
  target_lon: null,
};

describe('SlotSearchPage (PRX-003)', () => {
  beforeEach(() => {
    findFreeSlots.mockReset();
    fetchWaitlist.mockReset();
  });

  it('sucht mit den Wünschen des Wartelisteneintrags und führt vorbelegt ins Formular', async () => {
    fetchWaitlist.mockResolvedValue([
      {
        id: ENTRY,
        patient_id: PATIENT,
        treatment_basis_id: 'b1',
        preferred_staff_member_id: 's1',
        appointment_type: 'practice',
        duration_minutes: 45,
        time_windows: [{ weekday: 1, from: '08:00', to: '12:00' }],
        earliest_on: null,
      },
    ]);
    findFreeSlots.mockResolvedValue([SLOT]);
    renderWithProviders(
      <SlotSearchPage user={testUser(['office'])} />,
      `/patienten/${PATIENT}/plaetze?warteliste=${ENTRY}`,
    );

    expect(await screen.findByText(/09:00–09:45 Uhr/)).toBeInTheDocument();
    expect(findFreeSlots).toHaveBeenCalledWith(
      expect.objectContaining({
        patientId: PATIENT,
        staffMemberId: 's1',
        type: 'practice',
        duration: 45,
        windows: [{ weekday: 1, from: '08:00', to: '12:00' }],
      }),
    );
    // Der Normalfall trägt kein Kennzeichen; nur Abweichungen (UX-005g).
    expect(screen.queryByText('Im Gebietstag')).toBeNull();
    const href = screen.getByRole('link', { name: 'Übernehmen' }).getAttribute('href') ?? '';
    const [pfad, query] = href.split('?');
    expect(pfad).toBe(`/patienten/${PATIENT}/termine/neu`);
    const params = new URLSearchParams(query);
    expect(Object.fromEntries(params)).toMatchObject({
      datum: '2099-10-05',
      beginn: '09:00',
      ende: '09:45',
      art: 'practice',
      person: 's1',
      dauer: '45',
      verordnung: 'b1',
      warteliste: ENTRY,
    });
  });

  it('sagt, wenn nichts frei ist, und was man ändern kann', async () => {
    findFreeSlots.mockResolvedValue([]);
    renderWithProviders(
      <SlotSearchPage user={testUser(['office'])} />,
      `/patienten/${PATIENT}/plaetze`,
    );
    expect(await screen.findByText('Kein freier Platz')).toBeInTheDocument();
  });
});
