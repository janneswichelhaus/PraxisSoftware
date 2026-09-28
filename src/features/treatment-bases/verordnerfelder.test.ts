import { describe, expect, it } from 'vitest';
import { leereVerordnerdaten, prescriberSchemaForm, type Prescriber } from './api';
import {
  VERORDNER_BESCHRIFTUNG,
  VERORDNER_HOECHSTLAENGE,
  VERORDNER_REIHENFOLGE,
  verordnerAuswahlname,
  verordnerFeldId,
} from './verordnerfelder';

describe('Felder des Verordner-Formulars', () => {
  it('kennt jedes Feld des Schemas genau einmal', () => {
    expect([...VERORDNER_REIHENFOLGE].sort()).toEqual(Object.keys(leereVerordnerdaten).sort());
    expect(new Set(VERORDNER_REIHENFOLGE.map(verordnerFeldId)).size).toBe(
      VERORDNER_REIHENFOLGE.length,
    );
    expect(VERORDNER_BESCHRIFTUNG.family_name).toBe('Nachname');
  });

  // VER-15: `maxLength` am Feld und die Grenze im Schema dürfen nicht
  // auseinanderlaufen - sonst schnitte das Feld ab, was gültig wäre, oder
  // ließe durch, was das Schema dann doch mit „zu lang" abweist.
  it.each(Object.entries(VERORDNER_HOECHSTLAENGE))(
    'haelt die Hoechstlaenge von %s gleich mit dem Schema',
    (feld, grenze) => {
      const mit = (wert: string) =>
        prescriberSchemaForm.safeParse({
          ...leereVerordnerdaten,
          family_name: 'Probst',
          [feld]: wert,
        });

      expect(mit('a'.repeat(grenze)).success).toBe(true);
      expect(mit('a'.repeat(grenze + 1)).success).toBe(false);
    },
  );

  it('laesst Felder ohne Grenze im Schema auch am Feld ohne Grenze', () => {
    for (const feld of ['phone', 'fax', 'email'] as const) {
      expect(VERORDNER_HOECHSTLAENGE[feld]).toBeUndefined();
    }
  });
});

describe('verordnerAuswahlname (VER-09)', () => {
  const grund: Prescriber = {
    id: 'p1',
    title: 'Dr. med.',
    given_name: 'Petra',
    family_name: 'Probst',
    practice_name: 'Orthopaedische Gemeinschaftspraxis Fiktiv',
    speciality: null,
    street: null,
    house_number: null,
    postal_code: null,
    city: null,
    phone: null,
    fax: null,
    email: null,
  };

  it('beginnt mit dem Nachnamen, damit die Tipp-Suche der Auswahl trifft', () => {
    expect(verordnerAuswahlname(grund)).toBe(
      'Probst, Petra (Dr. med.) · Orthopaedische Gemeinschaftspraxis Fiktiv',
    );
  });

  it('laesst fehlende Teile ohne Reste weg', () => {
    expect(verordnerAuswahlname({ ...grund, title: null })).toBe(
      'Probst, Petra · Orthopaedische Gemeinschaftspraxis Fiktiv',
    );
    expect(verordnerAuswahlname({ ...grund, given_name: null, practice_name: null })).toBe(
      'Probst (Dr. med.)',
    );
    expect(
      verordnerAuswahlname({ ...grund, title: null, given_name: null, practice_name: null }),
    ).toBe('Probst');
  });
});
