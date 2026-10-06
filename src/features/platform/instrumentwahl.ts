import { erhebbareInstrumente } from '@/features/assessments/instrumente';
import type { ScoreDefinition } from '@/features/assessments/schema';

/** Die Bögen, die die Person selbst ausfüllt (ANN-248) - heute der Anamnesebogen. */
export function fuerDiePlattform(scores?: readonly ScoreDefinition[]): ScoreDefinition[] {
  return erhebbareInstrumente(scores).filter((s) => s.meta.ausgefuellt_von === 'patient');
}
