import { ESLint } from 'eslint';
import { readFileSync } from 'node:fs';
import { relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { laeufe } from './lint.mjs';

// Ein Parser ohne Inhalt und keine Regel: ESLint zählt nur die Dateien auf, so wie in `pnpm lint`,
// ohne TypeScript-Programm (Sekunden statt Minuten).
const LEER = {
  parseForESLint: (text) => ({
    ast: {
      type: 'Program',
      body: [],
      sourceType: 'module',
      range: [0, text.length],
      loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
      tokens: [],
      comments: [],
    },
    visitorKeys: { Program: [] },
  }),
};

/** Die Dateien, die ESLint mit diesen Argumenten prüft. */
async function dateien(argumente) {
  const muster = [];
  const ignorePatterns = [];
  let ignorieren = false;
  for (const argument of argumente) {
    if (argument === '--ignore-pattern') {
      ignorieren = true;
    } else {
      (ignorieren ? ignorePatterns : muster).push(argument);
      ignorieren = false;
    }
  }
  const eslint = new ESLint({
    ignorePatterns,
    ruleFilter: () => false,
    overrideConfig: { languageOptions: { parser: LEER } },
  });
  const ergebnisse = await eslint.lintFiles(muster);
  return ergebnisse.map((ergebnis) => relative(process.cwd(), ergebnis.filePath)).sort();
}

describe('pnpm lint in zwei Läufen', () => {
  const [anwendung, tests] = laeufe();
  const eslintArgumente = (lauf) => lauf.argumente.slice(2);

  it('prüft zusammen genau die Dateien von `eslint .`, jede einmal', async () => {
    const alle = await dateien(['.']);
    const erster = await dateien(eslintArgumente(anwendung));
    const zweiter = await dateien(eslintArgumente(tests));
    expect(erster.length).toBeGreaterThan(0);
    expect(zweiter.length).toBeGreaterThan(0);
    expect([...erster, ...zweiter].sort()).toEqual(alle);
  }, 60_000);

  it('gibt `--max-warnings 0` aus package.json an beide Läufe weiter', () => {
    const paket = JSON.parse(readFileSync('package.json', 'utf8'));
    expect(paket.scripts.lint).toBe('node scripts/lint.mjs --max-warnings 0');
    for (const lauf of laeufe(['--max-warnings', '0'])) {
      expect(lauf.argumente.slice(0, 4)).toEqual([
        '--max-old-space-size=3072',
        'node_modules/eslint/bin/eslint.js',
        '--max-warnings',
        '0',
      ]);
    }
  });
});
