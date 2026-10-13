import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Bibliothek, Variante } from '@/features/exercises/api';
import type { Katalogvorlage } from '@/features/exercises/katalog/typen';
import { KATALOG_VORLAGEN } from '@/features/exercises/katalog/vorlagen';
import { OHNE_KATALOG } from '@/features/exercises/testdaten';
import { OHNE_STANDARD } from './hinzufuegen';
import { ausVorlage, vorlagenListe } from './vorlagen';

/**
 * „Aus Vorlage" (Welle B): Vorlagenliste und Übernahme über den
 * Katalogschlüssel - und die Grenze aus ADR-006 Punkt 10: Die Liste liest
 * nie Angaben der Person.
 */

function variante(id: string, schluessel: string | null, zusatz: Partial<Variante> = {}): Variante {
  return {
    id,
    name: `Variante ${id}`,
    lay_name: `Alltag ${id}`,
    instruction: null,
    equipment: [],
    common_faults: null,
    practice_notes: null,
    archived: false,
    ...OHNE_KATALOG,
    catalog_key: schluessel,
    ...zusatz,
  };
}

const BIBLIOTHEK: Bibliothek = {
  can_manage: false,
  links: [],
  exercises: [
    {
      id: 'u1',
      name: 'A',
      lay_name: 'A',
      body_region: 'knie',
      archived: false,
      variants: [
        variante('a', 'KN-01', {
          default_dosage: {
            sets: 2,
            reps_min: null,
            reps_max: null,
            duration_seconds: 30,
            hold_seconds: null,
            per_side: true,
            times_per_day: 2,
          },
        }),
      ],
    },
    {
      id: 'u2',
      name: 'B',
      lay_name: 'B',
      body_region: 'knie',
      archived: false,
      variants: [variante('b', 'KN-02')],
    },
    // Archivierte Übung: die Variante zählt nicht als vorhanden.
    {
      id: 'u3',
      name: 'C',
      lay_name: 'C',
      body_region: 'knie',
      archived: true,
      variants: [variante('c', 'KN-03')],
    },
    {
      id: 'u4',
      name: 'D',
      lay_name: 'D',
      body_region: 'knie',
      archived: false,
      variants: [variante('d', null)],
    },
  ],
};

const VORLAGE: Katalogvorlage = {
  schluessel: 'V99',
  name: 'Test',
  ziel: 'Test',
  uebungen: [
    { schluessel: 'KN-02', dosierung: { saetze: 4, wiederholungen: [8, 12], halten_s: 2 } },
    { schluessel: 'KN-01' },
    { schluessel: 'KN-03' },
    { schluessel: 'KN-09' },
  ],
};

describe('Vorlagenliste (ADR-006 Punkt 10)', () => {
  it('ordnet nur nach Name und nimmt nichts als die Vorlagen', () => {
    const liste: Katalogvorlage[] = [
      { ...VORLAGE, schluessel: 'V02', name: 'Schulter' },
      { ...VORLAGE, schluessel: 'V01', name: 'Atmung' },
      { ...VORLAGE, schluessel: 'V03', name: 'Knie' },
    ];
    expect(vorlagenListe(liste).map((v) => v.name)).toEqual(['Atmung', 'Knie', 'Schulter']);
    // Ein einziger Parameter: Es gibt keinen Weg, Angaben einer Person hineinzureichen.
    expect(vorlagenListe.length).toBe(1);
    // Die Eingabe bleibt unverändert.
    expect(liste.map((v) => v.schluessel)).toEqual(['V02', 'V01', 'V03']);
  });

  it('kennt jede mitgelieferte Vorlage mit Namen und Übungen', () => {
    for (const vorlage of vorlagenListe(KATALOG_VORLAGEN)) {
      expect(vorlage.name.length).toBeGreaterThan(0);
      expect(vorlage.uebungen.length).toBeGreaterThan(0);
    }
  });

  it('importiert in Liste und Übernahme nichts aus Akte, Befund, Verordnung oder Verlauf', () => {
    const stamm = process.cwd();
    for (const datei of [
      'src/features/exercise-plans/vorlagen.ts',
      'src/features/exercise-plans/Vorlagenauswahl.tsx',
      'src/features/exercise-plans/Uebungsauswahl.tsx',
      'src/features/exercises/suche.ts',
    ]) {
      const quelle = readFileSync(join(stamm, datei), 'utf8');
      const importe = [...quelle.matchAll(/from '([^']+)'/g)].map((t) => t[1]);
      for (const pfad of importe) {
        expect(pfad, `${datei}: ${pfad}`).not.toMatch(
          /patients|assessments|documentation|treatment-bases|checkins|therapy-reports|messages/,
        );
      }
    }
  });
});

describe('Übungen aus einer Vorlage (Katalogschlüssel → Variante der Praxis)', () => {
  it('findet die Varianten in der Reihenfolge der Vorlage, mit der Dosierung der Vorlage oder der Standarddosierung', () => {
    const stand = ausVorlage(VORLAGE, BIBLIOTHEK);
    expect(stand.positionen.map((p) => p.variante.id)).toEqual(['b', 'a']);
    expect(stand.positionen[0]!.dosis).toEqual(
      expect.objectContaining({ sets: 4, reps_min: 8, reps_max: 12, hold_seconds: 2 }),
    );
    expect(stand.positionen[1]!.dosis).toEqual(
      expect.objectContaining({
        sets: 2,
        reps_min: null,
        duration_seconds: 30,
        per_side: true,
        times_per_day: 2,
      }),
    );
  });

  it('nennt, was archiviert ist und was der Praxis fehlt', () => {
    const stand = ausVorlage(VORLAGE, BIBLIOTHEK);
    expect(stand.archiviert).toEqual(['KN-03']);
    expect(stand.fehlend).toEqual(['KN-09']);
  });

  it('nimmt ohne Standarddosierung die bisherige Vorbelegung', () => {
    const stand = ausVorlage({ ...VORLAGE, uebungen: [{ schluessel: 'KN-02' }] }, BIBLIOTHEK);
    expect(stand.positionen[0]!.dosis).toEqual(OHNE_STANDARD);
  });
});
