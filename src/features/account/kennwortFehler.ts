import { KENNWORT_MINDESTLAENGE, kennwortProblem } from './api';

/** An welchem Feld ein Fehler des neuen Kennworts steht. */
export type Kennwortfeld = 'kennwort' | 'wiederholung';

export interface Kennwortfehler {
  feld: Kennwortfeld;
  text: string;
}

/**
 * Der Fehler eines neuen Kennworts - samt dem Feld, an das er gehört (NAV-13,
 * ORG-B01, AUTH-10).
 *
 * Bis UXR-002 stand jeder Fehler am Feld „Neues Kennwort wiederholen", auch
 * „mindestens 12 Zeichen", das das erste Feld betrifft. Man korrigierte das
 * falsche Feld, und Vorlesesoftware meldete es als fehlerhaft. Die Regel
 * selbst bleibt die eine aus `kennwortProblem` (ANN-027): erst die Länge,
 * dann die Übereinstimmung. Zu kurz gehört ans erste Feld, abweichend ans
 * zweite.
 */
export function kennwortFehler(kennwort: string, wiederholung: string): Kennwortfehler | null {
  const text = kennwortProblem(kennwort, wiederholung);
  if (!text) return null;
  return {
    feld: kennwort.length < KENNWORT_MINDESTLAENGE ? 'kennwort' : 'wiederholung',
    text,
  };
}
