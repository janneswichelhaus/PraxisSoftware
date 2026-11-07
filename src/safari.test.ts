import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { laengstesWort } from '@/features/clinical/assessments/darstellung';
import { saetze } from '@/lib/ki/gateway';

/**
 * Safari vor iOS 16.4 kennt keinen Lookbehind: Ein einziger macht das ganze Modul zum
 * Syntaxfehler. Ausgelieferter Code unter `src/` kommt ohne aus, Tests vergleichen damit.
 */
const STAMM = join(process.cwd(), 'src');
const LOOKBEHIND = /\(\?<[=!]/;

function quelldateien(verzeichnis: string): string[] {
  return readdirSync(verzeichnis, { withFileTypes: true }).flatMap((eintrag) => {
    const pfad = join(verzeichnis, eintrag.name);
    if (eintrag.isDirectory()) return quelldateien(pfad);
    if (!/\.(ts|tsx)$/.test(eintrag.name) || /\.test\.tsx?$/.test(eintrag.name)) return [];
    return [pfad];
  });
}

describe('ausgelieferter Code ohne Lookbehind', () => {
  it('findet unter src/ keinen Lookbehind außerhalb der Tests', () => {
    const funde = quelldateien(STAMM).flatMap((pfad) =>
      readFileSync(pfad, 'utf8')
        .split('\n')
        .flatMap((zeile, i) =>
          LOOKBEHIND.test(zeile) ? [`${relative(process.cwd(), pfad)}:${i + 1}`] : [],
        ),
    );
    expect(funde).toEqual([]);
  });

  const TEXTE = [
    'Schmerz drei von zehn. Keine Schwellung!  Treppe?\nWeiter … morgen.',
    'Befund\n\nKeine Schwellung, Beugung 110 Grad.',
    'Hm... ja. 2. Termin z. B. am Montag.',
    '',
    '   .  ',
  ];

  it('trennt Sätze wie der Lookbehind im Gateway', () => {
    const mitLookbehind = (text: string) =>
      text
        .split(/(?<=[.!?…])\s+/u)
        .map((teil) => teil.trim())
        .filter(Boolean);
    for (const text of TEXTE) {
      // Ohne die Abkürzungsregel stimmen beide Wege Satz für Satz überein.
      if (/(?:^|\s)(?:\d+|\p{L}|ca|bzw|ggf|evtl|vgl|inkl|usw|Dr|Nr)\.\s/iu.test(text)) continue;
      expect(saetze(text)).toEqual(mitLookbehind(text));
    }
    expect(saetze('Hm... ja. 2. Termin z. B. am Montag.')).toEqual([
      'Hm...',
      'ja.',
      '2. Termin z. B. am Montag.',
    ]);
  });

  it('misst das längste Wort wie mit Lookbehind am Bindestrich', () => {
    const mitLookbehind = (label: string) =>
      Math.max(0, ...label.split(/\s+|(?<=-)(?=\p{L})/u).map((wort) => wort.length));
    for (const label of [
      'hoch-/runter',
      'Knie-Beugung links',
      'Verdauungsbeschwerden/Sodbrennen',
    ]) {
      expect(laengstesWort([{ label }])).toBe(mitLookbehind(label));
    }
  });
});
