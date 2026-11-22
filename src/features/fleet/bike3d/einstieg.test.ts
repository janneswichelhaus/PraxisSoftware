import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * three.js liegt nicht im Einstiegspaket: Vom Einstieg `src/main.tsx` aus erreicht kein statischer
 * Import eine Datei, die `three` statisch importiert. Ein `import('…')` beginnt einen eigenen Teil.
 */

const stamm = process.cwd();
const quelle = join(stamm, 'src');

// Modulangabe hinter `from` oder bloßem `import`; ohne verschachtelte Quantoren.
const MODULANGABE = /(from|import)\s*(\(?)\s*['"]([^'"]+)['"]/g;

function ohneKommentare(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function aufloesen(von: string, modul: string): string | null {
  let basis: string;
  if (modul.startsWith('@/')) basis = join(quelle, modul.slice(2));
  else if (modul.startsWith('.')) basis = join(dirname(von), modul);
  else return null;
  for (const endung of ['', '.ts', '.tsx', '/index.ts', '/index.tsx']) {
    const kandidat = basis + endung;
    if (/\.(ts|tsx)$/.test(kandidat) && existsSync(kandidat)) return kandidat;
  }
  return null;
}

function statischeImporte(text: string): string[] {
  const quelltext = ohneKommentare(text);
  const module: string[] = [];
  for (const treffer of quelltext.matchAll(MODULANGABE)) {
    if (treffer[2] === '(') continue;
    const davor = quelltext.slice(0, treffer.index);
    const beginn = Math.max(davor.lastIndexOf('import'), davor.lastIndexOf('export'));
    if (treffer[1] === 'from' && beginn === -1) continue;
    const klausel = treffer[1] === 'from' ? davor.slice(beginn) : '';
    if (/^(?:import|export)\s+type\s/.test(klausel)) continue;
    module.push(treffer[3] ?? '');
  }
  return module;
}

function erreichbar(einstieg: string): { dateien: Set<string>; mitThree: string[] } {
  const dateien = new Set<string>();
  const mitThree: string[] = [];
  const offen = [einstieg];
  while (offen.length > 0) {
    const datei = offen.pop();
    if (!datei || dateien.has(datei)) continue;
    dateien.add(datei);
    for (const modul of statischeImporte(readFileSync(datei, 'utf8'))) {
      if (modul === 'three' || modul.startsWith('three/')) mitThree.push(relative(stamm, datei));
      const ziel = aufloesen(datei, modul);
      if (ziel) offen.push(ziel);
    }
  }
  return { dateien, mitThree };
}

describe('three.js nur auf Abruf', () => {
  const { dateien, mitThree } = erreichbar(join(quelle, 'main.tsx'));

  it('findet vom Einstieg aus den Baustein, sonst prüfte der Test einen leeren Graphen', () => {
    expect(dateien.size).toBeGreaterThan(200);
    expect(dateien.has(join(quelle, 'components/ui/Lastenrad3D.tsx'))).toBe(true);
  });

  it('erreicht keine Datei, die three statisch importiert', () => {
    expect(mitThree).toEqual([]);
    expect(dateien.has(join(quelle, 'components/ui/lastenrad3d/viewer.ts'))).toBe(false);
    expect(dateien.has(join(quelle, 'components/ui/lastenrad3d/build.ts'))).toBe(false);
  });

  it('würde einen statischen Import von three finden (Gegenprobe)', () => {
    expect(statischeImporte("import { Mesh } from 'three';")).toEqual(['three']);
    expect(statischeImporte("export { Mesh } from 'three';")).toEqual(['three']);
    expect(statischeImporte("import type { Mesh } from 'three';")).toEqual([]);
    expect(statischeImporte("const m = await import('./viewer');")).toEqual([]);
    const viewer = readFileSync(join(quelle, 'components/ui/lastenrad3d/viewer.ts'), 'utf8');
    expect(statischeImporte(viewer)).toContain('three');
  });
});
