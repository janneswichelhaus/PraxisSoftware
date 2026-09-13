import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import type * as StaffApi from '@/features/staff/api';
import type * as RouterModule from 'react-router-dom';
import { renderWithProviders, testUser } from '@/test-utils';

/**
 * Ereignis eintragen (CAL-015b, CAL-015c).
 *
 * Ein Ereignis ist ein Termin ohne Patient:in: Bezeichnung statt Name,
 * mehrere Beteiligte statt einer behandelnden Person, freie Länge im
 * Praxisraster. Geprüft wird, dass genau das im Formular ankommt - und dass
 * die Seite nichts anbietet, was ein Ereignis nicht hat.
 */

const ANNA = '55555555-5555-4555-8555-000000000002';
const OLIVIA = '55555555-5555-4555-8555-000000000003';
const ORT = '33333333-3333-4333-8333-000000000001';

const personen: StaffApi.StaffMember[] = [
  {
    id: ANNA,
    person_id: 'p-1',
    given_name: 'Anna',
    family_name: 'Beispiel',
    employment_status: 'active',
    work_email: null,
    work_phone: null,
    primary_location_id: null,
    primary_location_name: null,
    date_of_birth: null,
    private_email: null,
    private_phone: null,
    street: null,
    postal_code: null,
    city: null,
  },
  {
    id: OLIVIA,
    person_id: 'p-2',
    given_name: 'Olivia',
    family_name: 'Office',
    employment_status: 'active',
    work_email: null,
    work_phone: null,
    primary_location_id: null,
    primary_location_name: null,
    date_of_birth: null,
    private_email: null,
    private_phone: null,
    street: null,
    postal_code: null,
    city: null,
  },
  {
    id: '55555555-5555-4555-8555-000000000009',
    person_id: 'p-3',
    given_name: 'Frida',
    family_name: 'Fortgezogen',
    employment_status: 'inactive',
    work_email: null,
    work_phone: null,
    primary_location_id: null,
    primary_location_name: null,
    date_of_birth: null,
    private_email: null,
    private_phone: null,
    street: null,
    postal_code: null,
    city: null,
  },
];

const fetchStaffMembers = vi.fn();
const fetchLocations = vi.fn();
const createAppointmentEvent = vi.fn();
const navigate = vi.fn();

vi.mock('@/features/staff/api', async (importOriginal) => {
  const actual = await importOriginal<typeof StaffApi>();
  return {
    ...actual,
    fetchStaffMembers: () => fetchStaffMembers() as Promise<StaffApi.StaffMember[]>,
  };
});

vi.mock('./api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchLocations: () => fetchLocations() as Promise<AppointmentsApi.Location[]>,
    createAppointmentEvent: (werte: AppointmentsApi.EreignisFormValues, bestaetigt: boolean) =>
      createAppointmentEvent(werte, bestaetigt) as Promise<number>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof RouterModule>();
  return { ...actual, useNavigate: () => navigate };
});

const { NewEventPage } = await import('./NewEventPage');

function rendern(pfad = '/termine/ereignis?datum=2027-05-12') {
  return renderWithProviders(<NewEventPage user={testUser(['office'], 'Olivia Office')} />, pfad);
}

async function formularAbwarten() {
  await screen.findByLabelText('Bezeichnung *');
}

