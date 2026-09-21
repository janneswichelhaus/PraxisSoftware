import { ladeDefinitionen, type Bibliothek } from './definitionen';

/**
 * Die Bibliothek, wie die Anwendung sie sieht (FRB-007).
 *
 * `import.meta.glob` sammelt die Definitionsdateien zur Bauzeit ein. Zwei
 * Folgen, die beide gewollt sind:
 *
 *   - Eine neue Definition ist **eine Datei** — kein Import, keine Liste, kein
 *     Commit an einer Komponente. Das ist das Leitprinzip des Arbeitsauftrags.
 *   - Eine fehlerhafte Definition bricht den Start, nicht erst die Erhebung.
 *     Ein Fragebogen, der bei der Patientin auf halber Strecke stehenbleibt,
 *     wäre der schlechtere Zeitpunkt.
 *
 * Noch liegt keine Datei dort: Die Inhalte kommen mit den Phasen P2, P4 und P5
 * (`docs/development/FRB-BAUSTEINE-UND-SCORES.md`). Der Weg steht trotzdem
 * schon, damit diese Phasen reine Datenlieferungen sind.
 */
const rohdaten: Record<string, unknown> = import.meta.glob('./definitionen/**/*.json', {
  eager: true,
  import: 'default',
});

export const bibliothek: Bibliothek = ladeDefinitionen(rohdaten);
