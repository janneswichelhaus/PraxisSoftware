/**
 * Erkennt einen Pull Request, der nur Dokumentation ändert (ADR-013 Punkt 2,
 * Fassung 5).
 *
 * Ein solcher Pull Request durchläuft die Prüfungen, die Text lesen - Format,
 * Lint, Typecheck, Dokumentation, Secret Scanning, Dependency Audit, das
 * Migrationen-Gate -, aber nicht die Tests, den Build und die
 * Datenbankprüfungen: Deren Eingaben sind unverändert, ihr Ergebnis ist das
 * von `main`. Nach dem Merge läuft auf `main` immer alles.
 *
 * Dokumentation heißt hier eng: eine Markdown-Datei unter `docs/` oder im
 * Wurzelverzeichnis, die kein Test liest. Andere Dateien unter `docs/` gehören
 * nicht dazu - so liest `src/fortschritt.test.ts`
 * `docs/development/fortschritt.json`, und `src/quellen.test.ts` liest
 * `quellen/README.md`. Liest ein neuer Test eine Markdown-Datei, wird
 * `scripts/nur-doku.test.mjs` rot, bis sie in `VON_TESTS_GELESEN` steht.
 * Eine gelöschte Datei löst immer alles aus: Ein Test könnte prüfen, dass
 * sie da ist. Neue Dateien prüft `src/dateinamen.test.ts` auf Kollisionen der
 * Schreibweise; die CI führt ihn deshalb auch bei reiner Doku aus.
 *
 * Die CI führt dieses Skript in der Fassung des Zielbranchs aus: Ein Fehler,
 * den ein Pull Request hier einbaut, kann ihn nicht selbst als Doku einstufen.
 *
 * Bewusst ohne Abhängigkeiten, wie `migrationen-check.mjs`.
 *
 * Aufruf: `node scripts/nur-doku.mjs <basis>` - im Pull Request
 * `origin/<Zielbranch>`. Schreibt `nur_doku=true` oder `nur_doku=false` für
 * `$GITHUB_OUTPUT`. Im Zweifel `false`: Dann läuft alles.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Markdown, das Tests lesen: Eine Änderung daran ist nie „nur Doku“. */
export const VON_TESTS_GELESEN = [
  // src/lib/protokoll.test.ts: die Verbotsliste der Betriebslogs
  'docs/adr/ADR-011-logging-and-observability.md',
  // supabase/tests/bootstrap.test.ts: die SQL-Blöcke des Runbooks
  'docs/betrieb/bootstrap.md',
];

/** Ist dieser Pfad Dokumentation, die kein Test und kein Build liest? */
export function istDoku(pfad) {
  if (!pfad.endsWith('.md') || VON_TESTS_GELESEN.includes(pfad)) return false;
  return pfad.startsWith('docs/') || !pfad.includes('/');
}

/**
 * @param {{ status: string, pfad: string }[]} aenderungen - aus
 *   `git diff --name-status --no-renames`; eine Umbenennung erscheint als
 *   Löschung und Hinzufügung
 * @returns {boolean} wahr nur, wenn es Änderungen gibt und alle Doku sind,
 *   geändert oder neu
 */
export function nurDoku(aenderungen) {
  return (
    aenderungen.length > 0 &&
    aenderungen.every(({ status, pfad }) => (status === 'M' || status === 'A') && istDoku(pfad))
  );
}

function git(...argumente) {
  return execFileSync('git', argumente, { encoding: 'utf8' });
}

function main() {
  const basisRef = process.argv[2] || 'origin/main';
  // Wie im Migrationen-Gate: gegen den gemeinsamen Vorfahren, nicht gegen
  // das, was auf main nach dem Abzweigen dazukam.
  const basis = git('merge-base', basisRef, 'HEAD').trim();
  const aenderungen = git('diff', '--name-status', '--no-renames', basis, 'HEAD')
    .split('\n')
    .filter(Boolean)
    .map((zeile) => {
      const [status, pfad] = zeile.split('\t');
      return { status, pfad };
    });
  const ergebnis = nurDoku(aenderungen);
  const pfade = aenderungen.map(({ pfad }) => pfad);
  console.error(
    ergebnis
      ? `Nur Dokumentation (${pfade.length} Datei(en) gegen ${basis.slice(0, 7)}): ` +
          'Tests, Build und Datenbankprüfungen entfallen.'
      : `Nicht nur Dokumentation (${pfade.length} Datei(en) gegen ${basis.slice(0, 7)}): ` +
          'alle Prüfungen laufen.',
  );
  console.log(`nur_doku=${ergebnis}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
