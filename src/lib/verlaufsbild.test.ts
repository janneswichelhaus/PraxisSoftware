import { describe, expect, it } from 'vitest';
import { erfassungsgroesse } from './erfassungsgroessen';
import { alsBild, bildreihen } from './verlaufsbild';

describe('bildreihen (OUT-001)', () => {
  it('zeichnet Skalen und Zahlen mit Einheit, keine Auswahl und keinen Zusammenhang', () => {
    expect(alsBild(erfassungsgroesse('pain_rest')!)).toBe(true);
    expect(alsBild(erfassungsgroesse('morning_stiffness_minutes')!)).toBe(true);
    expect(alsBild(erfassungsgroesse('pain_quality')!)).toBe(false);
    expect(alsBild(erfassungsgroesse('painkiller_24h')!)).toBe(false);
    expect(alsBild(erfassungsgroesse('pain_side')!)).toBe(false);
  });

  it('liefert die Rohwerte je Größe, nach Tag, ohne Mittel und ohne Lücke zu füllen', () => {
    const reihen = bildreihen([
      { datum: '2026-10-08', werte: { pain_rest: 4, pain_quality: 2 } },
      { datum: '2026-10-01', werte: { pain_rest: 6, stress: 3 } },
      { datum: '2026-10-05', werte: { stress: 5 } },
    ]);
    expect(reihen.map((r) => r.groesse.key)).toEqual(['pain_rest', 'stress']);
    expect(reihen[0]!.punkte).toEqual([
      { datum: '2026-10-01', wert: 6 },
      { datum: '2026-10-08', wert: 4 },
    ]);
    expect(reihen[1]!.punkte).toHaveLength(2);
  });

  it('ohne Angaben kein Bild', () => {
    expect(bildreihen([])).toEqual([]);
    expect(bildreihen([{ datum: '2026-10-01', werte: { pain_quality: 1 } }])).toEqual([]);
  });
});
