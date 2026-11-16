import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as SlotApi from './api';
import type * as BuchungsApi from './auto-booking-api';
import type * as PatientsApi from '@/features/patients/record/api';
import type * as WaitlistApi from '@/features/calendar/waitlist/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testPatient, testUser } from '@/test-utils';
import type * as StaffApi from '@/features/workforce/staff/api';

const PATIENT = '66666666-6666-4666-8666-000000000001';
const ENTRY = '99999999-9999-4999-8999-000000000001';

const findFreeSlots = vi.fn();
const fetchWaitlist = vi.fn();
const bucheNaechstenTermin = vi.fn();

vi.mock('./auto-booking-api', async (importOriginal) => ({
  ...(await importOriginal<typeof BuchungsApi>()),
  bucheNaechstenTermin: (a: BuchungsApi.Buchungsauftrag) =>
    bucheNaechstenTermin(a) as Promise<BuchungsApi.Buchungsergebnis>,
}));

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof SlotApi>()),
  findFreeSlots: (p: SlotApi.SearchParams) => findFreeSlots(p) as Promise<SlotApi.Slot[]>,
  rateSlotTravel: () => Promise.resolve([]),
}));
vi.mock('@/features/patients/record/api', async (importOriginal) => ({
  ...(await importOriginal<typeof PatientsApi>()),
  fetchPatient: () =>
    Promise.resolve(testPatient({ id: PATIENT, given_name: 'Max', family_name: 'Mustermann' })),
}));
vi.mock('@/features/calendar/waitlist/api', async (importOriginal) => ({
  ...(await importOriginal<typeof WaitlistApi>()),
  fetchWaitlist: (f: string, p: string) =>
    fetchWaitlist(f, p) as Promise<WaitlistApi.WaitlistEntry[]>,
}));
vi.mock('@/features/workforce/staff/api', async (importOriginal) => ({
  ...(await importOriginal<typeof StaffApi>()),
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
    bucheNaechstenTermin.mockReset();
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

  it('sagt, wenn nichts frei ist, ohne Rat daneben (L7)', async () => {
    findFreeSlots.mockResolvedValue([]);
    renderWithProviders(
      <SlotSearchPage user={testUser(['office'])} />,
      `/patienten/${PATIENT}/plaetze`,
    );
    expect(await screen.findByText('Kein freier Platz')).toBeInTheDocument();
    expect(screen.queryByText(/Zeitraum verlängern/)).toBeNull();
  });

  it('bucht den nächsten passenden Hausbesuch mit der laufenden Suche und der Grundlage', async () => {
    findFreeSlots.mockResolvedValue([]);
    bucheNaechstenTermin.mockResolvedValue({ art: 'kein_platz', ungeprueft: 0 });
    renderWithProviders(
      <SlotSearchPage user={testUser(['office'])} />,
      `/patienten/${PATIENT}/plaetze?verordnung=88888888-8888-4888-8888-000000000002`,
    );
    await screen.findByText('Kein freier Platz');
    await userEvent.click(screen.getByRole('button', { name: 'Nächsten passenden Termin buchen' }));

    expect(await screen.findByText('Kein Platz mit passendem Fahrweg')).toBeInTheDocument();
    const suche = findFreeSlots.mock.calls[0]![0] as SlotApi.SearchParams;
    expect(bucheNaechstenTermin).toHaveBeenCalledWith({
      patientId: PATIENT,
      staffMemberId: null,
      duration: 60,
      from: suche.from,
      to: suche.to,
      windows: [],
      basisId: '88888888-8888-4888-8888-000000000002',
      waitlistId: null,
    });
  });

  it('hält einen offenen Ausgang fest: Auch nach einer neuen Suche gibt es keinen Knopf zum Buchen', async () => {
    findFreeSlots.mockResolvedValue([]);
    bucheNaechstenTermin.mockResolvedValue({
      art: 'unklar',
      satz: 'Unklar, ob gebucht wurde. Bitte bei den Terminen der Akte nachsehen.',
    });
    renderWithProviders(
      <SlotSearchPage user={testUser(['office'])} />,
      `/patienten/${PATIENT}/plaetze`,
    );
    await screen.findByText('Kein freier Platz');
    await userEvent.click(screen.getByRole('button', { name: 'Nächsten passenden Termin buchen' }));
    expect(await screen.findByText(/Unklar, ob gebucht wurde/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nächsten passenden Termin buchen' })).toBeNull();

    // Eine andere Dauer ist eine neue Suche; der offene Ausgang bleibt stehen.
    await userEvent.click(screen.getByText('Suche anpassen'));
    const dauer = screen.getByLabelText('Dauer in Minuten');
    await userEvent.clear(dauer);
    await userEvent.type(dauer, '45');
    await userEvent.click(screen.getByRole('button', { name: 'Suchen' }));
    await waitFor(() =>
      expect(findFreeSlots).toHaveBeenLastCalledWith(expect.objectContaining({ duration: 45 })),
    );
    expect(screen.getByText(/Unklar, ob gebucht wurde/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Nächsten passenden Termin buchen' })).toBeNull();
    expect(bucheNaechstenTermin).toHaveBeenCalledTimes(1);
  });

  it('bietet das Buchen nur für den Hausbesuch: Die Wegregel gilt dort', async () => {
    fetchWaitlist.mockResolvedValue([
      {
        id: ENTRY,
        patient_id: PATIENT,
        treatment_basis_id: null,
        preferred_staff_member_id: null,
        appointment_type: 'video',
        duration_minutes: 30,
        time_windows: [],
        earliest_on: null,
      },
    ]);
    findFreeSlots.mockResolvedValue([]);
    renderWithProviders(
      <SlotSearchPage user={testUser(['office'])} />,
      `/patienten/${PATIENT}/plaetze?warteliste=${ENTRY}`,
    );
    await screen.findByText('Kein freier Platz');
    expect(screen.queryByRole('button', { name: 'Nächsten passenden Termin buchen' })).toBeNull();
  });
});
