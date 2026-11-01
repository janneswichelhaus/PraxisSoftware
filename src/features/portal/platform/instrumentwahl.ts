import {
  erhebbareInstrumente,
  SKALEN_AM_TERMIN,
} from '@/features/clinical/assessments/instrumente';
import type { ScoreDefinition } from '@/features/clinical/assessments/schema';

const AM_TERMIN: ReadonlySet<string> = new Set(SKALEN_AM_TERMIN);

/** Die Bögen, die die Person vorab selbst ausfüllt (ANN-248); die Skalen kommen am Termin (ANN-823). */
export function fuerDiePlattform(scores?: readonly ScoreDefinition[]): ScoreDefinition[] {
  return erhebbareInstrumente(scores).filter(
    (s) => s.meta.ausgefuellt_von === 'patient' && !AM_TERMIN.has(s.meta.id),
  );
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
