import { describe, expect, it } from 'vitest';
import {
  ZOOMSTUFEN,
  ZOOM_STANDARD,
  arbeitszeitBaender,
  aufRaster,
  bereichFuer,
  fensterMitArbeitszeit,
  gitterlinien,
  isoWochentag,
  kachelBreite,
  blaettern,
  istIsoDatum,
  leseParameter,
  linienAchse,
  minuteZuPixel,
  minuteZuZeit,
  pixelZuMinute,
  position,
  schreibeParameter,
  spalten,
  tageImBereich,
  tagePlus,
  tagesFenster,
  wochenBeginn,
  zeitZuMinute,
  zoomSchritt,
  type Arbeitsausnahme,
  type Arbeitsblock,
} from './calendar';

describe('Kalenderarithmetik', () => {
  it('erkennt gueltige Kalendertage', () => {
    expect(istIsoDatum('2027-05-12')).toBe(true);
    expect(istIsoDatum('2027-02-29')).toBe(false); // 2027 ist kein Schaltjahr
    expect(istIsoDatum('2028-02-29')).toBe(true);
    expect(istIsoDatum('2027-13-01')).toBe(false);
    expect(istIsoDatum('12.05.2027')).toBe(false);
    expect(istIsoDatum('')).toBe(false);
    expect(istIsoDatum(null)).toBe(false);
  });

  it('verschiebt ueber Monats- und Jahresgrenzen', () => {
    expect(tagePlus('2027-05-31', 1)).toBe('2027-06-01');
    expect(tagePlus('2027-01-01', -1)).toBe('2026-12-31');
    expect(tagePlus('2028-02-28', 1)).toBe('2028-02-29');
  });

  it('findet den Montag der Woche', () => {
    // 12.05.2027 ist ein Mittwoch.
    expect(wochenBeginn('2027-05-12')).toBe('2027-05-10');
    // Ein Montag bleibt er selbst.
    expect(wochenBeginn('2027-05-10')).toBe('2027-05-10');
    // Ein Sonntag gehoert zur Woche davor.
    expect(wochenBeginn('2027-05-16')).toBe('2027-05-10');
  });

  it('bildet Tages- und Wochenbereiche halboffen ab', () => {
    expect(bereichFuer('tag', '2027-05-12')).toEqual({ von: '2027-05-12', bis: '2027-05-13' });
    expect(bereichFuer('woche', '2027-05-12')).toEqual({ von: '2027-05-10', bis: '2027-05-17' });
  });

  it('zaehlt die Tage eines Bereichs auf', () => {
    expect(tageImBereich({ von: '2027-05-10', bis: '2027-05-17' })).toHaveLength(7);
    expect(tageImBereich({ von: '2027-05-12', bis: '2027-05-13' })).toEqual(['2027-05-12']);
  });

  it('behaelt sieben Tage auch ueber die Zeitumstellung', () => {
    // Woche mit der Umstellung am 28.03.2027.
    expect(tageImBereich(bereichFuer('woche', '2027-03-28'))).toEqual([
      '2027-03-22',
      '2027-03-23',
      '2027-03-24',
      '2027-03-25',
      '2027-03-26',
      '2027-03-27',
      '2027-03-28',
    ]);
  });

  it('blaettert um eine ganze Ansichtslaenge', () => {
    expect(blaettern('tag', '2027-05-12', 1)).toBe('2027-05-13');
    expect(blaettern('tag', '2027-05-12', -1)).toBe('2027-05-11');
    expect(blaettern('woche', '2027-05-12', 1)).toBe('2027-05-19');
    expect(blaettern('woche', '2027-05-12', -1)).toBe('2027-05-05');
  });
});

