// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NavigationTarget } from './contract';
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

describe('Ziel-App (ADR-019 Punkt 22)', () => {
  // Übergeben wird allein an Google Maps; eine zweite Ziel-App braucht eine neue Fassung des ADR.
  const ANDERE_ZIEL_APP = /maps\.apple\.com|["'`]geo:[-\d$]/;

  function quelldateien(verzeichnis: string): string[] {
    return readdirSync(verzeichnis, { withFileTypes: true }).flatMap((eintrag) => {
      const pfad = join(verzeichnis, eintrag.name);
      if (eintrag.isDirectory()) return quelldateien(pfad);
      if (!/\.(ts|tsx)$/.test(eintrag.name) || /\.test\.tsx?$/.test(eintrag.name)) return [];
      return [pfad];
    });
  }

  it('baut unter src/ keinen Verweis auf Apple Maps oder die Systemnavigation', () => {
    const funde = quelldateien(join(process.cwd(), 'src')).flatMap((pfad) =>
      readFileSync(pfad, 'utf8')
        .split('\n')
        .flatMap((zeile, i) =>
          ANDERE_ZIEL_APP.test(zeile) ? [`${relative(process.cwd(), pfad)}:${i + 1}`] : [],
        ),
    );
    expect(funde).toEqual([]);
  });
});

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
    navigationOeffnen('geo:48.5216,9.0576');

    expect(gesammelt).toEqual([
      { href: 'geo:48.5216,9.0576', target: '', rel: 'noopener noreferrer' },
    ]);
  });

  it('laesst keinen Verweis im Dokument zurueck', () => {
    verweise();
    navigationOeffnen(buildNavigationUrl(koordinate, 'google_maps'));

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

  it('traegt je Abschnitt die Zwischenziele und das Ziel', () => {
    expect(stoppsJeAbschnitt('google_maps')).toBe(MAX_ZWISCHENZIELE + 1);
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

  it('haelt nur Ziel und Fahrmodus', () => {
    const ziel = navigationsZiel(termin);
    expect(ziel).not.toBeNull();
    const url = buildNavigationUrl(ziel!, 'google_maps');
    for (const feld of VERBOTEN) {
      expect(url).not.toContain(feld);
      expect(url).not.toContain(encodeURIComponent(feld));
    }
  });

  it('haelt auch den Tageslink frei davon', () => {
    const ziele = [navigationsZiel(termin)!, koordinate, adresse('Zweite')];
    for (const url of buildNavigationDayUrls(ziele, 'google_maps')) {
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

  it('liefert fuer einen leeren Tag keinen Link', () => {
    expect(buildNavigationDayUrls([], 'google_maps')).toEqual([]);
  });

  it('setzt die Stopps in Terminreihenfolge: letzter als Ziel, Rest als Wegpunkte', () => {
    const [url] = buildNavigationDayUrls(ziele(3), 'google_maps');
    expect(parameter(url!).get('destination')).toBe('Strasse 3 1, 72070 Tuebingen, DE');
    expect(parameter(url!).get('waypoints')).toBe(
      'Strasse 1 1, 72070 Tuebingen, DE|Strasse 2 1, 72070 Tuebingen, DE',
    );
  });

  it('kommt bei einem einzelnen Stopp ohne Wegpunkte aus', () => {
    const [url] = buildNavigationDayUrls(ziele(1), 'google_maps');
    expect(parameter(url!).has('waypoints')).toBe(false);
  });

  it('bleibt innerhalb des Wegpunktlimits', () => {
    const [url] = buildNavigationDayUrls(ziele(stoppsJeAbschnitt('google_maps')), 'google_maps');
    expect(parameter(url!).get('waypoints')!.split('|')).toHaveLength(MAX_ZWISCHENZIELE);
  });

  it('teilt einen laengeren Tag in Abschnitte statt ihn abzuschneiden', () => {
    const urls = buildNavigationDayUrls(ziele(stoppsJeAbschnitt('google_maps') + 2), 'google_maps');
    expect(urls).toHaveLength(2);
    // Der zweite Abschnitt beginnt beim naechsten Stopp - kein wiederholter
    // Punkt, den die Navigation erneut anfahren wuerde.
    expect(parameter(urls[1]!).get('destination')).toBe('Strasse 6 1, 72070 Tuebingen, DE');
    expect(parameter(urls[1]!).get('waypoints')).toBe('Strasse 5 1, 72070 Tuebingen, DE');
  });

  it('verliert keinen Stopp beim Teilen', () => {
    const urls = buildNavigationDayUrls(ziele(23), 'google_maps');
    const uebergeben = urls.flatMap((url) => {
      const p = parameter(url);
      return [...(p.get('waypoints')?.split('|') ?? []), p.get('destination')!];
    });
    expect(uebergeben).toHaveLength(23);
    expect(new Set(uebergeben).size).toBe(23);
  });
});

describe('navigationsZiel mit Kartenposition (MAP-006d, ANN-018)', () => {
  const BESUCH = {
    appointment_type: 'home_visit' as const,
    visit_street: 'Testweg',
    visit_house_number: '7',
    visit_postal_code: '72072',
    visit_city: 'Tübingen',
  };

  it('uebergibt die Koordinate, sobald der Hausbesuch eine traegt', () => {
    const ziel = navigationsZiel({ ...BESUCH, visit_lat: 48.5164, visit_lon: 9.0349 });
    expect(ziel).toEqual({ kind: 'coordinate', position: { lat: 48.5164, lon: 9.0349 } });
    const url = buildNavigationUrl(ziel!, 'google_maps');
    expect(url).toContain('destination=48.5164%2C9.0349');
    expect(url).not.toContain('Testweg');
  });

  it('faellt ohne Koordinate auf die Anschrift ohne Namen zurueck', () => {
    expect(navigationsZiel({ ...BESUCH, visit_lat: null, visit_lon: null })?.kind).toBe('address');
    expect(navigationsZiel(BESUCH)?.kind).toBe('address');
  });

  it('gibt einem Praxistermin auch mit Koordinate kein Ziel', () => {
    expect(
      navigationsZiel({ ...BESUCH, appointment_type: 'practice', visit_lat: 1, visit_lon: 1 }),
    ).toBeNull();
  });
});
