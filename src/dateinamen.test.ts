import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * Kein Pfad im Repository darf sich von einem anderen nur in Groß- und
 * Kleinschreibung unterscheiden.
 *
 * Linux (CI) unterscheidet `Patientenfotos` und `patientenfotos`, Windows und
 * macOS nicht. Mit DOK-006 lagen in `src/features/files/` die Komponente
 * `Patientenfotos.tsx` und das Datenmodul `patientenfotos.ts` nebeneinander:
 * In der CI grün, auf Jannes' Rechner löste `import … from './Patientenfotos'`
 * auf das Datenmodul auf — Typprüfung, Lint und Tests brachen, und der
 * Entwicklungsserver hätte das falsche Modul geladen.
 *
 * Geprüft wird deshalb zweierlei:
 *
 *   1. Ganze Pfade, auch Verzeichnisse, dürfen nicht nur in der Schreibweise
 *      abweichen — auf einem Dateisystem ohne Unterscheidung überschreibt die
 *      eine Datei beim Auschecken die andere.
 *   2. Quelldateien dürfen es auch **ohne Endung** nicht: Ein Import nennt
 *      keine Endung, und `Foo.tsx` neben `foo.ts` ist dieselbe Adresse.
 *
 * Die Liste kommt aus `git ls-files` (wie in `src/protokollierung.test.ts`),
 * nicht aus dem Dateisystem: Unter Windows liegt von zwei kollidierenden
 * Dateien oft nur eine auf der Platte, Git kennt beide.
 */

const stamm = process.cwd();

/** Endungen, die ein Import weglässt (TypeScript, Vite, Node). */
const MODULENDUNG = /\.(?:tsx|ts|jsx|js|mjs|cjs|mts|cts)$/;

function verfolgteDateien(): string[] {
  return execFileSync('git', ['ls-files', '-z'], { cwd: stamm, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

/** Alle Verzeichnisse, in denen die Dateien liegen, samt ihrer Eltern. */
function verzeichnisse(dateien: readonly string[]): string[] {
  const menge = new Set<string>();
  for (const datei of dateien) {
    const teile = datei.split('/');
    for (let ende = 1; ende < teile.length; ende += 1) menge.add(teile.slice(0, ende).join('/'));
  }
  return [...menge];
}

/**
 * Gruppen von Schreibweisen, die ohne Groß- und Kleinschreibung gleich sind.
 * Dieselbe Schreibweise zweimal (etwa `a.ts` und `a.tsx`) ist keine Kollision
 * dieser Art und bleibt außen vor.
 */
export function kollisionen(pfade: readonly string[]): string[][] {
  const gruppen = new Map<string, Set<string>>();
  for (const pfad of pfade) {
    const schluessel = pfad.toLowerCase();
    const gruppe = gruppen.get(schluessel) ?? new Set<string>();
    gruppe.add(pfad);
    gruppen.set(schluessel, gruppe);
  }
  return [...gruppen.values()].filter((gruppe) => gruppe.size > 1).map((gruppe) => [...gruppe]);
}

/** Die Adresse, unter der ein Import die Datei findet: Pfad ohne Modulendung. */
function importadressen(dateien: readonly string[]): string[] {
  return dateien.filter((datei) => MODULENDUNG.test(datei)).map((d) => d.replace(MODULENDUNG, ''));
}

describe('Dateinamen', () => {
  it('erkennt Pfade, die nur in der Schreibweise abweichen', () => {
    const dateien = [
      'src/features/files/Patientenfotos.tsx',
      'src/features/files/patientenfotos.ts',
      'src/features/files/kamera.ts',
      'src/features/files/kamera.test.ts',
    ];
    expect(kollisionen(dateien)).toEqual([]);
    expect(kollisionen(importadressen(dateien))).toEqual([
      ['src/features/files/Patientenfotos', 'src/features/files/patientenfotos'],
    ]);
    expect(kollisionen(verzeichnisse(['src/Features/a.ts', 'src/features/b.ts']))).toEqual([
      ['src/Features', 'src/features'],
    ]);
  });

  it('hat keine zwei Dateien oder Verzeichnisse, die nur in der Schreibweise abweichen', () => {
    const dateien = verfolgteDateien();
    expect(dateien.length).toBeGreaterThan(0);
    expect(kollisionen(dateien)).toEqual([]);
    expect(kollisionen(verzeichnisse(dateien))).toEqual([]);
  });

  it('hat keine zwei Quelldateien, die ein Import ohne Endung verwechseln kann', () => {
    expect(kollisionen(importadressen(verfolgteDateien()))).toEqual([]);
  });
});