describe('Query-Parameter', () => {
  const HEUTE = '2027-05-12';

  it('nimmt gueltige Werte an', () => {
    const p = leseParameter(
      new URLSearchParams({
        ansicht: 'tag',
        datum: '2027-06-01',
        person: '55555555-5555-4555-8555-000000000002',
        standort: '33333333-3333-4333-8333-000000000001',
        status: 'all',
      }),
      HEUTE,
    );
    expect(p).toEqual({
      ansicht: 'tag',
      datum: '2027-06-01',
      person: '55555555-5555-4555-8555-000000000002',
      standort: '33333333-3333-4333-8333-000000000001',
      status: 'all',
      patient: null,
      verordnung: null,
      zoom: ZOOM_STANDARD,
    });
  });

  it('faellt ohne Parameter auf sinnvolle Standardwerte zurueck', () => {
    expect(leseParameter(new URLSearchParams(), HEUTE)).toEqual({
      ansicht: 'woche',
      datum: HEUTE,
      person: null,
      standort: null,
      // Standard ist 'active': geplante UND abgeschlossene Termine belegen den
      // Tag, ein abgehakter Termin darf nicht aus der Ansicht fallen (CAL-004).
      status: 'active',
      // Der Patientenfilter kommt nur aus der Akte mit (AKTE-003).
      patient: null,
      verordnung: null,
      zoom: ZOOM_STANDARD,
    });
  });

  it.each([
    ['ansicht', 'monat'],
    ['datum', '2027-02-30'],
    ['datum', 'gestern'],
    ['person', 'nicht-uuid'],
    ['standort', "'; drop table appointments; --"],
    ['status', 'deleted'],
  ])('faellt bei ungueltigem %s sicher zurueck (%s)', (schluessel, wert) => {
    const p = leseParameter(new URLSearchParams({ [schluessel]: wert }), HEUTE);
    const standard = leseParameter(new URLSearchParams(), HEUTE);
    expect(p).toEqual(standard);
  });

  it('schreibt Ansicht und Datum immer, Filter nur wenn gesetzt', () => {
    const suche = schreibeParameter({
      ansicht: 'woche',
      datum: '2027-05-12',
      person: null,
      standort: null,
      status: 'active',
      patient: null,
      verordnung: null,
      zoom: ZOOM_STANDARD,
    });
    expect(suche.toString()).toBe('ansicht=woche&datum=2027-05-12');
  });

  it('schreibt gesetzte Filter mit', () => {
    const suche = schreibeParameter({
      ansicht: 'tag',
      datum: '2027-05-12',
      person: '55555555-5555-4555-8555-000000000002',
      standort: null,
      status: 'all',
      patient: null,
      verordnung: null,
      zoom: ZOOM_STANDARD,
    });
    expect(suche.get('person')).toBe('55555555-5555-4555-8555-000000000002');
    expect(suche.get('status')).toBe('all');
    expect(suche.get('standort')).toBeNull();
  });

  it('ueberlebt den Weg durch die Adresszeile unveraendert', () => {
    const original = {
      ansicht: 'tag' as const,
      datum: '2027-06-01',
      person: '55555555-5555-4555-8555-000000000002',
      standort: '33333333-3333-4333-8333-000000000001',
      status: 'all' as const,
      patient: '66666666-6666-4666-8666-000000000001',
      verordnung: '99999999-9999-4999-8999-000000000001',
      zoom: 144 as const,
    };
    expect(leseParameter(schreibeParameter(original), HEUTE)).toEqual(original);
  });
});

