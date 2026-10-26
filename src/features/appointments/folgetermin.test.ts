import { describe, expect, it } from 'vitest';
import {
  dauerangabe,
  freieMinuten,
  moeglicheDauer,
  moeglichText,
  nachbarText,
  nachbarZeiten,
  plane,
  tagKurz,
  urteilAus,
  wegangabe,
  type Urteil,
  type Zeitraum,
} from './folgetermin';
import { luftStufe, type Seite, type Wegpruefung } from './wegpruefung';
import { zeitpunktIn } from '@/lib/datum';

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

function minute(zeit: string): number {
  return Number(zeit.slice(0, 2)) * 60 + Number(zeit.slice(3));
}

/** Ein Termin am Tag, gleich welcher Art - es zählen nur die Zeiten. */
function termin(von: string, bis: string): Zeitraum {
  return {
    starts_at: zeitpunktIn(TAG, minute(von), ZONE),
    ends_at: zeitpunktIn(TAG, minute(bis), ZONE),
  };
}

function um(zeit: string): number {
  return Date.parse(zeitpunktIn(TAG, minute(zeit), ZONE));
}

function band(von: string, bis: string) {
  return { vonMinute: minute(von), bisMinute: minute(bis) };
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

describe('nachbarZeiten', () => {
  it('nimmt jeden Termin des Tages, den nächsten davor und danach', () => {
    const video = termin('10:00', '10:30');
    const { vorher, nachher } = nachbarZeiten(
      [termin('07:00', '07:45'), termin('08:00', '08:45'), video, termin('11:30', '12:30')],
      um('09:00'),
      um('10:00'),
    );
    expect(vorher).toEqual(termin('08:00', '08:45'));
    // Direkt anschließend zählt - auch ein Termin ohne Ort.
    expect(nachher).toBe(video);
  });

  it('übergeht, was den Vorschlag überschneidet', () => {
    expect(nachbarZeiten([termin('08:30', '09:30')], um('09:00'), um('10:00'))).toEqual({
      vorher: null,
      nachher: null,
    });
  });
});

describe('freieMinuten', () => {
  const arbeit = [band('08:00', '12:00'), band('13:00', '17:00')];

  it('reicht bis zum nächsten Termin, gleich welcher Art', () => {
    expect(
      freieMinuten({
        beginn: um('09:00'),
        beginnMinute: minute('09:00'),
        nachher: termin('10:15', '10:45'),
        baender: arbeit,
      }),
    ).toBe(75);
  });

  it('endet an der Pause, auch wenn danach lange nichts kommt', () => {
    expect(
      freieMinuten({
        beginn: um('11:00'),
        beginnMinute: minute('11:00'),
        nachher: termin('14:00', '15:00'),
        baender: arbeit,
      }),
    ).toBe(60);
  });

  it('zählt aneinanderstoßende Bänder als eines', () => {
    expect(
      freieMinuten({
        beginn: um('11:00'),
        beginnMinute: minute('11:00'),
        nachher: null,
        baender: [band('12:00', '16:00'), band('08:00', '12:00')],
      }),
    ).toBe(300);
  });

  it('kennt ohne Termin danach und außerhalb jedes Bands keine Grenze', () => {
    expect(
      freieMinuten({
        beginn: um('18:00'),
        beginnMinute: minute('18:00'),
        nachher: null,
        baender: arbeit,
      }),
    ).toBeNull();
  });
});

describe('moeglicheDauer', () => {
  it('rundet die Luft danach auf das Raster ab', () => {
    expect(moeglicheDauer(60, 32, 5)).toBe(90);
    expect(moeglicheDauer(60, 32, 10)).toBe(90);
    expect(moeglicheDauer(60, 32, 15)).toBe(90);
    expect(moeglicheDauer(60, 29, 15)).toBe(75);
    expect(moeglicheDauer(60, 4, 5)).toBe(60);
    expect(moeglicheDauer(45, 0, 5)).toBe(45);
    expect(moeglicheDauer(45, -5, 5)).toBe(45);
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

describe('dauerangabe (ANN-535)', () => {
  const passt = bereit(geprueft(20), geprueft(32));

  it('rechnet mit der Luft zur Weiterfahrt, wenn die Belegung weiter reicht', () => {
    expect(dauerangabe(passt, { dauer: 60, raster: 5, frei: 240 })).toBe('bis 90 Min. möglich');
  });

  it('rechnet am Tagesrand bis zum Arbeitsende (Rückfahrt)', () => {
    expect(
      dauerangabe(bereit(geprueft(20), geprueft(15, 'tagesrand')), {
        dauer: 60,
        raster: 5,
        frei: 240,
      }),
    ).toBe('bis 75 Min. möglich');
  });

  it('endet am nächsten Termin ohne Ort oder an der Pause, auch wenn der Weg mehr hergäbe', () => {
    // Videotermin um 10:00 nach dem Vorschlag 09:00–10:00: nichts dazu.
    expect(dauerangabe(passt, { dauer: 60, raster: 5, frei: 60 })).toBe('bis 60 Min. möglich');
    expect(dauerangabe(passt, { dauer: 60, raster: 15, frei: 80 })).toBe('bis 75 Min. möglich');
  });

  it('nennt am Videotermin die Grenze der Belegung', () => {
    expect(dauerangabe({ stand: 'aus' }, { dauer: 45, raster: 5, frei: 75 })).toBe(
      'bis 75 Min. möglich',
    );
    expect(dauerangabe({ stand: 'aus' }, { dauer: 45, raster: 5, frei: null })).toBeNull();
  });

  it('nennt ohne Weiterfahrt mit Ort die Grenze der Belegung', () => {
    expect(
      dauerangabe(bereit(geprueft(20), { stand: 'offen' }), { dauer: 60, raster: 5, frei: 90 }),
    ).toBe('bis 90 Min. möglich');
  });

  it('sagt nichts, solange die Weiterfahrt oder die Belegung unbekannt ist', () => {
    expect(dauerangabe(passt, { dauer: 60, raster: 5, frei: 'unbekannt' })).toBeNull();
    for (const weiter of [
      { stand: 'nicht_geprueft' },
      { stand: 'nachbar_nicht_verortet' },
      { stand: 'laedt' },
    ] as const) {
      expect(
        dauerangabe(bereit(geprueft(20), weiter), { dauer: 60, raster: 5, frei: 240 }),
      ).toBeNull();
    }
    for (const stand of ['nicht_verortet', 'veraltet', 'fehler', 'laedt'] as const) {
      expect(dauerangabe({ stand }, { dauer: 60, raster: 5, frei: 240 })).toBeNull();
    }
  });

  it('nimmt bei ungeprüfter Anfahrt die geprüfte Weiterfahrt', () => {
    expect(
      dauerangabe(bereit({ stand: 'nicht_geprueft' }, geprueft(30)), {
        dauer: 60,
        raster: 5,
        frei: 240,
      }),
    ).toBe('bis 90 Min. möglich');
  });
});

describe('wegangabe', () => {
  it('sagt „Wege passen“ leise: der Regelfall trägt kein Abzeichen (DESIGN.md Regel 5)', () => {
    expect(wegangabe(bereit(geprueft(20), geprueft(32)))).toEqual({
      ton: 'neutral',
      wort: 'Wege passen',
    });
  });

  it('nennt eine knappe Seite als Warnung', () => {
    expect(wegangabe(bereit(geprueft(3), geprueft(30)))).toEqual({
      ton: 'warnung',
      wort: 'Weg knapp',
    });
  });

  it('nennt Ungeprüftes leise', () => {
    expect(wegangabe(bereit({ stand: 'nicht_geprueft' }, geprueft(30)))).toEqual({
      ton: 'neutral',
      wort: 'Weg ungeprüft',
    });
    expect(wegangabe({ stand: 'nicht_verortet' })).toEqual({
      ton: 'neutral',
      wort: 'Weg ungeprüft',
    });
  });

  it('sagt nichts, wo es nichts zu prüfen gibt', () => {
    expect(wegangabe({ stand: 'aus' })).toBeNull();
    expect(wegangabe(bereit({ stand: 'offen' }, { stand: 'offen' }))).toBeNull();
    expect(wegangabe(bereit({ stand: 'offen' }, geprueft(30)))).toEqual({
      ton: 'neutral',
      wort: 'Weg passt',
    });
  });
});

describe('nachbarText', () => {
  it('nennt nur Zeiten', () => {
    expect(nachbarText(termin('08:00', '08:45'), termin('11:30', '12:30'), ZONE)).toBe(
      'davor 08:00–08:45 · danach 11:30',
    );
    expect(nachbarText(null, termin('11:30', '12:30'), ZONE)).toBe('danach 11:30');
    expect(nachbarText(termin('08:00', '08:45'), null, ZONE)).toBe('davor 08:00–08:45');
    expect(nachbarText(null, null, ZONE)).toBe('kein Termin davor oder danach');
  });
});
