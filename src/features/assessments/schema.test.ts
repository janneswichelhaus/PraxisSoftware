import { describe, expect, it } from 'vitest';
import {
  bausteinItemSchema,
  bausteinRegionSchema,
  blockSchema,
  kennungSchema,
  optionKennung,
  scoreDefinitionSchema,
  scoreItemSchema,
  versionSchema,
  type ScoreItem,
} from './schema';

/**
 * Das Schema ist nur so viel wert, wie es zurückweist.
 *
 * Diese Datei prüft deshalb vor allem Negativfälle: Jede Zusicherung, die der
 * Arbeitsauftrag (`quellen/ARBEITSAUFTRAG_Bausteine-und-Scores.md`) an eine
 * Definition stellt, hat hier einen Fall, der sie verletzt — sonst stünde die
 * Regel nur im Kommentar.
 */

/** Ein knapper, gültiger Block als Ausgangspunkt der Negativfälle. */
function block(abweichung: Record<string, unknown> = {}) {
  return {
    id: 'basisuntersuchung',
    label: 'Basisuntersuchung',
    art: 'basis',
    items: [
      {
        id: 'knie_lachmann_test',
        label: 'Lachmann-Test',
        type: 'test',
        bilateral: true,
        result_type: 'befund',
      },
    ],
    ...abweichung,
  };
}

function region(abweichung: Record<string, unknown> = {}) {
  return { id: 'knie', label: 'Knie', version: '1.0.0', blocks: [block()], ...abweichung };
}

describe('Kennung', () => {
  it.each(['knie', 'knie_lachmann_test', 'hws_therapie_hochzervikal', 'item_3'])(
    'nimmt %s an',
    (wert) => {
      expect(kennungSchema.safeParse(wert).success).toBe(true);
    },
  );

  it.each([
    ['Knie', 'Großbuchstaben'],
    ['knie-lachmann', 'Bindestrich'],
    ['3_knie', 'Ziffer am Anfang'],
    ['knie__test', 'doppelter Unterstrich'],
    ['knie_', 'Unterstrich am Ende'],
    ['', 'leer'],
  ])('weist %s zurueck (%s)', (wert) => {
    expect(kennungSchema.safeParse(wert).success).toBe(false);
  });
});

describe('Version', () => {
  it('nimmt eine semantische Version an', () => {
    expect(versionSchema.safeParse('1.0.0').success).toBe(true);
  });

  it.each(['1.0', '2026-09-21', 'v1.0.0', '1'])('weist %s zurueck', (wert) => {
    expect(versionSchema.safeParse(wert).success).toBe(false);
  });
});