describe('Anordnung im Wochengitter', () => {
  it('ordnet einen Termin proportional in das Tagesfenster ein', () => {
    const fenster = { vonMinute: 8 * 60, bisMinute: 18 * 60 }; // 10 Stunden
    // 13:00-14:00 liegt bei der Haelfte und ist ein Zehntel hoch.
    const { top, hoehe } = position(13 * 60, 14 * 60, fenster);
    expect(top).toBeCloseTo(50, 5);
    expect(hoehe).toBeCloseTo(10, 5);
  });

  it('gibt sehr kurzen Terminen eine anklickbare Mindesthoehe', () => {
    const fenster = { vonMinute: 8 * 60, bisMinute: 20 * 60 };
    expect(position(9 * 60, 9 * 60 + 5, fenster).hoehe).toBeGreaterThanOrEqual(4);
  });

  it('laesst keinen Termin aus dem Fenster herausragen', () => {
    const fenster = { vonMinute: 8 * 60, bisMinute: 18 * 60 };
    const { top, hoehe } = position(17 * 60, 23 * 60, fenster);
    expect(top + hoehe).toBeLessThanOrEqual(100.0001);
  });

  it('waechst das Tagesfenster fuer Termine ausserhalb der ueblichen Zeiten', () => {
    expect(tagesFenster([])).toEqual({ vonMinute: 420, bisMinute: 1200 });
    // Ein Termin um 06:15 zieht die Untergrenze auf die volle Stunde.
    expect(tagesFenster([{ beginn: 6 * 60 + 15, ende: 7 * 60 }]).vonMinute).toBe(6 * 60);
    // Ein Termin bis 21:30 zieht die Obergrenze auf die volle Stunde.
    expect(tagesFenster([{ beginn: 20 * 60, ende: 21 * 60 + 30 }]).bisMinute).toBe(22 * 60);
  });
});

describe('Nebeneinander bei zeitgleichen Terminen', () => {
  it('laesst einen einzelnen Termin die volle Breite behalten', () => {
    expect(spalten([{ beginn: 540, ende: 600 }])).toEqual([{ spalte: 0, anzahl: 1 }]);
  });

  it('laesst aufeinanderfolgende Termine die volle Breite behalten', () => {
    expect(
      spalten([
        { beginn: 540, ende: 600 },
        { beginn: 600, ende: 660 },
      ]),
    ).toEqual([
      { spalte: 0, anzahl: 1 },
      { spalte: 0, anzahl: 1 },
    ]);
  });

  it('stellt zwei ueberlappende Termine nebeneinander', () => {
    expect(
      spalten([
        { beginn: 540, ende: 660 },
        { beginn: 600, ende: 720 },
      ]),
    ).toEqual([
      { spalte: 0, anzahl: 2 },
      { spalte: 1, anzahl: 2 },
    ]);
  });

  it('teilt eine Dreiergruppe in drei Spalten', () => {
    expect(
      spalten([
        { beginn: 540, ende: 660 },
        { beginn: 550, ende: 670 },
        { beginn: 560, ende: 680 },
      ]),
    ).toEqual([
      { spalte: 0, anzahl: 3 },
      { spalte: 1, anzahl: 3 },
      { spalte: 2, anzahl: 3 },
    ]);
  });

  it('gibt eine Spalte nach dem Ende wieder frei', () => {
    const ergebnis = spalten([
      { beginn: 540, ende: 600 },
      { beginn: 545, ende: 605 },
      { beginn: 600, ende: 660 },
    ]);
    // Der dritte Termin ueberlappt nur den zweiten und nimmt dessen Platz eins.
    expect(ergebnis[2]?.spalte).toBe(0);
  });

  it('trennt zeitlich getrennte Gruppen voneinander', () => {
    const ergebnis = spalten([
      { beginn: 540, ende: 660 },
      { beginn: 600, ende: 700 },
      { beginn: 800, ende: 860 },
    ]);
    expect(ergebnis[0]?.anzahl).toBe(2);
    expect(ergebnis[1]?.anzahl).toBe(2);
    // Die spaetere Gruppe steht fuer sich und bekommt die volle Breite.
    expect(ergebnis[2]).toEqual({ spalte: 0, anzahl: 1 });
  });
});

