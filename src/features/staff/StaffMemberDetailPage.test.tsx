import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as StaffApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testStaffMember, testUser } from '@/test-utils';

const STAFF_ID = '55555555-5555-4555-8555-000000000002';

const aktiv = testStaffMember({
  id: STAFF_ID,
  work_phone: '+49 7071 0000102',
  primary_location_id: '33333333-3333-4333-8333-000000000001',
  primary_location_name: 'Hauptstandort Tuebingen',
});

const fetchStaffMember = vi.fn();
const setStaffEmploymentStatus = vi.fn();
const fetchStaffFutureAppointments = vi.fn();
const fetchAssignableTherapists = vi.fn();

// Kalender und Arbeitszeiten kennen nur zuordenbare Personen (UX-012); die
// Seite fragt deshalb, ob diese Person ueberhaupt behandelt.
vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAssignableTherapists: () =>
      fetchAssignableTherapists() as Promise<AppointmentsApi.AssignableTherapist[]>,
  };
});

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof StaffApi>();
  return {
    ...actual,
    fetchStaffMember: (id: string) => fetchStaffMember(id) as Promise<StaffApi.StaffMember | null>,
    setStaffEmploymentStatus: (id: string, status: string, bestaetigt?: boolean) =>
      setStaffEmploymentStatus(id, status, bestaetigt) as Promise<void>,
    fetchStaffFutureAppointments: (id: string) =>
      fetchStaffFutureAppointments(id) as Promise<StaffApi.FutureAppointment[]>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useParams: () => ({ staffMemberId: STAFF_ID }),
}));

const { StaffMemberDetailPage } = await import('./StaffMemberDetailPage');
const { OffeneTermineError } = await import('./api');

/** Der letzte Schreibvorgang mit seinem Bestätigungskennzeichen. */
function letzterStatusaufruf(): { id: string; status: string; bestaetigt: boolean | undefined } {
  const aufruf = setStaffEmploymentStatus.mock.calls.at(-1) as
    [string, string, boolean | undefined] | undefined;
  if (!aufruf) throw new Error('Es wurde kein Statuswechsel ausgelöst.');
  return { id: aufruf[0], status: aufruf[1], bestaetigt: aufruf[2] };
}

