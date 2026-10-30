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

describe('Aufgeteilte Jobs in der CI', () => {
  // Seit 2026-10-10 laufen die Datenbanktests in Teilen nebeneinander, seit
  // 2026-10-16 auch die E2E-Tests hinter der Anmeldung und Tests neben Lint
  // (ANN-571). Die Pflichtchecks der Branch Protection behalten ihre Namen
  // und sammeln die Teile ein. Rutscht ein Teil aus der Matrix oder prüft der
  // Sammeljob ein Ergebnis nicht, liefe ein Teil der Tests nie - und der
  // Pflichtcheck wäre trotzdem grün.
  const ci = readFileSync(join(stamm, '.github/workflows/ci.yml'), 'utf8');

  /** Der Abschnitt eines Jobs: von seiner Kopfzeile bis zum nächsten Job. */
  function job(id: string): string {
    const start = ci.indexOf(`\n  ${id}:\n`);
    expect(start, `Job ${id} fehlt`).toBeGreaterThan(-1);
    const rest = ci.slice(start + 1);
    const ende = rest.slice(1).search(/\n {2}[a-z][\w-]*:\n/);
    return ende === -1 ? rest : rest.slice(0, ende + 1);
  }

  /** Bei reiner Doku übersprungen, sonst immer - auch wenn die Erkennung scheitert. */
  const NUR_OHNE_DOKU = "if: ${{ !cancelled() && needs.aenderungen.outputs.nur_doku != 'true' }}";
  const SKIP_NUR_BEI_DOKU = (ergebnis: string) =>
    `test "$${ergebnis}" = success || { test "$NUR_DOKU" = true && test "$${ergebnis}" = skipped; }`;

  it.each([
    ['database-teil', /--shard=\$\{\{ matrix\.teil \}\}\/(\d+)/],
    ['e2e-supabase-teil', /--project authenticated --shard=\$\{\{ matrix\.teil \}\}\/(\d+)/],
  ])('%s teilt in so viele Teile, wie die Matrix startet', (id, shard) => {
    const teile = job(id);
    const matrix = (/teil: \[([\d, ]+)\]/.exec(teile)?.[1] ?? '')
      .split(',')
      .map((t) => Number(t.trim()));
    const anzahl = Number(shard.exec(teile)?.[1]);
    expect(anzahl).toBeGreaterThan(1);
    expect(matrix).toEqual(Array.from({ length: anzahl }, (_, i) => i + 1));
    expect(teile).toContain(`(Teil \${{ matrix.teil }}/${anzahl})`);
    expect(teile).toContain('fail-fast: false');
  });

  it('hält „Migrationen und RLS-Policies“ unter seinem Namen und grün nur mit allen Teilen', () => {
    const sammel = job('database');
    expect(sammel).toContain('name: Migrationen und RLS-Policies');
    expect(sammel).toContain('needs: [aenderungen, database-teil, migrationen]');
    expect(sammel).toContain('if: ${{ always() }}');
    expect(sammel).toContain('TEILE: ${{ needs.database-teil.result }}');
    expect(sammel).toContain('MIGRATIONEN: ${{ needs.migrationen.result }}');
    expect(sammel).toContain('test "$MIGRATIONEN" = success\n');
    expect(sammel).toContain(SKIP_NUR_BEI_DOKU('TEILE'));
  });

  it('hält „End-to-End hinter der Anmeldung“ unter seinem Namen und grün nur mit allen Teilen', () => {
    const sammel = job('e2e-supabase');
    expect(sammel).toContain('name: End-to-End hinter der Anmeldung\n');
    expect(sammel).toContain('needs: [aenderungen, e2e-supabase-teil]');
    expect(sammel).toContain('if: ${{ always() }}');
    expect(sammel).toContain('TEILE: ${{ needs.e2e-supabase-teil.result }}');
    expect(sammel).toContain(SKIP_NUR_BEI_DOKU('TEILE'));
  });

  /** Ein Schritt eines Jobs: von seinem `- name:` bis zum nächsten Schritt. */
  function schritt(jobText: string, name: string): string {
    const start = jobText.indexOf(`- name: ${name}\n`);
    expect(start, `Schritt ${name} fehlt`).toBeGreaterThan(-1);
    const rest = jobText.slice(start);
    const ende = rest.slice(1).search(/\n\s+- (name|uses):/);
    return ende === -1 ? rest : rest.slice(0, ende + 1);
  }

  /** Nur bei erkannter reiner Doku übersprungen; scheitert die Erkennung, läuft der Schritt. */
  const AUSSER_BEI_DOKU = "if: ${{ needs.aenderungen.outputs.nur_doku != 'true' }}";

  it('hält „Lint, Typecheck, Tests, Build“ unter seinem Namen; Lint und Typecheck außer bei reiner Doku', () => {
    const sammel = job('quality');
    expect(sammel).toContain('name: Lint, Typecheck, Tests, Build');
    expect(sammel).toContain('needs: [aenderungen, statisch, unit]');
    expect(sammel).toContain('if: ${{ always() }}');
    expect(sammel).toContain('test "$STATISCH" = success\n');
    expect(sammel).toContain(SKIP_NUR_BEI_DOKU('UNIT'));

    // ADR-013 Fassung 8: Der Job läuft immer, auch wenn die Erkennung scheitert.
    const statisch = job('statisch');
    expect(statisch).toContain('needs: aenderungen\n');
    expect(statisch).toContain('if: ${{ !cancelled() }}');
    for (const [name, befehl] of [
      ['Format', 'pnpm format:check'],
      ['Lint (inkl. statischer Sicherheitsanalyse)', 'pnpm lint'],
      ['Typecheck', 'pnpm typecheck'],
    ] as const) {
      expect(schritt(statisch, name), name).toContain(AUSSER_BEI_DOKU);
      expect(schritt(statisch, name), name).toContain(`run: ${befehl}`);
    }
    // Bei reiner Doku prüft das Format genau die geänderten und neuen Dateien.
    const doku = schritt(statisch, 'Format der geaenderten Dokumentation');
    expect(doku).toContain("if: ${{ needs.aenderungen.outputs.nur_doku == 'true' }}");
    // Ohne `shell: bash` fehlt pipefail: Ein gescheitertes `git diff` prüfte still nichts.
    expect(doku).toContain('shell: bash');
    expect(doku).toContain('git diff -z --name-only --diff-filter=AM "$BASIS...HEAD"');
    expect(doku).toContain('pnpm exec prettier --check --');
    // Immer, auch bei reiner Doku: Dokumentation, Kommentare und Dateinamen.
    for (const name of [
      'Dokumentation (Obergrenzen, Register-Anker, Links)',
      'Kommentarregel (hoechstens drei Zeilen, keine Tickets)',
      'Dateinamen ohne Kollision der Schreibweise',
    ]) {
      expect(schritt(statisch, name), name).not.toContain('if:');
    }
    const unit = job('unit');
    expect(unit).toContain('run: pnpm test\n');
    expect(unit).toContain('run: pnpm exec vite build');
  });

  it('überspringt bei reiner Dokumentation nur Lint, Typecheck, Tests, Build, Datenbank und E2E (ADR-013 Fassung 8)', () => {
    for (const id of ['unit', 'database-teil', 'e2e', 'e2e-supabase-teil']) {
      expect(job(id), id).toContain('needs: aenderungen\n');
      expect(job(id), id).toContain(NUR_OHNE_DOKU);
    }
    for (const id of ['migrationen', 'security']) {
      expect(job(id), id).not.toContain('aenderungen');
    }
    // Nur im Pull Request; auf main läuft nach dem Merge alles.
    const erkennung = job('aenderungen');
    expect(erkennung).toContain('if [ "$EREIGNIS" != pull_request ]; then');
    expect(erkennung).toContain('echo "nur_doku=false" >> "$GITHUB_OUTPUT"');
    // In der Fassung des Zielbranchs, nicht in der des Pull Requests.
    expect(erkennung).toContain(
      'git show "$BASIS:scripts/nur-doku.mjs" > "$RUNNER_TEMP/nur-doku.mjs"',
    );
    expect(erkennung).toContain('node "$RUNNER_TEMP/nur-doku.mjs" "$BASIS"');
    expect(job('statisch')).toContain('src/dateinamen.test.ts');
  });

  it('prüft die ausgelieferten Migrationen gegen die ganze Geschichte', () => {
    const gate = job('migrationen');
    expect(gate).toContain('fetch-depth: 0');
    expect(gate).toContain('node scripts/migrationen-check.mjs "$BASIS"');
  });
});

describe('Testprojekte', () => {
  it('führt mit `pnpm test` Komponenten und reine Logik aus', () => {
    const paket = JSON.parse(readFileSync(join(stamm, 'package.json'), 'utf8')) as {
      scripts?: Record<string, string>;
    };
    expect(paket.scripts?.test).toBe('vitest run --project unit --project logik');
  });
});
