import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type * as TagesrouteModul from '@/features/tours/tagesroute';
import type * as StartortModul from '@/features/tours/startort';
import type * as FunktionModul from '@/lib/location/funktion';
import { zeitpunktIn } from './api';

/**
 * UBK-014: Lückenfinder (ANN-239) - freie Lücken in der Arbeitszeit, Fahrweg
 * vom Termin davor (oder vom Startort) zur Patient:in und weiter, zwei
 * Matrizen je Spalte, gerundet im Server.
 */

const { fetchDayRoute, fetchStandorte, rufeFunktionAuf, checkTravelFit, fetchVisitPosition } =
  vi.hoisted(() => ({
    fetchDayRoute: vi.fn(),
    fetchStandorte: vi.fn(),
    rufeFunktionAuf: vi.fn(),
    checkTravelFit: vi.fn(),
    fetchVisitPosition: vi.fn(),
  }));

vi.mock('@/features/tours/tagesroute', async (importOriginal) => ({
  ...(await importOriginal<typeof TagesrouteModul>()),
  fetchDayRoute: (datum: string, person: string) =>
    fetchDayRoute(datum, person) as Promise<TagesrouteModul.Tagesstopp[]>,
}));
vi.mock('@/features/tours/startort', async (importOriginal) => ({
  ...(await importOriginal<typeof StartortModul>()),
  fetchStandorte: () => fetchStandorte() as Promise<StartortModul.Standort[]>,
}));
vi.mock('@/lib/location/funktion', async (importOriginal) => ({
  ...(await importOriginal<typeof FunktionModul>()),
  rufeFunktionAuf: (aufgabe: string, koerper: unknown) =>
    rufeFunktionAuf(aufgabe, koerper) as Promise<unknown>,
}));
vi.mock('@/features/tours/fahrzeitfaktor-api', () => ({
  fetchFahrzeitfaktor: () => Promise.resolve(1),
  saveFahrzeitfaktor: () => Promise.resolve(),
}));
vi.mock('./wegpruefung-api', () => ({
  checkTravelFit: (fragen: unknown) => checkTravelFit(fragen) as Promise<unknown>,
  fetchVisitPosition: (id: string) => fetchVisitPosition(id) as Promise<unknown>,
}));

const { freieLuecken, umfeldDer, useLueckenfinder } = await import('./lueckenfinder');

const ZONE = 'Europe/Berlin';
const TAG = '2027-05-12';
const PRAXIS = { lat: 48.5, lon: 9.05 };
const PATIENTIN = { lat: 48.53, lon: 9.07 };

function minute(zeit: string): number {
  const [h, m] = zeit.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

function stopp(id: string, von: string, bis: string, lat: number | null) {
  return {
    id,
    kind: 'therapy',
    appointment_type: 'home_visit' as const,
    status: 'confirmed',
    starts_at: zeitpunktIn(TAG, minute(von), ZONE),
    ends_at: zeitpunktIn(TAG, minute(bis), ZONE),
    lat,
    lon: lat === null ? null : 9.05,
    geocode_precision: lat === null ? null : ('address' as const),
    position_source: 'visit' as const,
    address_outdated: false,
  };
}

function band(von: string, bis: string) {
  return { vonMinute: minute(von), bisMinute: minute(bis) };
}

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  fetchDayRoute.mockReset();
  fetchStandorte.mockReset();
  rufeFunktionAuf.mockReset();
  checkTravelFit.mockReset();
  fetchVisitPosition.mockReset();
  fetchStandorte.mockResolvedValue([
    {
      id: 'ort',
      name: 'Praxis',
      street: 'Praxisweg',
      house_number: '1',
      postal_code: '72070',
      city: 'Tuebingen',
      ...PRAXIS,
      geocode_precision: 'address',
    },
  ]);
  fetchVisitPosition.mockResolvedValue(PATIENTIN);
});

