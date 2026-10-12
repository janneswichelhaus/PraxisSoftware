/**
 * Die Arten eines vermerkten Ereignisses im Verlauf (ANN-106, OUT-001
 * ANN-364): in der Akte und im Training dieselben fünf. Muss deckungsgleich
 * mit den Constraints an `patient_course_events.kind`
 * (`supabase/migrations/20260926110000_frb_002e_course_events.sql`) und
 * `training_course_events.kind`
 * (`supabase/migrations/20261109100000_out_001_progress_events.sql`) bleiben.
 *
 * Eine Markierung sagt, was geschehen ist – nie, ob es einen Wert erklärt
 * (ADR-006 Punkt 11).
 */
export const EREIGNISARTEN = [
  'operation',
  'erkrankung',
  'urlaub',
  'medikation',
  'sonstiges',
] as const;
export type Ereignisart = (typeof EREIGNISARTEN)[number];

export const ereignisartTexte: Record<Ereignisart, string> = {
  operation: 'Operation',
  erkrankung: 'Erkrankung',
  urlaub: 'Urlaub, Pause',
  medikation: 'Medikation geändert',
  sonstiges: 'Sonstiges',
};

/** Höchstlänge der Notiz an einem Ereignis; die Datenbank prüft dasselbe. */
export const EREIGNIS_NOTIZ_MAX = 200;
