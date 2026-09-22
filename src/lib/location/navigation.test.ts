import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NavigationApp, NavigationTarget } from './contract';
import {
  MAX_ZWISCHENZIELE,
  MAX_ZWISCHENZIELE_DOKUMENTIERT,
  MAX_ZWISCHENZIELE_MOBIL,
  buildNavigationDayUrls,
  buildNavigationUrl,
  navigationOeffnen,
  navigationsZiel,
  stoppsJeAbschnitt,
} from './navigation';

/**
 * Der Navigations-Handoff ist die eine Stelle, an der Daten dieser Anwendung
 * in die Hand einer fremden App gelangen. Was in der URL steht, ist deshalb
 * keine Gestaltungsfrage, sondern die Verankerung von ANN-018 - und gehört in
 * Tests, die auch das Fehlen von etwas prüfen.
 */

const ZIEL_APPS: NavigationApp[] = ['google_maps', 'apple_maps', 'system'];

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

describe('navigationOeffnen', () => {
  /** Was der Klick an das Gerät gibt - ohne dass jsdom irgendwohin navigiert. */
  function verweise(): { href: string; target: string; rel: string }[] {
    const gesammelt: { href: string; target: string; rel: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      gesammelt.push({ href: this.href, target: this.target, rel: this.rel });
    });
    return gesammelt;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('gibt einen Kartenverweis an einen eigenen Tab - abgeschirmt', () => {
    const gesammelt = verweise();
    navigationOeffnen(buildNavigationUrl(koordinate, 'google_maps'));

    expect(gesammelt).toHaveLength(1);
    expect(gesammelt[0]!.href).toContain('google.com/maps');
    expect(gesammelt[0]!.target).toBe('_blank');
    expect(gesammelt[0]!.rel).toBe('noopener noreferrer');
  });

  it('gibt einen geo:-Verweis ohne eigenen Tab weiter (BEF-030)', () => {
    // Ein neuer Tab bliebe leer stehen, wenn kein Programm das Schema
    // uebernimmt - genau das war am Laptop zu sehen.
    const gesammelt = verweise();
    navigationOeffnen(buildNavigationUrl(koordinate, 'system'));

    expect(gesammelt).toEqual([
      { href: 'geo:48.5216,9.0576', target: '', rel: 'noopener noreferrer' },
    ]);
  });

  it('laesst keinen Verweis im Dokument zurueck', () => {
    verweise();
    navigationOeffnen(buildNavigationUrl(koordinate, 'apple_maps'));

    expect(document.querySelector('a')).toBeNull();
  });
});

describe('Wegpunktlimit', () => {
  it('erzwingt die strengere der beiden dokumentierten Zahlen', () => {
    expect(MAX_ZWISCHENZIELE_DOKUMENTIERT).toBe(9);
    expect(MAX_ZWISCHENZIELE_MOBIL).toBe(3);
    // Nicht `toBe(3)`: Geprueft wird die Regel, nicht die Zahl. Wer die
    // Gerätebewertung auswertet und eine Zahl anhebt, soll hier scheitern,
    // wenn er die groessere erzwingt.
    expect(MAX_ZWISCHENZIELE).toBe(
      Math.min(MAX_ZWISCHENZIELE_DOKUMENTIERT, MAX_ZWISCHENZIELE_MOBIL),
    );
  });

  it('gibt der Systemnavigation keinen Umweg - sie kennt nur ein Ziel', () => {
    expect(stoppsJeAbschnitt('system')).toBe(1);
    expect(stoppsJeAbschnitt('google_maps')).toBe(MAX_ZWISCHENZIELE + 1);
    expect(stoppsJeAbschnitt('apple_maps')).toBe(MAX_ZWISCHENZIELE + 1);
  });
});

describe('buildNavigationUrl - Google Maps', () => {
  it('uebergibt die Adresse ohne Namen im Fahrradmodus', () => {
    const url = buildNavigationUrl(adresse(), 'google_maps');
    expect(url.startsWith('https://www.google.com/maps/dir/?')).toBe(true);
    expect(parameter(url).get('destination')).toBe('Beispielstrasse 12, 72070 Tuebingen, DE');
    expect(parameter(url).get('travelmode')).toBe('bicycling');
  });

  it('uebergibt eine Koordinate als lat,lon', () => {
    expect(parameter(buildNavigationUrl(koordinate, 'google_maps')).get('destination')).toBe(
      '48.5216,9.0576',
    );
  });

  it('setzt keinen Startpunkt - den kennt nur das Geraet', () => {
    expect(parameter(buildNavigationUrl(adresse(), 'google_maps')).has('origin')).toBe(false);
  });

  it('traegt ausser Ziel und Fahrmodus nichts', () => {
    const schluessel = [...parameter(buildNavigationUrl(adresse(), 'google_maps')).keys()].sort();
    expect(schluessel).toEqual(['api', 'destination', 'travelmode']);
  });
});

