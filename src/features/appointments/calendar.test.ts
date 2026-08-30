import { describe, expect, it } from 'vitest';
import {
  bereichFuer,
  kachelBreite,
  blaettern,
  istIsoDatum,
  leseParameter,
  position,
  schreibeParameter,
  spalten,
  tageImBereich,
  tagePlus,
  tagesFenster,
  wochenBeginn,
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
    });
  });

  it('faellt ohne Parameter auf sinnvolle Standardwerte zurueck', () => {
    expect(leseParameter(new URLSearchParams(), HEUTE)).toEqual({
      ansicht: 'woche',
      datum: HEUTE,
      person: null,
      standort: null,
      status: 'scheduled',
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
      status: 'scheduled',
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