describe('Kachelbreite bei Ueberlappung', () => {
  it('gibt einer allein stehenden Kachel die volle Breite', () => {
    expect(kachelBreite(0, 1)).toEqual({ links: 0, breite: 100 });
  });

  it('laesst zwei Kacheln leicht ueberlappen statt strikt zu teilen', () => {
    const links = kachelBreite(0, 2);
    const rechts = kachelBreite(1, 2);
    expect(links.links).toBe(0);
    expect(rechts.links).toBe(50);
    // Breiter als die strikte Haelfte - sonst bliebe bei drei Personen nur
    // noch ein Buchstabe lesbar.
    expect(links.breite).toBeGreaterThan(50);
    // Die letzte Kachel endet trotzdem am Spaltenrand.
    expect(rechts.links + rechts.breite).toBeLessThanOrEqual(100);
  });

  it('haelt jede Kachel innerhalb der Tagesspalte', () => {
    for (const anzahl of [1, 2, 3, 4, 5]) {
      for (let spalte = 0; spalte < anzahl; spalte++) {
        const { links, breite } = kachelBreite(spalte, anzahl);
        expect(links).toBeGreaterThanOrEqual(0);
        expect(breite).toBeGreaterThan(0);
        expect(links + breite).toBeLessThanOrEqual(100.0001);
      }
    }
  });

  it('gibt auch bei drei Personen mehr als den strikten Anteil', () => {
    expect(kachelBreite(0, 3).breite).toBeGreaterThan(100 / 3);
  });
});

// -----------------------------------------------------------------------------
// Zeitgitter und Arbeitszeit (CAL-006)
// -----------------------------------------------------------------------------

const ANNA = '55555555-5555-4555-8555-000000000002';
const TIM = '55555555-5555-4555-8555-000000000004';

function block(staff: string, weekday: number, von: string, bis: string): Arbeitsblock {
  return { staff_member_id: staff, weekday, starts_at: von, ends_at: bis };
}

function ausnahme(
  staff: string,
  datum: string,
  kind: 'unavailable' | 'block',
  von: string | null = null,
  bis: string | null = null,
): Arbeitsausnahme {
  return { staff_member_id: staff, on_date: datum, kind, starts_at: von, ends_at: bis };
}

describe('Umrechnung Minute und Pixel', () => {
  it('rechnet den Fensteranfang auf null', () => {
    expect(minuteZuPixel(7 * 60, 7 * 60, ZOOM_STANDARD)).toBe(0);
  });

  it('rechnet eine Stunde auf die Stundenhoehe', () => {
    expect(minuteZuPixel(8 * 60, 7 * 60, ZOOM_STANDARD)).toBe(ZOOM_STANDARD);
  });

  it('ist zur Rueckrechnung gegenlaeufig, auf jeder Zoomstufe', () => {
    for (const stufe of ZOOMSTUFEN) {
      for (const minute of [420, 455, 600, 1234]) {
        expect(pixelZuMinute(minuteZuPixel(minute, 420, stufe), 420, stufe)).toBeCloseTo(minute, 6);
      }
    }
  });
});

