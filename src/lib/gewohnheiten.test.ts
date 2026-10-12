import { describe, expect, it } from 'vitest';
import { gewohnheitSatz, tagDavor, tagesreihe } from './gewohnheiten';

describe('Gewohnheiten (ALT-003, ANN-370)', () => {
  it('rechnet Kalendertage, auch über den Monatswechsel und die Zeitumstellung', () => {
    expect(tagDavor('2026-11-01', 1)).toBe('2026-10-31');
    expect(tagDavor('2026-10-26', 2)).toBe('2026-10-24');
  });

  it('legt die Tage ältester zuerst an, mit Vermerk und Beginn – ohne Zählwerk', () => {
    const reihe = tagesreihe(
      '2026-10-12',
      4,
      ['2026-10-12', '2026-10-10', '2026-10-01'],
      '2026-10-10',
    );
    expect(reihe).toEqual([
      { datum: '2026-10-09', vermerkt: false, vorBeginn: true },
      { datum: '2026-10-10', vermerkt: true, vorBeginn: false },
      { datum: '2026-10-11', vermerkt: false, vorBeginn: false },
      { datum: '2026-10-12', vermerkt: true, vorBeginn: false },
    ]);
    for (const tag of reihe)
      expect(Object.keys(tag).sort()).toEqual(['datum', 'vermerkt', 'vorBeginn']);
  });

  it('formuliert die Gewohnheit mit Auslöser zuerst', () => {
    expect(
      gewohnheitSatz({
        action: 'zwei Minuten Mobilität',
        cue: 'Nach dem Zähneputzen',
        place: 'im Bad',
      }),
    ).toBe('Nach dem Zähneputzen: zwei Minuten Mobilität (im Bad)');
    expect(gewohnheitSatz({ action: 'Treppe statt Aufzug', cue: 'Im Büro', place: null })).toBe(
      'Im Büro: Treppe statt Aufzug',
    );
  });
});
