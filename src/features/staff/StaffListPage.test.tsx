import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen } from '@testing-library/react';
import type * as StaffApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import { renderWithProviders, testUser } from '@/test-utils';

const anna: StaffApi.StaffMember = {
  id: '55555555-5555-4555-8555-000000000002',
  person_id: '44444444-4444-4444-8444-000000000002',
  given_name: 'Anna',
  family_name: 'Beispiel',
  employment_status: 'active',
  work_email: 'anna.beispiel@praxis.invalid',
  work_phone: '+49 7071 0000102',
  primary_location_id: null,
  primary_location_name: 'Hauptstandort Tuebingen',
  date_of_birth: null,
  private_email: null,
  private_phone: null,
  street: null,
  postal_code: null,
  city: null,
};

const nina: StaffApi.StaffMember = {
  ...anna,
  id: '55555555-5555-4555-8555-0000000000aa',
  person_id: '44444444-4444-4444-8444-0000000000aa',
  given_name: 'Nina',
  family_name: 'Neu',
  work_email: null,
  work_phone: null,
  primary_location_name: null,
};

const tim: StaffApi.StaffMember = {
  ...anna,
  id: '55555555-5555-4555-8555-000000000004',
  person_id: '44444444-4444-4444-8444-000000000004',
  given_name: 'Tim',
  family_name: 'Teamleitung',
  work_phone: '+49 7071 0000104',
  employment_status: 'inactive',
};

const fetchStaffMembers = vi.fn();
const fetchAssignableTherapists = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof StaffApi>();
  return {
    ...actual,
    fetchStaffMembers: () => fetchStaffMembers() as Promise<StaffApi.StaffMember[]>,
  };
});

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAssignableTherapists: () =>
      fetchAssignableTherapists() as Promise<AppointmentsApi.AssignableTherapist[]>,
  };
});

const { StaffListPage } = await import('./StaffListPage');

describe('StaffListPage', () => {
  beforeEach(() => {
    fetchStaffMembers.mockReset();
    fetchAssignableTherapists.mockReset();
    fetchStaffMembers.mockResolvedValue([anna, nina, tim]);
    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: anna.id, display_name: 'Anna Beispiel' },
    ]);
  });

  it('listet die Mitarbeitenden mit ihrer dienstlichen Erreichbarkeit', async () => {
    renderWithProviders(<StaffListPage user={testUser(['office'])} />);
    expect(await screen.findByRole('link', { name: /Anna Beispiel/ })).toHaveAttribute(
      'href',
      `/praxis/team/${anna.id}`,
    );
    expect(screen.getByText(/\+49 7071 0000102/)).toBeInTheDocument();
  });

  it('kennzeichnet inaktive Personen', async () => {
    renderWithProviders(<StaffListPage user={testUser(['office'])} />);
    expect(await screen.findByText('inaktiv')).toBeInTheDocument();
  });

  it('weist aus, wer trotz aktiver Beschaeftigung nicht fuer Termine zuordenbar ist', async () => {
    // Nina hat keinen eigenen Zugang mit therapeutischer Rolle. Das ist eine
    // andere Frage als der Beschaeftigungsstatus und wird getrennt angezeigt.
    renderWithProviders(<StaffListPage user={testUser(['owner'])} />);
    expect(await screen.findByText('nicht für Termine zuordenbar')).toBeInTheDocument();
  });

  it('bietet nur der administrativen Rolle die Anlage an', async () => {
    renderWithProviders(<StaffListPage user={testUser(['owner'])} />);
    expect(await screen.findByRole('link', { name: 'Mitarbeiter:in anlegen' })).toHaveAttribute(
      'href',
      '/praxis/team/neu',
    );
  });

  it('bietet office die Anlage an (E10)', async () => {
    renderWithProviders(<StaffListPage user={testUser(['office'])} />);
    expect(await screen.findByRole('link', { name: 'Mitarbeiter:in anlegen' })).toBeInTheDocument();
  });

  it.each([['therapist'], ['team_lead']] as const)(
    'blendet die Anlage fuer %s aus',
    async (role) => {
      renderWithProviders(<StaffListPage user={testUser([role])} />);
      await screen.findByRole('link', { name: /Anna Beispiel/ });
      expect(
        screen.queryByRole('link', { name: 'Mitarbeiter:in anlegen' }),
      ).not.toBeInTheDocument();
    },
  );

  it('meldet einen Ladefehler verstaendlich', async () => {
    fetchStaffMembers.mockRejectedValue(new Error('kaputt'));
    renderWithProviders(<StaffListPage user={testUser(['office'])} />);
    expect(
      await screen.findByText('Die Mitarbeiterliste konnte nicht geladen werden.'),
    ).toBeInTheDocument();
  });
});
