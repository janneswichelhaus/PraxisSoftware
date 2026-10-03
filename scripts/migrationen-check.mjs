/**
 * Gate: Ausgelieferte Migrationen bleiben, wie sie sind (BEF-123, ADR-013
 * Punkt 2 „Datenbank-/Migrationstest").
 *
 * `supabase db push` spielt jede Migration genau einmal ein und merkt sich nur
 * ihre Versionsnummer. Wer eine Datei ändert, die schon auf `main` liegt,
 * ändert deshalb nur das Repository: Lokal und in der CI entsteht die
 * Datenbank aus der neuen Fassung, die Test-Umgebung behält die alte. Genau so
 * ist am 2026-09-26 die Migration `20260926150000_dok_006b_patient_photos.sql`
 * nach dem Einspielen noch einmal geändert worden; eine Woche später brach die
 * Auslieferung an einer Funktion, die es nur in der neuen Fassung gab.
 *
 * Zwei Zusicherungen gegenüber der Basis (`main` vor der Änderung):
 *
 *   1. **Unverändert.** Eine Migration der Basis wird weder geändert noch
 *      gelöscht noch umbenannt. Eine Korrektur ist eine neue Migration.
 *   2. **Hinten angehängt.** Eine neue Migration trägt eine höhere Version
 *      als die jüngste der Basis. Eine ältere spielt `db push` nur mit
 *      `--include-all` ein - und dann in falscher Reihenfolge.
 *
 * Migrationen, die nur auf dem Branch liegen, dürfen bis zum Merge beliebig
 * geändert werden: Ausgeliefert wird erst von `main`.
 *
 * Bewusst ohne Abhängigkeiten, wie `docs-check.mjs`.
 *
 * Aufruf: `node scripts/migrationen-check.mjs <basis>` - etwa `origin/main`
 * im Pull Request oder der Commit vor dem Push auf `main`. Ohne Angabe
 * `origin/main`. Exit 1 mit einer Liste der Verstöße.
 */
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export const MIGRATIONEN = 'supabase/migrations';

/** Die Versionsnummer vorn im Dateinamen: `20261004110000_…sql` → `20261004110000`. */
export function version(datei) {
  const name = datei.split('/').pop() ?? '';
  return /^(\d+)_/.exec(name)?.[1] ?? null;
}

/**
 * Prüft die Änderungen gegen die Basis.
 *
 * @param {{ status: string, pfad: string }[]} aenderungen - aus
 *   `git diff --name-status --no-renames`, nur unter `supabase/migrations/`
 * @param {string[]} basis - die Migrationsdateien der Basis
 * @returns {string[]} die Verstöße, leer heißt bestanden
 */
export function pruefeMigrationen(aenderungen, basis) {
  const verstoesse = [];
  const vorhanden = new Set(basis);
  const juengste = basis
    .map(version)
    .filter((v) => v !== null)
    .sort()
    .at(-1);

  for (const { status, pfad } of aenderungen) {
    if (!pfad.endsWith('.sql')) continue;
    if (vorhanden.has(pfad)) {
      const was = status.startsWith('D') ? 'gelöscht' : 'geändert';
      verstoesse.push(
        `${pfad}: ${was} - die Migration liegt schon auf main und ist ausgeliefert. ` +
          'Eine Korrektur gehört in eine neue Migration.',
      );
      continue;
    }
    if (!status.startsWith('A')) continue;
    const neu = version(pfad);
    if (neu === null) {
      verstoesse.push(`${pfad}: keine Versionsnummer vorn im Dateinamen.`);
    } else if (juengste && neu <= juengste) {
      verstoesse.push(
        `${pfad}: Version ${neu} liegt nicht hinter der jüngsten Migration auf main (${juengste}). ` +
          'Neue Migrationen werden hinten angehängt.',
      );
    }
  }
  return verstoesse;
}

function git(...argumente) {
  return execFileSync('git', argumente, { encoding: 'utf8' });
}

function main() {
  const basisRef = process.argv[2] || 'origin/main';
  // Die Basis ist der gemeinsame Vorfahr, nicht der heutige Stand von main:
  // Was dort nach dem Abzweigen dazukam, ist nicht Teil dieser Änderung.
  const basis = git('merge-base', basisRef, 'HEAD').trim();
  const dateien = git('ls-tree', '-r', '--name-only', basis, '--', `${MIGRATIONEN}/`)
    .split('\n')
    .filter(Boolean);
  const aenderungen = git(
    'diff',
    '--name-status',
    '--no-renames',
    basis,
    'HEAD',
    '--',
    `${MIGRATIONEN}/`,
  )
    .split('\n')
    .filter(Boolean)
    .map((zeile) => {
      const [status, pfad] = zeile.split('\t');
      return { status, pfad };
    });

  const verstoesse = pruefeMigrationen(aenderungen, dateien);
  if (verstoesse.length > 0) {
    console.error(`Migrationen-Gate rot (Basis ${basis.slice(0, 7)}):`);
    for (const verstoss of verstoesse) console.error(`  - ${verstoss}`);
    process.exit(1);
  }
  console.log(
    `Migrationen-Gate gruen: ${dateien.length} ausgelieferte Migrationen unveraendert, ` +
      `${aenderungen.length} Aenderung(en) gegen ${basis.slice(0, 7)} geprueft.`,
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
