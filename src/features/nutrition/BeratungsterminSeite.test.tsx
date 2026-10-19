import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type * as ErnaehrungApi from './api';
import type * as AppointmentsApi from '@/features/appointments/api';
import { testUser } from '@/test-utils';
import { BeratungsterminSeite } from './BeratungsterminSeite';

const fetchErnaehrung = vi.fn();
const beratungsterminAnlegen = vi.fn();

vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof ErnaehrungApi>()),
  fetchErnaehrung: (...args: unknown[]) => fetchErnaehrung(...args) as unknown,
  beratungsterminAnlegen: (...args: unknown[]) => beratungsterminAnlegen(...args) as unknown,
}));

const fetchAssignableTherapists = vi.fn();
const fetchAssignableTrainers = vi.fn();
vi.mock('@/features/appointments/api', async (importOriginal) => ({
  ...(await importOriginal<typeof AppointmentsApi>()),
  fetchAssignableTherapists: () => fetchAssignableTherapists() as unknown,
  fetchAssignableTrainers: () => fetchAssignableTrainers() as unknown,
  fetchLocations: () => Promise.resolve([{ id: 'ort-1', name: 'Hauptstandort Tuebingen' }]),
}));

const PATIENT = '66666666-6666-4666-8666-000000000002';

function sicht(einwilligung: 'granted' | 'withdrawn', beendet: string | null = null) {
  return {
    today: '2027-05-12',
    relationship_open: true,
    birth_date_known: true,
    running_elsewhere: null,
    earlier_count: 0,
    profile: {
      id: 'f0f0f0f0-f0f0-4f0f-8f0f-000000000001',
      ended_on: beendet,
      consent: { state: einwilligung, occurred_on: '2027-04-01', source: 'paper' },
    },
  };
}

function seite(pfad: string, art: 'treatment' | 'training') {
  const router = createMemoryRouter(
    [
      {
        path:
          art === 'treatment'
            ? '/patienten/:patientId/ernaehrung/termin'
            : '/training/:relationshipId/ernaehrung/termin',
        element: <BeratungsterminSeite art={art} user={testUser(['owner'], 'Jannes Test')} />,
      },
    ],
    { initialEntries: [pfad] },
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('BeratungsterminSeite (ERN-012)', () => {
  beforeEach(() => {
    fetchErnaehrung.mockReset();
    beratungsterminAnlegen.mockReset();
    fetchAssignableTherapists.mockReset();
    fetchAssignableTrainers.mockReset();
    fetchAssignableTherapists.mockResolvedValue([
      { staff_member_id: '55555555-5555-4555-8555-000000000001', display_name: 'Jannes Test' },
    ]);
    fetchAssignableTrainers.mockResolvedValue([
      { staff_member_id: '55555555-5555-4555-8555-000000000006', display_name: 'Tom Training' },
    ]);
  });

  it('an der Akte: Formular mit den Behandelnden', async () => {
    fetchErnaehrung.mockResolvedValue(sicht('granted'));
    seite(`/patienten/${PATIENT}/ernaehrung/termin`, 'treatment');

    expect(await screen.findByRole('heading', { name: 'Beratungstermin anlegen' })).toBeVisible();
    expect(await screen.findByLabelText(/Behandelnde Person/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Beratungstermin anlegen' })).toBeEnabled();
    expect(fetchErnaehrung).toHaveBeenCalledWith('treatment', PATIENT);
    expect(fetchAssignableTrainers).not.toHaveBeenCalled();
  });

  it('am Trainingsverhältnis: Formular mit der Betreuung', async () => {
    fetchErnaehrung.mockResolvedValue(sicht('granted'));
    seite('/training/eeeeeeee-eeee-4eee-8eee-000000000001/ernaehrung/termin', 'training');

    expect(await screen.findByLabelText(/Betreuende Person/)).toBeInTheDocument();
    expect(fetchAssignableTherapists).not.toHaveBeenCalled();
  });

  it('ohne Einwilligung kein Formular', async () => {
    fetchErnaehrung.mockResolvedValue(sicht('withdrawn'));
    seite(`/patienten/${PATIENT}/ernaehrung/termin`, 'treatment');

    expect(
      await screen.findByText('Keine laufende Ernährungsberatung mit Einwilligung'),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Beratungstermin anlegen' })).toBeNull();
  });
});