describe('NewEventPage', () => {
  beforeEach(() => {
    fetchStaffMembers.mockReset().mockResolvedValue(personen);
    fetchLocations.mockReset().mockResolvedValue([{ id: ORT, name: 'Hauptstandort' }]);
    createAppointmentEvent.mockReset().mockResolvedValue(2);
    navigate.mockReset();
  });

  it('fragt nach Bezeichnung, Beteiligten und freien Zeiten - nicht nach einer Patient:in', async () => {
    rendern();
    await formularAbwarten();

    expect(screen.getByLabelText('Bezeichnung *')).toBeInTheDocument();
    expect(screen.getByLabelText('Beginn *')).toBeInTheDocument();
    expect(screen.getByLabelText('Ende *')).toBeInTheDocument();
    // Ein Ereignis hat weder Patient:in noch Verordnung noch eine Dauerwahl.
    expect(screen.queryByLabelText(/Patient/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Dauer')).not.toBeInTheDocument();
  });

  it('bietet nur aktive Beschaeftigte an - und nicht nur therapeutische Rollen', async () => {
    rendern();
    await formularAbwarten();

    expect(screen.getByLabelText('Anna Beispiel')).toBeInTheDocument();
    // Das Büro nimmt an einer Teambesprechung teil.
    expect(screen.getByLabelText('Olivia Office')).toBeInTheDocument();
    expect(screen.queryByLabelText('Frida Fortgezogen')).not.toBeInTheDocument();
  });

  /**
   * Dieselbe Regel wie bei der Terminanlage: Eine Auswahl ohne Alternative ist
   * keine Entscheidung. Ohne die Vorbelegung verlangte das Formular ein
   * Pflichtfeld, für das es nur eine Antwort gab — in CI hat genau das den
   * angemeldeten Ereignistest scheitern lassen (FIX-013).
   */
  it('waehlt den einzigen Standort vor', async () => {
    rendern();
    await formularAbwarten();

    await waitFor(() => expect(screen.getByLabelText('Standort *')).toHaveValue(ORT));
  });

  it('waehlt bei mehreren Standorten nichts vor', async () => {
    fetchLocations.mockResolvedValue([
      { id: ORT, name: 'Hauptstandort' },
      { id: '33333333-3333-4333-8333-000000000002', name: 'Zweigstelle' },
    ]);
    rendern();
    await formularAbwarten();

    expect(screen.getByLabelText('Standort *')).toHaveValue('');
  });

  it('uebernimmt Tag und Zeiten aus der angetippten Stelle im Kalender', async () => {
    rendern('/termine/ereignis?datum=2027-05-12&beginn=09:30&ende=10:00');
    await formularAbwarten();

    expect(screen.getByLabelText('Datum *')).toHaveValue('2027-05-12');
    expect(screen.getByLabelText('Beginn *')).toHaveValue('09:30');
    expect(screen.getByLabelText('Ende *')).toHaveValue('10:00');
  });

  it('traegt das Ereignis mit allen Beteiligten ein', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.type(screen.getByLabelText('Bezeichnung *'), 'Teambesprechung');
    await user.click(screen.getByLabelText('Anna Beispiel'));
    await user.selectOptions(screen.getByLabelText('Standort *'), ORT);
    await user.type(screen.getByLabelText('Beginn *'), '08:00');
    await user.type(screen.getByLabelText('Ende *'), '08:25');
    await user.click(screen.getByRole('button', { name: 'Ereignis eintragen' }));

    await waitFor(() => expect(createAppointmentEvent).toHaveBeenCalledTimes(1));
    expect(createAppointmentEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Teambesprechung',
        // Die eigene Person ist vorbelegt, Anna kommt dazu.
        staff_member_ids: expect.arrayContaining([ANNA]) as string[],
        appointment_type: 'practice',
        start_time: '08:00',
        end_time: '08:25',
        location_id: ORT,
      }),
      false,
    );
  });

  it('meldet fehlende Pflichtangaben inline und sendet nicht', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.click(screen.getByRole('button', { name: 'Ereignis eintragen' }));

    expect(await screen.findByText('Bezeichnung ist erforderlich.')).toBeInTheDocument();
    expect(createAppointmentEvent).not.toHaveBeenCalled();
  });

  it('weist ein Ende vor dem Beginn ab', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.type(screen.getByLabelText('Bezeichnung *'), 'Teambesprechung');
    await user.selectOptions(screen.getByLabelText('Standort *'), ORT);
    await user.type(screen.getByLabelText('Beginn *'), '10:00');
    await user.type(screen.getByLabelText('Ende *'), '09:00');
    await user.click(screen.getByRole('button', { name: 'Ereignis eintragen' }));

    expect(await screen.findByText('Das Ende muss nach dem Beginn liegen.')).toBeInTheDocument();
    expect(createAppointmentEvent).not.toHaveBeenCalled();
  });

  /**
   * Dieselbe Rückfrage wie beim Termin (CAL-005): Außerhalb der Arbeitszeit
   * ist eine Warnung, keine Grenze - und der zweite Anlauf schickt dieselben
   * Werte mit ausdrücklicher Bestätigung.
   */
  it('fragt bei einer Zeit ausserhalb der Arbeitszeit nach', async () => {
    const { AusserhalbArbeitszeitError } = await import('./api');
    createAppointmentEvent.mockRejectedValueOnce(new AusserhalbArbeitszeitError());
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.type(screen.getByLabelText('Bezeichnung *'), 'Teambesprechung');
    await user.selectOptions(screen.getByLabelText('Standort *'), ORT);
    await user.type(screen.getByLabelText('Beginn *'), '05:00');
    await user.type(screen.getByLabelText('Ende *'), '05:30');
    await user.click(screen.getByRole('button', { name: 'Ereignis eintragen' }));

    expect(
      await screen.findByRole('group', { name: 'Außerhalb der Arbeitszeit' }),
    ).toBeInTheDocument();

    createAppointmentEvent.mockResolvedValueOnce(1);
    await user.click(screen.getByRole('button', { name: 'Trotzdem eintragen' }));

    await waitFor(() => expect(createAppointmentEvent).toHaveBeenCalledTimes(2));
    expect(createAppointmentEvent).toHaveBeenLastCalledWith(expect.any(Object), true);
  });

  it('zeigt einer Rolle ohne Terminverwaltung nichts an', async () => {
    renderWithProviders(
      <NewEventPage user={testUser(['patient'], 'Olivia Office')} />,
      '/termine/ereignis',
    );

    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
    expect(screen.queryByLabelText('Bezeichnung *')).not.toBeInTheDocument();
  });
});