describe('Item eines Untersuchungsbausteins', () => {
  it('nimmt einen Test mit Messwert an', () => {
    const ergebnis = bausteinItemSchema.safeParse({
      id: 'fuss_knee_to_wall',
      label: 'Knee-to-Wall',
      type: 'test',
      bilateral: true,
      result_type: 'befund',
      value_field: { label: 'Abstand', unit: 'cm', input: 'zahl' },
      hint: '30–60 Sekunden halten',
    });
    expect(ergebnis.success).toBe(true);
  });

  it('weist eine Technik mit Testergebnis zurueck', () => {
    // Die Kopplung von type und result_type ist der Kern: Eine Technik hat
    // keinen Befund, und "positiv" an einer Behandlungstechnik waere eine
    // Aussage, die niemand getroffen hat.
    const ergebnis = bausteinItemSchema.safeParse({
      id: 'knie_patella_mobilisation',
      label: 'Patellamobilisation',
      type: 'technik',
      bilateral: true,
      result_type: 'befund',
    });
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.message).toContain('result_type "durchgefuehrt"');
  });

  it('weist einen Test mit Technikergebnis zurueck', () => {
    const ergebnis = bausteinItemSchema.safeParse({
      id: 'knie_lachmann_test',
      label: 'Lachmann-Test',
      type: 'test',
      bilateral: true,
      result_type: 'durchgefuehrt',
    });
    expect(ergebnis.success).toBe(false);
  });

  it.each(['befundet', 'positiv', ''])('weist result_type %s zurueck', (result_type) => {
    const ergebnis = bausteinItemSchema.safeParse({
      id: 'knie_lachmann_test',
      label: 'Lachmann-Test',
      type: 'test',
      bilateral: true,
      result_type,
    });
    expect(ergebnis.success).toBe(false);
  });

  it('weist ein Item ohne bilateral-Angabe zurueck', () => {
    // Seitengetrennt oder nicht ist keine Vorliebe der Oberflaeche: Ohne die
    // Angabe entstehen Ergebnisse, die sich spaeter nicht zuordnen lassen.
    const ohne = {
      id: 'knie_lachmann_test',
      label: 'Lachmann-Test',
      type: 'test',
      result_type: 'befund',
    };
    expect(bausteinItemSchema.safeParse(ohne).success).toBe(false);
  });

  it('weist ein leeres Label zurueck', () => {
    expect(bausteinItemSchema.safeParse({ ...block().items[0], label: '' }).success).toBe(false);
  });

  it('weist eine leere Subitem-Liste zurueck', () => {
    expect(bausteinItemSchema.safeParse({ ...block().items[0], subitems: [] }).success).toBe(false);
  });

  it('nimmt eine Gruppe mit Subitems an', () => {
    const ergebnis = bausteinItemSchema.safeParse({
      ...block().items[0],
      id: 'ellenbogen_let',
      label: 'LET',
      subitems: [
        { id: 'cozen_test', label: 'Cozen-Test' },
        { id: 'maudsley_test', label: 'Maudsley-Test' },
      ],
    });
    expect(ergebnis.success).toBe(true);
  });
});

describe('Block', () => {
  it('nimmt einen Block mit Items an', () => {
    expect(blockSchema.safeParse(block()).success).toBe(true);
  });

  it('nimmt einen leeren Block mit status unvollstaendig an', () => {
    // Die vier bekannten Luecken der Vorlage (Arbeitsauftrag §2) entstehen so —
    // sichtbar offen statt aus eigenem Wissen gefuellt.
    const ergebnis = blockSchema.safeParse(block({ items: [], status: 'unvollstaendig' }));
    expect(ergebnis.success).toBe(true);
  });

  it('weist einen leeren Block ohne Kennzeichen zurueck', () => {
    const ergebnis = blockSchema.safeParse(block({ items: [] }));
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.message).toContain('unvollstaendig');
  });

  it('weist einen gefuellten Block mit Kennzeichen unvollstaendig zurueck', () => {
    expect(blockSchema.safeParse(block({ status: 'unvollstaendig' })).success).toBe(false);
  });

  it.each(['basis', 'weiterfuehrend', 'spezial', 'therapie'])('nimmt die Blockart %s an', (art) => {
    expect(blockSchema.safeParse(block({ art })).success).toBe(true);
  });

  it('weist eine unbekannte Blockart zurueck', () => {
    expect(blockSchema.safeParse(block({ art: 'sonstiges' })).success).toBe(false);
  });
});

describe('Region', () => {
  it('nimmt eine Region an', () => {
    expect(bausteinRegionSchema.safeParse(region()).success).toBe(true);
  });

  it('weist eine Definition ohne version zurueck', () => {
    const ohne = { id: 'knie', label: 'Knie', blocks: [block()] };
    const ergebnis = bausteinRegionSchema.safeParse(ohne);
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues.some((issue) => issue.path.includes('version'))).toBe(true);
  });

  it('weist eine Region ohne Block zurueck', () => {
    expect(bausteinRegionSchema.safeParse(region({ blocks: [] })).success).toBe(false);
  });

  it('weist unbekannte Felder nicht ab, aber uebernimmt sie nicht', () => {
    // Zod ignoriert Zusatzfelder. Das ist hier gewollt: Eine Vorlage darf einen
    // Kommentar tragen, ohne den Ladepfad zu sprengen. Dass keine *bekannte*
    // Angabe still verlorengeht, sichern die Felder darueber.
    const ergebnis = bausteinRegionSchema.safeParse({ ...region(), kommentar: 'aus PDF Seite 3' });
    expect(ergebnis.success).toBe(true);
    expect(ergebnis.data).not.toHaveProperty('kommentar');
  });
});

