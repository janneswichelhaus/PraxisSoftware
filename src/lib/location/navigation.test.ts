import { describe, expect, it } from 'vitest';
import type { NavigationTarget } from './contract';
import {
  MAX_ZWISCHENZIELE,
  STOPPS_JE_ABSCHNITT,
  buildGoogleMapsDayUrls,
  buildGoogleMapsUrl,
} from './navigation';

/**
 * Der Navigations-Handoff ist die eine Stelle, an der Daten dieser Anwendung
 * in die Hand einer fremden App gelangen. Was in der URL steht, ist deshalb
 * keine Gestaltungsfrage, sondern die Verankerung von ANN-018 - und gehört in
 * Tests, die auch das Fehlen von etwas prüfen.
 */

function adresse(strasse = 'Beispielstrasse', hausnummer = '12'): NavigationTarget {
  return {
    kind: 'address',
    address: {
      street: strasse,
      houseNumber: hausnummer,
      postalCode: '72070',
      city: 'Tuebingen',
      countryCode: 'DE',
    },
  };
}

const koordinate: NavigationTarget = {
  kind: 'coordinate',
  position: { lat: 48.5216, lon: 9.0576 },
};

function parameter(url: string): URLSearchParams {
  return new URL(url).searchParams;
}

describe('buildGoogleMapsUrl', () => {
  it('uebergibt die Adresse ohne Namen im Fahrradmodus', () => {
    const url = buildGoogleMapsUrl(adresse());
    expect(url.startsWith('https://www.google.com/maps/dir/?')).toBe(true);
    expect(parameter(url).get('destination')).toBe('Beispielstrasse 12, 72070 Tuebingen, DE');
    expect(parameter(url).get('travelmode')).toBe('bicycling');
  });

  it('uebergibt eine Koordinate als lat,lon', () => {
    expect(parameter(buildGoogleMapsUrl(koordinate)).get('destination')).toBe('48.5216,9.0576');
  });

  it('setzt keinen Startpunkt - den kennt nur das Geraet', () => {
    expect(parameter(buildGoogleMapsUrl(adresse())).has('origin')).toBe(false);
  });

  it('traegt ausser Ziel und Fahrmodus nichts', () => {
    const schluessel = [...parameter(buildGoogleMapsUrl(adresse())).keys()].sort();
    expect(schluessel).toEqual(['api', 'destination', 'travelmode']);
  });
});

describe('buildGoogleMapsDayUrls', () => {
  const ziele = (anzahl: number): NavigationTarget[] =>
    Array.from({ length: anzahl }, (_, index) => adresse(`Strasse ${index + 1}`, '1'));

  it('liefert fuer einen leeren Tag keinen Link', () => {
    expect(buildGoogleMapsDayUrls([])).toEqual([]);
  });

  it('setzt die Stopps in Terminreihenfolge: letzter als Ziel, Rest als Wegpunkte', () => {
    const [url] = buildGoogleMapsDayUrls(ziele(3));
    expect(parameter(url!).get('destination')).toBe('Strasse 3 1, 72070 Tuebingen, DE');
    expect(parameter(url!).get('waypoints')).toBe(
      'Strasse 1 1, 72070 Tuebingen, DE|Strasse 2 1, 72070 Tuebingen, DE',
    );
  });

  it('kommt bei einem einzelnen Stopp ohne Wegpunkte aus', () => {
    const [url] = buildGoogleMapsDayUrls(ziele(1));
    expect(parameter(url!).has('waypoints')).toBe(false);
  });

  it('bleibt innerhalb des Wegpunktlimits der Ziel-App', () => {
    const [url] = buildGoogleMapsDayUrls(ziele(STOPPS_JE_ABSCHNITT));
    expect(parameter(url!).get('waypoints')!.split('|')).toHaveLength(MAX_ZWISCHENZIELE);
  });

  it('teilt einen laengeren Tag in Abschnitte statt ihn abzuschneiden', () => {
    const urls = buildGoogleMapsDayUrls(ziele(STOPPS_JE_ABSCHNITT + 2));
    expect(urls).toHaveLength(2);
    // Der zweite Abschnitt beginnt beim naechsten Stopp - kein wiederholter
    // Punkt, den die Navigation erneut anfahren wuerde.
    expect(parameter(urls[1]!).get('destination')).toBe('Strasse 12 1, 72070 Tuebingen, DE');
    expect(parameter(urls[1]!).get('waypoints')).toBe('Strasse 11 1, 72070 Tuebingen, DE');
  });

  it('verliert keinen Stopp beim Teilen', () => {
    const urls = buildGoogleMapsDayUrls(ziele(23));
    const uebergeben = urls.flatMap((url) => {
      const p = parameter(url);
      return [...(p.get('waypoints')?.split('|') ?? []), p.get('destination')!];
    });
    expect(uebergeben).toHaveLength(23);
    expect(new Set(uebergeben).size).toBe(23);
  });
});
