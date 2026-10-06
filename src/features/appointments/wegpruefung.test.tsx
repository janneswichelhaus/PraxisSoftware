import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import type * as TagesrouteModul from '@/features/tours/tagesroute';
import type * as StartortModul from '@/features/tours/startort';
import type * as FunktionModul from '@/lib/location/funktion';
import { zeitpunktIn } from './api';

/**
 * UBK-012: „Passt es?“ - Nachbarn, Tagesrand, eine Route über höchstens drei
 * Punkte und die Rundung im Server (ANN-238).
 */

const { fetchDayRoute, fetchStandorte, rufeFunktionAuf, checkTravelFit, fetchVisitPosition } =
  vi.hoisted(() => ({
    fetchDayRoute: vi.fn(),
    fetchStandorte: vi.fn(),
    rufeFunktionAuf: vi.fn(),
    checkTravelFit: vi.fn(),
    fetchVisitPosition: vi.fn(),
  }));
const arbeitszeit = vi.hoisted(() => ({ wochenplan: [] as unknown[], fehler: false }));

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
vi.mock('@/features/scheduling/api', () => ({
  fetchWorkingHours: () =>
    arbeitszeit.fehler
      ? Promise.reject(new Error('Arbeitszeiten nicht geladen'))
      : Promise.resolve(arbeitszeit.wochenplan),
  fetchWorkingHourExceptions: () => Promise.resolve([]),
}));
vi.mock('@/features/tours/fahrzeitfaktor-api', () => ({
  fetchFahrzeitfaktor: () => Promise.resolve(1),
  saveFahrzeitfaktor: () => Promise.resolve(),
}));
vi.mock('./wegpruefung-api', () => ({
  checkTravelFit: (fragen: unknown) => checkTravelFit(fragen) as Promise<unknown>,
  fetchVisitPosition: (id: string) => fetchVisitPosition(id) as Promise<unknown>,
}));

const { frageAusFormular, luftStufe, nachbarnDes, tagesrand, useWegpruefung } =
  await import('./wegpruefung');

const ZONE = 'Europe/Berlin';
const TAG = '2027-05-12';
const ANNA = 'anna';
const ORT = 'ort-1';

function stopp(id: string, von: string, bis: string, lat: number | null, veraltet = false) {
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
    address_outdated: veraltet,
  };
}

function minute(zeit: string): number {
  const [h, m] = zeit.split(':').map(Number) as [number, number];
  return h * 60 + m;
}

const STANDORT = {
  id: ORT,
  name: 'Praxis',
  street: 'Praxisweg',
  house_number: '1',
  postal_code: '72070',
  city: 'Tuebingen',
  lat: 48.5,
  lon: 9.05,
  geocode_precision: 'address' as const,
};

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function route(...minuten: number[]) {
  return {
    ok: true,
    quelle: 'anbieter',
    value: {
      distanceMeters: 1000,
      durationSeconds: minuten.reduce((s, m) => s + m * 60, 0),
      legs: minuten.map((m) => ({ distanceMeters: 500, durationSeconds: m * 60 })),
      geometry: [],
    },
  };
}

beforeEach(() => {
  fetchDayRoute.mockReset();
  fetchStandorte.mockReset();
  rufeFunktionAuf.mockReset();
  checkTravelFit.mockReset();
  fetchVisitPosition.mockReset();
  fetchStandorte.mockResolvedValue([STANDORT]);
  arbeitszeit.wochenplan = [];
  arbeitszeit.fehler = false;
});