/* ------------------------------------------------------------------------- *
 * Scores (FRB-006)
 * ------------------------------------------------------------------------- */

/**
 * Die Formen unten sind die des Inventars — jede steht für Instrumente, die
 * wirklich vorliegen. Zusammen sind sie der Nachweis, dass das Schema die 18
 * Rechenvorschriften ausdrücken kann, **bevor** in P4 und P5 Itemtexte
 * übertragen werden. Ein Schema, das erst beim zwölften Fragebogen bricht,
 * hätte bis dahin elf Dateien nach sich zu ziehen.
 */

const LIZENZ = {
  status: 'freigegeben' as const,
  begruendung: 'Jannes, 2026-09-21: keine Lizenzierung, Integration freigegeben (B8 offen).',
  stand: '2026-09-21',
};

function meta(abweichung: Record<string, unknown> = {}) {
  return {
    id: 'visa_a',
    version: '1.0.0',
    name_de: 'VISA-A Score',
    region: 'Untere Extremitaet / Achillessehne',
    konstrukt: 'Schweregrad und Verlauf der Achillessehnen-Tendinopathie',
    ausgefuellt_von: 'patient',
    sprache: 'de',
    prioritaet: 'a',
    quelle: { datei: 'VISA-A-Score_09-2023.pdf', validierung: 'Lohrer & Nauck 2009' },
    lizenzstatus: LIZENZ,
    aktiv: true,
    ...abweichung,
  };
}

/** Ein Item mit Antwortoptionen, wie es in fast jedem der 18 Bögen steht. */
function item(id: string, nummer: number, abweichung: Partial<ScoreItem> = {}) {
  return {
    id,
    nummer,
    text: `Frage ${nummer}`,
    typ: 'einzelauswahl',
    optionen: [
      { label: 'nie', wert: 0 },
      { label: 'immer', wert: 4 },
    ],
    ...abweichung,
  };
}

function score(abweichung: Record<string, unknown> = {}) {
  return {
    meta: meta(),
    items: [item('frage_1', 1), item('frage_2', 2)],
    scoring: {
      regel_wortlaut: 'Summe der Antwortwerte, dargestellt als x/100 bzw. %',
      gesamt: { formel: { art: 'summe' }, wertebereich: { min: 0, max: 8 } },
      subskalen: [],
      richtung: 'hoch_ist_besser',
      missing_value_regel: 'im PDF nicht geregelt - alle Fragen erforderlich',
    },
    interpretation: { cutoffs: '100 = beschwerdefrei', mcid: 'mindestens 12 Punkte', mdc: null },
    referenzfaelle: [
      {
        bezeichnung: 'beide Fragen maximal',
        antworten: { frage_1: 4, frage_2: 4 },
        erwartet: { gesamt: 8 },
      },
    ],
    ...abweichung,
  };
}

