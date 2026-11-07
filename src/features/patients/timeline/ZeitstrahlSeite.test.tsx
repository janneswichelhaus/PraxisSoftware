import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import type * as ZeitstrahlApi from './api';
import type { Zeitstrahlfenster } from './api';
import { ZeitstrahlSeite } from './ZeitstrahlSeite';

const fetchZeitstrahl =
  vi.fn<(id: string, bis: string | null) => Promise<Zeitstrahlfenster | null>>();
vi.mock('./api', async (importOriginal) => ({
  ...(await importOriginal<typeof ZeitstrahlApi>()),
  fetchZeitstrahl: (id: string, bis: string | null) => fetchZeitstrahl(id, bis),
}));
vi.mock('../record/api', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  fetchPatient: () =>
    Promise.resolve({ id: PATIENT, given_name: 'Erika', family_name: 'Beispiel' }),
}));

const PATIENT = '66666666-6666-4666-8666-000000000002';

function fenster(teil: Partial<Zeitstrahlfenster>): Zeitstrahlfenster {
  return {
    today: '2026-11-07',
    time_zone: 'Europe/Berlin',
    from: '2026-08-08',
    to: null,
    has_more: true,
    entries: [
      {
        on: '2026-11-10',
        at: '2026-11-10T09:00:00Z',
        kind: 'appointment',
        state: 'confirmed',
        label: 'home_visit',
        detail: 'none',
        ref: 't2',
      },
      {
        on: '2026-11-03',
        at: '2026-11-03T08:00:00Z',
        kind: 'message',
        state: 'open',
        label: 'complaint',
        detail: null,
        ref: 'm1',
      },
      {
        on: '2026-10-20',
        at: null,
        kind: 'checkin',
        state: 'self',
        label: null,
        detail: null,
        ref: null,
      },
    ],
    ...teil,
  };
}

function zeige() {
  const router = createMemoryRouter(
    [{ path: '/patienten/:patientId/zeitstrahl', element: <ZeitstrahlSeite /> }],
    { initialEntries: [`/patienten/${PATIENT}/zeitstrahl`] },
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
  fetchZeitstrahl.mockReset().mockImplementation((_id, bis) =>
    Promise.resolve(
      bis === null
        ? fenster({})
        : fenster({
            from: '2026-05-08',
            to: bis,
            has_more: false,
            entries: [
              {
                on: '2026-06-18',
                at: null,
                kind: 'treatment_basis',
                state: null,
                label: 'follow_up',
                detail: null,
                ref: 'b1',
              },
            ],
          }),
    ),
  );
});

describe('Zeitstrahl (ORG-002)', () => {
  it('neueste zuerst je Monat, mit Stand als Wort und Weg zur Quelle', async () => {
    zeige();
    expect(await screen.findByRole('heading', { level: 1, name: 'Zeitstrahl' })).toBeVisible();
    expect(await screen.findByText('Erika Beispiel')).toBeVisible();
    expect(screen.getByRole('heading', { name: 'November 2026 (2)' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Oktober 2026 (1)' })).toBeVisible();
    expect(screen.getByRole('link', { name: /Rückfrage: Beschwerden/ })).toHaveAttribute(
      'href',
      expect.stringContaining('/rueckfragen/m1'),
    );
    expect(screen.getByText('Offen')).toBeVisible();
    expect(screen.getByText('Check-in')).toBeVisible();
  });

  it('„Weiter zurück“ holt das Fenster vor dem ersten und endet dort', async () => {
    zeige();
    await userEvent.click(await screen.findByRole('button', { name: 'Weiter zurück' }));
    expect(await screen.findByText('Folgeverordnung')).toBeVisible();
    expect(fetchZeitstrahl).toHaveBeenLastCalledWith(PATIENT, '2026-08-07');
    expect(screen.queryByRole('button', { name: 'Weiter zurück' })).toBeNull();
  });

  it('ohne Recht: nicht gefunden, nichts erfunden', async () => {
    fetchZeitstrahl.mockResolvedValue(null);
    zeige();
    expect(await screen.findByText('Nicht gefunden')).toBeVisible();
  });
});
