import { describe, expect, it } from 'vitest';
import { erlaubteWerte } from '../../../supabase/tests/helpers/migrationen';
import { AUDIT_ACTIONS, AUDIT_ACTION_GROUPS, auditSubjectLabels } from './actions';

// Die Aktionen prueft supabase/tests/audit.test.ts gegen die Datenbank; die Gegenstaende hier,
// ohne Datenbank, damit jeder Gegenstand eine Beschriftung hat.
const gegenstaendeDerDatenbank = () => erlaubteWerte('audit_log_subject_type_check');

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