describe('Score-Definition', () => {
  it('nimmt einen Summenscore an', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(score());
    expect(ergebnis.error?.issues).toBeUndefined();
    expect(ergebnis.success).toBe(true);
  });

  it('setzt gewertet standardmaessig auf true', () => {
    // Der Arbeitsauftrag verlangt, nicht gewertete Items zu *markieren*. Der
    // Standard steht deshalb auf gewertet: Markiert wird die Ausnahme.
    const ergebnis = scoreDefinitionSchema.parse(score());
    expect(ergebnis.items.every((eintrag) => eintrag.gewertet)).toBe(true);
  });

  it('weist eine Definition ohne richtung zurueck', () => {
    const scoringOhneRichtung: Record<string, unknown> = { ...score().scoring };
    delete scoringOhneRichtung.richtung;
    const ergebnis = scoreDefinitionSchema.safeParse(score({ scoring: scoringOhneRichtung }));
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues.some((issue) => issue.path.includes('richtung'))).toBe(true);
  });

  it('weist eine unbekannte richtung zurueck', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({ scoring: { ...score().scoring, richtung: 'hoch_ist_gut' } }),
    );
    expect(ergebnis.success).toBe(false);
  });

  it('weist einen rechnenden Score ohne Referenzfall zurueck', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(score({ referenzfaelle: [] }));
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.message).toContain('unbelegt');
  });

  it('weist doppelte Item-Kennungen zurueck', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({ items: [item('frage_1', 1), item('frage_1', 2)] }),
    );
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.message).toContain('Doppelte Item-Kennung');
  });

  it('weist ein aktives Instrument mit ungeklaerter Lizenz zurueck', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        meta: meta({
          aktiv: true,
          lizenzstatus: { ...LIZENZ, status: 'ungeklaert', begruendung: 'Auskunft steht aus' },
        }),
      }),
    );
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.message).toContain('nicht aktiv sein');
  });

  it('nimmt ein nicht aktives Instrument mit ungeklaerter Lizenz an', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        meta: meta({
          aktiv: false,
          lizenzstatus: { ...LIZENZ, status: 'ungeklaert', begruendung: 'Auskunft steht aus' },
        }),
      }),
    );
    expect(ergebnis.success).toBe(true);
  });

  it('weist ein aktives Instrument ohne Vorlage im Repository zurueck (ANN-099)', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        meta: meta({
          aktiv: true,
          quelle: { literatur: 'Stratford et al. 1995', validierung: 'keine deutsche' },
        }),
      }),
    );
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.message).toContain('Wortlaut ist vorläufig');
  });

  it('nimmt ein nicht aktives Instrument mit Literatur statt Vorlage an', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        meta: meta({
          aktiv: false,
          quelle: { literatur: 'Stratford et al. 1995', validierung: 'keine deutsche' },
        }),
      }),
    );
    expect(ergebnis.success).toBe(true);
  });

  it('weist eine Quelle ohne Vorlage und ohne Literatur zurueck', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({ meta: meta({ aktiv: false, quelle: { validierung: 'keine' } }) }),
    );
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.path).toEqual(['meta', 'quelle']);
  });
});

describe('Score-Items', () => {
  it('nimmt Anker an einer Skala an', () => {
    const ergebnis = scoreItemSchema.safeParse({
      id: 'schmerz',
      text: 'Schmerz',
      typ: 'skala',
      skala: { min: 0, max: 10 },
      anker: { min: 'keine', max: 'stärkste' },
    });
    expect(ergebnis.success).toBe(true);
  });

  it('weist Anker an einer Einzelauswahl zurueck', () => {
    const ergebnis = scoreItemSchema.safeParse({
      ...item('frage_1', 1),
      anker: { min: 'nie', max: 'immer' },
    });
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.path).toEqual(['anker']);
  });

  it('weist eine Einzelauswahl ohne Optionen zurueck', () => {
    const ergebnis = scoreItemSchema.safeParse({
      id: 'frage_1',
      text: 'Frage 1',
      typ: 'einzelauswahl',
    });
    expect(ergebnis.success).toBe(false);
  });

  it('weist eine Skala ohne Wertebereich zurueck', () => {
    const ergebnis = scoreItemSchema.safeParse({ id: 'nrs', text: 'Schmerz', typ: 'skala' });
    expect(ergebnis.success).toBe(false);
  });

  it('nimmt eine NRS mit Wertebereich an', () => {
    const ergebnis = scoreItemSchema.safeParse({
      id: 'nrs',
      text: 'Schmerz in den letzten 7 Tagen',
      typ: 'skala',
      skala: { min: 0, max: 10 },
    });
    expect(ergebnis.success).toBe(true);
  });

  it('weist einen gewerteten Freitext zurueck', () => {
    const ergebnis = scoreItemSchema.safeParse({
      id: 'sonstiges',
      text: 'Sonstige Beschwerden',
      typ: 'freitext',
      gewertet: true,
    });
    expect(ergebnis.success).toBe(false);
  });

  it('haelt die Punktzuordnung am Item fest, nicht im Code', () => {
    // Die Falle, die das Inventar beim HOOS ausdruecklich nennt: Dieselbe
    // Antwort bedeutet im KOOS 0 und im HOOS 4. Weil der Wert am Item steht,
    // kann sie sich nicht im Code verstecken.
    const koos = scoreItemSchema.parse(
      item('koos_p1', 1, {
        optionen: [
          { label: 'gering', wert: 0 },
          { label: 'stark', wert: 4 },
        ],
      }),
    );
    const hoos = scoreItemSchema.parse(
      item('hoos_s1', 1, {
        optionen: [
          { label: 'gering', wert: 4 },
          { label: 'stark', wert: 0 },
        ],
      }),
    );
    expect(koos.optionen?.[0]?.wert).toBe(0);
    expect(hoos.optionen?.[0]?.wert).toBe(4);
  });
});

