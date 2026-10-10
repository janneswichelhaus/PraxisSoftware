import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Die Werkzeugkette hält zusammen, was zusammengehört.
 *
 * `BEF-011`: Unter Node 24 scheitern rund 60 Komponententests an der
 * Navigation in jsdom — react-router baut dabei ein `Request` mit dem
 * `AbortSignal` von jsdom, das Node 24 nicht mehr als seines erkennt. Der
 * Code ist daran unbeteiligt; die CI läuft mit Node 22 und ist grün.
 *
 * Ein Pflichtgate, das lokal rot ist, ohne dass Code betroffen wäre, wird
 * übersprungen — und dann auch, wenn es einen echten Fehler hätte. Deshalb
 * sagt das Repo, mit welcher Node-Fassung es arbeitet, und zwar an allen
 * Stellen dieselbe (R3-049).
 */

const stamm = process.cwd();

describe('Lint-Gate', () => {
  it('macht jede Warnung rot, nicht nur jeden Fehler (R3-022)', () => {
    // Die statische Sicherheitsanalyse (eslint-plugin-security) meldet ihre
    // 14 Regeln als `warn`. Ohne `--max-warnings 0` liefert `pnpm lint` dann
    // Exit 0 - das CI-Gate "Lint (inkl. statischer Sicherheitsanalyse)" waere
    // bei keinem einzigen Sicherheitsbefund rot geworden.
    const paket = JSON.parse(readFileSync(join(stamm, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(paket.scripts?.lint).toContain('--max-warnings 0');
  });
});

describe('Node-Fassung', () => {
  const paket = JSON.parse(readFileSync(join(stamm, 'package.json'), 'utf8')) as {
    engines?: { node?: string };
  };

  it('nagelt engines auf 22 fest statt >=22 zuzulassen', () => {
    expect(paket.engines?.node).toBe('22.x');
  });

  it('nennt dieselbe Fassung in .nvmrc', () => {
    const nvmrc = readFileSync(join(stamm, '.nvmrc'), 'utf8').trim();
    expect(nvmrc).toBe('22');
  });

  it('nennt dieselbe Fassung in der CI', () => {
    const ci = readFileSync(join(stamm, '.github/workflows/ci.yml'), 'utf8');
    const treffer = /NODE_VERSION:\s*'?(\d+)'?/.exec(ci);
    expect(treffer?.[1]).toBe('22');
  });
});

describe('Datenbanktests in der CI', () => {
  // Seit 2026-10-10 laufen die Datenbanktests in Teilen nebeneinander. Der
  // Pflichtcheck der Branch Protection heißt weiter „Migrationen und
  // RLS-Policies“ und sammelt die Teile ein. Rutscht ein Teil aus der Matrix
  // oder prüft der Sammeljob ein Ergebnis nicht, liefe ein Teil der Tests
  // nie - und der Pflichtcheck wäre trotzdem grün.
  const ci = readFileSync(join(stamm, '.github/workflows/ci.yml'), 'utf8');

  /** Der Abschnitt eines Jobs: von seiner Kopfzeile bis zum nächsten Job. */
  function job(id: string): string {
    const start = ci.indexOf(`\n  ${id}:\n`);
    expect(start, `Job ${id} fehlt`).toBeGreaterThan(-1);
    const rest = ci.slice(start + 1);
    const ende = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
    return ende === -1 ? rest : rest.slice(0, ende + 1);
  }

  it('teilt in so viele Teile, wie die Matrix startet', () => {
    const teile = job('database-teil');
    const matrix = (/teil: \[([\d, ]+)\]/.exec(teile)?.[1] ?? '')
      .split(',')
      .map((t) => Number(t.trim()));
    const anzahl = Number(/--shard=\$\{\{ matrix\.teil \}\}\/(\d+)/.exec(teile)?.[1]);
    expect(anzahl).toBeGreaterThan(1);
    expect(matrix).toEqual(Array.from({ length: anzahl }, (_, i) => i + 1));
    expect(teile).toContain(`(Teil \${{ matrix.teil }}/${anzahl})`);
    expect(teile).toContain('fail-fast: false');
  });

  it('hält den Pflichtcheck unter seinem Namen und macht ihn nur mit allen Teilen grün', () => {
    const sammel = job('database');
    expect(sammel).toContain('name: Migrationen und RLS-Policies');
    expect(sammel).toContain('needs: [database-teil, migrationen]');
    expect(sammel).toContain('if: ${{ !cancelled() }}');
    expect(sammel).toContain('TEILE: ${{ needs.database-teil.result }}');
    expect(sammel).toContain('MIGRATIONEN: ${{ needs.migrationen.result }}');
    expect(sammel).toContain('test "$TEILE" = success && test "$MIGRATIONEN" = success');
  });

  it('prüft die ausgelieferten Migrationen gegen die ganze Geschichte', () => {
    const gate = job('migrationen');
    expect(gate).toContain('fetch-depth: 0');
    expect(gate).toContain('node scripts/migrationen-check.mjs "$BASIS"');
  });
});
