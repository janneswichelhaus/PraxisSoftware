import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

/**
 * UBK-010, ANN-237: Der Fahrzeitfaktor greift an genau einer Stelle.
 */

const { fetchFahrzeitfaktor, invoke } = vi.hoisted(() => ({
  fetchFahrzeitfaktor: vi.fn(),
  invoke: vi.fn(),
}));

vi.mock('./fahrzeitfaktor-api', () => ({
  fetchFahrzeitfaktor: () => fetchFahrzeitfaktor() as Promise<number>,
  saveFahrzeitfaktor: () => Promise.resolve(),
}));
vi.mock('@/lib/supabase', () => ({ getSupabase: () => ({ functions: { invoke } }) }));

const {
  FAHRZEITFAKTOR_WERTE,
  planungsfahrzeit,
  planungsmatrix,
  planungsroute,
  useFahrzeitfaktor,
  usePlanungsmatrix,
  usePlanungsroute,
} = await import('./fahrzeitfaktor');

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

const A = { lat: 48.5, lon: 9 };
const B = { lat: 48.51, lon: 9 };

beforeEach(() => {
  fetchFahrzeitfaktor.mockReset();
  invoke.mockReset();
});

describe('planungsfahrzeit', () => {
  it('multipliziert und rundet auf ganze Sekunden', () => {
    expect(planungsfahrzeit(600, 1.5)).toBe(900);
    expect(planungsfahrzeit(301, 1.5)).toBe(452);
    expect(planungsfahrzeit(0, 2.5)).toBe(0);
  });

  it('bietet 1,0 bis 2,5 in Schritten von 0,1 an', () => {
    expect(FAHRZEITFAKTOR_WERTE).toHaveLength(16);
    expect(FAHRZEITFAKTOR_WERTE[0]).toBe(1);
    expect(FAHRZEITFAKTOR_WERTE.at(-1)).toBe(2.5);
    expect(FAHRZEITFAKTOR_WERTE).toContain(1.5);
  });

  it('aendert an der Route nur die Fahrzeiten, nicht Strecke und Linie', () => {
    const antwort = {
      ok: true as const,
      value: {
        quelle: 'anbieter' as const,
        route: {
          distanceMeters: 3000,
          durationSeconds: 600,
          legs: [
            { distanceMeters: 1000, durationSeconds: 200 },
            { distanceMeters: 2000, durationSeconds: 400 },
          ],
          geometry: [A, B],
        },
      },
    };
    const mit = planungsroute(antwort, 1.5);
    expect(mit).toEqual({
      ok: true,
      value: {
        quelle: 'anbieter',
        route: {
          distanceMeters: 3000,
          durationSeconds: 900,
          legs: [
            { distanceMeters: 1000, durationSeconds: 300 },
            { distanceMeters: 2000, durationSeconds: 600 },
          ],
          geometry: [A, B],
        },
      },
    });
    // Ein Fehler bleibt ein Fehler.
    const fehler = { ok: false as const, error: { code: 'timeout' as const, message: 'x' } };
    expect(planungsroute(fehler, 1.5)).toBe(fehler);
  });

  it('laesst an der Matrix eine fehlende Fahrzeit fehlen (ADR-019 Punkt 38)', () => {
    const antwort = {
      ok: true as const,
      value: {
        quelle: 'anbieter' as const,
        matrix: { durationsSeconds: [[100, null]], distancesMeters: [[500, null]] },
      },
    };
    expect(planungsmatrix(antwort, 2)).toEqual({
      ok: true,
      value: {
        quelle: 'anbieter',
        matrix: { durationsSeconds: [[200, null]], distancesMeters: [[500, null]] },
      },
    });
  });
});

describe('useFahrzeitfaktor', () => {
  it('ist null, solange der Faktor laedt, und dann der Wert der Praxis', async () => {
    fetchFahrzeitfaktor.mockResolvedValue(1.8);
    const { result } = renderHook(() => useFahrzeitfaktor(), { wrapper });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe(1.8));
  });

  it('nimmt ohne lesbaren Wert die Voreinstellung 1,5 und nie 1,0', async () => {
    fetchFahrzeitfaktor.mockRejectedValue(new Error('weg'));
    const { result } = renderHook(() => useFahrzeitfaktor(), { wrapper });
    await waitFor(() => expect(result.current).toBe(1.5));
  });
});

