import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ABGELOESTE_BEGRIFFE, BEREICHE, type AbgeloesterBegriff } from './begriffe';

/**
 * Das Gate der Begriffe (UX-EPIC-002, ANN-111).
 *
 * Eine Liste abgelöster Wörter in `begriffe.ts` hielte allein nichts fest:
 * Der nächste Loop schreibt „Ereignis eintragen", weil die Route so heißt. Der
 * Test durchsucht deshalb jeden Oberflächentext unter `src/` — Quelltext ohne
 * Kommentare, denn ein Kommentar darf erzählen, was früher dastand.
 *
 * Kennungen fallen von selbst heraus: Die Muster verlangen eine Wortgrenze,
 * und `istEreignis` oder `EreignisFormFields` haben keine.
 */

const stamm = process.cwd();

function quelldateien(verzeichnis: string): string[] {
  const treffer: string[] = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) treffer.push(...quelldateien(pfad));
    // Tests beschreiben die Regel und dürfen das alte Wort nennen; die Quelle
    // der Begriffe nennt es, um es zu verbieten.
    else if (
      /\.(tsx|ts)$/.test(eintrag) &&
      !/\.test\.(tsx|ts)$/.test(eintrag) &&
      eintrag !== 'begriffe.ts'
    ) {
      treffer.push(pfad);
    }
  }
  return treffer;
}

/** Quelltext ohne Kommentare, Zeilen bleiben erhalten. */
export function ohneKommentare(quelltext: string): string {
  return (
    quelltext
      // Blockkommentare, auch `{/* … */}` in JSX; Zeilenumbrüche bleiben stehen,
      // damit die gemeldete Zeile stimmt.
      .replace(/\/\*[\s\S]*?\*\//g, (kommentar) => kommentar.replace(/[^\n]/g, ' '))
      // Zeilenkommentare — aber nicht `https://` in einer Zeichenkette.
      .replace(/(^|[^:\\])\/\/.*$/gm, '$1')
  );
}

function verstoesse(regel: AbgeloesterBegriff, dateien: readonly string[]): string[] {
  const gefunden: string[] = [];
  for (const datei of dateien) {
    const pfad = relative(stamm, datei).split(sep).join('/');
    if (regel.nurIn && !regel.nurIn.some((anfang) => pfad.startsWith(anfang))) continue;
    const zeilen = ohneKommentare(readFileSync(datei, 'utf8')).split('\n');
    zeilen.forEach((zeile, index) => {
      if (regel.muster.test(zeile)) gefunden.push(`${pfad}:${index + 1}: ${zeile.trim()}`);
    });
  }
  return gefunden;
}

describe('Begriffe', () => {
  const dateien = quelldateien(join(stamm, 'src'));

  it.each(ABGELOESTE_BEGRIFFE.map((regel) => [String(regel.muster), regel] as const))(
    'kein Oberflächentext sagt %s',
    (_name, regel) => {
      // Die Meldung nennt Datei, Zeile und das Wort, das stattdessen gilt.
      expect(verstoesse(regel, dateien), `statt dessen: „${regel.statt}"`).toEqual([]);
    },
  );

  it('findet ein abgelöstes Wort in Text, aber nicht in Kommentar und Kennung', () => {
    // Das Gate prüft sich selbst: Ein Muster, das nie anschlägt, wäre grün
    // und wertlos.
    const ereignis = ABGELOESTE_BEGRIFFE.find((regel) => regel.statt === 'Fehlzeit')!;
    const probe = ohneKommentare(
      [
        '// Ein Ereignis des Praxisbetriebs',
        '/* Ereignis */ const istEreignis = true;',
        "import { EreignisFormFields } from './EreignisFormFields';",
        "const titel = 'Ereignis eintragen';",
        '<p>Zurück zum Ereignis</p>',
        "const url = 'https://beispiel.test/Ereignis';",
        "const satz = 'mit den Ereignissen';",
      ].join('\n'),
    ).split('\n');
    const treffer = probe.map((zeile) => ereignis.muster.test(zeile));
    expect(treffer).toEqual([false, false, false, true, true, true, true]);
  });

  it('nennt für jedes abgelöste Wort, was stattdessen gilt, und woher', () => {
    for (const regel of ABGELOESTE_BEGRIFFE) {
      expect(regel.statt.length).toBeGreaterThan(0);
      expect(regel.quelle.length).toBeGreaterThan(0);
      expect(regel.muster.test(regel.statt)).toBe(false);
    }
  });

  it('hält die Kurzform jedes Bereichs bei höchstens 13 Zeichen', () => {
    // Tableiste bei 375 px: 67 px je Ziel (navigation.test.tsx).
    for (const bereich of Object.values(BEREICHE)) {
      expect(bereich.kurz.length).toBeLessThanOrEqual(13);
    }
  });
});