describe('Zoomstufen des Zeitgitters (CAL-011)', () => {
  it('zeigt in der Voreinstellung das Praxisraster von fuenf Minuten', () => {
    // Der gemeldete Anlass: terminiert wird auf fuenf Minuten genau, zu sehen
    // waren nur Stundenbloecke.
    expect(gitterlinien(ZOOM_STANDARD, 5).fein).toBe(5);
  });

  it('zeichnet das Praxisraster, nicht eine feste Zahl', () => {
    // Stellt die Praxis auf zehn oder fuenfzehn Minuten um, folgt das Gitter:
    // gezeichnet wird, worauf ein Termin einrastet (CAL-005).
    expect(gitterlinien(ZOOM_STANDARD, 10).fein).toBe(10);
    expect(gitterlinien(ZOOM_STANDARD, 15).fein).toBe(15);
  });

  it('laesst die feinen Linien weg, wo sie nur noch eine graue Flaeche waeren', () => {
    // 40 px je Stunde sind 3,3 px je fuenf Minuten - zu eng. Die
    // Viertelstunde traegt mit 10 px noch, ebenso die halbe Stunde.
    const klein = gitterlinien(40, 5);
    expect(klein.fein).toBe(15);
    expect(klein.halbeStunde).toBe(true);

    // 64 px je Stunde: die fuenf Minuten messen 5,3 px und fallen weiterhin
    // weg, die Viertelstunde misst 16 px.
    expect(gitterlinien(64, 5).fein).toBe(15);

    // Erst unterhalb jeder brauchbaren Stufe bleiben nur Stunden uebrig: bei
    // 20 px je Stunde traegt die halbe Stunde noch (10 px), bei 12 px nicht
    // mehr (6 px).
    expect(gitterlinien(20, 5)).toEqual({ fein: null, halbeStunde: true });
    expect(gitterlinien(12, 5)).toEqual({ fein: null, halbeStunde: false });
  });

  it('faellt ohne hinterlegtes Praxisraster auf fuenf Minuten zurueck', () => {
    expect(gitterlinien(ZOOM_STANDARD, null).fein).toBe(5);
    expect(gitterlinien(ZOOM_STANDARD, 0).fein).toBe(5);
  });

  it('bleibt beim Schritt an den Enden stehen', () => {
    const kleinste = ZOOMSTUFEN[0];
    const groesste = ZOOMSTUFEN[ZOOMSTUFEN.length - 1]!;
    expect(zoomSchritt(kleinste, -1)).toBe(kleinste);
    expect(zoomSchritt(groesste, 1)).toBe(groesste);
    expect(zoomSchritt(ZOOM_STANDARD, 1)).toBeGreaterThan(ZOOM_STANDARD);
    expect(zoomSchritt(ZOOM_STANDARD, -1)).toBeLessThan(ZOOM_STANDARD);
  });

  it('liefert die Linien einer Stufe innerhalb des Fensters', () => {
    expect(linienAchse(7 * 60, 8 * 60, 15)).toEqual([420, 435, 450, 465]);
    // Der obere Rand gehoert dazu, der untere nicht - sonst zeichnete die
    // letzte Linie auf den Rahmen des Gitters.
    expect(linienAchse(430, 460, 15)).toEqual([435, 450]);
    expect(linienAchse(7 * 60, 8 * 60, 0)).toEqual([]);
  });
});

describe('aufRaster', () => {
  it.each([
    [543, 5, 545],
    [542, 5, 540],
    [543, 10, 540],
    [546, 10, 550],
    [543, 15, 540],
    [548, 15, 555],
  ])('rundet %s auf einem %ser-Raster zu %s', (wert, raster, erwartet) => {
    expect(aufRaster(wert, raster)).toBe(erwartet);
  });

  it('rundet ohne gueltiges Raster auf volle Minuten', () => {
    // Lieber ganze Minuten als stillschweigend ein anderes Raster annehmen.
    expect(aufRaster(543.4, null)).toBe(543);
    expect(aufRaster(543.6, 0)).toBe(544);
  });
});

describe('Zeitformate', () => {
  it.each([
    ['08:00', 480],
    ['00:00', 0],
    ['23:59', 1439],
    ['13:45', 825],
  ])('liest %s als %s Minuten', (wert, minute) => {
    expect(zeitZuMinute(wert)).toBe(minute);
  });

  it.each([
    [480, '08:00'],
    [0, '00:00'],
    [1439, '23:59'],
    [825, '13:45'],
  ])('schreibt %s Minuten als %s', (minute, wert) => {
    expect(minuteZuZeit(minute)).toBe(wert);
  });

  it('begrenzt auf einen Kalendertag', () => {
    expect(minuteZuZeit(-30)).toBe('00:00');
    expect(minuteZuZeit(2000)).toBe('24:00');
  });
});

describe('isoWochentag', () => {
  it.each([
    ['2027-05-10', 1],
    ['2027-05-12', 3],
    ['2027-05-15', 6],
    ['2027-05-16', 7],
  ])('bestimmt fuer %s den Wochentag %s', (tag, erwartet) => {
    expect(isoWochentag(tag)).toBe(erwartet);
  });
});

