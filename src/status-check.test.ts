import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * `pnpm status:check` erkennt einen gemergten Pull Request in `docs/STATUS.md`.
 *
 * Geprüft wird ausschließlich gegen **synthetische** Eingaben: eine Statusdatei
 * im Temp-Verzeichnis und eine per `--merged` vorgegebene Liste. Der echte
 * Livestand wird hier bewusst **nicht** geprüft.
 *
 * Der Grund ist der Zeitpunkt, zu dem ein Verstoß entsteht: Solange ein PR
 * offen ist, darf `STATUS.md` ihn nennen — im Augenblick des Merges wird
 * dieselbe, unveränderte Datei falsch. Ein Test gegen den echten Stand würde
 * `pnpm test` also nach jedem Merge rot färben, ohne dass jemand etwas falsch
 * gemacht hätte, und das Gate stünde unter Druck, abgeschwächt zu werden.
 * Deshalb läuft die echte Prüfung im eigenen, nicht merge-blockierenden
 * Workflow (`.github/workflows/status-drift.yml`); hier steht nur, dass sie
 * funktioniert.
 */

const skript = join(process.cwd(), 'scripts/status-check.mjs');

/** Führt das Skript aus und liefert Exitcode und Ausgabe, statt zu werfen. */
function lauf(inhalt: string, merged: string): { code: number; ausgabe: string } {
  const verzeichnis = mkdtempSync(join(tmpdir(), 'status-check-'));
  const datei = join(verzeichnis, 'STATUS.md');
  writeFileSync(datei, inhalt, 'utf8');
  try {
    const ausgabe = execFileSync(
      process.execPath,
      [skript, '--status', datei, '--merged', merged],
      { encoding: 'utf8', stdio: 'pipe' },
    );
    return { code: 0, ausgabe };
  } catch (fehler) {
    const e = fehler as { status?: number; stdout?: string; stderr?: string };
    return { code: e.status ?? -1, ausgabe: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

describe('status-check', () => {
  it('meldet einen PR, der in STATUS.md steht und schon gemergt ist', () => {
    const { code, ausgabe } = lauf('## Zum Merge\n\n1. **PR #41** — ROL-EPIC-001.\n', '41');

    expect(code).toBe(1);
    expect(ausgabe).toContain('#41');
  });

  it('bleibt grün, solange der genannte PR offen ist', () => {
    const { code, ausgabe } = lauf('## Zum Merge\n\n1. **PR #43** — offen.\n', '41,42');

    expect(code).toBe(0);
    expect(ausgabe).toContain('gruen');
  });

  it('findet die Nennung überall in der Datei, nicht nur im Merge-Abschnitt', () => {
    // STATUS.md führt den Livestand: Eine Nennung unter „Letzte Session" ist
    // genauso veraltet wie eine unter „Zum Merge". Die Prüfung soll deshalb
    // nicht davon abhängen, wie eine Überschrift gerade heißt.
    const { code, ausgabe } = lauf('## Letzte Session\n\nNach dem Merge von #42 gilt …\n', '42');

    expect(code).toBe(1);
    expect(ausgabe).toContain('#42');
  });

  it('hält eine Farbangabe nicht für eine PR-Nummer', () => {
    const { code } = lauf('Akzentfarbe `#4285f4`, Anteil 42 Prozent.\n', '4285,42');

    expect(code).toBe(0);
  });

  it('nennt mehrere gemergte PRs einzeln', () => {
    const { code, ausgabe } = lauf(
      '1. **PR #41**\n2. **PR #42**\n3. **PR #99** — offen\n',
      '41,42',
    );

    expect(code).toBe(1);
    expect(ausgabe).toContain('#41');
    expect(ausgabe).toContain('#42');
    expect(ausgabe).not.toContain('#99');
  });
});