describe('Rechenformen der 18 Instrumente', () => {
  it('drueckt den ODI aus: Summe der Sektionen als Prozentwert', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        meta: meta({ id: 'odi' }),
        scoring: {
          regel_wortlaut: 'Summe der 10 Sektionen (0-50), x 2 = Prozentwert',
          gesamt: {
            formel: { art: 'summe_prozent', maximum: 50 },
            wertebereich: { min: 0, max: 100 },
          },
          subskalen: [],
          richtung: 'hoch_ist_schlechter',
          missing_value_regel: 'TODO_ENTSCHEIDUNG',
        },
      }),
    );
    expect(ergebnis.error?.issues).toBeUndefined();
    expect(ergebnis.success).toBe(true);
  });

  it('drueckt den KOOS aus: fuenf Subskalen, kein Gesamtwert', () => {
    // "Subskalen einzeln auswerten - kein Gesamtscore bilden" (Inventar).
    // gesamt: null ist hier eine Angabe der Quelle, kein fehlender Eintrag.
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        meta: meta({ id: 'koos' }),
        scoring: {
          regel_wortlaut: 'Je Subskala: 100 - (Mittelwert der Items x 100 / 4)',
          gesamt: null,
          subskalen: [
            {
              id: 'schmerz',
              label: 'Schmerz',
              items: ['frage_1', 'frage_2'],
              formel: { art: 'mittelwert_invertiert', item_maximum: 4 },
              wertebereich: { min: 0, max: 100 },
            },
          ],
          richtung: 'hoch_ist_besser',
          missing_value_regel: 'Nicht durchfuehrbare Aktivitaet = schlechteste Punktzahl',
        },
        referenzfaelle: [
          {
            bezeichnung: 'alle Items maximal belastet',
            antworten: { frage_1: 4, frage_2: 4 },
            erwartet: { gesamt: null, subskalen: { schmerz: 0 } },
          },
        ],
      }),
    );
    expect(ergebnis.error?.issues).toBeUndefined();
    expect(ergebnis.success).toBe(true);
  });

  it('drueckt den PRWE-G aus: Schmerz plus halbe Funktionssumme', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        meta: meta({ id: 'prwe_g', prioritaet: 'b' }),
        scoring: {
          regel_wortlaut: 'Schmerz-Summe + (Funktions-Summe / 2) = Gesamtscore 0-100',
          gesamt: {
            formel: { art: 'gewichtete_subskalensumme', gewichte: { schmerz: 1, funktion: 0.5 } },
            wertebereich: { min: 0, max: 100 },
          },
          subskalen: [
            {
              id: 'schmerz',
              label: 'Schmerz',
              items: ['frage_1'],
              formel: { art: 'summe' },
              wertebereich: { min: 0, max: 50 },
            },
            {
              id: 'funktion',
              label: 'Funktion',
              items: ['frage_2'],
              formel: { art: 'summe' },
              wertebereich: { min: 0, max: 100 },
            },
          ],
          richtung: 'hoch_ist_schlechter',
          missing_value_regel:
            "'trifft nicht zu' wird in der jeweiligen Subskala nicht mitgezaehlt",
        },
      }),
    );
    expect(ergebnis.error?.issues).toBeUndefined();
    expect(ergebnis.success).toBe(true);
  });

  it('drueckt den FAAM aus: nicht zutreffend senkt das Maximum', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        meta: meta({ id: 'faam_g', prioritaet: 'b' }),
        scoring: {
          regel_wortlaut: '(erreichte Punkte / maximal moegliche Punkte) x 100 - je Subskala',
          gesamt: null,
          subskalen: [
            {
              id: 'adl',
              label: 'ADL',
              items: ['frage_1', 'frage_2'],
              formel: { art: 'summe_prozent', maximum: 'aus_gewerteten_items', item_maximum: 4 },
              wertebereich: { min: 0, max: 100 },
            },
          ],
          richtung: 'hoch_ist_besser',
          missing_value_regel:
            "'nicht zutreffend' reduziert das Maximum, wird nicht als 0 gewertet",
        },
        referenzfaelle: [
          {
            bezeichnung: 'eine Aktivitaet nicht zutreffend',
            antworten: { frage_1: 4 },
            erwartet: { subskalen: { adl: 100 } },
          },
        ],
      }),
    );
    expect(ergebnis.error?.issues).toBeUndefined();
    expect(ergebnis.success).toBe(true);
  });

  it('weist aus_gewerteten_items ohne item_maximum zurueck', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        scoring: {
          ...score().scoring,
          gesamt: {
            formel: { art: 'summe_prozent', maximum: 'aus_gewerteten_items' },
            wertebereich: { min: 0, max: 100 },
          },
        },
      }),
    );
    expect(ergebnis.success).toBe(false);
  });

  it('drueckt die Tegner-Skala aus: ein Item, keine Richtung', () => {
    // "hoch = aktiver" ist keine Wertung. hoch_ist_besser zu schreiben waere
    // eine Aussage, die weder im Inventar steht noch nach ADR-006 Punkt 11 von
    // uns kommen darf (ANN-085).
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        meta: meta({ id: 'tegner', prioritaet: 'b' }),
        items: [item('aktivitaetsniveau', 1, { typ: 'skala', skala: { min: 0, max: 10 } })],
        scoring: {
          regel_wortlaut: 'Direkte Einstufung - keine Berechnung',
          gesamt: {
            formel: { art: 'einzelwert', item: 'aktivitaetsniveau' },
            wertebereich: { min: 0, max: 10 },
          },
          subskalen: [],
          richtung: 'nicht_anwendbar',
          missing_value_regel: 'n/a',
        },
        referenzfaelle: [
          {
            bezeichnung: 'Wettkampfsport',
            antworten: { aktivitaetsniveau: 9 },
            erwartet: { gesamt: 9 },
          },
        ],
      }),
    );
    expect(ergebnis.error?.issues).toBeUndefined();
    expect(ergebnis.success).toBe(true);
  });

  it('drueckt den Anamnesebogen aus: Erfassung ohne Score', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        meta: meta({ id: 'anamnesebogen_v8', ausgefuellt_von: 'patient' }),
        items: [
          item('frage_1', 1, { typ: 'freitext', gewertet: false, optionen: undefined }),
          item('frage_2', 2, {
            typ: 'mehrfachauswahl',
            gewertet: false,
            // Ohne Punktwert: Der Bogen kennt keinen, und einen zu erfinden
            // verbietet der Arbeitsauftrag §5 Punkt 2 (ANN-102).
            optionen: [
              { id: 'nacken', label: 'Nacken' },
              { id: 'ruecken', label: 'Ruecken' },
            ],
          }),
        ],
        scoring: {
          regel_wortlaut: 'Kein Scoring - reine Informationserfassung',
          gesamt: null,
          subskalen: [],
          richtung: 'nicht_anwendbar',
          missing_value_regel: 'n/a',
        },
        interpretation: { cutoffs: null, mcid: null, mdc: null },
        referenzfaelle: [],
      }),
    );
    expect(ergebnis.error?.issues).toBeUndefined();
    expect(ergebnis.success).toBe(true);
  });

  it('weist ein Instrument ohne Score mit behaupteter Richtung zurueck', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        scoring: {
          ...score().scoring,
          gesamt: null,
          subskalen: [],
          richtung: 'hoch_ist_schlechter',
        },
        referenzfaelle: [],
      }),
    );
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.message).toContain('nicht_anwendbar');
  });
});

