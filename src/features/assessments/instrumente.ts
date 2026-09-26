import { bibliothek } from './bibliothek';
import type { ScoreDefinition } from './schema';

/** Die Definition zu einer gespeicherten Kennung, auch wenn sie inaktiv ist. */
export function instrumentFuer(
  instrumentId: string,
  scores: readonly ScoreDefinition[] = bibliothek.scores,
): ScoreDefinition | undefined {
  return scores.find((score) => score.meta.id === instrumentId);
}

/**
 * Was sich erheben lässt: nur aktive Instrumente (ANN-086, ANN-099). Ein
 * inaktives erreicht keine Patientin — auch nicht über eine direkte Adresse,
 * denn die Erhebungsseite fragt hier nach.
 */
export function erhebbareInstrumente(
  scores: readonly ScoreDefinition[] = bibliothek.scores,
): ScoreDefinition[] {
  return scores.filter((score) => score.meta.aktiv);
}