describe('StaffMemberDetailPage', () => {
  beforeEach(() => {
    fetchStaffMember.mockReset();
    setStaffEmploymentStatus.mockReset();
    fetchStaffFutureAppointments.mockReset();
    fetchStaffMember.mockResolvedValue(aktiv);
    setStaffEmploymentStatus.mockResolvedValue(undefined);
    fetchStaffFutureAppointments.mockResolvedValue([]);
    fetchAssignableTherapists.mockReset();
    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: STAFF_ID, display_name: 'Anna Beispiel' },
    ]);
  });

  // ---------------------------------------------------------------------------
  // UX-012: Der Datensatz ist der Ausgangspunkt fuer das, was mit dieser Person
  // zu tun ist - anrufen, schreiben, nachsehen wann sie arbeitet.
  // ---------------------------------------------------------------------------
  describe('Kontakt und Planung', () => {
    it('bietet Diensttelefon und dienstliche E-Mail als Weg an', async () => {
      renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
      await screen.findByRole('heading', { name: 'Anna Beispiel' });

      expect(screen.getByRole('link', { name: '+49 7071 0000102' })).toHaveAttribute(
        'href',
        'tel:+4970710000102',
      );
      expect(screen.getByRole('link', { name: 'anna.beispiel@praxis.invalid' })).toHaveAttribute(
        'href',
        'mailto:anna.beispiel@praxis.invalid',
      );
    });

    it('fuehrt in die Woche im Kalender und zu den Arbeitszeiten dieser Person', async () => {
      renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
      await screen.findByRole('heading', { name: 'Anna Beispiel' });

      const kalender = await screen.findByRole('link', { name: 'Woche im Kalender' });
      expect(kalender.getAttribute('href')).toContain(`person=${STAFF_ID}`);
      expect(kalender.getAttribute('href')).toContain('ansicht=woche');
      expect(screen.getByRole('link', { name: 'Arbeitszeiten' })).toHaveAttribute(
        'href',
        `/praxis/planung?person=${STAFF_ID}`,
      );
    });

    it('bietet beides nicht an, wenn die Person gar nicht behandelt', async () => {
      fetchAssignableTherapists.mockResolvedValue([]);
      renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
      await screen.findByRole('heading', { name: 'Anna Beispiel' });

      await waitFor(() => expect(fetchAssignableTherapists).toHaveBeenCalled());
      expect(screen.queryByRole('link', { name: 'Woche im Kalender' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Arbeitszeiten' })).not.toBeInTheDocument();
    });
  });

  it('zeigt die dienstlichen Angaben', async () => {
    renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
    expect(await screen.findByRole('heading', { name: 'Anna Beispiel' })).toBeInTheDocument();
    expect(screen.getByText('Hauptstandort Tuebingen')).toBeInTheDocument();
  });

  it('zeigt keine Privatangaben, wenn der Server keine geliefert hat', async () => {
    renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
    await screen.findByRole('heading', { name: 'Anna Beispiel' });
    // Die Felder werden gar nicht erst geliefert - nicht nur ausgeblendet.
    expect(screen.queryByText('Privat')).not.toBeInTheDocument();
  });

  it('zeigt Privatangaben, wenn der Server sie geliefert hat', async () => {
    fetchStaffMember.mockResolvedValue({
      ...aktiv,
      date_of_birth: '1992-06-02',
      private_phone: '+49 7071 0000002',
    });
    renderWithProviders(<StaffMemberDetailPage user={testUser(['owner'])} />);
    expect(await screen.findByText('Privat')).toBeInTheDocument();
    expect(screen.getByText('+49 7071 0000002')).toBeInTheDocument();
  });

  it.each([['therapist'], ['team_lead']] as const)(
    'bietet %s weder Bearbeiten noch Statuswechsel an',
    async (role) => {
      renderWithProviders(<StaffMemberDetailPage user={testUser([role])} />);
      await screen.findByRole('heading', { name: 'Anna Beispiel' });
      expect(screen.queryByRole('link', { name: 'Stammdaten bearbeiten' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Als inaktiv führen' })).not.toBeInTheDocument();
    },
  );

  // E10 teilt die beiden Rechte: das Office pflegt Stammdaten, der
  // Statuswechsel bleibt bei der Praxisinhaberin.
  it('bietet office das Bearbeiten an, aber keinen Statuswechsel', async () => {
    renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
    expect(await screen.findByRole('link', { name: 'Stammdaten bearbeiten' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Als inaktiv führen' })).not.toBeInTheDocument();
  });

  it('bietet owner die Verwaltung an', async () => {
    renderWithProviders(<StaffMemberDetailPage user={testUser(['owner'])} />);
    const link = await screen.findByRole('link', { name: 'Stammdaten bearbeiten' });
    expect(link).toHaveAttribute('href', `/praxis/team/${STAFF_ID}/bearbeiten`);
    expect(screen.getByRole('button', { name: 'Als inaktiv führen' })).toBeInTheDocument();
  });

  it('schreibt erst nach der Rueckfrage', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StaffMemberDetailPage user={testUser(['owner'])} />);

    await user.click(await screen.findByRole('button', { name: 'Als inaktiv führen' }));
    expect(setStaffEmploymentStatus).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Als inaktiv führen' }));
    await waitFor(() => expect(setStaffEmploymentStatus).toHaveBeenCalledTimes(1));
    expect(letzterStatusaufruf()).toEqual({
      id: STAFF_ID,
      status: 'inactive',
      bestaetigt: false,
    });
  });

  it('sagt in der Rueckfrage zu, dass bestehende Zuordnungen erhalten bleiben', async () => {
    const user = userEvent.setup();
    renderWithProviders(<StaffMemberDetailPage user={testUser(['owner'])} />);

    await user.click(await screen.findByRole('button', { name: 'Als inaktiv führen' }));
    expect(screen.getByText(/bleiben vollständig erhalten/)).toBeInTheDocument();
    expect(
      screen.getByText(/Zugang zur Anwendung wird dadurch nicht gesperrt/),
    ).toBeInTheDocument();
  });

  it('zeigt die offenen Termine, wenn der Server die Deaktivierung abweist', async () => {
    const user = userEvent.setup();
    setStaffEmploymentStatus.mockRejectedValueOnce(new OffeneTermineError());
    fetchStaffFutureAppointments.mockResolvedValue([
      {
        id: '77777777-7777-4777-8777-000000000001',
        starts_at: '2026-09-15T08:00:00.000Z',
        ends_at: '2026-09-15T09:00:00.000Z',
        appointment_type: 'home_visit',
        patient_id: '66666666-6666-4666-8666-000000000001',
        kind: 'treatment' as const,
        title: null,
        patient_given_name: 'Max',
        patient_family_name: 'Mustermann',
        location_name: null,
      },
    ]);

    renderWithProviders(<StaffMemberDetailPage user={testUser(['owner'])} />);
    await user.click(await screen.findByRole('button', { name: 'Als inaktiv führen' }));
    await user.click(screen.getByRole('button', { name: 'Als inaktiv führen' }));

    expect(await screen.findByText(/noch Termine in der Zukunft geplant/)).toBeInTheDocument();
    expect(await screen.findByText(/Max Mustermann/)).toBeInTheDocument();
    // Der abgewiesene Vorgang hat nichts geschrieben: der Status steht noch.
    expect(screen.getByText(/weder abgesagt noch umgebucht/)).toBeInTheDocument();
  });

  it('wiederholt den Vorgang erst nach ausdruecklicher Bestaetigung', async () => {
    const user = userEvent.setup();
    setStaffEmploymentStatus.mockRejectedValueOnce(new OffeneTermineError());
    fetchStaffFutureAppointments.mockResolvedValue([]);

    renderWithProviders(<StaffMemberDetailPage user={testUser(['owner'])} />);
    await user.click(await screen.findByRole('button', { name: 'Als inaktiv führen' }));
    await user.click(screen.getByRole('button', { name: 'Als inaktiv führen' }));

    const erneut = await screen.findByRole('button', {
      name: 'Trotz offener Termine deaktivieren',
    });
    expect(setStaffEmploymentStatus).toHaveBeenCalledTimes(1);
    expect(letzterStatusaufruf().bestaetigt).toBe(false);

    await user.click(erneut);
    await waitFor(() => expect(setStaffEmploymentStatus).toHaveBeenCalledTimes(2));
    expect(letzterStatusaufruf().bestaetigt).toBe(true);
  });

  it('bietet bei einer inaktiven Person die Reaktivierung an', async () => {
    const user = userEvent.setup();
    fetchStaffMember.mockResolvedValue({ ...aktiv, employment_status: 'inactive' });

    renderWithProviders(<StaffMemberDetailPage user={testUser(['owner'])} />);
    await user.click(await screen.findByRole('button', { name: 'Wieder als aktiv führen' }));
    await user.click(screen.getByRole('button', { name: 'Wieder als aktiv führen' }));

    await waitFor(() => expect(setStaffEmploymentStatus).toHaveBeenCalledTimes(1));
    expect(letzterStatusaufruf().status).toBe('active');
  });

  it('zeigt eine verstaendliche Meldung, wenn der Datensatz nicht sichtbar ist', async () => {
    fetchStaffMember.mockResolvedValue(null);
    renderWithProviders(<StaffMemberDetailPage user={testUser(['office'])} />);
    expect(await screen.findByText('Nicht gefunden')).toBeInTheDocument();
  });
});
