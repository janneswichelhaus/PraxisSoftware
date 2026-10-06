import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type { DayPlanEntry } from '@/features/today/api';
import type { Stopp } from './tagesroute';

/**
 * MAP-006c: Die Fahrzeiten kommen aus **einer** Route; geprüft wird jedes
 * aufeinanderfolgende Paar vom Server.
 */

const { rpc, invoke, faktor } = vi.hoisted(() => ({
  rpc: vi.fn(),
  invoke: vi.fn(),
  faktor: { wert: 2 },
}));

// UBK-010: Der Fahrzeitfaktor der Praxis kommt aus der Organisation.
const organisation = {
  select: () => ({
    maybeSingle: () => Promise.resolve({ data: { travel_time_factor: faktor.wert }, error: null }),
  }),
};

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc, functions: { invoke }, from: () => organisation }),
}));

const { useFahrten, useTagesstopps } = await import('./fahrpuffer');

function stopp(nummer: number, lat: number | null): Stopp {
  return {
    nummer,
    termin: { id: `t${nummer}`, appointment_type: 'home_visit' } as DayPlanEntry,
    position: lat === null ? null : { lat, lon: 9 },
    genauigkeit: lat === null ? null : 'address',
  };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  rpc.mockReset();
  invoke.mockReset();
});

describe('useFahrten', () => {
  it('ruft eine Route ab und laesst jedes Paar mit bekannter Fahrzeit pruefen', async () => {
    invoke.mockResolvedValue({
      data: {
        ok: true,
        quelle: 'nachbildung',
        value: {
          distanceMeters: 2000,
          durationSeconds: 900,
          legs: [
            { distanceMeters: 1000, durationSeconds: 300 },
            { distanceMeters: 1000, durationSeconds: 600 },
          ],
          geometry: [],
        },
      },
      error: null,
    });
    rpc.mockResolvedValue({
      data: [
        {
          from_appointment_id: 't1',
          to_appointment_id: 't2',
          travel_seconds: 600,
          earliest_start: '2026-09-10T08:10:00Z',
          shortfall_minutes: 0,
        },
      ],
      error: null,
    });

    const stopps = [stopp(1, 48.5), stopp(2, 48.51), stopp(3, null), stopp(4, 48.52)];
    const { result } = renderHook(() => useFahrten(null, stopps), { wrapper });

    await waitFor(() => expect(result.current.zwischen[0]!.pruefung).not.toBeNull());
    expect(invoke).toHaveBeenCalledTimes(1);
    // Nur Koordinaten gehen zur Route - drei Punkte, der Stopp ohne Position fehlt.
    const koerper = (invoke.mock.calls[0]![1] as { body: { waypoints: unknown[] } }).body;
    expect(koerper.waypoints).toHaveLength(3);

    // UBK-010: 300 s des Kartendienstes mal Faktor 2 - angezeigt und geprüft
    // wird dieselbe Zahl.
    expect(result.current.zwischen.map((z) => z.sekunden)).toEqual([600, null, null]);
    expect(result.current.zwischen[0]!.meter).toBe(1000);
    expect(rpc).toHaveBeenCalledWith('check_travel_buffers', {
      p_legs: [{ from: 't1', to: 't2', travel_seconds: 600 }],
    });
  });

  it('laedt Tagesliste und Route nach einem Fehler erneut, ohne die Seite neu zu laden (ZST-04)', async () => {
    let planVersuche = 0;
    rpc.mockImplementation((name: string) => {
      if (name === 'list_day_plan') {
        planVersuche += 1;
        // Der erste Abruf scheitert - das Funkloch -, der zweite nicht.
        return Promise.resolve(
          planVersuche === 1 ? { data: null, error: { message: 'x' } } : { data: [], error: null },
        );
      }
      return Promise.resolve({ data: [], error: null });
    });

    const { result } = renderHook(() => useTagesstopps('2026-09-10', 'anna'), { wrapper });
    await waitFor(() => expect(result.current.fehler).toBe(true));

    await act(async () => {
      await result.current.erneut();
    });

    // Die Abfrage meldet ihr Ergebnis gebündelt; gewartet wird darauf.
    await waitFor(() => expect(result.current.fehler).toBe(false));
    expect(planVersuche).toBe(2);
    expect(rpc).toHaveBeenCalledWith('list_day_route', {
      p_date: '2026-09-10',
      p_staff_member_id: 'anna',
    });
  });

  it('prueft nichts, wenn die Route fehlt', async () => {
    invoke.mockResolvedValue({
      data: { ok: false, error: { code: 'not_configured', message: 'x' } },
      error: null,
    });
    const { result } = renderHook(() => useFahrten(null, [stopp(1, 48.5), stopp(2, 48.51)]), {
      wrapper,
    });
    await waitFor(() => expect(result.current.route.isFetched).toBe(true));
    expect(result.current.zwischen[0]!.sekunden).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
});
