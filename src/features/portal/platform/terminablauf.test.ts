import { describe, expect, it } from 'vitest';
import { aendern, kannZurueck, zurueck, type Abfolge } from '@/components/ui/abfolge';
import {
  NICHTS_GEWAEHLT,
  WUNSCHTAGE,
  artAusAdresse,
  beginneAenderung,
  beginneWunsch,
  egalUmschalten,
  notizFehler,
  seitenfolge,
  stand,
  tagUmschalten,
  ungespeichert,
  wannFehlt,
  wunschtage,
  wunschzeiten,
  zeitUmschalten,
  zurZusammenfassung,
  type Seite,
  type Wann,
} from './terminablauf';
import { naechsteWerktage } from './zeit';

/**
 * Die reine Logik von Wünschen, Ändern und Absagen: Seitenfolge in zwei Schritten, was fehlt und was
 * an den Server geht.
 */

/** Freitag, 16.10.2026: die nächsten 14 Werktage reichen bis Donnerstag, 05.11. */
const WERKTAGE = naechsteWerktage(WUNSCHTAGE, new Date('2026-10-16T09:00:00'));

const MONTAGS_VORMITTAGS: Wann = { tage: [1], zeiten: ['morning'] };

describe('Seitenfolge', () => {
  it('hat auf jedem Weg zwei Seiten: Ändern und Absagen beginnen auf der Seite des Termins', () => {
    expect(seitenfolge('aenderung', 'cancel')).toEqual(['ausfallhonorar', 'zusammenfassung']);
    expect(seitenfolge('aenderung', 'change')).toEqual(['wann', 'zusammenfassung']);
    expect(seitenfolge('wunsch', null)).toEqual(['wann', 'zusammenfassung']);
  });

  it('nennt den Schritt mit fester Zahl', () => {
    expect(stand('aenderung', 'cancel', 'ausfallhonorar')).toEqual({
      text: 'Schritt 1 von 2',
      wert: 1,
      von: 2,
    });
    expect(stand('aenderung', 'change', 'wann').text).toBe('Schritt 1 von 2');
    expect(stand('aenderung', 'change', 'zusammenfassung').text).toBe('Schritt 2 von 2');
    expect(stand('wunsch', null, 'wann').text).toBe('Schritt 1 von 2');
    expect(stand('wunsch', null, 'zusammenfassung').text).toBe('Schritt 2 von 2');
  });

  it('liest die Art nur als cancel oder change aus der Adresse', () => {
    expect(artAusAdresse('cancel')).toBe('cancel');
    expect(artAusAdresse('change')).toBe('change');
    expect(artAusAdresse('absagen')).toBeNull();
    expect(artAusAdresse(null)).toBeNull();
  });

  it('beginnt auf der ersten Seite des Wegs, ohne „← Zurück“', () => {
    const absagen = beginneAenderung('cancel');
    expect(absagen.seite).toBe('ausfallhonorar');
    expect(kannZurueck(absagen)).toBe(false);
    expect(beginneAenderung('change').seite).toBe('wann');
    expect(kannZurueck(beginneAenderung('change'))).toBe(false);
    expect(beginneWunsch().seite).toBe('wann');
    expect(kannZurueck(beginneWunsch())).toBe(false);
  });

  it('führt beim Absagen über den Hinweis zur Zusammenfassung und zurück', () => {
    const ende = zurZusammenfassung(beginneAenderung('cancel'));
    expect(ende.seite).toBe('zusammenfassung');
    expect(zurueck(ende)?.seite).toBe('ausfallhonorar');
    expect(zurueck(zurueck(ende)!)).toBeNull();
  });

  it('kehrt nach dem Ändern aus der Zusammenfassung dorthin zurück', () => {
    const ende: Abfolge<Seite> = zurZusammenfassung(beginneAenderung('change'));
    // Die Tage ändern: „Wann passt es Ihnen?“, dann gleich wieder die Zusammenfassung.
    const wann = aendern(ende, 'wann');
    expect(wann.seite).toBe('wann');
    expect(zurZusammenfassung(wann)).toEqual(ende);
    // „← Zurück“ aus dem Ändern führt ebenso zur Zusammenfassung.
    expect(zurueck(wann)).toEqual(ende);
  });
});

