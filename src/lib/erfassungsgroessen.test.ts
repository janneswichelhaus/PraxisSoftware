import { describe, expect, it } from 'vitest';
import { ERFASSUNGSGROESSEN, angabeText, angabenZeile } from './erfassungsgroessen';

describe('Erfassungsgrößen (TRK-001, TRK-004)', () => {
  it('liest den Wert unverändert, eine Auswahl als Wort (ANN-354)', () => {
    expect(angabeText('pain_rest', 3)).toBe('Schmerz in Ruhe 3');
    expect(angabeText('pain_recovery_hours', 6)).toBe('Schmerz wieder wie vorher nach 6 Stunden');
    expect(angabeText('pain_quality', 2)).toBe('Schmerzart: stechend');
    // ALT-001: Häufigkeit, kein Medikationsplan (ANN-368).
    expect(angabeText('painkiller_days_7d', 3)).toBe('Schmerzmittel bei Bedarf 3 von 7 Tagen');
    expect(angabeText('sleep_hours', 6)).toBe('Schlafdauer 6 Stunden');
    expect(angabenZeile({ movement_confidence: 7, pain_quality: 1 })).toBe(
      'Schmerzart: dumpf · Bewegungssicherheit 7',
    );
  });

  it('jede Auswahl hat so viele Wörter wie Werte; keine Größe hat eine Schwelle', () => {
    for (const g of ERFASSUNGSGROESSEN) {
      if (g.optionen) expect(g.optionen).toHaveLength(g.max - g.min + 1);
      expect(Object.keys(g)).not.toContain('schwelle');
    }
  });
});
