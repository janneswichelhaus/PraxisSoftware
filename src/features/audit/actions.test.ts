import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { auditSubjectLabels } from './actions';

/**
 * Die Gegenstände einer Auditzeile, wie die Datenbank sie zulässt (ORG-20).
 *
 * Die Aktionen hält der Datenbanktest in `supabase/tests/audit.test.ts` gegen
 * die Constraint. Für die Gegenstände gab es das nicht - und so fehlten
 * `text_snippet` und `user_account`, bis die Liste „user_account" anzeigte.
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
  it('beschriftet jeden Gegenstand, den die Datenbank zulaesst', () => {
    const gegenstaende = gegenstaendeDerDatenbank();
    // Gegenprobe: die Liste ist wirklich gelesen worden.
    expect(gegenstaende).toContain('patient');
    expect(gegenstaende.length).toBeGreaterThan(10);

    const ohneBeschriftung = gegenstaende.filter((schluessel) => !auditSubjectLabels[schluessel]);
    expect(ohneBeschriftung).toEqual([]);
  });

  it('nennt Textbaustein und Zugang in der Sprache der Oberflaeche', () => {
    expect(auditSubjectLabels.text_snippet).toBe('Textbaustein');
    expect(auditSubjectLabels.user_account).toBe('Zugang');
  });
});
