import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as StaffApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testUser } from '@/test-utils';

const createStaffMember = vi.fn();
const fetchLocations = vi.fn();
const navigate = vi.fn();

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof StaffApi>();
  return {
    ...actual,
    createStaffMember: (values: StaffApi.StaffMasterDataValues) =>
      createStaffMember(values) as Promise<string>,
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
}));

const { NewStaffMemberPage } = await import('./NewStaffMemberPage');

describe('NewStaffMemberPage', () => {
  beforeEach(() => {
    createStaffMember.mockReset();
    fetchLocations.mockReset();
    navigate.mockReset();
    createStaffMember.mockResolvedValue('55555555-5555-4555-8555-0000000000aa');
    fetchLocations.mockResolvedValue([
      { id: '33333333-3333-4333-8333-000000000001', name: 'Hauptstandort Tuebingen' },
    ]);
  });

  it('verlangt Vor- und Nachname', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await user.click(screen.getByRole('button', { name: 'Mitarbeiter:in anlegen' }));

    expect(await screen.findByText('Vorname ist erforderlich.')).toBeInTheDocument();
    expect(screen.getByText('Nachname ist erforderlich.')).toBeInTheDocument();
    expect(createStaffMember).not.toHaveBeenCalled();
  });

  it('fuehrt aus der Fehlerzusammenfassung ins Feld', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await user.click(screen.getByRole('button', { name: 'Mitarbeiter:in anlegen' }));

    const kasten = await screen.findByRole('alert');
    expect(kasten).toHaveTextContent('Nachname: Nachname ist erforderlich.');

    await user.click(screen.getByRole('link', { name: 'Nachname: Nachname ist erforderlich.' }));
    expect(screen.getByLabelText('Nachname *')).toHaveFocus();
  });

  it('nennt dem Office keine Privatangabe, die es gar nicht sieht', async () => {
    // Ohne Privatzugriff fehlt der Abschnitt (ANN-024); ein Eintrag dorthin
    // fuehrte ins Leere.
    const user = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['office'])} />);

    expect(screen.queryByLabelText('Private E-Mail')).toBeNull();
    await user.click(screen.getByRole('button', { name: 'Mitarbeiter:in anlegen' }));

    const kasten = await screen.findByRole('alert');
    expect(kasten).toHaveTextContent('Vorname: Vorname ist erforderlich.');
    expect(kasten).not.toHaveTextContent('Private E-Mail');
    expect(kasten).not.toHaveTextContent('Geburtsdatum');
  });

  it('legt an und leitet auf den neuen Datensatz weiter', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await user.type(screen.getByLabelText('Vorname *'), 'Nina');
    await user.type(screen.getByLabelText('Nachname *'), 'Neu');
    await user.type(screen.getByLabelText('Dienstliche E-Mail'), 'nina.neu@praxis.invalid');
    await user.click(screen.getByRole('button', { name: 'Mitarbeiter:in anlegen' }));

    await waitFor(() => expect(createStaffMember).toHaveBeenCalledTimes(1));
    expect(createStaffMember.mock.calls[0]?.[0]).toMatchObject({
      given_name: 'Nina',
      family_name: 'Neu',
      work_email: 'nina.neu@praxis.invalid',
      // Leere Optionalfelder gehen als null, nicht als leerer Text.
      work_phone: null,
      primary_location_id: null,
      date_of_birth: null,
    });
    await waitFor(() =>
      expect(navigate).toHaveBeenCalledWith('/praxis/team/55555555-5555-4555-8555-0000000000aa', {
        replace: true,
      }),
    );
  });

  it('weist eine unbrauchbare E-Mail-Adresse ab', async () => {
    const user = userEvent.setup();
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await user.type(screen.getByLabelText('Vorname *'), 'Nina');
    await user.type(screen.getByLabelText('Nachname *'), 'Neu');
    await user.type(screen.getByLabelText('Private E-Mail'), 'keine-adresse');
    await user.click(screen.getByRole('button', { name: 'Mitarbeiter:in anlegen' }));

    expect(await screen.findByText('Keine gültige E-Mail-Adresse.')).toBeInTheDocument();
    expect(createStaffMember).not.toHaveBeenCalled();
  });

  it('sagt ausdruecklich, dass kein Zugang entsteht', () => {
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);
    expect(screen.getByText(/kein Zugang zur Anwendung/)).toBeInTheDocument();
  });

  it('meldet einen fehlgeschlagenen Schreibvorgang, ohne Details preiszugeben', async () => {
    const user = userEvent.setup();
    createStaffMember.mockRejectedValue(new Error('irgendetwas aus der Datenbank'));
    renderWithProviders(<NewStaffMemberPage user={testUser(['owner'])} />);

    await user.type(screen.getByLabelText('Vorname *'), 'Nina');
    await user.type(screen.getByLabelText('Nachname *'), 'Neu');
    await user.click(screen.getByRole('button', { name: 'Mitarbeiter:in anlegen' }));

    expect(
      await screen.findByText('Der Mitarbeiterdatensatz konnte nicht angelegt werden.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/irgendetwas aus der Datenbank/)).not.toBeInTheDocument();
  });
});