describe('Vollständig', () => {
  it('sagt, was fehlt', () => {
    expect(wannFehlt(NICHTS_GEWAEHLT)).toBe('Bitte wählen Sie mindestens einen Tag.');
    expect(wannFehlt({ tage: [2], zeiten: [] })).toBe(
      'Bitte wählen Sie eine Tageszeit oder „Egal“.',
    );
    expect(wannFehlt({ tage: [2], zeiten: 'egal' })).toBeNull();
  });

  it('prüft die Länge der Nachricht wie der Server, ohne Leerraum am Rand', () => {
    expect(notizFehler(`  ${'a'.repeat(500)}  `)).toBeNull();
    expect(notizFehler('a'.repeat(501))).toBe(
      'Ihre Nachricht darf höchstens 500 Zeichen lang sein.',
    );
  });

  it('hält ab der zweiten Seite oder mit einer Wahl als ungespeichert fest', () => {
    expect(ungespeichert(beginneAenderung('cancel'), NICHTS_GEWAEHLT, '')).toBe(false);
    expect(ungespeichert(zurZusammenfassung(beginneAenderung('cancel')), NICHTS_GEWAEHLT, '')).toBe(
      true,
    );
    expect(ungespeichert(beginneAenderung('change'), MONTAGS_VORMITTAGS, '')).toBe(true);
    expect(ungespeichert(beginneWunsch(), { tage: [3], zeiten: [] }, '')).toBe(true);
    expect(ungespeichert(beginneWunsch(), { tage: [], zeiten: 'egal' }, '')).toBe(true);
    expect(ungespeichert(beginneWunsch(), NICHTS_GEWAEHLT, ' Bitte anrufen ')).toBe(true);
    expect(ungespeichert(beginneWunsch(), NICHTS_GEWAEHLT, '   ')).toBe(false);
  });
});

describe('Wann passt es Ihnen?', () => {
  it('schaltet Tage um und hält sie in der Folge der Woche', () => {
    let wann = tagUmschalten(NICHTS_GEWAEHLT, 5);
    wann = tagUmschalten(wann, 1);
    expect(wann.tage).toEqual([1, 5]);
    expect(tagUmschalten(wann, 5).tage).toEqual([1]);
  });

  it('lässt „Egal“ und einzelne Tageszeiten einander ausschließen', () => {
    const vormittag = zeitUmschalten(NICHTS_GEWAEHLT, 'morning');
    expect(vormittag.zeiten).toEqual(['morning']);
    const egal = egalUmschalten(vormittag);
    expect(egal.zeiten).toBe('egal');
    expect(zeitUmschalten(egal, 'afternoon').zeiten).toEqual(['afternoon']);
    expect(egalUmschalten(egal).zeiten).toEqual([]);
    // Die Folge des Tages, nicht die des Antippens.
    expect(zeitUmschalten(zeitUmschalten(NICHTS_GEWAEHLT, 'afternoon'), 'morning').zeiten).toEqual([
      'morning',
      'afternoon',
    ]);
  });

  it('gibt dem Server jeden gewählten Wochentag der nächsten 14 Werktage als Kalendertag', () => {
    expect(WERKTAGE).toHaveLength(14);
    expect(WERKTAGE[0]).toBe('2026-10-19');
    expect(WERKTAGE[13]).toBe('2026-11-05');
    expect(wunschtage([1, 3], WERKTAGE)).toEqual([
      '2026-10-19',
      '2026-10-21',
      '2026-10-26',
      '2026-10-28',
      '2026-11-02',
      '2026-11-04',
    ]);
    // Alle fünf Tage: alle 14 Werktage - nie mehr, als der Server annimmt.
    expect(wunschtage([1, 2, 3, 4, 5], WERKTAGE)).toEqual(WERKTAGE);
    expect(wunschtage([], WERKTAGE)).toEqual([]);
  });

  it('gibt dem Server bei „Egal“ keine Tageszeit - das heißt dort jede', () => {
    expect(wunschzeiten('egal')).toEqual([]);
    expect(wunschzeiten(['afternoon', 'morning'])).toEqual(['morning', 'afternoon']);
  });
});
