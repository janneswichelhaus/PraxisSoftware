import { describe, expect, it } from 'vitest';
import type { Anbieteradapter, Coordinate, RouteRequest } from '../location-provider/typen.ts';
import { erstelleNachbildung } from '../location-provider/mock.ts';
import { PROFILE, monthDistanceMeters, segments, wholeKilometers } from './distance.ts';

/** BEF-181: die Monatsstrecke aus den Routen je Tag. */

function punkt(i: number): Coordinate {
  return { lat: 48.5 + i / 1000, lon: 9.05 };
}

function adapter(meterJeRoute: number | null, gesehen: RouteRequest[] = []): Anbieteradapter {
  const nachbildung = erstelleNachbildung();
  return {
    ...nachbildung,
    route(request) {
      gesehen.push(request);
      if (meterJeRoute === null) {
        return Promise.resolve({
          ok: false,
          error: { code: 'unavailable', message: 'location-provider: aus' },
        });
      }
      return Promise.resolve({
        ok: true,
        value: { distanceMeters: meterJeRoute, durationSeconds: 1, legs: [], geometry: [] },
      });
    },
  };
}

describe('segments', () => {
  it('lässt einen Tag mit höchstens 25 Punkten ganz', () => {
    const tag = Array.from({ length: 25 }, (_, i) => punkt(i));
    expect(segments(tag)).toEqual([tag]);
  });

  it('teilt längere Tage in Stücke, die sich am Rand einen Punkt teilen', () => {
    const tag = Array.from({ length: 30 }, (_, i) => punkt(i));
    const stuecke = segments(tag);
    expect(stuecke.map((s) => s.length)).toEqual([25, 6]);
    expect(stuecke[1]![0]).toEqual(stuecke[0]![24]);
    expect(stuecke.flat().length - (stuecke.length - 1)).toBe(30);
  });

  it('hat für einen einzelnen Punkt keine Strecke', () => {
    expect(segments([punkt(0)])).toEqual([]);
  });
});

describe('monthDistanceMeters', () => {
  it('summiert die Routen aller Tage mit dem Profil des Lastenrads', async () => {
    const gesehen: RouteRequest[] = [];
    const tage = [
      [punkt(0), punkt(1), punkt(0)],
      [punkt(0), punkt(2), punkt(0)],
    ];
    expect(await monthDistanceMeters(adapter(1500, gesehen), tage)).toBe(3000);
    expect(gesehen).toHaveLength(2);
    expect(gesehen.every((r) => r.profile === PROFILE && PROFILE === 'cargo_bicycle')).toBe(true);
  });

  it('gibt ohne Tag mit Fahrt 0', async () => {
    expect(await monthDistanceMeters(adapter(1500), [])).toBe(0);
  });

  it('gibt keine Summe, sobald eine Route scheitert - keine halbe Monatsstrecke', async () => {
    expect(await monthDistanceMeters(adapter(null), [[punkt(0), punkt(1)]])).toBeNull();
  });

  it('rechnet mit der Nachbildung die Luftlinie', async () => {
    const meter = await monthDistanceMeters(erstelleNachbildung(), [[punkt(0), punkt(10)]]);
    expect(meter).toBeGreaterThan(1000);
    expect(meter).toBeLessThan(1200);
  });
});

describe('wholeKilometers', () => {
  it('rundet kaufmännisch auf ganze Kilometer', () => {
    expect(wholeKilometers(411_499)).toBe(411);
    expect(wholeKilometers(411_500)).toBe(412);
    expect(wholeKilometers(499)).toBe(0);
  });
});