describe('buildNavigationUrl - Apple Maps', () => {
  it('uebergibt das Ziel an /directions im Fahrradmodus', () => {
    const url = buildNavigationUrl(adresse(), 'apple_maps');
    expect(url.startsWith('https://maps.apple.com/directions?')).toBe(true);
    expect(parameter(url).get('destination')).toBe('Beispielstrasse 12, 72070 Tuebingen, DE');
    expect(parameter(url).get('mode')).toBe('cycling');
  });

  it('uebergibt eine Koordinate als lat,lon', () => {
    expect(parameter(buildNavigationUrl(koordinate, 'apple_maps')).get('destination')).toBe(
      '48.5216,9.0576',
    );
  });

  it('setzt keinen Startpunkt und traegt ausser Ziel und Fahrmodus nichts', () => {
    const schluessel = [...parameter(buildNavigationUrl(adresse(), 'apple_maps')).keys()].sort();
    expect(schluessel).toEqual(['destination', 'mode']);
  });

  it('nutzt nicht die aeltere Form ohne Fahrradmodus', () => {
    const url = buildNavigationUrl(adresse(), 'apple_maps');
    expect(url).not.toContain('daddr=');
    expect(url).not.toContain('dirflg=');
  });
});

describe('buildNavigationUrl - Systemnavigation', () => {
  it('uebergibt eine Koordinate als geo:lat,lon', () => {
    expect(buildNavigationUrl(koordinate, 'system')).toBe('geo:48.5216,9.0576');
  });

  it('uebergibt eine Adresse kodiert als Suchbegriff', () => {
    const url = buildNavigationUrl(adresse(), 'system');
    expect(url.startsWith('geo:0,0?')).toBe(true);
    expect(parameter(url).get('q')).toBe('Beispielstrasse 12, 72070 Tuebingen, DE');
    // Kodiert, nicht roh: Ein Komma oder Leerzeichen im URI zerlegt ihn sonst.
    expect(url).not.toContain(' ');
  });

  it('traegt kein Verkehrsmittel - der URI kennt keins', () => {
    const url = buildNavigationUrl(adresse(), 'system');
    expect(url).not.toContain('mode');
    expect(url).not.toContain('bicycling');
  });
});

describe('Feldliste: was die URL nicht enthaelt', () => {
  /**
   * Die Liste aus ANN-018, als Zeichenketten: Name, Uhrzeit, Kennung, Notiz,
   * Diagnose. Sie steckt hier in einem Objekt, das mehr traegt als der
   * Handoff annimmt - so prueft der Test den Weg vom Termin zur URL und nicht
   * nur die Typsignatur.
   */
  const VERBOTEN = [
    'Mustermann',
    'Max',
    '08:30',
    '2026-09-22',
    '7f3c1d2e-4b5a-6c7d-8e9f-0a1b2c3d4e5f',
    'Klingel',
    'Schulter',
  ];

  const termin = {
    appointment_type: 'home_visit' as const,
    visit_street: 'Beispielstrasse',
    visit_house_number: '12',
    visit_postal_code: '72070',
    visit_city: 'Tuebingen',
    // Alles darunter kennt `Besuchsadresse` nicht - es steht hier, damit der
    // Test etwas zu finden haette, wenn die Funktion mehr naehme.
    patient_name: 'Max Mustermann',
    starts_at: '2026-09-22T08:30:00.000Z',
    appointment_id: '7f3c1d2e-4b5a-6c7d-8e9f-0a1b2c3d4e5f',
    access_note: 'Klingel unten links',
    diagnosis: 'Schulter',
  };

  it.each(ZIEL_APPS)('haelt bei %s nur Ziel und Fahrmodus', (app) => {
    const ziel = navigationsZiel(termin);
    expect(ziel).not.toBeNull();
    const url = buildNavigationUrl(ziel!, app);
    for (const feld of VERBOTEN) {
      expect(url).not.toContain(feld);
      expect(url).not.toContain(encodeURIComponent(feld));
    }
  });

  it.each(ZIEL_APPS)('haelt auch den Tageslink bei %s frei davon', (app) => {
    const ziele = [navigationsZiel(termin)!, koordinate, adresse('Zweite')];
    for (const url of buildNavigationDayUrls(ziele, app)) {
      for (const feld of VERBOTEN) {
        expect(url).not.toContain(feld);
        expect(url).not.toContain(encodeURIComponent(feld));
      }
    }
  });
});

