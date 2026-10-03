import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { aktionen, freigegeben, unterschied, LABEL } from './audit-aktionen-check.mjs';
import { AUDIT_ACTIONS } from '../src/features/audit/actions';

/**
 * Rückfallschutz der Protokollierung (LOG-EPIC-001, ADR-010): Die Menge der
 * Aktionen ändert sich nur mit dem Label `freigabe-audit`, gesetzt von der
 * freigebenden Person.
 */
describe('Katalog der Aktionen', () => {
  it('liest Aktionen ohne Leerzeilen und Kommentare', () => {
    expect([...aktionen('# Kopf\npatient_record.viewed\n\naccess.denied  # Abweisung\n')]).toEqual([
      'patient_record.viewed',
      'access.denied',
    ]);
  });

  it('ist deckungsgleich mit dem Katalog der Oberfläche', () => {
    const datei = [...aktionen(readFileSync('supabase/audit-aktionen.txt', 'utf8'))].sort();
    expect(datei).toEqual([...AUDIT_ACTIONS].sort());
    expect(datei).toHaveLength(26);
  });

  it('nennt hinzugekommene und entfallene Aktionen', () => {
    expect(unterschied(new Set(['a', 'b']), new Set(['b', 'c']))).toEqual({
      neu: ['c'],
      entfallen: ['a'],
    });
    expect(unterschied(new Set(['a']), new Set(['a']))).toEqual({ neu: [], entfallen: [] });
  });
});

describe('Freigabe', () => {
  const gesetzt = (login) => ({ event: 'labeled', label: { name: LABEL }, actor: { login } });

  it('gilt nur mit Label, zuletzt gesetzt von der freigebenden Person', () => {
    expect(freigegeben([gesetzt('janneswichelhaus')], [LABEL], 'janneswichelhaus')).toBe(true);
    expect(freigegeben([gesetzt('JannesWichelhaus')], [LABEL], 'janneswichelhaus')).toBe(true);
  });

  it('gilt nicht ohne Label am Pull Request', () => {
    expect(freigegeben([gesetzt('janneswichelhaus')], [], 'janneswichelhaus')).toBe(false);
  });

  it('gilt nicht, wenn jemand anderes das Label gesetzt hat', () => {
    expect(freigegeben([gesetzt('jemand')], [LABEL], 'janneswichelhaus')).toBe(false);
    // Entfernt und von jemand anderem neu gesetzt: maßgeblich ist das letzte Setzen.
    expect(
      freigegeben(
        [
          gesetzt('janneswichelhaus'),
          { event: 'unlabeled', label: { name: LABEL }, actor: { login: 'jemand' } },
          gesetzt('jemand'),
        ],
        [LABEL],
        'janneswichelhaus',
      ),
    ).toBe(false);
  });

  it('übersieht andere Labels', () => {
    expect(
      freigegeben(
        [{ event: 'labeled', label: { name: 'anderes' }, actor: { login: 'janneswichelhaus' } }],
        [LABEL],
        'janneswichelhaus',
      ),
    ).toBe(false);
  });
});
