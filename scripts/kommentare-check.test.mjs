import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  kommentarbloecke,
  neueZeilenAusDiff,
  pruefeDatei,
  textzeilen,
} from './kommentare-check.mjs';

const zeilen = (...z) => z.join('\n');
const alle = (text) => new Set(text.split('\n').map((_, i) => i + 1));

describe('kommentarbloecke', () => {
  it('fasst Zeilenkommentare und JSDoc zu Bloecken zusammen', () => {
    const text = zeilen('// a', '// b', 'const x = 1;', '/**', ' * c', ' */', 'f();');
    expect(kommentarbloecke(text, 'ts').map((b) => [b.start, b.ende])).toEqual([
      [1, 2],
      [4, 6],
    ]);
  });

  it('zaehlt Code mit Kommentar in derselben Zeile nicht als Kommentar', () => {
    expect(kommentarbloecke(zeilen('/* a */ f();', 'g(); // b'), 'ts')).toEqual([]);
  });

  it('erkennt Kommentare in JSX', () => {
    expect(kommentarbloecke('  {/* Hinweis */}', 'ts')).toHaveLength(1);
  });

  it('liest in SQL nur -- und /* */', () => {
    const text = zeilen('-- a', 'select 1; -- b', '// in SQL kein Kommentar');
    expect(kommentarbloecke(text, 'sql').map((b) => b.start)).toEqual([1]);
    expect(kommentarbloecke('-- in TypeScript kein Kommentar', 'ts')).toEqual([]);
  });
});

describe('textzeilen', () => {
  it('zaehlt Trennlinien, leere Zeilen und Anweisungen an Werkzeuge nicht', () => {
    const [block] = kommentarbloecke(
      zeilen(
        '// -----',
        '// Warum',
        '//',
        '// eslint-disable-next-line no-console -- Grund',
        '// ===',
      ),
      'ts',
    );
    expect(textzeilen(block)).toBe(1);
  });

  it('zaehlt im JSDoc nur die Zeilen mit Text', () => {
    const [block] = kommentarbloecke(zeilen('/**', ' * eins', ' *', ' * zwei', ' */'), 'ts');
    expect(textzeilen(block)).toBe(2);
  });
});

describe('pruefeDatei', () => {
  const lang = zeilen('// eins', '// zwei', '// drei', '// vier', 'f();');

  it('laesst drei Zeilen durch und weist vier ab', () => {
    const drei = zeilen('// eins', '// zwei', '// drei', 'f();');
    expect(pruefeDatei('a.ts', drei, alle(drei))).toEqual([]);
    expect(pruefeDatei('a.ts', lang, alle(lang))[0]).toMatch(
      /^a\.ts:1: Kommentar mit 4 Zeilen, höchstens 3/,
    );
  });

  it('prueft einen langen Block nur, wenn der Diff ihn beruehrt', () => {
    expect(pruefeDatei('a.ts', lang, new Set([5]))).toEqual([]);
    expect(pruefeDatei('a.ts', lang, new Set([2]))).toHaveLength(1);
  });

  it('weist Tickets und Epics in neuen Kommentarzeilen ab', () => {
    const text = zeilen('// Seit KI-EPIC-001 und BEF-056 so', 'f();');
    expect(pruefeDatei('a.ts', text, alle(text))[0]).toMatch(/KI-EPIC-001, BEF-056 im Kommentar/);
  });

  it('laesst ANN, ADR und Normen stehen', () => {
    const text = zeilen('-- ANN-046, ADR-016 Punkt 10, SHA-256', 'select 1;');
    expect(pruefeDatei('m.sql', text, alle(text))).toEqual([]);
  });

  it('meldet keine Tickets in Zeichenketten und in unveraenderten Zeilen', () => {
    const text = zeilen("it('BEF-185 im Testnamen', f);", '// BEF-001 stand schon da', '// neu');
    expect(pruefeDatei('a.test.ts', text, new Set([1, 3]))).toEqual([]);
  });
});

