import { describe, expect, it } from 'vitest';
import {
  WARTEZEIT_MS,
  ausfallAusAdresse,
  ausfallInAdresse,
  darfVermerken,
  folgeBis,
  gewartet,
  minutenSekunden,
  naechsteSeite,
  niemandStand,
} from './niemandOeffnet';

describe('Niemand öffnet - die Folge (G1)', () => {
  it('führt vom Klingeln über den Anruf zur Wartezeit', () => {
    expect(naechsteSeite('geklingelt')).toBe('angerufen');
    expect(naechsteSeite('angerufen')).toBe('gewartet');
    expect(naechsteSeite('gewartet')).toBeNull();
    expect(niemandStand('angerufen')).toEqual({ text: 'Schritt 2 von 3', wert: 2, von: 3 });
  });

  it('zählt die Viertelstunde ab dem Tipp und hält bei 15:00 an', () => {
    const seit = 1_000_000;
    expect(gewartet(seit, seit + 61_000)).toEqual({ vergangen: 61_000, um: false });
    expect(gewartet(seit, seit + WARTEZEIT_MS)).toEqual({ vergangen: WARTEZEIT_MS, um: true });
    expect(gewartet(seit, seit + 2 * WARTEZEIT_MS).vergangen).toBe(WARTEZEIT_MS);
    // Eine Uhr, die zurückspringt, zählt nicht rückwärts.
    expect(gewartet(seit, seit - 5_000).vergangen).toBe(0);
    expect(minutenSekunden(185_000)).toBe('3:05');
  });

  it('vermerkt erst nach 15 Minuten oder mit „schon vorher gewartet“', () => {
    expect(darfVermerken(false, false)).toBe(false);
    expect(darfVermerken(true, false)).toBe(true);
    expect(darfVermerken(false, true)).toBe(true);
  });

  it('hält Uhr und Seite in der Adresse - nur für diesen Termin, nur Kennung und Zeit', () => {
    const id = '0b4f3a52-6a51-4c43-9d25-0d1f7f6a1c11';
    const wert = ausfallInAdresse(id, { seit: 1_760_000_000_000, seite: 'angerufen' });
    expect(wert).toBe(`${id}.1760000000000.angerufen`);
    expect(ausfallAusAdresse(wert, id)).toEqual({ seit: 1_760_000_000_000, seite: 'angerufen' });
    // Nach dem Abbrechen bleibt die Uhr, die Seite nicht (ANN-479).
    expect(ausfallAusAdresse(ausfallInAdresse(id, { seit: 5, seite: null }), id)).toEqual({
      seit: 5,
      seite: null,
    });
    expect(ausfallAusAdresse(wert, '1b4f3a52-6a51-4c43-9d25-0d1f7f6a1c11')).toBeNull();
    expect(ausfallAusAdresse(`${id}.abc`, id)).toBeNull();
    expect(ausfallAusAdresse(`${id}.12.unbekannt`, id)).toEqual({ seit: 12, seite: null });
    expect(ausfallAusAdresse(null, id)).toBeNull();
    expect(folgeBis('gewartet')).toEqual(['geklingelt', 'angerufen', 'gewartet']);
    expect(folgeBis('geklingelt')).toEqual(['geklingelt']);
  });
});