describe('Subskalen und Referenzfaelle', () => {
  it('drueckt den FABQ aus: 16 Items, 11 gewertet, zwei Bereiche', () => {
    const items = Array.from({ length: 16 }, (_, stelle) =>
      item(`frage_${stelle + 1}`, stelle + 1, {
        gewertet: ![1, 8, 13, 14, 16].includes(stelle + 1),
      }),
    );
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        meta: meta({ id: 'fabq' }),
        items,
        scoring: {
          regel_wortlaut:
            'Subskalen getrennt summieren - Items 1, 8, 13, 14, 16 werden NICHT gewertet',
          gesamt: null,
          subskalen: [
            {
              id: 'fabq_pa',
              label: 'FABQ-PA',
              items: ['frage_2', 'frage_3', 'frage_4', 'frage_5'],
              formel: { art: 'summe' },
              wertebereich: { min: 0, max: 24 },
            },
            {
              id: 'fabq_w',
              label: 'FABQ-W',
              items: [
                'frage_6',
                'frage_7',
                'frage_9',
                'frage_10',
                'frage_11',
                'frage_12',
                'frage_15',
              ],
              formel: { art: 'summe' },
              wertebereich: { min: 0, max: 42 },
            },
          ],
          richtung: 'hoch_ist_schlechter',
          missing_value_regel: 'TODO_ENTSCHEIDUNG',
        },
        referenzfaelle: [
          {
            bezeichnung: 'alle gewerteten Items auf 0',
            antworten: Object.fromEntries(items.map((eintrag) => [eintrag.id, 0])),
            erwartet: { subskalen: { fabq_pa: 0, fabq_w: 0 } },
          },
        ],
      }),
    );
    expect(ergebnis.error?.issues).toBeUndefined();
    expect(ergebnis.success).toBe(true);
    expect(ergebnis.data?.items.filter((eintrag) => eintrag.gewertet)).toHaveLength(11);
  });

  it('weist eine Subskala mit unbekanntem Item zurueck', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        scoring: {
          ...score().scoring,
          subskalen: [
            {
              id: 'schmerz',
              label: 'Schmerz',
              items: ['frage_7'],
              formel: { art: 'summe' },
              wertebereich: { min: 0, max: 4 },
            },
          ],
        },
      }),
    );
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.message).toContain('unbekannte Item "frage_7"');
  });

  it('weist ein nicht gewertetes Item in einer Subskala zurueck', () => {
    // Die FABQ-Falle: Items 1, 8, 13, 14 und 16 werden gezeigt, aber nicht
    // gewertet. Stehen sie trotzdem in einer Subskala, ist der Wert falsch und
    // niemand sieht es am Ergebnis.
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        items: [item('frage_1', 1, { gewertet: false }), item('frage_2', 2)],
        scoring: {
          ...score().scoring,
          gesamt: null,
          subskalen: [
            {
              id: 'schmerz',
              label: 'Schmerz',
              items: ['frage_1', 'frage_2'],
              formel: { art: 'summe' },
              wertebereich: { min: 0, max: 8 },
            },
          ],
        },
        referenzfaelle: [
          {
            bezeichnung: 'beide',
            antworten: { frage_2: 4 },
            erwartet: { subskalen: { schmerz: 4 } },
          },
        ],
      }),
    );
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.message).toContain('nicht gewertet');
  });

  it('weist eine Einzelwert-Formel auf ein unbekanntes Item zurueck', () => {
    // Auch an der Subskala, nicht nur am Gesamtwert: Der seltene Fall ist der,
    // den sonst niemand prueft.
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        scoring: {
          ...score().scoring,
          gesamt: null,
          subskalen: [
            {
              id: 'niveau',
              label: 'Niveau',
              items: ['frage_1'],
              formel: { art: 'einzelwert', item: 'frage_7' },
              wertebereich: { min: 0, max: 10 },
            },
          ],
        },
        referenzfaelle: [
          {
            bezeichnung: 'hoch',
            antworten: { frage_1: 4 },
            erwartet: { subskalen: { niveau: 4 } },
          },
        ],
      }),
    );
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.message).toContain('unbekannte Item "frage_7"');
  });

  it('weist eine Gewichtung auf eine unbekannte Subskala zurueck', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        scoring: {
          ...score().scoring,
          gesamt: {
            formel: { art: 'gewichtete_subskalensumme', gewichte: { funktion: 0.5 } },
            wertebereich: { min: 0, max: 100 },
          },
        },
      }),
    );
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.message).toContain('unbekannte Subskala "funktion"');
  });

  it('weist einen Referenzfall auf ein unbekanntes Item zurueck', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        referenzfaelle: [
          { bezeichnung: 'Tippfehler', antworten: { frage_9: 4 }, erwartet: { gesamt: 4 } },
        ],
      }),
    );
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.message).toContain('unbekannte Item "frage_9"');
  });

  it('weist einen Referenzfall auf eine unbekannte Subskala zurueck', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        referenzfaelle: [
          {
            bezeichnung: 'Tippfehler',
            antworten: { frage_1: 4 },
            erwartet: { subskalen: { schmerz: 4 } },
          },
        ],
      }),
    );
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.message).toContain('unbekannte Subskala "schmerz"');
  });

  it('weist eine unbekannte Formelart zurueck', () => {
    const ergebnis = scoreDefinitionSchema.safeParse(
      score({
        scoring: {
          ...score().scoring,
          gesamt: { formel: { art: 'z_wert' }, wertebereich: { min: 0, max: 1 } },
        },
      }),
    );
    expect(ergebnis.success).toBe(false);
  });
});

