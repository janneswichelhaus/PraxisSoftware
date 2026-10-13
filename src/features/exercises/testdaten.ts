import type { Variante } from './api';

/**
 * Synthetische Bausteine für Komponententests und Prüfseiten (UEB-012). Nur
 * von Tests und Prüfseiten importiert; kein Datenzugriff.
 */

/** Was eine eigene Variante ohne Herkunft aus dem Katalog trägt (ANN-382). */
export const OHNE_KATALOG = {
  catalog_key: null,
  catalog_version: null,
  goal: null,
  starting_position: null,
  level: null,
  default_dosage: null,
  illustration: null,
  reviewed_at: null,
  reviewed_by_name: null,
} as const satisfies Partial<Variante>;
