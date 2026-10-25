import { execFileSync } from 'node:child_process';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  mkdirSync,
  unlinkSync,
  renameSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  LETZTE_ERSETZTE,
  ZUSAMMENFASSUNG,
  pruefeMigrationen,
  version,
} from './migrationen-check.mjs';

/**
 * Ausgelieferte Migrationen bleiben, wie sie sind (BEF-123).
 */

const M = 'supabase/migrations';
const BASIS = [
  `${M}/20260926150000_dok_006b_patient_photos.sql`,
  `${M}/20261004110000_akte_anmeldebogen_checklist.sql`,
];

describe('pruefeMigrationen', () => {
  it('liest die Versionsnummer vorn im Dateinamen', () => {
    expect(version(`${M}/20261004110000_akte.sql`)).toBe('20261004110000');
    expect(version(`${M}/ohne_nummer.sql`)).toBeNull();
  });

  it('laesst eine neue Migration hinter der juengsten durch', () => {
    expect(
      pruefeMigrationen([{ status: 'A', pfad: `${M}/20261005090000_neu.sql` }], BASIS),
    ).toEqual([]);
  });

  it('weist eine geaenderte ausgelieferte Migration ab - der Fall der Test-Umgebung', () => {
    const [verstoss] = pruefeMigrationen([{ status: 'M', pfad: BASIS[0] }], BASIS);
    expect(verstoss).toMatch(/dok_006b_patient_photos\.sql: geändert/);
    expect(verstoss).toMatch(/neue Migration/);
  });

  it('weist eine geloeschte ausgelieferte Migration ab', () => {
    expect(pruefeMigrationen([{ status: 'D', pfad: BASIS[1] }], BASIS)[0]).toMatch(/gelöscht/);
  });

  it('weist eine neue Migration ab, die vor der juengsten liegt', () => {
    const [verstoss] = pruefeMigrationen(
      [{ status: 'A', pfad: `${M}/20261001000000_zu_frueh.sql` }],
      BASIS,
    );
    expect(verstoss).toMatch(/nicht hinter der jüngsten Migration auf main \(20261004110000\)/);
  });

  it('weist eine neue Migration ohne Versionsnummer ab', () => {
    expect(pruefeMigrationen([{ status: 'A', pfad: `${M}/neu.sql` }], BASIS)[0]).toMatch(
      /keine Versionsnummer/,
    );
  });

  it('laesst die Basis einmalig alle aelteren Migrationen ersetzen', () => {
    const geloescht = BASIS.map((pfad) => ({ status: 'D', pfad }));
    expect(
      pruefeMigrationen([...geloescht, { status: 'A', pfad: ZUSAMMENFASSUNG }], BASIS),
    ).toEqual([]);
  });

  it('verlangt, dass die Basis alle aelteren ersetzt und keine aendert', () => {
    const verstoesse = pruefeMigrationen(
      [
        { status: 'M', pfad: BASIS[0] },
        { status: 'D', pfad: BASIS[1] },
        { status: 'A', pfad: ZUSAMMENFASSUNG },
      ],
      BASIS,
    );
    expect(verstoesse).toHaveLength(2);
    expect(verstoesse[0]).toMatch(/dok_006b_patient_photos\.sql: bleibt neben der Basis stehen/);
    expect(verstoesse[1]).toMatch(/dok_006b_patient_photos\.sql: geändert/);
  });

  it('verlangt eine neue Basis, wenn auf main eine Migration nach der letzten ersetzten dazukam', () => {
    const spaeter = `${M}/20261224150000_parallel.sql`;
    const geloescht = BASIS.map((pfad) => ({ status: 'D', pfad }));
    const verstoesse = pruefeMigrationen(
      [...geloescht, { status: 'D', pfad: spaeter }, { status: 'A', pfad: ZUSAMMENFASSUNG }],
      [...BASIS, spaeter],
    );
    expect(verstoesse).toHaveLength(2);
    expect(verstoesse[0]).toMatch(/parallel\.sql: kam nach der letzten ersetzten Migration/);
    expect(verstoesse[1]).toMatch(/parallel\.sql: gelöscht/);
  });

  it('kennt dieselbe letzte ersetzte Migration wie die Basis selbst', () => {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- fester Pfad der Basis.
    expect(readFileSync(ZUSAMMENFASSUNG, 'utf8').split('\n')[0]).toContain(
      `bis ${LETZTE_ERSETZTE} `,
    );
  });

  it('laesst neben der Basis nur Migrationen hinter ihr zu', () => {
    const geloescht = BASIS.map((pfad) => ({ status: 'D', pfad }));
    const mit = (pfad) =>
      pruefeMigrationen(
        [...geloescht, { status: 'A', pfad: ZUSAMMENFASSUNG }, { status: 'A', pfad }],
        BASIS,
      );
    expect(mit(`${M}/20261224200000_davor.sql`)[0]).toMatch(/liefe vor der Basis/);
    expect(mit(`${M}/20261226000000_dahinter.sql`)).toEqual([]);
  });

  it('erlaubt Loeschen nur mit genau dieser Basis', () => {
    const verstoesse = pruefeMigrationen(
      [
        { status: 'D', pfad: BASIS[0] },
        { status: 'A', pfad: `${M}/20261226000000_basis.sql` },
      ],
      BASIS,
    );
    expect(verstoesse[0]).toMatch(/gelöscht/);
    expect(
      pruefeMigrationen([{ status: 'D', pfad: ZUSAMMENFASSUNG }], [...BASIS, ZUSAMMENFASSUNG])[0],
    ).toMatch(/20261225000000_basis\.sql: gelöscht/);
  });

  it('kuemmert sich nicht um Dateien, die keine Migrationen sind', () => {
    expect(pruefeMigrationen([{ status: 'M', pfad: `${M}/README.md` }], BASIS)).toEqual([]);
  });
});

