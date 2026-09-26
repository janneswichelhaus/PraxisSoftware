import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { bibliothek } from './bibliothek';

/**
 * Die Untersuchungsbausteine gegen ihre Vorlage (FRB-003a, Phase P2).
 *
 * Zwei Zusicherungen, beide aus dem Arbeitsauftrag
 * (`quellen/ARBEITSAUFTRAG_Bausteine-und-Scores.md`, §2):
 *
 *   1. **Die Zahl der Items je Block ist exakt die der Tabelle.** Eine
 *      Abweichung ist ein Übertragungsfehler, keine Rundung.
 *   2. **Jede Bezeichnung steht wörtlich in der Quelldatei** — samt ihrer
 *      Tippfehler (ANN-119). Was hier nicht gefunden wird, hat jemand
 *      umformuliert.
 *
 * Abweichend von der Tabelle ist LWS „Untersuchung SIG" ein voller Block mit
 * sechs Items: Die Vorlage setzt ihn als Tabelle, der Plan hat ihn am
 * Original nachgesehen (D2, ANN-118).
 */

const QUELLE = join(process.cwd(), 'quellen/bausteine/mt-untersuchung-quelldaten.md');

/** Region → Block → [Zahl der Items, unvollständig?] */
const ERWARTET: Record<string, Record<string, [number, boolean]>> = {
  hws: {
    basis: [6, false],
    weiterfuehrend: [7, false],
    hochzervikal: [8, false],
    behandlungstechniken: [8, false],
    therapie_hochzervikal: [1, true],
  },
  lws: {
    basis: [1, false],
    weiterfuehrend: [5, false],
    neurologisch: [4, false],
    sig: [6, false],
    behandlung: [4, true],
  },
  schulter: {
    basis: [3, false],
    weiterfuehrend: [4, false],
    acg: [0, true],
    behandlungstechniken: [6, false],
  },
  ellenbogen: { basis: [3, false], weiterfuehrend: [3, false], therapie: [5, false] },
  hand: {
    basis: [3, false],
    weiterfuehrend: [11, false],
    daumensattelgelenk: [2, false],
    behandlung: [5, false],
  },
  huefte: { untersuchung: [6, false], therapie: [3, false] },
  knie: {
    basis: [7, false],
    weiterfuehrend: [13, false],
    therapie: [3, false],
    therapie_patella: [2, false],
  },
  fuss: { basis: [8, false], weiterfuehrend: [10, false], therapie: [4, false] },
  kiefer: { basis: [11, false] },
};

/** Zeilenumbruch, Einzug und Silbentrennung am Zeilenende sind Satz, kein Wortlaut. */
function einzeilig(text: string): string {
  return text
    .replace(/-\n\s+/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

describe('Untersuchungsbausteine (P2)', () => {
  it('liegen in genau den neun Regionen der Vorlage, in ihrer Reihenfolge', () => {
    expect(bibliothek.bausteine.map((region) => region.id)).toEqual(Object.keys(ERWARTET));
  });

  it.each(Object.entries(ERWARTET))('%s: Items je Block wie im Arbeitsauftrag', (id, bloecke) => {
    const region = bibliothek.bausteine.find((r) => r.id === id);
    expect(region).toBeDefined();
    const ist = Object.fromEntries(
      (region?.blocks ?? []).map((block) => [
        block.id,
        [block.items.length, block.status === 'unvollstaendig'],
      ]),
    );
    expect(ist).toEqual(bloecke);
  });

  it('übernimmt jede Bezeichnung und jeden Hinweis wörtlich aus der Quelldatei', () => {
    const quelle = einzeilig(readFileSync(QUELLE, 'utf8'));
    const fehlend: string[] = [];
    const pruefe = (text: string | undefined, wo: string) => {
      if (!text) return;
      // Ein Label aus zwei Zeilen derselben Nummer steht mit „ · " zusammen
      // (HWS Basis 2); geprüft wird jeder Teil für sich.
      for (const teil of text.split(' · ')) {
        if (!quelle.includes(teil)) fehlend.push(`${wo}: „${teil}"`);
      }
    };

    for (const region of bibliothek.bausteine) {
      for (const block of region.blocks) {
        pruefe(block.label, `${region.id}.${block.id}`);
        for (const item of block.items) {
          pruefe(item.label, item.id);
          pruefe(item.hint, `${item.id} (Hinweis)`);
          for (const subitem of item.subitems ?? []) {
            pruefe(subitem.label, subitem.id);
            pruefe(subitem.hint, `${subitem.id} (Hinweis)`);
          }
        }
      }
    }

    expect(fehlend).toEqual([]);
  });

  it('zeigt keinen Grenzwert mit Folge als Hinweis (ADR-006, ANN-118)', () => {
    // Die Vorlage nennt beim Navicular Drop „mehr als 1 cm Differenz im Svgl.
    // → Training Gewölbe": ein Schwellenwert neben dem eigenen Messwert samt
    // Therapiefolge. Bis zur externen Prüfung B1 steht so etwas nirgends
    // (`cutoff-anzeige` in src/app/mdr.ts).
    const hinweise = bibliothek.bausteine.flatMap((region) =>
      region.blocks.flatMap((block) =>
        block.items.flatMap((item) => [
          item.hint,
          ...(item.subitems ?? []).map((subitem) => subitem.hint),
        ]),
      ),
    );
    expect(hinweise.filter((hinweis) => hinweis?.includes('→'))).toEqual([]);
  });

  it('lässt die Tippfehler der Vorlage stehen (ANN-119)', () => {
    const labels = bibliothek.bausteine.flatMap((region) =>
      region.blocks.flatMap((block) =>
        block.items.flatMap((item) => [
          item.label,
          ...(item.subitems ?? []).map((subitem) => subitem.label),
        ]),
      ),
    );
    for (const wort of ['Relocation Tet', 'Supinatin', 'Lachmann-Test', 'Painfull Arc Sign']) {
      expect(labels.some((label) => label.includes(wort))).toBe(true);
    }
  });

  it('bindet Techniken an die Therapieblöcke und Tests an die Untersuchung', () => {
    for (const region of bibliothek.bausteine) {
      for (const block of region.blocks) {
        const erwartet = block.art === 'therapie' ? 'technik' : 'test';
        for (const item of block.items) expect(item.type).toBe(erwartet);
      }
    }
  });
});
