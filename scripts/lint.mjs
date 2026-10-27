/**
 * `pnpm lint` in zwei Läufen nacheinander, Anwendung und Tests: Jeder hält nur sein TypeScript-Programm
 * im Speicher und braucht so halb so viel wie ein Lauf über alles (docs/DEVELOPMENT.md).
 */
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Der zweite Lauf prüft genau, was der erste auslässt: dieselben Muster, keine Lücke. */
export const TESTS = ['**/*.test.ts', '**/*.test.tsx', 'supabase/tests/**', 'tests/**'];
export const HEAP_MB = 3072;

/** Die Argumente für Node je Lauf; `zusatz` (etwa `--max-warnings 0`) gilt für beide. */
export function laeufe(zusatz = []) {
  const basis = [`--max-old-space-size=${HEAP_MB}`, 'node_modules/eslint/bin/eslint.js', ...zusatz];
  return [
    {
      name: 'Anwendung',
      argumente: [...basis, '.', ...TESTS.flatMap((muster) => ['--ignore-pattern', muster])],
    },
    { name: 'Tests', argumente: [...basis, ...TESTS] },
  ];
}

function main() {
  let status = 0;
  for (const { name, argumente } of laeufe(process.argv.slice(2))) {
    console.log(`ESLint: ${name}`);
    const lauf = spawnSync(process.execPath, argumente, { stdio: 'inherit' });
    // Auch nach einem roten ersten Lauf zeigt der zweite seine Befunde.
    if (lauf.status !== 0 && status === 0) status = lauf.status ?? 1;
  }
  process.exit(status);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
