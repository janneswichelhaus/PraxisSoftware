import { describe, expect, it } from 'vitest';
import { aendern, kannZurueck, zurueck, type Abfolge } from '@/components/ui/abfolge';
import {
  NICHTS_GEWAEHLT,
  WUNSCHTAGE,
  artAusAdresse,
  beginneAenderung,
  beginneWunsch,
  egalUmschalten,
  nachDerArt,
  notizFehler,
  seitenfolge,
  stand,
  tagUmschalten,
  tageText,
  ungespeichert,
  vollstaendig,
  wannFehlt,
  wunschtage,
  wunschzeiten,
  zeitUmschalten,
  zeitenText,
  zeitraumText,
  zurZusammenfassung,
  type Angaben,
  type Seite,
  type Wann,
} from './terminablauf';
import { naechsteWerktage } from './zeit';

/**
 * Die reine Logik von „Termin ändern oder absagen“ und „Termin wünschen“
 * (Überholung 6, G6): Seitenfolge, Vollständigkeit, Zusammenfassung und was
 * an den Server geht.
 */

/** Freitag, 16.10.2026: die nächsten 14 Werktage reichen bis Donnerstag, 05.11. */
const WERKTAGE = naechsteWerktage(WUNSCHTAGE, new Date('2026-10-16T09:00:00'));

const LEER: Angaben = { art: null, verstanden: false, wann: NICHTS_GEWAEHLT };
const MONTAGS_VORMITTAGS: Wann = { tage: [1], zeiten: ['morning'] };

describe('Seitenfolge', () => {
  it('hat beim Ändern und beim Absagen drei Seiten, beim Wünschen zwei', () => {
    expect(seitenfolge('aenderung', 'cancel')).toEqual([
      'art',
      'ausfallhonorar',
      'zusammenfassung',
    ]);
    expect(seitenfolge('aenderung', 'change')).toEqual(['art', 'wann', 'zusammenfassung']);
    expect(seitenfolge('aenderung', null)).toHaveLength(3);
    expect(seitenfolge('wunsch', null)).toEqual(['wann', 'zusammenfassung']);
  });

  it('nennt den Schritt mit fester Zahl, auch bevor die Art gewählt ist', () => {
    expect(stand('aenderung', null, 'art')).toEqual({ text: 'Schritt 1 von 3', wert: 1, von: 3 });
    expect(stand('aenderung', 'cancel', 'ausfallhonorar').text).toBe('Schritt 2 von 3');
    expect(stand('aenderung', 'change', 'wann').text).toBe('Schritt 2 von 3');
    expect(stand('aenderung', 'change', 'zusammenfassung').text).toBe('Schritt 3 von 3');
    expect(stand('wunsch', null, 'wann').text).toBe('Schritt 1 von 2');
    expect(stand('wunsch', null, 'zusammenfassung').text).toBe('Schritt 2 von 2');
  });

  it('liest die Art nur als cancel oder change aus der Adresse', () => {
    expect(artAusAdresse('cancel')).toBe('cancel');
    expect(artAusAdresse('change')).toBe('change');
    expect(artAusAdresse('absagen')).toBeNull();
    expect(artAusAdresse(null)).toBeNull();
  });

  it('beginnt ohne Art bei „Was möchten Sie?“, mit Art gleich auf der passenden Seite', () => {
    const ohne = beginneAenderung(null);
    expect(ohne.seite).toBe('art');
    expect(kannZurueck(ohne)).toBe(false);

    const absagen = beginneAenderung('cancel');
    expect(absagen.seite).toBe('ausfallhonorar');
    // „← Zurück“ führt zu „Was möchten Sie?“.
    expect(zurueck(absagen)?.seite).toBe('art');

    expect(beginneAenderung('change').seite).toBe('wann');
    expect(beginneWunsch().seite).toBe('wann');
    expect(kannZurueck(beginneWunsch())).toBe(false);
  });

  it('führt beim Absagen über den Hinweis zur Zusammenfassung und zurück', () => {
    const hinweis = nachDerArt(beginneAenderung(null), LEER, 'cancel');
    expect(hinweis.seite).toBe('ausfallhonorar');
    const ende = zurZusammenfassung(hinweis);
    expect(ende.seite).toBe('zusammenfassung');
    expect(zurueck(ende)?.seite).toBe('ausfallhonorar');
    expect(zurueck(zurueck(ende)!)?.seite).toBe('art');
  });

  it('kehrt nach dem Ändern aus der Zusammenfassung dorthin zurück', () => {
    const angaben: Angaben = { art: 'change', verstanden: false, wann: MONTAGS_VORMITTAGS };
    const ende = zurZusammenfassung(nachDerArt(beginneAenderung(null), LEER, 'change'));
    // Die Tage ändern: „Wann passt es Ihnen?“, dann gleich wieder die Zusammenfassung.
    const wann = aendern(ende, 'wann');
    expect(wann.seite).toBe('wann');
    expect(zurZusammenfassung(wann)).toEqual(ende);
    // Dieselbe Art noch einmal gewählt: zurück, weil alles da ist.
    const art = aendern(ende, 'art');
    expect(nachDerArt(art, angaben, 'change')).toEqual(ende);
    // „← Zurück“ aus dem Ändern führt ebenso zur Zusammenfassung.
    expect(zurueck(art)).toEqual(ende);
  });

  it('beginnt den Weg neu, wenn aus der Zusammenfassung die andere Art gewählt wird', () => {
    const absage: Angaben = { art: 'cancel', verstanden: true, wann: NICHTS_GEWAEHLT };
    const ende = zurZusammenfassung(nachDerArt(beginneAenderung(null), LEER, 'cancel'));
    const neu = nachDerArt(aendern(ende, 'art'), absage, 'change');
    expect(neu.seite).toBe('wann');
    expect(neu.rueckkehr).toBeNull();
    // „← Zurück“ aus der neuen Zusammenfassung führt auf „Wann passt es Ihnen?“,
    // nicht auf den Hinweis zum Ausfallhonorar des anderen Wegs.
    const neuesEnde = zurZusammenfassung(neu);
    expect(neuesEnde.seite).toBe('zusammenfassung');
    expect(zurueck(neuesEnde)?.seite).toBe('wann');
    expect(neuesEnde.verlauf).toEqual(['art', 'wann']);
  });

  it('zeigt nach dem Wechsel zurück zum Absagen den Hinweis wieder', () => {
    const aenderung: Angaben = { art: 'change', verstanden: false, wann: MONTAGS_VORMITTAGS };
    const ende: Abfolge<Seite> = zurZusammenfassung(
      nachDerArt(beginneAenderung(null), LEER, 'change'),
    );
    const neu = nachDerArt(aendern(ende, 'art'), aenderung, 'cancel');
    expect(neu.seite).toBe('ausfallhonorar');
    expect(zurueck(neu)?.seite).toBe('art');
  });
});