describe('Optionen und Antworttypen der Erhebung (FRB-EPIC-002)', () => {
  const erfassung = (optionen: unknown, abweichung: Partial<ScoreItem> = {}) =>
    scoreItemSchema.safeParse(
      item('frage', 1, {
        gewertet: false,
        optionen: optionen as ScoreItem['optionen'],
        ...abweichung,
      }),
    );

  it('nimmt eine Option ohne Punktwert an, wenn sie eine Kennung trägt', () => {
    expect(
      erfassung([
        { id: 'ja', label: 'ja' },
        { id: 'nein', label: 'nein' },
      ]).success,
    ).toBe(true);
  });

  it('weist eine Option ohne Kennung und ohne Punktwert zurück', () => {
    // Sie liesse sich nicht speichern (ANN-102).
    expect(erfassung([{ id: 'ja', label: 'ja' }, { label: 'nein' }]).success).toBe(false);
  });

  it('verlangt am gewerteten Item weiter den Punktwert', () => {
    const ergebnis = scoreItemSchema.safeParse(
      item('frage', 1, {
        optionen: [
          { id: 'nie', label: 'nie' },
          { label: 'immer', wert: 4 },
        ],
      }),
    );
    expect(ergebnis.success).toBe(false);
    expect(ergebnis.error?.issues[0]?.message).toMatch(/Punktwert/);
  });

  it('weist doppelte Kennungen innerhalb eines Items zurück', () => {
    expect(
      erfassung([
        { id: 'ja', label: 'ja' },
        { id: 'ja', label: 'jein' },
      ]).success,
    ).toBe(false);
  });

  it('erlaubt exklusiv nur in einer Mehrfachauswahl', () => {
    const optionen = [
      { id: 'kopf', label: 'Kopf' },
      { id: 'nein', label: 'nein', exklusiv: true },
    ];
    expect(erfassung(optionen, { typ: 'mehrfachauswahl' }).success).toBe(true);
    expect(erfassung(optionen, { typ: 'einzelauswahl' }).success).toBe(false);
  });

  it('nimmt ein Körperschema nur ungewertet an', () => {
    expect(
      scoreItemSchema.safeParse(
        item('ort', 1, { typ: 'koerperschema', gewertet: false, optionen: undefined }),
      ).success,
    ).toBe(true);
    expect(
      scoreItemSchema.safeParse(
        item('ort', 1, { typ: 'koerperschema', gewertet: true, optionen: undefined }),
      ).success,
    ).toBe(false);
  });

  it('speichert die Kennung, sonst den Punktwert', () => {
    expect(optionKennung({ id: 'nachtschmerzen', wert: 3 })).toBe('nachtschmerzen');
    expect(optionKennung({ wert: 3 })).toBe('3');
  });
});
