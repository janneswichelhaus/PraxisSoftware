import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Bibliothek, Variante } from '@/features/exercises/api';
import { katalogeintrag } from '@/features/exercises/katalog';
import { ausruestungVon } from '@/features/exercises/katalog/schema';
import { ungeprueft } from '@/features/exercises/suche';
import { OHNE_KATALOG } from '@/features/exercises/testdaten';
import { standardDosis } from './hinzufuegen';
import { alsVariante, eineListe, fehlendImKatalog, nurImKatalog } from './uebungsliste';

/**
 * Eine Übungsliste statt Katalog und Bibliothek (Befund B9, O-002): Was der
 * Bibliothek fehlt, steht als Übung daneben - einmal, nach Bezeichnung, und
 * nie, was die Praxis archiviert hat.
 */

const KN01 = katalogeintrag('KN-01')!;
const KN07 = katalogeintrag('KN-07')!;
const HU01 = katalogeintrag('HU-01')!;
const AT01 = katalogeintrag('AT-01')!;

function variante(id: string, zusatz: Partial<Variante> = {}): Variante {
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
    ...zusatz,
  };
}

const BIBLIOTHEK: Bibliothek = {
  can_manage: false,
  links: [],
  exercises: [
    {
      id: 'u1',
      name: KN01.name,
      lay_name: KN01.alltagsname,
      body_region: 'knie',
      archived: false,
      variants: [variante('v1', { catalog_key: 'KN-01' })],
    },
    // Archiviert: kommt nicht über den Katalog zurück.
    {
      id: 'u2',
      name: KN07.name,
      lay_name: KN07.alltagsname,
      body_region: 'knie',
      archived: true,
      variants: [variante('v2', { catalog_key: 'KN-07' })],
    },
    // Eine eigene Übung, die so heißt wie ein Katalogeintrag.
    {
      id: 'u3',
      name: `  ${HU01.name.toUpperCase()} `,
      lay_name: 'Eigene',
      body_region: 'huefte',
      archived: false,
      variants: [variante('v3')],
    },
    {
      id: 'u4',
      name: 'Zehenstand am Spülbecken',
      lay_name: 'Auf die Zehen',
      body_region: 'fuss',
      archived: false,
      variants: [variante('v4')],
    },
  ],
};

describe('eineListe', () => {
  it('nimmt nur, was der Bibliothek fehlt - auch Archiviertes und Gleichnamiges zählen als vorhanden', () => {
    expect(fehlendImKatalog(BIBLIOTHEK, [KN01, KN07, HU01, AT01])).toEqual([AT01]);
  });

  it('steht als eine Liste nach Bezeichnung, die Bibliothek unverändert darin', () => {
    const liste = eineListe(BIBLIOTHEK, [AT01, KN01]);
    expect(liste).toHaveLength(5);
    const namen = liste.map((u) => u.name);
    expect(namen).toEqual(
      [...namen].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' })),
    );
    for (const uebung of BIBLIOTHEK.exercises) expect(liste).toContain(uebung);
    const neu = liste.find((u) => u.variants.some(nurImKatalog))!;
    expect(neu.variants.map((v) => v.catalog_key)).toEqual(['AT-01']);
  });

  it('lässt die Bibliothek in ihrer Reihenfolge, wenn nichts fehlt', () => {
    expect(eineListe(BIBLIOTHEK, [KN01])).toEqual(BIBLIOTHEK.exercises);
  });
});

describe('alsVariante', () => {
  it('sieht aus wie die übernommene Variante: Anleitung, Ausrüstung, Standarddosierung, ungeprüft', () => {
    const v = alsVariante(KN01);
    expect(nurImKatalog(v)).toBe(true);
    expect(nurImKatalog({ id: 'v1' })).toBe(false);
    expect(v).toMatchObject({
      name: KN01.name,
      lay_name: KN01.alltagsname,
      instruction: KN01.anleitung.join('\n'),
      equipment: ausruestungVon(KN01),
      catalog_key: 'KN-01',
      goal: KN01.ziel,
      level: KN01.niveau,
    });
    // Dieselbe Standarddosierung wie nach dem Import (ANN-384).
    expect(standardDosis(v)).toEqual(
      expect.objectContaining({ sets: 3, reps_min: 10, reps_max: 10, hold_seconds: 3 }),
    );
    expect(ungeprueft(v)).toBe(true);
  });

  it('liest nichts aus Akte, Befund, Verordnung oder Verlauf (ADR-006 Punkt 10)', () => {
    const quelle = readFileSync(
      join(process.cwd(), 'src/features/exercise-plans/uebungsliste.ts'),
      'utf8',
    );
    const importe = [...quelle.matchAll(/from '([^']+)'/g)].map((t) => t[1]);
    for (const pfad of importe) {
      expect(pfad).not.toMatch(
        /patients|assessments|documentation|treatment-bases|checkins|therapy-reports|messages/,
      );
    }
  });
});