describe('Bausteine', () => {
  it('stuft die Luft wie der Wegbalken: ab 5 passt, darunter knapp, unter 0 zu knapp', () => {
    expect(luftStufe(5)).toBe('passt');
    expect(luftStufe(4)).toBe('knapp');
    expect(luftStufe(0)).toBe('knapp');
    expect(luftStufe(-1)).toBe('nicht');
  });

  it('findet die Nachbarn ohne den Termin selbst und ohne Ueberschneidungen', () => {
    const stopps = [
      stopp('a', '08:00', '09:00', 48.51),
      stopp('b', '09:00', '09:45', 48.52),
      stopp('x', '10:00', '11:00', 48.53),
      stopp('c', '11:30', '12:30', 48.54),
    ];
    const beginn = Date.parse(zeitpunktIn(TAG, minute('10:00'), ZONE));
    const ende = Date.parse(zeitpunktIn(TAG, minute('11:00'), ZONE));
    const { vorher, nachher } = nachbarnDes(stopps, beginn, ende, 'x');
    expect(vorher?.id).toBe('b');
    expect(nachher?.id).toBe('c');
  });

  it('nimmt Arbeitsbeginn und -ende aus den Baendern', () => {
    expect(tagesrand([])).toBeNull();
    expect(
      tagesrand([
        { vonMinute: 13 * 60, bisMinute: 17 * 60 },
        { vonMinute: 8 * 60, bisMinute: 12 * 60 },
      ]),
    ).toEqual({ beginn: 8 * 60, ende: 17 * 60 });
  });

  it('rechnet Ortszeit in einen Zeitpunkt um, auch ueber die Zeitumstellung', () => {
    expect(zeitpunktIn('2027-05-12', 9 * 60, ZONE)).toBe('2027-05-12T07:00:00.000Z');
    expect(zeitpunktIn('2027-01-12', 9 * 60, ZONE)).toBe('2027-01-12T08:00:00.000Z');
    // Tag der Umstellung auf Sommerzeit: 03:30 Ortszeit ist schon UTC+2.
    expect(zeitpunktIn('2027-03-28', 3 * 60 + 30, ZONE)).toBe('2027-03-28T01:30:00.000Z');
  });

  it('fragt erst, wenn Person, Tag, Zeit und Ort feststehen', () => {
    const werte = {
      staff_member_id: ANNA,
      appointment_type: 'practice',
      date: TAG,
      start_time: '10:00',
      end_time: '11:00',
      location_id: ORT,
    };
    expect(frageAusFormular(werte, { patientId: 'p', zeitzone: ZONE })).toMatchObject({
      ort: { art: 'practice', standortId: ORT },
      beginnMinute: 600,
      endeMinute: 660,
    });
    expect(
      frageAusFormular({ ...werte, location_id: '' }, { patientId: 'p', zeitzone: ZONE }),
    ).toBeNull();
    expect(
      frageAusFormular({ ...werte, start_time: '' }, { patientId: 'p', zeitzone: ZONE }),
    ).toBeNull();
    expect(
      frageAusFormular(
        { ...werte, appointment_type: 'home_visit' },
        { patientId: 'p', zeitzone: ZONE },
      ),
    ).toMatchObject({ ort: { art: 'home_visit', patientId: 'p' } });
    expect(
      frageAusFormular(
        { ...werte, appointment_type: 'home_visit' },
        { patientId: 'p', zeitzone: ZONE, bestehend: { terminId: 't', datum: TAG, person: ANNA } },
      ),
    ).toMatchObject({ ort: { art: 'bestehend', terminId: 't' }, ohneTermin: 't' });
  });
});

