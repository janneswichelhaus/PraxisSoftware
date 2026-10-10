import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { AUDIT_ACTIONS, AUDIT_ACTION_GROUPS, auditSubjectLabels } from './actions';

/**
 * Die Gegenstände einer Auditzeile, wie die Datenbank sie zulässt (ORG-20).
 *
 * Die Aktionen hält der Datenbanktest in `supabase/tests/audit.test.ts` gegen
 * die Constraint. Für die Gegenstände gab es das nicht - und so fehlte
 * `user_account`, bis die Liste „user_account" anzeigte.
 * Gelesen wird die jüngste Migration, die die Constraint setzt; die Prüfung
 * braucht keine Datenbank.
 */
const MIGRATION = readdirSync('supabase/migrations')
  .filter((datei) => datei.endsWith('.sql'))
  .sort()
  .map((datei) => readFileSync(`supabase/migrations/${datei}`, 'utf8'))
  .filter((inhalt) => inhalt.includes('add constraint audit_log_subject_type_check'))
  .at(-1)!;

function gegenstaendeDerDatenbank(): string[] {
  const abschnitt = MIGRATION.slice(
    MIGRATION.lastIndexOf('add constraint audit_log_subject_type_check'),
  );
  const liste = /check \(subject_type in \(([^)]*)\)\)/.exec(abschnitt)![1]!;
  return [...liste.matchAll(/'([a-z_]+)'/g)].map((treffer) => treffer[1]!);
}

describe('auditSubjectLabels', () => {
  it('beschriftet genau die Gegenstände, die die Datenbank zulässt (LOG-EPIC-001)', () => {
    const gegenstaende = gegenstaendeDerDatenbank();
    // Gegenprobe: die Liste ist wirklich gelesen worden.
    expect(gegenstaende).toContain('patient');
    expect([...gegenstaende].sort()).toEqual(Object.keys(auditSubjectLabels).sort());
  });

  it('nennt den Zugang in der Sprache der Oberflaeche', () => {
    expect(auditSubjectLabels.user_account).toBe('Zugang');
  });
});

describe('AUDIT_ACTION_GROUPS (BEF-065)', () => {
  it('führt jede Aktion in genau einer Gruppe', () => {
    const gruppiert = AUDIT_ACTION_GROUPS.flatMap((gruppe) => gruppe.aktionen);
    expect(new Set(gruppiert).size).toBe(gruppiert.length);
    expect([...gruppiert].sort()).toEqual([...AUDIT_ACTIONS].sort());
  });
});
