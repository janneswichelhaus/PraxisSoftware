import { describe, expect, it } from 'vitest';
import type { Fassungsinhalt, Grundlagenfassung } from './api';
import { aenderungen, verlauf } from './verlauf';

/** BEF-124 (ANN-562): Was eine Änderung ersetzt hat, je Feld mit dem Wert davor. */
const stand: Fassungsinhalt = {
  treatment_basis_kind: 'first',
  prescriber_name: 'Dr. med. Petra Probst',
  issued_on: '2026-03-01',
  appointment_count: 10,
  frequency_note: null,
  note: null,
  diagnosis: 'Synthetisch: Schulter rechts.',
  diagnosis_icd10: null,
  therapy_goal: null,
  prescriber_note: null,
  follow_up_recommendation: null,
  items: [{ remedy: 'Krankengymnastik', prescribed_quantity: 10 }],
};

function fassung(version_no: number, content: Fassungsinhalt): Grundlagenfassung {
  return {
    version_no,
    content,
    replaced_at: `2026-03-0${version_no + 1}T10:00:00.000Z`,
    replaced_by_name: 'Anna Beispiel',
  };
}

describe('aenderungen', () => {
  it('nennt nur geänderte Felder, mit dem früheren Wert', () => {
    expect(
      aenderungen(stand, {
        ...stand,
        appointment_count: 6,
        diagnosis_icd10: 'M75.1',
        items: [{ remedy: 'Krankengymnastik', prescribed_quantity: 6 }],
      }),
    ).toEqual([
      { feld: 'Heilmittel', vorher: 'Krankengymnastik × 10' },
      { feld: 'Anzahl möglicher Termine', vorher: '10' },
      { feld: 'ICD-10', vorher: '—' },
    ]);
  });

  it('meldet nichts, wenn alles gleich ist', () => {
    expect(aenderungen(stand, { ...stand })).toEqual([]);
  });
});

describe('verlauf', () => {
  it('vergleicht die jüngste Fassung mit dem aktuellen Stand und jede ältere mit der nächsten', () => {
    const v1 = fassung(1, stand);
    const v2 = fassung(2, { ...stand, appointment_count: 6 });
    const aktuell = { ...stand, appointment_count: 6, note: 'Synthetisch: Anmerkung.' };

    // Absichtlich aufsteigend übergeben: Die Reihenfolge des Servers zählt nicht.
    const eintraege = verlauf([v1, v2], aktuell);
    expect(eintraege.map((e) => e.version_no)).toEqual([2, 1]);
    expect(eintraege[0]!.aenderungen).toEqual([{ feld: 'Anmerkungen', vorher: '—' }]);
    expect(eintraege[1]!.aenderungen).toEqual([{ feld: 'Anzahl möglicher Termine', vorher: '10' }]);
  });
});