describe('freieLuecken', () => {
  it('nimmt die Arbeitszeit und zieht Belegtes ab, auch ueberlappendes', () => {
    expect(
      freieLuecken(
        [band('08:00', '12:00'), band('13:00', '17:00')],
        [band('09:00', '10:00'), band('09:30', '10:30'), band('11:50', '13:30')],
      ),
    ).toEqual([band('08:00', '09:00'), band('10:30', '11:50'), band('13:30', '17:00')]);
  });

  it('laesst Streifen unter 15 Minuten weg und kennt ohne Arbeitszeit keine Luecke', () => {
    expect(freieLuecken([band('08:00', '10:00')], [band('08:10', '10:00')])).toEqual([]);
    expect(freieLuecken([], [])).toEqual([]);
  });
});

describe('umfeldDer', () => {
  const orte = { start: PRAXIS, ende: PRAXIS };
  const stopps = [stopp('a', '09:00', '10:00', 48.51), stopp('b', '12:00', '13:00', 48.52)];

  it('nimmt den Termin davor und danach, sonst den Startort', () => {
    expect(umfeldDer(band('10:00', '12:00'), stopps, orte, ZONE)).toEqual({
      vor: { lat: 48.51, lon: 9.05 },
      nach: { lat: 48.52, lon: 9.05 },
    });
    expect(umfeldDer(band('08:00', '09:00'), stopps, orte, ZONE)).toEqual({
      vor: PRAXIS,
      nach: { lat: 48.51, lon: 9.05 },
    });
    expect(umfeldDer(band('13:00', '17:00'), stopps, orte, ZONE).nach).toEqual(PRAXIS);
  });

  it('kennt einen Ort ohne Koordinate nicht - ungeprueft ist nicht „passt“', () => {
    const ohne = [stopp('a', '09:00', '10:00', null)];
    expect(umfeldDer(band('10:00', '12:00'), ohne, orte, ZONE).vor).toBeNull();
  });
});