describe('useWegpruefung', () => {
  const PRAXISTERMIN = {
    person: ANNA,
    datum: TAG,
    beginnMinute: 10 * 60,
    endeMinute: 11 * 60,
    ort: { art: 'practice' as const, standortId: ORT },
    zeitzone: ZONE,
  };

  it('prueft An- und Weiterfahrt ueber eine Route und rundet im Server', async () => {
    fetchDayRoute.mockResolvedValue([
      stopp('a', '08:30', '09:30', 48.51),
      stopp('c', '11:30', '12:30', 48.52),
    ]);
    rufeFunktionAuf.mockResolvedValue(route(12, 20));
    checkTravelFit.mockResolvedValue([
      {
        item_index: 0,
        starts_at: '2027-05-12T08:00:00Z',
        arrival_earliest_start: '2027-05-12T07:45:00Z',
        arrival_slack_minutes: 15,
        next_earliest_start: '2027-05-12T09:20:00Z',
        departure_slack_minutes: 10,
      },
    ]);

    const { result } = renderHook(() => useWegpruefung(PRAXISTERMIN), { wrapper });
    await waitFor(() => expect(result.current.stand).toBe('bereit'));
    await waitFor(() =>
      expect(result.current).toMatchObject({
        an: { stand: 'geprueft', luft: 15, stufe: 'passt', fahrtMinuten: 12, nachbar: 'termin' },
        weiter: { stand: 'geprueft', luft: 10, stufe: 'passt', fahrtMinuten: 20 },
      }),
    );

    // Zum Kartendienst nur Koordinaten und Profil, drei Punkte.
    const [aufgabe, koerper] = rufeFunktionAuf.mock.calls[0] as [string, Record<string, unknown>];
    expect(aufgabe).toBe('route');
    expect(Object.keys(koerper).sort()).toEqual(['profile', 'waypoints']);
    expect(koerper['waypoints']).toHaveLength(3);
    // Zum Server Zeiten und Fahrzeiten, keine Kennung eines anderen Termins.
    expect(checkTravelFit).toHaveBeenCalledWith([
      {
        index: 0,
        duration_minutes: 60,
        starts_at: '2027-05-12T08:00:00.000Z',
        previous_end: zeitpunktIn(TAG, minute('09:30'), ZONE),
        travel_to_seconds: 720,
        next_start: zeitpunktIn(TAG, minute('11:30'), ZONE),
        travel_from_seconds: 1200,
      },
    ]);
  });

  it('sagt „nicht verortet“ statt einer Zeit und fragt den Kartendienst nicht', async () => {
    fetchDayRoute.mockResolvedValue([stopp('a', '08:30', '09:30', 48.51)]);
    fetchVisitPosition.mockResolvedValue(null);
    const { result } = renderHook(
      () => useWegpruefung({ ...PRAXISTERMIN, ort: { art: 'home_visit', patientId: 'p' } }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.stand).toBe('nicht_verortet'));
    expect(rufeFunktionAuf).not.toHaveBeenCalled();
    expect(checkTravelFit).not.toHaveBeenCalled();
  });

  it('rechnet ohne Termin davor vom Startort ab Arbeitsbeginn', async () => {
    arbeitszeit.wochenplan = [
      { id: 'w', staff_member_id: ANNA, weekday: 3, starts_at: '08:00', ends_at: '16:00' },
    ];
    fetchDayRoute.mockResolvedValue([]);
    fetchVisitPosition.mockResolvedValue({ lat: 48.52, lon: 9.06 });
    rufeFunktionAuf.mockResolvedValue(route(15, 15));
    checkTravelFit.mockResolvedValue([
      {
        item_index: 0,
        starts_at: '2027-05-12T06:00:00Z',
        arrival_earliest_start: '2027-05-12T06:15:00Z',
        arrival_slack_minutes: -15,
        next_earliest_start: '2027-05-12T07:15:00Z',
        departure_slack_minutes: 465,
      },
    ]);
    const { result } = renderHook(
      () =>
        useWegpruefung({
          ...PRAXISTERMIN,
          beginnMinute: 8 * 60,
          endeMinute: 9 * 60,
          ort: { art: 'home_visit', patientId: 'p' },
        }),
      { wrapper },
    );
    await waitFor(() =>
      expect(result.current).toMatchObject({
        an: { stand: 'geprueft', stufe: 'nicht', luft: -15, nachbar: 'tagesrand' },
        weiter: { stand: 'geprueft', nachbar: 'tagesrand' },
      }),
    );
    const frage = (checkTravelFit.mock.calls[0]![0] as Record<string, unknown>[])[0]!;
    expect(frage['previous_end']).toBe(zeitpunktIn(TAG, 8 * 60, ZONE));
    expect(frage['next_start']).toBe(zeitpunktIn(TAG, 16 * 60, ZONE));
  });

  it('nennt einen nicht verorteten Nachbarn und prueft die andere Seite', async () => {
    fetchDayRoute.mockResolvedValue([
      stopp('a', '08:30', '09:30', null),
      stopp('c', '11:30', '12:30', 48.52),
    ]);
    rufeFunktionAuf.mockResolvedValue(route(20));
    checkTravelFit.mockResolvedValue([
      {
        item_index: 0,
        starts_at: '2027-05-12T08:00:00Z',
        arrival_earliest_start: null,
        arrival_slack_minutes: null,
        next_earliest_start: '2027-05-12T09:20:00Z',
        departure_slack_minutes: 10,
      },
    ]);
    const { result } = renderHook(() => useWegpruefung(PRAXISTERMIN), { wrapper });
    await waitFor(() =>
      expect(result.current).toMatchObject({
        an: { stand: 'nachbar_nicht_verortet' },
        weiter: { stand: 'geprueft', luft: 10 },
      }),
    );
  });

  it('ist ohne Route nicht geprueft - ungeprueft ist nicht „passt“', async () => {
    fetchDayRoute.mockResolvedValue([stopp('a', '08:30', '09:30', 48.51)]);
    rufeFunktionAuf.mockResolvedValue({
      ok: false,
      error: { code: 'not_found', message: 'x' },
    });
    const { result } = renderHook(() => useWegpruefung(PRAXISTERMIN), { wrapper });
    await waitFor(() =>
      expect(result.current).toMatchObject({
        an: { stand: 'nicht_geprueft' },
        weiter: { stand: 'offen' },
      }),
    );
    expect(checkTravelFit).not.toHaveBeenCalled();
  });

  it('nennt eine Seite ohne Termin nicht geprueft, wenn die Arbeitszeit nicht laedt', async () => {
    arbeitszeit.fehler = true;
    fetchDayRoute.mockResolvedValue([stopp('a', '08:30', '09:30', 48.51)]);
    rufeFunktionAuf.mockResolvedValue(route(12));
    checkTravelFit.mockResolvedValue([
      {
        item_index: 0,
        starts_at: '2027-05-12T08:00:00Z',
        arrival_earliest_start: '2027-05-12T07:45:00Z',
        arrival_slack_minutes: 15,
        next_earliest_start: null,
        departure_slack_minutes: null,
      },
    ]);
    const { result } = renderHook(() => useWegpruefung(PRAXISTERMIN), { wrapper });
    await waitFor(() =>
      expect(result.current).toMatchObject({
        an: { stand: 'geprueft', luft: 15 },
        weiter: { stand: 'nicht_geprueft' },
      }),
    );
  });

  it('nimmt fuer einen bestehenden Hausbesuch die Position aus seiner Tagesroute', async () => {
    fetchDayRoute.mockResolvedValue([
      stopp('t', '10:00', '11:00', 48.55, true),
      stopp('a', '08:30', '09:30', 48.51),
    ]);
    const { result } = renderHook(
      () =>
        useWegpruefung({
          ...PRAXISTERMIN,
          ort: { art: 'bestehend', terminId: 't', datum: TAG, person: ANNA },
          ohneTermin: 't',
        }),
      { wrapper },
    );
    // Die Anschrift am Termin ist veraltet (ANN-236) - keine Zeit.
    await waitFor(() => expect(result.current.stand).toBe('veraltet'));
  });

  it('prueft einen Videotermin nicht', () => {
    const { result } = renderHook(
      () => useWegpruefung({ ...PRAXISTERMIN, ort: { art: 'video' } }),
      { wrapper },
    );
    expect(result.current.stand).toBe('aus');
    expect(fetchDayRoute).not.toHaveBeenCalled();
  });
});
