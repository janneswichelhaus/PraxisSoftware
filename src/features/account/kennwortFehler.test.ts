import { describe, expect, it } from 'vitest';
import { KENNWORT_MINDESTLAENGE } from './api';
import { kennwortFehler } from './kennwortFehler';

/**
 * Der Fehler gehört an das Feld, das ihn verursacht (NAV-13, ORG-B01,
 * AUTH-10).
 */
describe('kennwortFehler', () => {
  it('stellt „zu kurz" an das erste Feld', () => {
    expect(kennwortFehler('kurz', 'kurz')).toEqual({
      feld: 'kennwort',
      text: `Das Kennwort braucht mindestens ${KENNWORT_MINDESTLAENGE} Zeichen.`,
    });
  });

  it('stellt „zu kurz" auch dann an das erste Feld, wenn die zweite Eingabe abweicht', () => {
    // Die Länge wird zuerst geprüft (ANN-027) - und betrifft das erste Feld.
    expect(kennwortFehler('kurz', 'etwas anderes')?.feld).toBe('kennwort');
  });

  it('stellt eine Abweichung an das Wiederholungsfeld', () => {
    expect(kennwortFehler('ein langer satz hier', 'ein anderer satz')).toEqual({
      feld: 'wiederholung',
      text: 'Die beiden Eingaben stimmen nicht überein.',
    });
  });

  it('meldet nichts, wenn beide Eingaben gleich und lang genug sind', () => {
    expect(kennwortFehler('ein langer satz hier', 'ein langer satz hier')).toBeNull();
  });
});