describe('useLueckenfinder', () => {
  const SPALTE = {
    id: 'anna',
    person: 'anna',
    baender: [band('08:00', '17:00')],
    belegt: [band('10:00', '11:00'), band('14:00', '15:00')],
  };
  const EINGABE = {
    spalten: [SPALTE],
    datum: TAG,
    patientId: 'p1',
    zeitzone: ZONE,
    dauer: 60,
    aktiv: true,
  };

  /** Eine Matrix mit `sekunden` je Relation, in der Form der Function. */
  function matrixAntwort(
    koerper: { origins: unknown[]; destinations: unknown[] },
    sekunden: number,
  ) {
    return {
      ok: true,
      quelle: 'anbieter',
      value: {
        durationsSeconds: koerper.origins.map(() => koerper.destinations.map(() => sekunden)),
      },
    };
  }

  it('faerbt jede Luecke nach der Luft, die der Server rechnet', async () => {
    fetchDayRoute.mockResolvedValue([
      stopp('a', '10:00', '11:00', 48.51),
      stopp('b', '14:00', '15:00', 48.52),
    ]);
    rufeFunktionAuf.mockImplementation(
      (_: string, koerper: { origins: unknown[]; destinations: unknown[] }) =>
        Promise.resolve(matrixAntwort(koerper, 600)),
    );
    checkTravelFit.mockImplementation((items: { index: number }[]) =>
      Promise.resolve(
        items.map((it) => ({
          item_index: it.index,
          starts_at: '2027-05-12T07:00:00Z',
          arrival_earliest_start: '2027-05-12T07:00:00Z',
          arrival_slack_minutes: 0,
          next_earliest_start: null,
          // 1. Lücke passt, 2. knapp, 3. nicht.
          departure_slack_minutes: [20, 3, -10][it.index] ?? 0,
        })),
      ),
    );

    const { result } = renderHook(() => useLueckenfinder(EINGABE), { wrapper });
    await waitFor(() => {
      const r = result.current;
      expect(r.stand === 'bereit' ? r.jeSpalte.get('anna')?.map((l) => l.stufe) : r.stand).toEqual([
        'passt',
        'knapp',
        'nicht',
      ]);
    });

    // Zwei Matrizen: von jedem Ort zur Person, von ihr zu jedem Ort - nur Koordinaten.
    expect(rufeFunktionAuf).toHaveBeenCalledTimes(2);
    for (const [aufgabe, koerper] of rufeFunktionAuf.mock.calls as [
      string,
      Record<string, unknown>,
    ][]) {
      expect(aufgabe).toBe('matrix');
      expect(Object.keys(koerper).sort()).toEqual(['destinations', 'origins', 'profile']);
    }
    // Ohne festen Beginn: der früheste nach der Anfahrt.
    const items = checkTravelFit.mock.calls[0]![0] as Record<string, unknown>[];
    expect(items[0]).toEqual({
      index: 0,
      duration_minutes: 60,
      previous_end: zeitpunktIn(TAG, minute('08:00'), ZONE),
      travel_to_seconds: 600,
      next_start: zeitpunktIn(TAG, minute('10:00'), ZONE),
      travel_from_seconds: 600,
    });
    expect(items[0]).not.toHaveProperty('starts_at');
  });

  it('nennt eine zu kurze Luecke, ohne zu fragen', async () => {
    fetchDayRoute.mockResolvedValue([]);
    rufeFunktionAuf.mockImplementation(
      (_: string, koerper: { origins: unknown[]; destinations: unknown[] }) =>
        Promise.resolve(matrixAntwort(koerper, 300)),
    );
    checkTravelFit.mockResolvedValue([]);
    const { result } = renderHook(
      () =>
        useLueckenfinder({
          ...EINGABE,
          spalten: [{ ...SPALTE, baender: [band('08:00', '08:45')], belegt: [] }],
        }),
      { wrapper },
    );
    await waitFor(() => expect(result.current).toMatchObject({ stand: 'bereit' }));
    const r = result.current;
    expect(r.stand === 'bereit' ? r.jeSpalte.get('anna')?.[0]?.stufe : null).toBe('zu_kurz');
  });

  it('zeigt bei einer gescheiterten Matrix „nicht geprueft“ statt Farben', async () => {
    fetchDayRoute.mockResolvedValue([stopp('a', '10:00', '11:00', 48.51)]);
    rufeFunktionAuf.mockResolvedValue({
      ok: false,
      error: { code: 'provider_error', message: 'x' },
    });
    const { result } = renderHook(() => useLueckenfinder(EINGABE), { wrapper });
    await waitFor(() =>
      expect(result.current).toMatchObject({ stand: 'bereit', ungeprueft: true }),
    );
    const r = result.current;
    expect(
      r.stand === 'bereit'
        ? r.jeSpalte
            .get('anna')
            ?.filter((l) => l.stufe !== 'zu_kurz')
            .map((l) => l.stufe)
        : null,
    ).toEqual(['ungeprueft', 'ungeprueft', 'ungeprueft']);
    expect(checkTravelFit).not.toHaveBeenCalled();
  });

  it('sagt „nicht verortet“, wenn die Adresse der Patient:in keine Koordinate hat', async () => {
    fetchVisitPosition.mockResolvedValue(null);
    fetchDayRoute.mockResolvedValue([]);
    const { result } = renderHook(() => useLueckenfinder(EINGABE), { wrapper });
    await waitFor(() => expect(result.current.stand).toBe('nicht_verortet'));
    expect(rufeFunktionAuf).not.toHaveBeenCalled();
  });

  it('fragt ohne Recht, ohne Patient:in oder fuer einen vergangenen Tag nichts', () => {
    const { result } = renderHook(() => useLueckenfinder({ ...EINGABE, aktiv: false }), {
      wrapper,
    });
    expect(result.current.stand).toBe('aus');
    expect(fetchVisitPosition).not.toHaveBeenCalled();
    expect(fetchDayRoute).not.toHaveBeenCalled();
  });
});
