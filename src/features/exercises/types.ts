/**
 * Begriffe der Übungsbibliothek (UEB-EPIC-001).
 *
 * Die Körperregionen sind eine feste, grobe Liste ohne Seitenangabe (ANN-295).
 * Gegenstück in der Datenbank: `app.exercise_body_regions()` in
 * `supabase/migrations/20261017100000_ueb_001_exercise_library.sql`;
 * `supabase/tests/exercise-library.test.ts` hält beide gleich.
 */
export const KOERPERREGIONEN = [
  'hws',
  'bws',
  'lws',
  'schulter',
  'ellenbogen',
  'hand',
  'huefte',
  'knie',
  'fuss',
  'rumpf',
  'ganzkoerper',
] as const;

export type Koerperregion = (typeof KOERPERREGIONEN)[number];

export const KOERPERREGION_LABEL: Readonly<Record<Koerperregion, string>> = {
  hws: 'Halswirbelsäule',
  bws: 'Brustwirbelsäule',
  lws: 'Lendenwirbelsäule',
  schulter: 'Schulter',
  ellenbogen: 'Ellenbogen',
  hand: 'Hand',
  huefte: 'Hüfte',
  knie: 'Knie',
  fuss: 'Fuß',
  rumpf: 'Rumpf',
  ganzkoerper: 'Ganzer Körper',
};

/** Grenzen der Eingabe, wie in der Datenbank. */
export const NAME_HOECHSTENS = 120;
export const TEXT_HOECHSTENS = 1000;
export const AUSRUESTUNG_HOECHSTENS = 8;
export const SCHLAGWORT_HOECHSTENS = 40;
