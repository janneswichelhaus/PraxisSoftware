import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { istDoku, nurDoku, VON_TESTS_GELESEN } from './nur-doku.mjs';

/**
 * Ein Pull Request nur mit Dokumentation lässt Tests, Build und
 * Datenbankprüfungen aus (ADR-013 Punkt 2, Fassung 5). Das ist nur richtig,
 * solange kein Test und kein Build die Dateien liest, die als Dokumentation
 * gelten.
 */

describe('istDoku', () => {
  it('nimmt Markdown unter docs/ und im Wurzelverzeichnis', () => {
    expect(istDoku('docs/STATUS.md')).toBe(true);
    expect(istDoku('docs/adr/ADR-013-ci-cd-and-release-governance.md')).toBe(true);
    expect(istDoku('CLAUDE.md')).toBe(true);
    expect(istDoku('PROJECT_PRINCIPLES.md')).toBe(true);
  });

  it('nimmt keine andere Datei unter docs/ - fortschritt.json liest ein Test', () => {
    expect(istDoku('docs/development/fortschritt.json')).toBe(false);
    expect(istDoku('docs/bilder/kalender.png')).toBe(false);
  });

  it('nimmt kein Markdown, das ein Test liest', () => {
    expect(istDoku('docs/adr/ADR-011-logging-and-observability.md')).toBe(false);
    expect(istDoku('docs/betrieb/bootstrap.md')).toBe(false);
  });

  it('nimmt kein Markdown außerhalb von docs/ - quellen/README.md liest ein Test', () => {
    expect(istDoku('quellen/README.md')).toBe(false);
    expect(istDoku('.claude/skills/bereich/SKILL.md')).toBe(false);
    expect(istDoku('src/features/clinical/assessments/definitionen/scores/README.md')).toBe(false);
  });
});

describe('nurDoku', () => {
  const geaendert = (pfad) => ({ status: 'M', pfad });
  const neu = (pfad) => ({ status: 'A', pfad });
  const geloescht = (pfad) => ({ status: 'D', pfad });

  it('ist wahr, wenn alle Änderungen Dokumentation sind, geändert oder neu', () => {
    expect(
      nurDoku([geaendert('docs/STATUS.md'), neu('docs/product/neu.md'), geaendert('CLAUDE.md')]),
    ).toBe(true);
  });

  it('ist falsch, sobald eine einzige Datei keine ist', () => {
    expect(nurDoku([geaendert('docs/STATUS.md'), geaendert('src/app/App.tsx')])).toBe(false);
    expect(nurDoku([geaendert('docs/STATUS.md'), geaendert('.github/workflows/ci.yml')])).toBe(
      false,
    );
    expect(
      nurDoku([geaendert('docs/STATUS.md'), geaendert('docs/development/fortschritt.json')]),
    ).toBe(false);
  });

  it('ist bei einer gelöschten Datei falsch - ein Test könnte prüfen, dass sie da ist', () => {
    expect(nurDoku([geaendert('docs/STATUS.md'), geloescht('docs/regulatorik/pruefung.md')])).toBe(
      false,
    );
    // Eine Umbenennung kommt mit --no-renames als Löschung und Hinzufügung.
    expect(nurDoku([geloescht('docs/alt.md'), neu('docs/neu.md')])).toBe(false);
  });

  it('ist bei anderem Status falsch, etwa einer Änderung des Dateimodus', () => {
    expect(nurDoku([{ status: 'T', pfad: 'docs/STATUS.md' }])).toBe(false);
  });

  it('ist ohne Änderungen falsch - im Zweifel läuft alles', () => {
    expect(nurDoku([])).toBe(false);
  });
});

describe('Kein Test liest, was als Dokumentation gilt', () => {
  const stamm = process.cwd();
  // docs-check liest die Dokumentation, läuft aber auch bei reiner Doku;
  // seine Tests nennen Pfade nur als Beispiel.
  const AUSGENOMMEN = new Set(['scripts/docs-check.test.mjs', 'scripts/nur-doku.test.mjs']);
  /** Markdown-Namen im Code von Tests, die keine gelesene Doku sind. */
  const KEINE_DOKU = {
    'src/app/mdr.test.ts: docs/regulatorik/pruefung.md': 'nur ein Wert im Freigabeeintrag',
    'src/quellen.test.ts: README.md': 'quellen/README.md, nicht die Wurzel',
  };

  function testdateien(verzeichnis) {
    const treffer = [];
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade unter dem Repository, fest im Quelltext.
    for (const eintrag of readdirSync(verzeichnis)) {
      if (eintrag === 'node_modules') continue;
      const pfad = join(verzeichnis, eintrag);
      // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade unter dem Repository, fest im Quelltext.
      if (statSync(pfad).isDirectory()) treffer.push(...testdateien(pfad));
      else if (/\.(test|spec)\.(ts|tsx|mjs)$/.test(eintrag)) treffer.push(pfad);
    }
    return treffer;
  }

  /** Markdown-Namen in Zeichenketten des Codes, ohne Kommentarzeilen. */
  function markdownImCode(text) {
    return text
      .split('\n')
      .filter((zeile) => !/^\s*(\*|\/\/|\/\*)/.test(zeile))
      .flatMap((zeile) => [...zeile.matchAll(/['"]([\w./-]+\.md)['"]/g)].map((t) => t[1]));
  }

  it('kennt jede Markdown-Datei, die eine Testdatei im Code nennt', () => {
    const gelesen = (name) =>
      VON_TESTS_GELESEN.some((pfad) => pfad === name || pfad.endsWith(`/${name}`));
    const unbekannt = ['src', 'scripts', 'supabase', 'tests']
      .flatMap((ordner) => testdateien(join(stamm, ordner)))
      .map((pfad) => relative(stamm, pfad))
      .filter((datei) => !AUSGENOMMEN.has(datei))
      .flatMap((datei) =>
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade unter dem Repository, fest im Quelltext.
        markdownImCode(readFileSync(join(stamm, datei), 'utf8')).map((name) => ({ datei, name })),
      )
      // Ein Name mit Ordner außerhalb von docs/ ist ohnehin keine Doku.
      .filter(({ name }) => istDoku(name))
      .filter(({ datei, name }) => !gelesen(name) && !(`${datei}: ${name}` in KEINE_DOKU))
      .map(({ datei, name }) => `${datei}: ${name}`);
    expect(
      unbekannt,
      'Liest der Test die Datei, gehört sie in VON_TESTS_GELESEN (scripts/nur-doku.mjs)',
    ).toEqual([]);
  });

  it('nennt nur Dateien, die es gibt', () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade unter dem Repository, fest im Quelltext.
    for (const pfad of VON_TESTS_GELESEN) expect(statSync(join(stamm, pfad)).isFile()).toBe(true);
  });
});
