import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Das Fortschrittsmodell bleibt rechenbar.
 *
 * `docs/development/fortschritt.json` ist die Datengrundlage für
 * `pnpm fortschritt` und wird am Ende jedes Loops von Hand gepflegt. Von Hand
 * gepflegte Zahlen laufen auseinander: ein Blockgewicht wird angehoben und das
 * Gegenstück nicht gesenkt, ein Status wird abgekürzt getippt, ein Posten
 * bekommt Gewicht 0 und verschwindet lautlos aus der Rechnung.
 *
 * Das Skript selbst wirft bei den ersten beiden Fällen — aber erst, wenn
 * jemand es aufruft. Dieser Test zieht die Prüfung in `pnpm test` vor, also in
 * das Gate, das ohnehin bei jedem Commit läuft.
 *
 * Geprüft wird die Rechenbarkeit, nicht die Höhe: ob 30 Prozent für die
 * Software angemessen sind, ist eine Ermessensfrage und gehört in die
 * Roadmap-Diskussion, nicht in einen Test.
 */

type Posten = { id: string; name: string; gewicht: number; status: string };
type Block = { id: string; name: string; gewicht: number; posten: Posten[] };
type Modell = {
  stand: string;
  ziel: { meilenstein: string; name: string; termin: string };
  statuswerte: Record<string, { anteil: number; text: string }>;
  bloecke: Block[];
};

const rohdaten: unknown = JSON.parse(
  readFileSync(join(process.cwd(), 'docs/development/fortschritt.json'), 'utf8'),
);

if (typeof rohdaten !== 'object' || rohdaten === null || !('bloecke' in rohdaten)) {
  throw new Error('docs/development/fortschritt.json ist kein Fortschrittsmodell.');
}
const modell = rohdaten as Modell;

// Map statt Objektzugriff: der Statusname kommt aus den Daten, nicht aus einer
// Literalliste, und `map.get()` ist kein Sink fuer eslint-plugin-security.
const statuswerte = new Map(Object.entries(modell.statuswerte));

function anteilVon(name: string): number {
  const eintrag = statuswerte.get(name);
  if (!eintrag) throw new Error(`Das Modell kennt den Status "${name}" nicht.`);
  return eintrag.anteil;
}

describe('Fortschrittsmodell', () => {
  it('ergibt über alle Blöcke genau 100 — sonst ist das Ergebnis keine Prozentzahl', () => {
    const summe = modell.bloecke.reduce((wert, block) => wert + block.gewicht, 0);
    expect(summe).toBe(100);
  });

  it('kennt jeden verwendeten Status', () => {
    for (const block of modell.bloecke) {
      for (const posten of block.posten) {
        expect(
          statuswerte.has(posten.status),
          `Posten "${posten.id}" in Block ${block.id} hat den unbekannten Status "${posten.status}"`,
        ).toBe(true);
      }
    }
  });

  it('gibt jedem Posten Gewicht — ein Posten mit 0 zählt nie und täuscht Vollständigkeit vor', () => {
    for (const block of modell.bloecke) {
      expect(block.posten.length, `Block ${block.id} ohne Posten`).toBeGreaterThan(0);
      for (const posten of block.posten) {
        expect(posten.gewicht, `Posten "${posten.id}"`).toBeGreaterThan(0);
      }
    }
  });

  it('vergibt jede Posten-Kennung nur einmal', () => {
    const kennungen = modell.bloecke.flatMap((block) => block.posten.map((p) => p.id));
    expect(new Set(kennungen).size).toBe(kennungen.length);
  });

  it('hält die Statusanteile zwischen 0 und 1', () => {
    for (const [name, wert] of statuswerte) {
      expect(wert.anteil, `Status "${name}"`).toBeGreaterThanOrEqual(0);
      expect(wert.anteil, `Status "${name}"`).toBeLessThanOrEqual(1);
    }
  });

  it('zählt einen gebauten, aber nicht abgenommenen Loop unter einem fertigen', () => {
    // Die Definition of Done trennt "fertig" (Skill-Schritt I) von "abgenommen"
    // (Jannes hat docs/abnahme/ durchlaufen). Faellt diese Ordnung, zaehlt die
    // Abnahme nichts mehr und die Zahl schmeichelt.
    expect(anteilVon('gebaut')).toBeLessThan(anteilVon('fertig'));
    expect(anteilVon('vorlaeufig')).toBeLessThan(anteilVon('fertig'));
  });
});