describe('buildNavigationDayUrls', () => {
  const ziele = (anzahl: number): NavigationTarget[] =>
    Array.from({ length: anzahl }, (_, index) => adresse(`Strasse ${index + 1}`, '1'));

  it.each(ZIEL_APPS)('liefert fuer einen leeren Tag keinen Link (%s)', (app) => {
    expect(buildNavigationDayUrls([], app)).toEqual([]);
  });

  it('setzt die Stopps in Terminreihenfolge: letzter als Ziel, Rest als Wegpunkte', () => {
    const [url] = buildNavigationDayUrls(ziele(3), 'google_maps');
    expect(parameter(url!).get('destination')).toBe('Strasse 3 1, 72070 Tuebingen, DE');
    expect(parameter(url!).get('waypoints')).toBe(
      'Strasse 1 1, 72070 Tuebingen, DE|Strasse 2 1, 72070 Tuebingen, DE',
    );
  });

  it('wiederholt den Parameter bei Apple Maps, statt zu trennen', () => {
    const [url] = buildNavigationDayUrls(ziele(3), 'apple_maps');
    expect(parameter(url!).getAll('waypoint')).toEqual([
      'Strasse 1 1, 72070 Tuebingen, DE',
      'Strasse 2 1, 72070 Tuebingen, DE',
    ]);
    expect(parameter(url!).get('destination')).toBe('Strasse 3 1, 72070 Tuebingen, DE');
  });

  it('gibt der Systemnavigation je Stopp einen eigenen Link', () => {
    const urls = buildNavigationDayUrls(ziele(3), 'system');
    expect(urls).toHaveLength(3);
    expect(urls.every((url) => url.startsWith('geo:'))).toBe(true);
  });

  it('kommt bei einem einzelnen Stopp ohne Wegpunkte aus', () => {
    const [url] = buildNavigationDayUrls(ziele(1), 'google_maps');
    expect(parameter(url!).has('waypoints')).toBe(false);
  });

  it.each(['google_maps', 'apple_maps'] as const)(
    'bleibt bei %s innerhalb des Wegpunktlimits',
    (app) => {
      const [url] = buildNavigationDayUrls(ziele(stoppsJeAbschnitt(app)), app);
      const uebergeben =
        app === 'google_maps'
          ? parameter(url!).get('waypoints')!.split('|')
          : parameter(url!).getAll('waypoint');
      expect(uebergeben).toHaveLength(MAX_ZWISCHENZIELE);
    },
  );

  it('teilt einen laengeren Tag in Abschnitte statt ihn abzuschneiden', () => {
    const urls = buildNavigationDayUrls(ziele(stoppsJeAbschnitt('google_maps') + 2), 'google_maps');
    expect(urls).toHaveLength(2);
    // Der zweite Abschnitt beginnt beim naechsten Stopp - kein wiederholter
    // Punkt, den die Navigation erneut anfahren wuerde.
    expect(parameter(urls[1]!).get('destination')).toBe('Strasse 6 1, 72070 Tuebingen, DE');
    expect(parameter(urls[1]!).get('waypoints')).toBe('Strasse 5 1, 72070 Tuebingen, DE');
  });

  it.each(ZIEL_APPS)('verliert bei %s keinen Stopp beim Teilen', (app) => {
    const urls = buildNavigationDayUrls(ziele(23), app);
    const uebergeben = urls.flatMap((url) => {
      if (app === 'system') return [parameter(url).get('q')!];
      const p = parameter(url);
      const zwischen =
        app === 'google_maps' ? (p.get('waypoints')?.split('|') ?? []) : p.getAll('waypoint');
      return [...zwischen, p.get('destination')!];
    });
    expect(uebergeben).toHaveLength(23);
    expect(new Set(uebergeben).size).toBe(23);
  });
});