describe('Vollständig', () => {
  it('ist beim Absagen erst mit dem gelesenen Hinweis vollständig', () => {
    expect(vollstaendig('aenderung', { ...LEER, art: 'cancel' })).toBe(false);
    expect(vollstaendig('aenderung', { ...LEER, art: 'cancel', verstanden: true })).toBe(true);
    expect(vollstaendig('aenderung', LEER)).toBe(false);
  });

  it('braucht beim Ändern und Wünschen einen Tag und eine Tageszeit oder „Egal“', () => {
    expect(vollstaendig('aenderung', { ...LEER, art: 'change' })).toBe(false);
    expect(
      vollstaendig('aenderung', { ...LEER, art: 'change', wann: { tage: [1], zeiten: [] } }),
    ).toBe(false);
    expect(vollstaendig('aenderung', { ...LEER, art: 'change', wann: MONTAGS_VORMITTAGS })).toBe(
      true,
    );
    expect(vollstaendig('wunsch', { ...LEER, wann: { tage: [5], zeiten: 'egal' } })).toBe(true);
  });

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
    expect(ungespeichert(beginneAenderung(null), NICHTS_GEWAEHLT, '')).toBe(false);
    expect(ungespeichert(beginneAenderung('cancel'), NICHTS_GEWAEHLT, '')).toBe(true);
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

describe('Zusammenfassung', () => {
  it('nennt die Tage in Worten', () => {
    expect(tageText([1])).toBe('Montag');
    expect(tageText([3, 1])).toBe('Montag und Mittwoch');
    expect(tageText([1, 3, 5])).toBe('Montag, Mittwoch und Freitag');
    expect(tageText([1, 2, 3, 4, 5])).toBe('Montag bis Freitag');
  });

  it('nennt die Tageszeit in Worten', () => {
    expect(zeitenText('egal')).toBe('Jede Tageszeit');
    expect(zeitenText(['midday'])).toBe('Mittag');
    expect(zeitenText(['afternoon', 'morning'])).toBe('Vormittag und Nachmittag');
    expect(zeitenText(['morning', 'midday', 'afternoon'])).toBe('Vormittag, Mittag und Nachmittag');
  });

  it('sagt, bis wann die gewählten Tage reichen', () => {
    expect(zeitraumText(wunschtage([1, 3], WERKTAGE))).toBe('bis Mittwoch, 04.11.');
    expect(zeitraumText([])).toBe('');
  });
});
