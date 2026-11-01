import { describe, expect, it } from 'vitest';
import { instrumentFuer } from './instrumente';
import { ankerVon, skalenFuer, skalenzeile, stufenVon } from './skalenAmTermin';

const nrs = instrumentFuer('nrs_schmerz')!;
const veraenderung = instrumentFuer('globale_veraenderung')!;

describe('Skalen an der Doku (FRB-EPIC-004, ANN-823)', () => {
  it('stellt die Veränderungsfrage erst ab dem zweiten Termin vor die NRS', () => {
    expect(skalenFuer(1).map((s) => s.meta.id)).toEqual(['nrs_schmerz']);
    expect(skalenFuer(2).map((s) => s.meta.id)).toEqual(['globale_veraenderung', 'nrs_schmerz']);
    expect(skalenFuer(null).map((s) => s.meta.id)).toEqual(['globale_veraenderung', 'nrs_schmerz']);
  });

  it('lässt inaktive Instrumente weg', () => {
    const inaktiv = { ...nrs, meta: { ...nrs.meta, aktiv: false } };
    expect(skalenFuer(1, [inaktiv, veraenderung])).toEqual([]);
  });

  it('macht aus der NRS elf Stufen mit Wert und aus der Veränderungsfrage sieben mit Vorzeichen', () => {
    const schmerz = stufenVon(nrs.items[0]!);
    expect(schmerz.map((s) => s.text)).toEqual([
      '0',
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '10',
    ]);
    expect(schmerz[4]?.antwort).toEqual({ wert: 4 });

    const stufen = stufenVon(veraenderung.items[0]!);
    expect(stufen.map((s) => s.text)).toEqual(['−3', '−2', '−1', '0', '+1', '+2', '+3']);
    expect(stufen[4]).toMatchObject({ bedeutung: 'etwas besser', antwort: { auswahl: '1' } });
  });

  it('nennt die Enden und schreibt eine Zeile ohne Bewertung', () => {
    expect(ankerVon(veraenderung.items[0]!)).toEqual({
      min: 'sehr viel schlechter',
      max: 'sehr viel besser',
    });
    expect(skalenzeile(nrs, stufenVon(nrs.items[0]!)[7]!)).toBe(
      'Numerische Rating-Skala Schmerz (NRS): 7 von 10',
    );
    expect(skalenzeile(veraenderung, stufenVon(veraenderung.items[0]!)[1]!)).toBe(
      'Globale Veränderungsfrage: viel schlechter',
    );
  });
});
