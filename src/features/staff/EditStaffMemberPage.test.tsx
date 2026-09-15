import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as StaffApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testStaffMember, testUser } from '@/test-utils';

const STAFF_ID = '55555555-5555-4555-8555-000000000002';

const anna = testStaffMember({
  id: STAFF_ID,
  work_phone: '+49 7071 0000102',
  primary_location_id: '33333333-3333-4333-8333-000000000001',
  primary_location_name: 'Hauptstandort Tuebingen',
  date_of_birth: '1992-06-02',
  private_email: 'anna.privat@beispiel.invalid',
  private_phone: '+49 7071 0000002',
  street: 'Beispielweg 2',
  postal_code: '72072',
  city: 'Tuebingen',
});

const fetchStaffMember = vi.fn();
const updateStaffMember = vi.fn();
const fetchLocations = vi.fn();
const navigate = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof StaffApi>();
  return {
    ...actual,
    fetchStaffMember: (id: string) => fetchStaffMember(id) as Promise<StaffApi.StaffMember | null>,
    updateStaffMember: (id: string, values: StaffApi.StaffMasterDataValues, privat?: boolean) =>
      updateStaffMember(id, values, privat) as Promise<void>,
  };
});

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchLocations: () => fetchLocations() as Promise<AppointmentsApi.Location[]>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
  useParams: () => ({ staffMemberId: STAFF_ID }),
}));

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
    renderWithProviders(<EditStaffMemberPage user={testUser(['owner'])} />);
    expect(await screen.findByLabelText('Vorname *')).toHaveValue('Anna');
    expect(screen.getByLabelText('Diensttelefon')).toHaveValue('+49 7071 0000102');
    expect(screen.getByLabelText('Geburtsdatum')).toHaveValue('1992-06-02');
  });

  it('speichert die geaenderten Werte und kehrt zum Datensatz zurueck', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditStaffMemberPage user={testUser(['owner'])} />);

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
    renderWithProviders(<EditStaffMemberPage user={testUser(['owner'])} />);
    await screen.findByLabelText('Vorname *');
    // Der Statuswechsel hat einen eigenen Vorgang mit eigener Rueckfrage.
    expect(screen.queryByLabelText(/Beschäftigung/)).not.toBeInTheDocument();
  });

  it('zeigt eine verstaendliche Meldung, wenn der Datensatz nicht sichtbar ist', async () => {
    fetchStaffMember.mockResolvedValue(null);
    renderWithProviders(<EditStaffMemberPage user={testUser(['owner'])} />);
    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// E10: das Office pflegt Stammdaten, sieht die Privatangaben aber nicht
// ---------------------------------------------------------------------------
describe('EditStaffMemberPage fuer office (E10, ANN-024)', () => {
  beforeEach(() => {
    fetchStaffMember.mockReset();
    updateStaffMember.mockReset();
    fetchLocations.mockReset();
    navigate.mockReset();
    // So kommt der Datensatz beim Office tatsaechlich an: die Privatspalten
    // filtert die RLS der Basistabelle weg, sie sind null.
    fetchStaffMember.mockResolvedValue({
      ...anna,
      date_of_birth: null,
      private_email: null,
      private_phone: null,
      street: null,
      postal_code: null,
      city: null,
    });
    updateStaffMember.mockResolvedValue(undefined);
    fetchLocations.mockResolvedValue([
      { id: '33333333-3333-4333-8333-000000000001', name: 'Hauptstandort Tuebingen' },
    ]);
  });

  it('zeigt den Abschnitt Privat gar nicht erst', async () => {
    renderWithProviders(<EditStaffMemberPage user={testUser(['office'])} />);

    expect(await screen.findByLabelText('Diensttelefon')).toBeInTheDocument();
    expect(screen.queryByLabelText('Private E-Mail')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Geburtsdatum')).not.toBeInTheDocument();
    expect(
      screen.getByText(/Privatangaben .* pflegt\s*ausschließlich die Praxisinhaberin/s),
    ).toBeInTheDocument();
  });

  it('speichert ohne Privatangaben, damit nichts geleert wird', async () => {
    const user = userEvent.setup();
    renderWithProviders(<EditStaffMemberPage user={testUser(['office'])} />);

    const telefon = await screen.findByLabelText('Diensttelefon');
    await user.clear(telefon);
    await user.type(telefon, '+49 7071 111');
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(updateStaffMember).toHaveBeenCalledTimes(1));
    expect(updateStaffMember.mock.calls[0]?.[2]).toBe(false);
  });

  it('schickt fuer owner die Privatangaben mit', async () => {
    const user = userEvent.setup();
    fetchStaffMember.mockResolvedValue(anna);
    renderWithProviders(<EditStaffMemberPage user={testUser(['owner'])} />);

    expect(await screen.findByLabelText('Private E-Mail')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Änderungen speichern' }));

    await waitFor(() => expect(updateStaffMember).toHaveBeenCalledTimes(1));
    expect(updateStaffMember.mock.calls[0]?.[2]).toBe(true);
  });
});
