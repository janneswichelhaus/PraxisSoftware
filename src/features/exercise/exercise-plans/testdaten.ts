import type { Position } from './api';

/**
 * Synthetische Bausteine für Komponententests und Prüfseiten (UEB-012). Nur
 * von Tests und Prüfseiten importiert; kein Datenzugriff.
 */

/** Eine Position ohne Bild, ohne Halten, nicht je Seite, ohne Häufigkeit am Tag (ANN-384). */
export const OHNE_ZUSATZ = {
  hold_seconds: null,
  per_side: false,
  times_per_day: null,
} as const satisfies Partial<Position>;