describe('arbeitszeitBaender', () => {
  const plan: Arbeitsblock[] = [
    block(ANNA, 3, '13:00', '18:00'),
    block(ANNA, 3, '08:00', '12:00'),
    block(ANNA, 1, '09:00', '17:00'),
    block(TIM, 3, '10:00', '16:00'),
  ];

  it('liefert den Wochenplan der Person, aufsteigend sortiert', () => {
    // 2027-05-12 ist ein Mittwoch.
    expect(arbeitszeitBaender(ANNA, '2027-05-12', plan, [])).toEqual([
      { vonMinute: 480, bisMinute: 720 },
      { vonMinute: 780, bisMinute: 1080 },
    ]);
  });

  it('vermischt zwei Personen nicht', () => {
    expect(arbeitszeitBaender(TIM, '2027-05-12', plan, [])).toEqual([
      { vonMinute: 600, bisMinute: 960 },
    ]);
  });

  it('liefert ohne Eintrag am Wochentag keine Baender', () => {
    // 2027-05-15 ist ein Samstag.
    expect(arbeitszeitBaender(ANNA, '2027-05-15', plan, [])).toEqual([]);
  });

  it('ersetzt den Wochenplan durch abweichende Bloecke, statt ihn zu ergaenzen', () => {
    const baender = arbeitszeitBaender(ANNA, '2027-05-12', plan, [
      ausnahme(ANNA, '2027-05-12', 'block', '18:00', '20:00'),
    ]);
    expect(baender).toEqual([{ vonMinute: 1080, bisMinute: 1200 }]);
  });

  it('liefert an einem Tag ohne Termine gar keine Baender', () => {
    expect(
      arbeitszeitBaender(ANNA, '2027-05-12', plan, [ausnahme(ANNA, '2027-05-12', 'unavailable')]),
    ).toEqual([]);
  });

  it('laesst die Abweichung einer anderen Person unberuecksichtigt', () => {
    const baender = arbeitszeitBaender(ANNA, '2027-05-12', plan, [
      ausnahme(TIM, '2027-05-12', 'unavailable'),
    ]);
    expect(baender).toHaveLength(2);
  });

  it('laesst die Abweichung eines anderen Tages unberuecksichtigt', () => {
    const baender = arbeitszeitBaender(ANNA, '2027-05-12', plan, [
      ausnahme(ANNA, '2027-05-13', 'unavailable'),
    ]);
    expect(baender).toHaveLength(2);
  });
});

describe('fensterMitArbeitszeit', () => {
  it('erweitert das Fenster auf eine frueher beginnende Arbeitszeit', () => {
    expect(
      fensterMitArbeitszeit({ vonMinute: 420, bisMinute: 1200 }, [
        { vonMinute: 330, bisMinute: 600 },
      ]),
    ).toEqual({ vonMinute: 300, bisMinute: 1200 });
  });

  it('erweitert das Fenster auf eine spaeter endende Arbeitszeit', () => {
    expect(
      fensterMitArbeitszeit({ vonMinute: 420, bisMinute: 1200 }, [
        { vonMinute: 1140, bisMinute: 1290 },
      ]),
    ).toEqual({ vonMinute: 420, bisMinute: 1320 });
  });

  it('laesst ein bereits ausreichendes Fenster unveraendert', () => {
    expect(
      fensterMitArbeitszeit({ vonMinute: 420, bisMinute: 1200 }, [
        { vonMinute: 480, bisMinute: 1080 },
      ]),
    ).toEqual({ vonMinute: 420, bisMinute: 1200 });
  });

  it('kommt ohne Arbeitszeit aus', () => {
    expect(fensterMitArbeitszeit({ vonMinute: 420, bisMinute: 1200 }, [])).toEqual({
      vonMinute: 420,
      bisMinute: 1200,
    });
  });
});
