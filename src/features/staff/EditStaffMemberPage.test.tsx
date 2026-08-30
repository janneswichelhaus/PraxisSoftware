import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as StaffApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as RouterModule from 'react-router-dom';
import { renderWithProviders } from '@/test-utils';

const STAFF_ID = '55555555-5555-4555-8555-000000000002';

const anna: StaffApi.StaffMember = {
  id: STAFF_ID,
  person_id: '44444444-4444-4444-8444-000000000002',
  given_name: 'Anna',
  family_name: 'Beispiel',
  employment_status: 'active',
  work_email: 'anna.beispiel@praxis.invalid',
  work_phone: '+49 7071 0000102',
  primary_location_id: '33333333-3333-4333-8333-000000000001',
  primary_location_name: 'Hauptstandort Tuebingen',
  date_of_birth: '1992-06-02',
  private_email: 'anna.privat@beispiel.invalid',
  private_phone: '+49 7071 0000002',
  street: 'Beispielweg 2',
  postal_code: '72072',
  city: 'Tuebingen',
};

const fetchStaffMember = vi.fn();
const updateStaffMember = vi.fn();
const fetchLocations = vi.fn();
const navigate = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof StaffApi>();
  return {
    ...actual,
    fetchStaffMember: (id: string) => fetchStaffMember(id) as Promise<StaffApi.StaffMember | null>,
    updateStaffMember: (id: string, values: StaffApi.StaffMasterDataValues) =>
      updateStaffMember(id, values) as Promise<void>,
  };
});

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchLocations: () => fetchLocations() as Promise<AppointmentsApi.Location[]>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModule>();
  return { ...actual, useParams: () => ({ staffMemberId: STAFF_ID }), useNavigate: () => navigate };
});

const { EditStaffMemberPage } = await import('./EditStaffMemberPage');

describe('EditStaffMemberPage', () => {
  beforeEach(() => {
    fetchStaffMember.mockReset();
    updateStaffMember.mockReset();
    fetchLocations.mockReset();
    navigate.mockReset();
    fetchStaffMember.mockResolvedValue(anna);
    updateStaffMember.mockResolvedValue(undefined);
    fetchLocations.mockResolvedValue([
      { id: '33333333-3333-4333-8333-000000000001', name: 'Hauptstandort Tuebingen' },
    ]);
  });

  it('fuellt das Formular aus dem gelesenen Datensatz vor', async () => {
    renderWithProviders(<EditStaffMemberPage />);
    expect(await screen.findByLabelText('Vorname *')).toHaveValue('Anna');
    expect(screen.getByLabelText('Diensttelefon')).toHaveValue('+49 7071 0000102');
    expect(screen.getByLabelText('Geburtsdatum')).toHaveValue('1992-06-02');
  });

  it('speichert die geaenderten Werte und kehrt zum Datensatz zurueck', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditStaffMemberPage />);

    const telefon = await screen.findByLabelText('Diensttelefon');
    await user.clear(telefon);
    await user.type(telefon, '+49 7071 999');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(updateStaffMember).toHaveBeenCalledTimes(1));
    expect(updateStaffMember.mock.calls[0]?.[0]).toBe(STAFF_ID);
    expect(updateStaffMember.mock.calls[0]?.[1]).toMatchObject({
      given_name: 'Anna',
      work_phone: '+49 7071 999',
    });
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith(`/praxis/team/${STAFF_ID}`, { replace: true }),
    );
  });

  it('bietet den Beschaeftigungsstatus nicht als Eingabefeld an', async () => {
    renderWithProviders(<EditStaffMemberPage />);
    await screen.findByLabelText('Vorname *');
    // Der Statuswechsel hat einen eigenen Vorgang mit eigener Rueckfrage.
    expect(screen.queryByLabelText(/Beschäftigung/)).not.toBeInTheDocument();
  });

  it('zeigt eine verstaendliche Meldung, wenn der Datensatz nicht sichtbar ist', async () => {
    fetchStaffMember.mockResolvedValue(null);
    renderWithProviders(<EditStaffMemberPage />);
    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
  });
});