describe('usePlanungsroute und usePlanungsmatrix', () => {
  it('fragt erst an, wenn der Faktor feststeht, und liefert Planungsfahrzeiten', async () => {
    let freigeben: (wert: number) => void = () => undefined;
    fetchFahrzeitfaktor.mockReturnValue(new Promise<number>((r) => (freigeben = r)));
    invoke.mockResolvedValue({
      data: {
        ok: true,
        quelle: 'anbieter',
        value: {
          distanceMeters: 1000,
          durationSeconds: 300,
          legs: [{ distanceMeters: 1000, durationSeconds: 300 }],
          geometry: [],
        },
      },
      error: null,
    });
    const { result } = renderHook(() => usePlanungsroute([A, B]), { wrapper });
    // Ohne Faktor geht nichts hinaus - sonst stünde kurz die Zeit ohne Zuschlag da.
    await new Promise((r) => setTimeout(r, 20));
    expect(invoke).not.toHaveBeenCalled();

    freigeben(2);
    await waitFor(() => expect(result.current.data?.ok).toBe(true));
    const route = result.current.data?.ok === true ? result.current.data.value.route : null;
    expect(route?.legs[0]?.durationSeconds).toBe(600);
    expect(route?.durationSeconds).toBe(600);
    // Zum Kartendienst gehen weiter nur Koordinaten und Profil.
    const koerper = (invoke.mock.calls[0]![1] as { body: Record<string, unknown> }).body;
    expect(Object.keys(koerper).sort()).toEqual(['aufgabe', 'profile', 'waypoints']);
  });

  it('wendet den Faktor auf die Matrix an', async () => {
    fetchFahrzeitfaktor.mockResolvedValue(1.5);
    invoke.mockResolvedValue({
      data: { ok: true, quelle: 'anbieter', value: { durationsSeconds: [[400]] } },
      error: null,
    });
    const { result } = renderHook(() => usePlanungsmatrix([A], [B]), { wrapper });
    await waitFor(() => expect(result.current.data?.ok).toBe(true));
    expect(
      result.current.data?.ok === true ? result.current.data.value.matrix.durationsSeconds : null,
    ).toEqual([[600]]);
  });
});

// -----------------------------------------------------------------------------
// Die eine Stelle - am Quelltext gehalten
// -----------------------------------------------------------------------------

/** Aufrufe, die eine Fahrzeit des Kartendienstes ohne Faktor in den Fachcode brächten. */
const ROHE_ZUGRIFFE = [
  'useRoute(',
  'useMatrix(',
  'fordereRouteAn(',
  'fordereMatrixAn(',
  'routenAbfrage(',
  'matrixAbfrage(',
];

function dateien(verzeichnis: string): string[] {
  return readdirSync(verzeichnis).flatMap((name) => {
    const pfad = join(verzeichnis, name);
    if (statSync(pfad).isDirectory()) return dateien(pfad);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) ? [pfad] : [];
  });
}

describe('Der Fahrzeitfaktor greift an genau einer Stelle (ANN-237)', () => {
  it('fragt Route und Matrix im Fachcode nur ueber fahrzeitfaktor.ts an', () => {
    const funde = dateien('src/features')
      .filter((pfad) => !pfad.endsWith(join('tours', 'fahrzeitfaktor.ts')))
      .flatMap((pfad) => {
        const text = readFileSync(pfad, 'utf8');
        return ROHE_ZUGRIFFE.filter((zugriff) => text.includes(zugriff)).map(
          (zugriff) => `${pfad}: ${zugriff}`,
        );
      });
    expect(funde).toEqual([]);
  });

  it('liest an keiner anderen Stelle eine Fahrzeit der Matrix', () => {
    // Die Matrix hat genau einen Leser ausserhalb von fahrzeitfaktor.ts nicht:
    // Wer `durationsSeconds` liest, bekommt sie aus `usePlanungsmatrix`.
    const leser = dateien('src/features').filter((pfad) => {
      const text = readFileSync(pfad, 'utf8');
      return (
        text.includes('durationsSeconds') && !pfad.endsWith(join('tours', 'fahrzeitfaktor.ts'))
      );
    });
    for (const pfad of leser) {
      expect(readFileSync(pfad, 'utf8'), pfad).toMatch(/usePlanungsmatri(x|zen)/);
    }
  });
});
