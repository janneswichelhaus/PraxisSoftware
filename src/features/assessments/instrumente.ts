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

/**
 * Die Definition, mit der eine Erhebung erhoben wurde (ABN-014, BEF-101
 * Punkt 1): Kennung **und** Fassung. Angezeigt und ausgewertet wird mit ihr,
 * nicht mit der heutigen. `undefined`, wenn die Fassung nicht im Release liegt.
 */
export function fassungFuer(
  instrumentId: string,
  version: string,
  fassungen: readonly ScoreDefinition[] = bibliothek.scoreFassungen,
): ScoreDefinition | undefined {
  return fassungen.find((s) => s.meta.id === instrumentId && s.meta.version === version);
}

/**
 * Sind die Werte einer Erhebung in Fassung `version` mit der aktuellen
 * Definition vergleichbar? Dieselbe Fassung immer, eine frühere nur, wenn die
 * aktuelle sie in `vergleichbar_mit` nennt (BEF-101 Punkt 4).
 */
export function vergleichbar(aktuell: ScoreDefinition, version: string): boolean {
  return (
    version === aktuell.meta.version || (aktuell.meta.vergleichbar_mit ?? []).includes(version)
  );
}
