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
