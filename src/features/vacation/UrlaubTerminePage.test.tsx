import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { pruefeBarrierefreiheit } from '@/barrierefreiheit';
import { testUser } from '@/test-utils';
import type * as AppointmentsApi from '@/features/appointments/api';
import { STAFF } from './testdaten';
import { terminePfad } from './termine';

/**
 * Termine im Urlaub (URL-001, Praxis-Review Überholung 7): Der Rückweg jedes
 * „Tag umplanen“ führt hierher, und die Seite zählt neu - so bleiben die
 * übrigen Tage im Blick, bis alles umgeplant ist.
 */

const fetchAppointments = vi.fn();
const fetchAssignableTherapists = vi.fn();

vi.mock('@/features/appointments/api', async (importOriginal) => {
  const actual = await importOriginal<typeof AppointmentsApi>();
  return {
    ...actual,
    fetchAppointments: (...a: unknown[]) => fetchAppointments(...a) as unknown,
    fetchAssignableTherapists: (...a: unknown[]) => fetchAssignableTherapists(...a) as unknown,
  };
});

const { UrlaubTerminePage } = await import('./UrlaubTerminePage');

/** Ein bestätigter Termin um 9 Uhr Ortszeit (UTC+1 im November). */
function termin(tag: string) {
  return { id: `t-${tag}`, staff_member_id: STAFF.anna, starts_at: `${tag}T08:00:00Z` };
}

function rendern(pfad: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/betrieb/urlaub/termine',
        element: <UrlaubTerminePage user={testUser(['owner'], 'Jannes Test')} />,
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

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-04T08:00:00Z'));
  fetchAppointments.mockReset().mockResolvedValue([]);
  fetchAssignableTherapists
    .mockReset()
    .mockResolvedValue([{ staff_member_id: STAFF.anna, display_name: 'Anna Beispiel' }]);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('UrlaubTerminePage', () => {
  it('zählt ab heute neu und führt jeden Tag hierher zurück', async () => {
    fetchAppointments.mockResolvedValue([
      termin('2026-11-05'),
      termin('2026-11-05'),
      termin('2026-11-10'),
    ]);
    const pfad = terminePfad(STAFF.anna, '2026-11-02', '2026-11-13', '/offen');
    rendern(pfad);

    expect(
      await screen.findByRole('heading', { name: 'Termine umplanen (3)' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Anna Beispiel · 2.–13. Nov.')).toBeInTheDocument();
    // Was vor heute lag, ist vorbei: gefragt wird ab dem 4. November.
    expect(fetchAppointments).toHaveBeenCalledWith({
      von: '2026-11-04',
      bis: '2026-11-13',
      person: STAFF.anna,
      standort: null,
      status: 'confirmed',
    });
    const tag = screen.getByRole('link', { name: 'Tag umplanen: Donnerstag, 5. November' });
    const ziel = new URL(tag.getAttribute('href')!, 'http://praxis.test');
    expect(ziel.pathname).toBe('/kalender/tag-umplanen');
    expect(ziel.searchParams.get('datum')).toBe('2026-11-05');
    expect(ziel.searchParams.get('zurueck')).toBe(pfad);
    expect(screen.getByText('2 Termine')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '← Zurück zu den offenen Punkten' })).toHaveAttribute(
      'href',
      '/offen',
    );
    await act(() => pruefeBarrierefreiheit(document.body));
  });

  it('sagt, wenn nichts mehr umzuplanen ist, und führt dorthin, woher es kam', async () => {
    rendern(terminePfad(STAFF.anna, '2026-11-02', '2026-11-13', '/offen'));
    expect(await screen.findByText('Keine Termine mehr im Urlaub')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Fertig' })).toHaveAttribute('href', '/offen');
  });

  it('fragt einen langen Urlaub in Fenstern ab, die der Server annimmt', async () => {
    fetchAppointments.mockImplementation(({ von }: { von: string }) =>
      Promise.resolve(von === '2026-12-02' ? [termin('2026-12-10')] : []),
    );
    rendern(terminePfad(STAFF.anna, '2026-11-04', '2026-12-20', '/betrieb/urlaub'));
    expect(
      await screen.findByRole('link', { name: 'Tag umplanen: Donnerstag, 10. Dezember' }),
    ).toBeInTheDocument();
    const fenster = fetchAppointments.mock.calls.map(
      ([q]) => [(q as { von: string }).von, (q as { bis: string }).bis] as const,
    );
    expect(fenster).toEqual([
      ['2026-11-04', '2026-12-01'],
      ['2026-12-02', '2026-12-20'],
    ]);
  });

  it('nimmt aus der Adresse nur einen Zeitraum mit Person', async () => {
    rendern('/betrieb/urlaub/termine?von=2026-11-02&bis=2026-11-13');
    expect(await screen.findByText('Keine Termine mehr im Urlaub')).toBeInTheDocument();
    expect(fetchAppointments).not.toHaveBeenCalled();
    expect(within(document.body).getByRole('link', { name: 'Fertig' })).toHaveAttribute(
      'href',
      '/betrieb/urlaub',
    );
  });

  it('bietet im Funkloch einen neuen Versuch an', async () => {
    fetchAppointments.mockRejectedValue(new Error('Die Termine konnten nicht geladen werden.'));
    rendern(terminePfad(STAFF.anna, '2026-11-02', '2026-11-13', '/offen'));
    expect(
      await screen.findByText('Die Termine konnten nicht geladen werden.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Erneut versuchen' })).toBeInTheDocument();
  });
});
