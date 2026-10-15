import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Bibliothek, Variante } from '@/features/exercises/api';
import { katalogeintrag } from '@/features/exercises/katalog';
import type { Katalogvorlage } from '@/features/exercises/katalog/typen';
import { KATALOG_VORLAGEN } from '@/features/exercises/katalog/vorlagen';
import { OHNE_KATALOG } from '@/features/exercises/testdaten';
import { OHNE_STANDARD } from './hinzufuegen';
import { vorausgewaehlt, vorlagenListe, vorlagenZeilen, type Vorlagenzeile } from './vorlagen';

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
      'src/features/exercise-plans/Vorlagenvorschau.tsx',
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

describe('Vorschau einer Vorlage (Befund B9, ANN-537)', () => {
  const KN09 = katalogeintrag('KN-09')!;
  const katalog = [KN09, katalogeintrag('KN-02')!];
  const zeilen = vorlagenZeilen(VORLAGE, BIBLIOTHEK, katalog);
  const art = (z: Vorlagenzeile) =>
    z.art === 'waehlbar' ? (z.eintrag ? 'katalog' : z.variante.id) : 'archiviert';

  it('nimmt die Übungen in der Reihenfolge der Vorlage: Bibliothek, archiviert, Katalog', () => {
    expect(zeilen.map((z) => [z.schluessel, art(z)])).toEqual([
      ['KN-02', 'b'],
      ['KN-01', 'a'],
      ['KN-03', 'archiviert'],
      ['KN-09', 'katalog'],
    ]);
  });

  it('nimmt die Dosierung der Vorlage, sonst die Standarddosierung', () => {
    const [kn02, kn01] = zeilen as Extract<Vorlagenzeile, { art: 'waehlbar' }>[];
    expect(kn02!.dosis).toEqual(
      expect.objectContaining({ sets: 4, reps_min: 8, reps_max: 12, hold_seconds: 2 }),
    );
    expect(kn01!.dosis).toEqual(
      expect.objectContaining({
        sets: 2,
        reps_min: null,
        duration_seconds: 30,
        per_side: true,
        times_per_day: 2,
      }),
    );
    // Ohne Standarddosierung die bisherige Vorbelegung.
    const ohne = vorlagenZeilen(
      { ...VORLAGE, uebungen: [{ schluessel: 'KN-02' }] },
      BIBLIOTHEK,
      [],
    );
    expect((ohne[0] as Extract<Vorlagenzeile, { art: 'waehlbar' }>).dosis).toEqual(OHNE_STANDARD);
  });

  it('bringt eine Übung, die der Praxis fehlt, mit ihrem Katalogeintrag', () => {
    const kn09 = zeilen[3] as Extract<Vorlagenzeile, { art: 'waehlbar' }>;
    expect(kn09.eintrag).toBe(KN09);
    expect(kn09.variante).toMatchObject({ id: 'katalog:KN-09', name: KN09.name });
    // Ohne Katalog fällt sie weg - sie hätte keinen Namen.
    expect(vorlagenZeilen(VORLAGE, BIBLIOTHEK, []).map((z) => z.schluessel)).toEqual([
      'KN-02',
      'KN-01',
      'KN-03',
    ]);
  });

  it('zeigt ohne Übernahmerecht, was der Praxis fehlt, ohne Wahl (ANN-293)', () => {
    const ohneRecht = vorlagenZeilen(VORLAGE, BIBLIOTHEK, katalog, false);
    expect(ohneRecht.map((z) => [z.schluessel, z.art])).toEqual([
      ['KN-02', 'waehlbar'],
      ['KN-01', 'waehlbar'],
      ['KN-03', 'archiviert'],
      ['KN-09', 'fehlt'],
    ]);
    expect(ohneRecht[3]).toEqual({ art: 'fehlt', schluessel: 'KN-09', name: KN09.name });
    expect(vorausgewaehlt(ohneRecht, new Set())).toEqual(['KN-02', 'KN-01']);
  });

  it('wählt alles Wählbare vor, außer was schon im Plan steht', () => {
    expect(vorausgewaehlt(zeilen, new Set())).toEqual(['KN-02', 'KN-01', 'KN-09']);
    expect(vorausgewaehlt(zeilen, new Set(['a']))).toEqual(['KN-02', 'KN-09']);
    // Zwei Parameter, keine Person (ADR-006 Punkt 10).
    expect(vorausgewaehlt.length).toBe(2);
    expect(vorlagenZeilen.length).toBe(3);
  });
});
