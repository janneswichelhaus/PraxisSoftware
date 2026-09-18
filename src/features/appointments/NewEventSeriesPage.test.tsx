import { beforeEach, describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type * as AppointmentsApi from './api';
import type * as StaffApi from '@/features/staff/api';
import type * as RouterModul from 'react-router-dom';
import { renderWithProviders, testUser } from '@/test-utils';

/**
 * Dauerfehlzeit eintragen (CAL-021).
 *
 * Geprüft wird, dass die Seite eine **Serie** meint und das auch sagt: der
 * erste Tag heißt so, die Tage stehen vor dem Eintragen da, und der Vorgang
 * geht mit allen Tagen zugleich an den Server. Was eine Fehlzeit ausmacht -
 * keine Patient:in, keine Verordnung, keine Leistung - gilt wie beim
 * einzelnen Ereignis.
 */

const ANNA = '55555555-5555-4555-8555-000000000002';
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
];

const fetchStaffMembers = vi.fn();
const fetchLocations = vi.fn();
const createEventSeries = vi.fn();
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
    createEventSeries: (
      werte: AppointmentsApi.EreignisFormValues,
      tage: readonly string[],
      bestaetigt: boolean,
    ) => createEventSeries(werte, tage, bestaetigt) as Promise<string>,
  };
});

vi.mock('react-router-dom', async (importOriginal) => ({
  ...(await importOriginal<typeof RouterModul>()),
  useNavigate: () => navigate,
}));

const { NewEventSeriesPage } = await import('./NewEventSeriesPage');

function rendern(pfad = '/termine/dauerfehlzeit?datum=2027-05-12&beginn=09:00&ende=10:30') {
  return renderWithProviders(
    <NewEventSeriesPage user={testUser(['office'], 'Olivia Office')} />,
    pfad,
  );
}

async function formularAbwarten() {
  await screen.findByLabelText('Bezeichnung *');
}

describe('NewEventSeriesPage', () => {
  beforeEach(() => {
    fetchStaffMembers.mockReset().mockResolvedValue(personen);
    fetchLocations.mockReset().mockResolvedValue([{ id: ORT, name: 'Hauptstandort' }]);
    createEventSeries.mockReset().mockResolvedValue('serie-1');
    navigate.mockReset();
  });

  it('nennt den ersten Tag als solchen und uebernimmt die aufgezogene Spanne', async () => {
    rendern();
    await formularAbwarten();

    expect(screen.getByLabelText('Erste Fehlzeit am *')).toHaveValue('2027-05-12');
    expect(screen.getByLabelText('Beginn *')).toHaveValue('09:00');
    expect(screen.getByLabelText('Ende *')).toHaveValue('10:30');
    // Ein Ereignis kennt keine Patient:in und keine Verordnung.
    expect(screen.queryByLabelText(/Patient/)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Verordnung/)).not.toBeInTheDocument();
  });

  /**
   * Die Bezeichnung steht als Aufschrift im Kalender und ist damit für alle
   * sichtbar, die den Kalender sehen - deshalb sagt das Feld, was hinein darf
   * und was nicht (ANN-060).
   */
  it('sagt an der Bezeichnung, dass sie organisatorisch ist', async () => {
    rendern();
    await formularAbwarten();

    expect(screen.getByText(/kein Patientenname, keine Diagnose/)).toBeInTheDocument();
  });

  it('zeigt die Tage der Serie vor dem Eintragen', async () => {
    rendern();
    await formularAbwarten();

    // Sechs Vorkommen sind vorbelegt, wöchentlich ab dem 12.05.2027.
    expect(screen.getByText('6 Fehlzeiten, jeweils 09:00–10:30 Uhr')).toBeInTheDocument();
    expect(screen.getByText('12.05.2027')).toBeInTheDocument();
    expect(screen.getByText('16.06.2027')).toBeInTheDocument();
  });

  it('rechnet den gewaehlten Rhythmus', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.selectOptions(screen.getByLabelText('Rhythmus *'), 'zweiwoechentlich');

    expect(screen.getByText('26.05.2027')).toBeInTheDocument();
    expect(screen.queryByText('19.05.2027')).not.toBeInTheDocument();
  });

  it('traegt die Serie mit allen Tagen in einem Vorgang ein', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.type(screen.getByLabelText('Bezeichnung *'), 'Teammeeting');
    await user.click(screen.getByLabelText('Anna Beispiel'));
    await user.clear(screen.getByLabelText('Anzahl Fehlzeiten *'));
    await user.type(screen.getByLabelText('Anzahl Fehlzeiten *'), '3');
    await user.click(screen.getByRole('button', { name: '3 Fehlzeiten eintragen' }));

    await waitFor(() => expect(createEventSeries).toHaveBeenCalledTimes(1));
    expect(createEventSeries).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Teammeeting', start_time: '09:00', end_time: '10:30' }),
      ['2027-05-12', '2027-05-19', '2027-05-26'],
      false,
    );
    await waitFor(() => expect(navigate).toHaveBeenCalled());
  });

  it('meldet fehlende Pflichtangaben inline und sendet nicht', async () => {
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.click(screen.getByRole('button', { name: '6 Fehlzeiten eintragen' }));

    expect(await screen.findByText('Bezeichnung ist erforderlich.')).toBeInTheDocument();
    expect(createEventSeries).not.toHaveBeenCalled();
  });

  /** Dieselbe Rückfrage wie beim einzelnen Ereignis (CAL-005). */
  it('fragt bei einer Zeit ausserhalb der Arbeitszeit nach', async () => {
    const { AusserhalbArbeitszeitError } = await import('./api');
    createEventSeries.mockRejectedValueOnce(new AusserhalbArbeitszeitError());
    const user = userEvent.setup();
    rendern();
    await formularAbwarten();

    await user.type(screen.getByLabelText('Bezeichnung *'), 'Teammeeting');
    await user.click(screen.getByRole('button', { name: '6 Fehlzeiten eintragen' }));

    expect(
      await screen.findByRole('dialog', { name: 'Außerhalb der Arbeitszeit' }),
    ).toBeInTheDocument();

    createEventSeries.mockResolvedValueOnce('serie-1');
    await user.click(screen.getByRole('button', { name: 'Trotzdem eintragen' }));

    await waitFor(() => expect(createEventSeries).toHaveBeenCalledTimes(2));
    expect(createEventSeries).toHaveBeenLastCalledWith(expect.any(Object), expect.any(Array), true);
  });

  it('zeigt einer Rolle ohne Terminverwaltung nichts an', async () => {
    renderWithProviders(
      <NewEventSeriesPage user={testUser(['patient'], 'Olivia Office')} />,
      '/termine/dauerfehlzeit',
    );

    expect(await screen.findByText('Nicht freigegeben')).toBeInTheDocument();
    expect(screen.queryByLabelText('Bezeichnung *')).not.toBeInTheDocument();
  });
});