/**
 * Das Skript gegen ein echtes Git-Repository: Basis auf `main`, Änderung auf
 * einem Branch - so, wie die CI es aufruft.
 */
describe('migrationen-check.mjs im Repository', () => {
  const skript = join(process.cwd(), 'scripts/migrationen-check.mjs');
  let ordner = '';

  function git(...argumente) {
    return execFileSync('git', argumente, { cwd: ordner, encoding: 'utf8' });
  }

  function migration(name, inhalt) {
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade unter einem eigenen Wegwerfordner aus mkdtempSync, fest im Test.
    writeFileSync(join(ordner, M, name), inhalt);
  }

  function aufbauen() {
    ordner = mkdtempSync(join(tmpdir(), 'migrationen-'));
    git('init', '-q', '-b', 'main');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Test');
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade unter einem eigenen Wegwerfordner aus mkdtempSync, fest im Test.
    mkdirSync(join(ordner, M), { recursive: true });
    migration('20260101000000_eins.sql', 'select 1;\n');
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

  function einchecken() {
    git('add', '-A');
    git('commit', '-q', '-m', 'Aenderung');
  }

  afterEach(() => {
    if (ordner) rmSync(ordner, { recursive: true, force: true });
  });

  it('ist gruen fuer eine neue Migration - und fuer deren Aenderung vor dem Merge', () => {
    aufbauen();
    migration('20260201000000_zwei.sql', 'select 2;\n');
    einchecken();
    migration('20260201000000_zwei.sql', 'select 22;\n');
    einchecken();
    expect(pruefen().rot).toBe(false);
  });

  it('ist rot fuer eine geaenderte Migration von main', () => {
    aufbauen();
    migration('20260101000000_eins.sql', 'select 11;\n');
    einchecken();
    const { rot, ausgabe } = pruefen();
    expect(rot).toBe(true);
    expect(ausgabe).toMatch(/20260101000000_eins\.sql: geändert/);
  });

  it('ist rot fuer eine umbenannte Migration von main', () => {
    aufbauen();
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade unter einem eigenen Wegwerfordner aus mkdtempSync, fest im Test.
    renameSync(
      join(ordner, M, '20260101000000_eins.sql'),
      join(ordner, M, '20260301000000_eins.sql'),
    );
    einchecken();
    expect(pruefen().ausgabe).toMatch(/20260101000000_eins\.sql: gelöscht/);
  });

  it('ist rot fuer eine geloeschte Migration von main', () => {
    aufbauen();
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Pfade unter einem eigenen Wegwerfordner aus mkdtempSync, fest im Test.
    unlinkSync(join(ordner, M, '20260101000000_eins.sql'));
    einchecken();
    expect(pruefen().rot).toBe(true);
  });
});
