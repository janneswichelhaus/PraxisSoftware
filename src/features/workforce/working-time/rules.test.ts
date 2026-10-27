import { describe, expect, it } from 'vitest';
import {
  blocksText,
  breaks,
  dayProblems,
  hoursText,
  restMinutes,
  sameBlocks,
  toMinutes,
  toTime,
  weekMinutes,
  weekProblems,
  workMinutes,
  type Week,
} from './rules';

const ANNA = [
  { von: '08:00', bis: '12:00' },
  { von: '13:00', bis: '18:00' },
];

function woche(tage: Partial<Record<number, typeof ANNA>> = {}): Week {
  const ergebnis: Week = {};
  for (let tag = 1; tag <= 7; tag += 1) ergebnis[String(tag)] = tage[tag] ?? (tag <= 5 ? ANNA : []);
  return ergebnis;
}

describe('Arbeitszeit rechnen (AZ-001, ANN-588)', () => {
  it('rechnet Uhrzeiten, Arbeitsminuten und Pausen', () => {
    expect(toMinutes('08:30')).toBe(510);
    expect(toMinutes('24:00')).toBe(1440);
    expect(toMinutes('8:30')).toBeNull();
    expect(toTime(510)).toBe('08:30');
    expect(workMinutes(ANNA)).toBe(540);
    expect(breaks(ANNA)).toEqual([60]);
    expect(weekMinutes(woche())).toBe(45 * 60);
    expect(hoursText(540)).toBe('9:00 Std.');
    expect(hoursText(45 * 60 + 30)).toBe('45:30 Std.');
    expect(blocksText([])).toBe('frei');
    expect(blocksText([...ANNA].reverse())).toBe('08:00–12:00, 13:00–18:00');
    expect(sameBlocks(ANNA, [...ANNA].reverse())).toBe(true);
  });

  it('findet dieselben Gründe wie der Server (§§ 3, 4 ArbZG)', () => {
    expect(dayProblems(ANNA)).toEqual([]);
    expect(dayProblems([])).toEqual([]);
    expect(
      dayProblems([
        { von: '07:00', bis: '12:00' },
        { von: '12:45', bis: '18:30' },
      ]),
    ).toEqual(['more_than_ten_hours']);
    expect(
      dayProblems([
        { von: '08:00', bis: '12:00' },
        { von: '12:20', bis: '17:20' },
      ]),
    ).toEqual(['break_too_short']);
    expect(
      dayProblems([
        { von: '07:00', bis: '13:30' },
        { von: '14:00', bis: '16:30' },
      ]),
    ).toEqual(['more_than_six_hours_in_a_row']);
    // Eine Unterbrechung unter 15 Minuten ist keine Pause.
    expect(
      dayProblems([
        { von: '08:00', bis: '11:00' },
        { von: '11:10', bis: '15:00' },
      ]),
    ).toEqual(['break_too_short', 'more_than_six_hours_in_a_row']);
    expect(dayProblems([{ von: '12:00', bis: '08:00' }])).toEqual(['invalid_block']);
    expect(
      dayProblems([
        { von: '08:00', bis: '12:00' },
        { von: '11:00', bis: '18:00' },
      ]),
    ).toEqual(['overlap']);
  });

  it('prüft die Ruhe von Tag zu Tag, auch vom Sonntag in den Montag (§ 5 ArbZG)', () => {
    expect(restMinutes(ANNA, ANNA)).toBe(14 * 60);
    expect(restMinutes(ANNA, [])).toBeNull();
    expect(weekProblems(woche())).toEqual([]);
    expect(
      weekProblems(
        woche({
          1: [
            { von: '11:00', bis: '15:00' },
            { von: '16:00', bis: '21:00' },
          ],
          2: [
            { von: '07:00', bis: '12:00' },
            { von: '13:00', bis: '17:00' },
          ],
        }),
      ),
    ).toEqual(['rest_shorter_than_eleven_hours']);
    expect(weekProblems(woche({ 7: [{ von: '18:00', bis: '22:00' }] }))).toEqual([
      'rest_shorter_than_eleven_hours',
    ]);
  });
});
