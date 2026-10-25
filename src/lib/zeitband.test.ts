import { describe, expect, it } from 'vitest';
import { freieLuecken } from './zeitband';

function band(von: string, bis: string) {
  const minute = (zeit: string) => Number(zeit.slice(0, 2)) * 60 + Number(zeit.slice(3, 5));
  return { vonMinute: minute(von), bisMinute: minute(bis) };
}

describe('freieLuecken', () => {
  it('nimmt die Arbeitszeit und zieht Belegtes ab, auch ueberlappendes', () => {
    expect(
      freieLuecken(
        [band('08:00', '12:00'), band('13:00', '17:00')],
        [band('09:00', '10:00'), band('09:30', '10:30'), band('11:50', '13:30')],
        15,
      ),
    ).toEqual([band('08:00', '09:00'), band('10:30', '11:50'), band('13:30', '17:00')]);
  });

  it('laesst Streifen unter der Mindestlaenge weg und kennt ohne Arbeitszeit keine Luecke', () => {
    expect(freieLuecken([band('08:00', '10:00')], [band('08:10', '10:00')], 15)).toEqual([]);
    expect(freieLuecken([band('08:00', '10:00')], [band('08:10', '10:00')], 10)).toEqual([
      band('08:00', '08:10'),
    ]);
    expect(freieLuecken([], [], 15)).toEqual([]);
  });
});
