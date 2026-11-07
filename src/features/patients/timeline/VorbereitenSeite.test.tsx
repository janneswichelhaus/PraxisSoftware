import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type * as ZeitstrahlApi from './api';
import type { Vorbereitung } from './api';
import type * as Uebungen from '@/features/exercise';
import { VorbereitenSeite } from './VorbereitenSeite';

const fetchVorbereitung = vi.fn<() => Promise<Vorbereitung | null>>();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof ZeitstrahlApi>()),
  fetchVorbereitung: () => fetchVorbereitung(),
}));
const fetchCheckins = vi.fn();
vi.mock('@/features/exercise', async (importOriginal) => ({
  ...(await importOriginal<typeof Uebungen>()),
  fetchCheckins: () => fetchCheckins() as unknown,
}));
vi.mock('../record/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchPatient: () =>
    Promise.resolve({ id: PATIENT, given_name: 'Erika', family_name: 'Beispiel' }),
}));

const PATIENT = '66666666-6666-4666-8666-000000000002';

function vorbereitung(teil: Partial<Vorbereitung> = {}): Vorbereitung {
  return {
    today: '2026-11-07',
    time_zone: 'Europe/Berlin',
    last_session_on: '2026-11-03',
    next_appointment: {
      id: 't9',
      starts_at: '2026-11-10T09:30:00Z',
      ends_at: '2026-11-10T10:30:00Z',
      appointment_type: 'home_visit',
    },
    open_messages: [{ id: 'm1', topic: 'complaint', due_on: '2026-11-09', overdue: false }],
    checkin_due_on: null,
    plans_review: [],
    documentation_open: [],
    goals: [
      {
        treatment_basis_id: 'b1',
        issued_on: '2026-09-08',
        kind: 'follow_up',
        text: 'Treppe ohne Geländer.',
      },
    ],
    ...teil,
  };
}

function checkins() {
  return {
    today: '2026-11-07',
    can_write: false,
    relationship_open: true,
    schedule: null,
    checkins: [
      {
        answered_on: '2026-11-01',
        recorded_at: '2026-11-01T08:00:00Z',
        recorded_by_kind: 'self',
        values: { pain_rest: 4 },
      },
      {
        answered_on: '2026-11-05',
        recorded_at: '2026-11-05T08:00:00Z',
        recorded_by_kind: 'self',
        values: { pain_rest: 3 },
      },
    ],
    time_zone: 'Europe/Berlin',
    sessions: [],
    events: [],
    plan_events: [],
    appointment_days: ['2026-11-03'],
    events_writable: false,
    health_consent: null,
    habits: [],
    habits_max: 3,
    habits_writable: false,
  };
}

function zeige() {
  const router = createMemoryRouter(
    [{ path: '/patienten/:patientId/vorbereiten', element: <VorbereitenSeite /> }],
    { initialEntries: [`/patienten/${PATIENT}/vorbereiten`] },
  );
  render(
    <QueryClientProvider
      client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}
    >
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  fetchVorbereitung.mockReset().mockResolvedValue(vorbereitung());
  fetchCheckins.mockReset().mockResolvedValue(checkins());
});

describe('Sitzung vorbereiten (ORG-003)', () => {
  it('zu tun, seit dem letzten Mal und Ziele in einer Ansicht', async () => {
    zeige();
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Sitzung vorbereiten' }),
    ).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Zu tun (1)' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Rückfrage beantworten: Beschwerden/ })).toBeVisible();
    // Nur der Check-in nach der Behandlung am 03.11. zählt.
    expect(
      await screen.findByText('1 Check-in und 0 Einheiten seit der letzten Behandlung'),
    ).toBeVisible();
    expect(screen.getByText('Treppe ohne Geländer.')).toBeVisible();
    expect(screen.getByText('Folgeverordnung vom 08.09.2026')).toBeVisible();
  });

  it('nichts offen und ohne Recht auf die Angaben: nichts erfunden', async () => {
    fetchVorbereitung.mockResolvedValue(
      vorbereitung({ open_messages: [], goals: null, last_session_on: null }),
    );
    fetchCheckins.mockResolvedValue(null);
    zeige();
    expect(await screen.findByText('Nichts offen')).toBeVisible();
    expect(await screen.findByText('Nicht freigegeben')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Ziele' })).toBeNull();
  });

  it('ohne Recht: nicht gefunden', async () => {
    fetchVorbereitung.mockResolvedValue(null);
    zeige();
    expect(await screen.findByText('Nicht gefunden')).toBeVisible();
  });
});
