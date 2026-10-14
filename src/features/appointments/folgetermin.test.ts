import { describe, expect, it } from 'vitest';
import type { Tagesstopp } from '@/features/tours/tagesroute';
import { zeitpunktIn } from './api';
import {
  moeglicheDauer,
  moeglichText,
  nachbarText,
  plane,
  tagKurz,
  urteilAus,
  wegangabe,
  type Urteil,
} from './folgetermin';
import { luftStufe, type Seite, type Wegpruefung } from './wegpruefung';

/** Befund B8: die Regeln hinter den Folgeterminvorschlägen (ANN-535). */

const ZONE = 'Europe/Berlin';
const TAG = '2027-05-12';

function geprueft(luft: number, nachbar: 'termin' | 'tagesrand' = 'termin'): Seite {
  return {
    stand: 'geprueft',
    luft,
    stufe: luftStufe(luft),
    fruehester: zeitpunktIn(TAG, 9 * 60, ZONE),
    fahrtMinuten: 12,
    nachbar,
    nachbarZeit: zeitpunktIn(TAG, 8 * 60, ZONE),
  };
}

function bereit(an: Seite, weiter: Seite): Wegpruefung {
  return { stand: 'bereit', an, weiter };
}

function stopp(von: string, bis: string): Tagesstopp {
  const minute = (z: string) => Number(z.slice(0, 2)) * 60 + Number(z.slice(3));
  return {
    id: `${von}-${bis}`,
    kind: 'therapy',
    appointment_type: 'home_visit',
    status: 'confirmed',
    starts_at: zeitpunktIn(TAG, minute(von), ZONE),
    ends_at: zeitpunktIn(TAG, minute(bis), ZONE),
    lat: 48.52,
    lon: 9.05,
    geocode_precision: 'address',
    position_source: 'visit',
  };
}

describe('tagKurz', () => {
  it('schreibt den Tag kurz mit Wochentag', () => {
    expect(tagKurz('2026-10-20')).toBe('Di 20.10.');
  });
});

describe('urteilAus (ANN-535)', () => {
  it('lässt einen Kandidaten mit zu knapper Seite wegfallen - auch wenn die andere passt', () => {
    expect(urteilAus(bereit(geprueft(-1), geprueft(30)), true)).toBe('faellt_weg');
    expect(urteilAus(bereit(geprueft(30), geprueft(-10, 'tagesrand')), true)).toBe('faellt_weg');
  });

  it('behält knappe und ungeprüfte Kandidaten', () => {
    expect(urteilAus(bereit(geprueft(0), geprueft(4)), true)).toBe('bleibt');
    expect(urteilAus(bereit({ stand: 'nicht_geprueft' }, geprueft(30)), true)).toBe('bleibt');
    expect(urteilAus({ stand: 'nicht_verortet' }, true)).toBe('bleibt');
    expect(urteilAus({ stand: 'fehler' }, true)).toBe('bleibt');
    // Videotermin: nichts zu prüfen.
    expect(urteilAus({ stand: 'aus' }, true)).toBe('bleibt');
  });

  it('wartet auf jede Seite und auf die Nachbarn', () => {
    expect(urteilAus({ stand: 'laedt' }, true)).toBe('laedt');
    expect(urteilAus(bereit({ stand: 'laedt' }, geprueft(30)), true)).toBe('laedt');
    expect(urteilAus(bereit(geprueft(30), geprueft(30)), false)).toBe('laedt');
    // Zu knapp steht fest, auch bevor die andere Seite fertig ist.
    expect(urteilAus(bereit({ stand: 'laedt' }, geprueft(-5)), false)).toBe('faellt_weg');
  });
});

