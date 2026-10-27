import { describe, expect, it } from 'vitest';
import type { TreatmentNote } from './api';
import { fristDatum, herkunft } from './format';

/** OFF-002: Frist und Herkunft eines übertragenen Offline-Entwurfs (ADR-024 Punkte 6 und 8). */

const ZONE = 'Europe/Berlin';

function notiz(teil: Partial<TreatmentNote>): TreatmentNote {
  return {
    id: 'n1',
    appointment_id: 't1',
    addendum_to_note_id: null,
    status: 'draft',
    content: 'Synthetisch.',
    visit_without_treatment: false,
    created_at: '2026-10-14T12:00:00Z',
    updated_at: '2026-10-14T12:00:00Z',
    finalized_at: null,
    finalisation_kind: null,
    version_count: 0,
    author_name: 'Anna Beispiel',
    last_editor_name: 'Anna Beispiel',
    finalized_by_name: null,
    ...teil,
  };
}

describe('fristDatum', () => {
  it('zählt ab der Behandlung, oder ab der Anlage, wenn sie später liegt (ANN-008)', () => {
    expect(fristDatum('2026-10-12T08:00:00Z', ZONE, 1)).toBe('13.10.');
    expect(fristDatum('2026-10-12T08:00:00Z', ZONE, 1, '2026-10-12T15:00:00Z')).toBe('13.10.');
    expect(fristDatum('2026-10-12T08:00:00Z', ZONE, 1, '2026-10-15T09:00:00Z')).toBe('16.10.');
  });
});

describe('herkunft', () => {
  it('nennt bei einem Offline-Entwurf die Uhr des Geräts als Angabe und den Eingang', () => {
    const text = herkunft(notiz({ reported_written_at: '2026-10-12T08:42:00Z' }), ZONE);
    expect(text).toContain('Ohne Verbindung geschrieben, laut Gerät am');
    expect(text).toContain('10:42');
    expect(text).toContain('übertragen am');
  });

  it('sagt an einem online geschriebenen Eintrag nichts davon', () => {
    expect(herkunft(notiz({ reported_written_at: null }), ZONE)).not.toContain('Ohne Verbindung');
  });
});
