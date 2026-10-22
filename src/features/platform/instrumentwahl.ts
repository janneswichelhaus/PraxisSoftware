import { erhebbareInstrumente } from '@/features/assessments/instrumente';
import type { ScoreDefinition } from '@/features/assessments/schema';

/** Die Bögen, die die Person selbst ausfüllt (ANN-248) - heute der Anamnesebogen. */
export function fuerDiePlattform(scores?: readonly ScoreDefinition[]): ScoreDefinition[] {
  return erhebbareInstrumente(scores).filter((s) => s.meta.ausgefuellt_von === 'patient');
}

/**
 * Wie der Bogen auf der Plattform heißt (DR-125): nach seinem Zweck, nicht
 * nach der Vorlage. „Anamnesebogen Version 8 (DIGOTOR)“ ist der Name in der
 * Praxis; Herausgeber und Fassung stehen hier im Kleingedruckten.
 */
export const BOGEN_TITEL = 'Fragebogen vor dem ersten Termin';

/**
 * Woher die Fragen stammen, fürs Kleingedruckte: bei einer Vorlage
 * Herausgeber und Fassung (wie in der Bibliothek der Praxis), sonst die
 * Veröffentlichung; ohne Angabe nichts.
 */
export function bogenVorlage(definition: ScoreDefinition): string | null {
  const { datei, literatur, validierung } = definition.meta.quelle;
  const quelle = datei !== undefined ? validierung : literatur;
  return quelle ? `Vorlage der Fragen: ${quelle}.` : null;
}