describe('plane (ANN-535)', () => {
  const k = (schluessel: string, tag: string) => ({ schluessel, tag });
  const kandidaten = [
    k('a', 'd7'),
    k('b1', 'd1'),
    k('b2', 'd1'),
    k('c', 'd2'),
    k('d', 'd3'),
    k('e', 'd4'),
    k('f', 'd5'),
    k('g', 'd6'),
  ];
  const urteile = (eintraege: Record<string, Urteil>) => new Map(Object.entries(eintraege));

  it('prüft zuerst je Tag einen, bis drei dastehen', () => {
    const plan = plane(kandidaten, urteile({}));
    expect([...plan.pruefen]).toEqual(['a', 'b1', 'c']);
    expect(plan.zeigen).toEqual([]);
    expect(plan.offen).toBe(true);
  });

  it('zeigt in der Reihenfolge der Kandidaten, gleiche Zeit zuerst', () => {
    const plan = plane(kandidaten, urteile({ a: 'bleibt', b1: 'bleibt', c: 'bleibt' }));
    expect(plan.zeigen).toEqual(['a', 'b1', 'c']);
    expect(plan.offen).toBe(false);
  });

  it('lässt den nächsten Platz nachrücken, auch am selben Tag', () => {
    const plan = plane(kandidaten, urteile({ a: 'bleibt', b1: 'faellt_weg', c: 'bleibt' }));
    expect([...plan.pruefen]).toEqual(['a', 'b1', 'b2', 'c']);
    // b2 läuft noch: c wartet, damit keine Zeile verrutscht.
    expect(plan.zeigen).toEqual(['a']);
    expect(plan.offen).toBe(true);

    const fertig = plane(
      kandidaten,
      urteile({ a: 'bleibt', b1: 'faellt_weg', b2: 'bleibt', c: 'bleibt' }),
    );
    expect(fertig.zeigen).toEqual(['a', 'b2', 'c']);
  });

  it('zeigt nichts hinter einer laufenden Prüfung', () => {
    const plan = plane(kandidaten, urteile({ b1: 'bleibt', c: 'bleibt' }));
    expect(plan.zeigen).toEqual([]);
    expect(plan.offen).toBe(true);
  });

  it('prüft höchstens sechs Kandidaten', () => {
    const alleWeg = Object.fromEntries(
      kandidaten.map((c) => [c.schluessel, 'faellt_weg' as const]),
    );
    const plan = plane(kandidaten, urteile(alleWeg));
    expect(plan.pruefen.size).toBe(6);
    expect(plan.zeigen).toEqual([]);
    expect(plan.offen).toBe(false);
  });
});

describe('moeglicheDauer', () => {
  it('rundet die Luft zur Weiterfahrt auf das Raster ab', () => {
    expect(moeglicheDauer(60, 32, 5)).toBe(90);
    expect(moeglicheDauer(60, 32, 10)).toBe(90);
    expect(moeglicheDauer(60, 32, 15)).toBe(90);
    expect(moeglicheDauer(60, 29, 15)).toBe(75);
    expect(moeglicheDauer(60, 4, 5)).toBe(60);
    expect(moeglicheDauer(45, 0, 5)).toBe(45);
  });

  it('nimmt ohne Raster der Praxis fünf Minuten', () => {
    expect(moeglicheDauer(60, 12, null)).toBe(70);
  });

  it('sagt über zwei Stunden nur die Grenze', () => {
    expect(moeglichText(90)).toBe('bis 90 Min. möglich');
    expect(moeglichText(120)).toBe('bis 120 Min. möglich');
    expect(moeglichText(125)).toBe('über 2 Std. möglich');
  });
});

describe('wegangabe', () => {
  it('sagt „Wege passen“ mit der möglichen Dauer', () => {
    expect(wegangabe(bereit(geprueft(20), geprueft(32)), 60, 5)).toEqual({
      ton: 'positiv',
      wort: 'Wege passen',
      dauer: 'bis 90 Min. möglich',
    });
  });

  it('rechnet am Tagesrand bis zum Arbeitsende (Rückfahrt)', () => {
    expect(wegangabe(bereit(geprueft(20), geprueft(15, 'tagesrand')), 60, 5)?.dauer).toBe(
      'bis 75 Min. möglich',
    );
  });

  it('nennt eine knappe Seite als Warnung', () => {
    expect(wegangabe(bereit(geprueft(3), geprueft(30)), 60, 5)).toMatchObject({
      ton: 'warnung',
      wort: 'Weg knapp',
    });
  });

  it('nennt Ungeprüftes leise', () => {
    expect(wegangabe(bereit({ stand: 'nicht_geprueft' }, geprueft(30)), 60, 5)).toEqual({
      ton: 'neutral',
      wort: 'Weg ungeprüft',
      dauer: 'bis 90 Min. möglich',
    });
    expect(wegangabe({ stand: 'nicht_verortet' }, 60, 5)).toEqual({
      ton: 'neutral',
      wort: 'Weg ungeprüft',
      dauer: null,
    });
  });

  it('sagt nichts, wo es nichts zu prüfen gibt', () => {
    expect(wegangabe({ stand: 'aus' }, 60, 5)).toBeNull();
    expect(wegangabe(bereit({ stand: 'offen' }, { stand: 'offen' }), 60, 5)).toBeNull();
    expect(wegangabe(bereit({ stand: 'offen' }, geprueft(30)), 60, 5)?.wort).toBe('Weg passt');
  });
});

describe('nachbarText', () => {
  it('nennt nur Zeiten', () => {
    expect(nachbarText(stopp('08:00', '08:45'), stopp('11:30', '12:30'), ZONE)).toBe(
      'davor 08:00–08:45 · danach 11:30',
    );
    expect(nachbarText(null, stopp('11:30', '12:30'), ZONE)).toBe('danach 11:30');
    expect(nachbarText(stopp('08:00', '08:45'), null, ZONE)).toBe('davor 08:00–08:45');
    expect(nachbarText(null, null, ZONE)).toBe('kein Termin davor oder danach');
  });
});
