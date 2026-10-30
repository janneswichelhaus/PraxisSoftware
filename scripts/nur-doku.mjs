/**
 * Erkennt einen Pull Request nur mit Doku (ADR-013 Punkt 2): Markdown unter `docs/` oder im
 * Wurzelverzeichnis, das kein Test liest. Die CI nimmt die Fassung des Zielbranchs, damit sich kein
 * Pull Request selbst so einstuft; im Zweifel `false`, dann läuft alles (`docs/DEVELOPMENT.md`).
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Markdown, das Tests lesen: nie „nur Doku“; liest ein neuer Test eines, wird `nur-doku.test.mjs` rot. */
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
  // Gelöscht löst alles aus: Ein Test könnte prüfen, dass die Datei da ist. Neue Dateien prüft
  // `src/dateinamen.test.ts` auf Kollisionen der Schreibweise, die CI auch bei reiner Doku.
  return (
    aenderungen.length > 0 &&
    aenderungen.every(({ status, pfad }) => (status === 'M' || status === 'A') && istDoku(pfad))
  );
}

function git(...argumente) {
  return execFileSync('git', argumente, { encoding: 'utf8' });
}

// Aufruf: `node scripts/nur-doku.mjs <basis>`; schreibt `nur_doku=true|false` für `$GITHUB_OUTPUT`.
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
          'Lint, Typecheck, Tests, Build und Datenbankprüfungen entfallen.'
      : `Nicht nur Dokumentation (${pfade.length} Datei(en) gegen ${basis.slice(0, 7)}): ` +
          'alle Prüfungen laufen.',
  );
  console.log(`nur_doku=${ergebnis}`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