describe('neueZeilenAusDiff', () => {
  it('liest die hinzugefuegten Zeilen je Datei aus den Hunks', () => {
    const diff = zeilen(
      'diff --git a/a.ts b/a.ts',
      '--- a/a.ts',
      '+++ b/a.ts',
      '@@ -3,0 +4,2 @@',
      '+// neu',
      '+// auch neu',
      '@@ -9 +11 @@',
      '--- entfernte SQL-Zeile',
      '+++ hinzugefuegte Zeile',
      'diff --git a/weg.ts b/weg.ts',
      '--- a/weg.ts',
      '+++ /dev/null',
      '@@ -1,2 +0,0 @@',
    );
    const neu = neueZeilenAusDiff(diff);
    expect([...neu.keys()]).toEqual(['a.ts']);
    expect([...neu.get('a.ts')]).toEqual([4, 5, 11]);
  });
});

describe('kommentare-check.mjs im Repository', () => {
  const skript = join(process.cwd(), 'scripts/kommentare-check.mjs');
  const alt = zeilen('// eins', '// zwei', '// drei', '// vier', 'export const a = 1;', '');
  let ordner = '';

  function git(...argumente) {
    return execFileSync('git', argumente, { cwd: ordner, encoding: 'utf8' });
  }

  function datei(name, inhalt) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Wegwerfordner aus mkdtempSync.
    writeFileSync(join(ordner, name), inhalt);
  }

  function aufbauen() {
    ordner = mkdtempSync(join(tmpdir(), 'kommentare-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Test');
    datei('alt.ts', alt);
    git('add', '.');
    git('commit', '-q', '-m', 'Basis');
    git('checkout', '-q', '-b', 'zweig');
  }

  function pruefen() {
    try {
      execFileSync('node', [skript, 'main'], { cwd: ordner, encoding: 'utf8', stdio: 'pipe' });
      return { rot: false, ausgabe: '' };
    } catch (fehler) {
      return { rot: true, ausgabe: String(fehler.stderr) };
    }
  }

  afterEach(() => {
    if (ordner) rmSync(ordner, { recursive: true, force: true });
  });

  it('ist gruen, wenn nur Code neben einem alten langen Kommentar geaendert wird', () => {
    aufbauen();
    datei('alt.ts', alt.replace('a = 1', 'a = 2'));
    git('commit', '-qam', 'Code');
    expect(pruefen().rot).toBe(false);
  });

  it('ist rot fuer einen beruehrten langen Kommentar', () => {
    aufbauen();
    datei('alt.ts', alt.replace('// zwei', '// zwei, ergaenzt'));
    git('commit', '-qam', 'Kommentar');
    const { rot, ausgabe } = pruefen();
    expect(rot).toBe(true);
    expect(ausgabe).toMatch(/alt\.ts:1: Kommentar mit 4 Zeilen/);
  });

  it('ist rot fuer eine neue Datei, auch bevor sie im Index liegt', () => {
    aufbauen();
    datei('neu.sql', zeilen('-- Seit FLT-005 so', 'select 1;', ''));
    expect(pruefen().ausgabe).toMatch(/neu\.sql:1: FLT-005 im Kommentar/);
  });

  it('laesst nur die erzeugte Basis der Migrationen aus', () => {
    aufbauen();
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Wegwerfordner aus mkdtempSync.
    mkdirSync(join(ordner, 'supabase/migrations'), { recursive: true });
    const rumpf = zeilen('-- Seit FLT-005', '-- zwei', '-- drei', '-- vier', 'select 1;', '');
    datei('supabase/migrations/20261225000000_basis.sql', rumpf);
    expect(pruefen().rot).toBe(false);
    datei('supabase/migrations/20261226000000_neu.sql', rumpf);
    expect(pruefen().ausgabe).toMatch(/20261226000000_neu\.sql:1: Kommentar mit 4 Zeilen/);
  });

  it('ist gruen fuer eine umbenannte Datei mit altem Kommentar', () => {
    aufbauen();
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Wegwerfordner aus mkdtempSync.
    renameSync(join(ordner, 'alt.ts'), join(ordner, 'umbenannt.ts'));
    git('add', '-A');
    git('commit', '-qm', 'Umbenannt');
    expect(pruefen().rot).toBe(false);
  });
});
