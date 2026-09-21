import { describe, expect, it } from 'vitest';
import {
  bausteinItemSchema,
  bausteinRegionSchema,
  blockSchema,
  kennungSchema,
  versionSchema,
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
