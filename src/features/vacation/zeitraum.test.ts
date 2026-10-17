import { describe, expect, it } from 'vitest';
import {
  KEINE_WAHL,
  gewaehlteTage,
  kalendertage,
  statusAnzeige,
  ueberschneidet,
  urlaubstage,
  vollstaendig,
  waehleTag,
  zeitraumText,
} from './zeitraum';

describe('Zeitraum wählen', () => {
  it('wählt mit zwei Tipps Beginn und Ende', () => {
    const erst = waehleTag(KEINE_WAHL, '2027-08-04');
    expect(erst).toEqual({ von: '2027-08-04', bis: null });
    expect(vollstaendig(erst)).toBe(false);
    const dann = waehleTag(erst, '2027-08-15');
    expect(dann).toEqual({ von: '2027-08-04', bis: '2027-08-15' });
    expect(vollstaendig(dann)).toBe(true);
  });

  it('beginnt neu bei einem Tag vor dem Beginn und nach einer vollständigen Wahl', () => {
    expect(waehleTag({ von: '2027-08-04', bis: null }, '2027-08-01')).toEqual({
      von: '2027-08-01',
      bis: null,
    });
    expect(waehleTag({ von: '2027-08-04', bis: '2027-08-15' }, '2027-09-01')).toEqual({
      von: '2027-09-01',
      bis: null,
    });
  });

  it('nimmt denselben Tag zweimal als einen Urlaubstag', () => {
    const wahl = waehleTag(waehleTag(KEINE_WAHL, '2027-08-04'), '2027-08-04');
    expect(wahl).toEqual({ von: '2027-08-04', bis: '2027-08-04' });
    expect(gewaehlteTage(wahl)).toEqual(['2027-08-04']);
  });

  it('zählt Kalendertage über den Monatswechsel', () => {
    expect(gewaehlteTage({ von: '2027-08-30', bis: '2027-09-02' })).toEqual([
      '2027-08-30',
      '2027-08-31',
      '2027-09-01',
      '2027-09-02',
    ]);
    expect(kalendertage('2027-12-28', '2028-01-08')).toBe(12);
    expect(gewaehlteTage(KEINE_WAHL)).toEqual([]);
  });

  it('erkennt Überschneidungen an den Grenzen', () => {
    const urlaub = { starts_on: '2027-08-04', ends_on: '2027-08-15' };
    expect(ueberschneidet(urlaub, '2027-08-15', '2027-08-20')).toBe(true);
    expect(ueberschneidet(urlaub, '2027-08-16', '2027-08-20')).toBe(false);
    expect(ueberschneidet(urlaub, '2027-08-01', '2027-08-03')).toBe(false);
  });
});

describe('Zeitraum schreiben', () => {
  it('kürzt im selben Monat und Jahr', () => {
    expect(zeitraumText('2027-08-04', '2027-08-15')).toBe('4.–15. Aug. 2027');
    expect(zeitraumText('2027-07-28', '2027-08-06')).toBe('28. Juli – 6. Aug. 2027');
    expect(zeitraumText('2027-12-28', '2028-01-08')).toBe('28. Dez. 2027 – 8. Jan. 2028');
    expect(zeitraumText('2027-08-04', '2027-08-04')).toBe('4. Aug. 2027');
  });

  it('lässt das laufende Jahr weg', () => {
    expect(zeitraumText('2027-08-04', '2027-08-15', 2027)).toBe('4.–15. Aug.');
    expect(zeitraumText('2027-12-28', '2028-01-08', 2027)).toBe('28. Dez. 2027 – 8. Jan. 2028');
  });

  it('schreibt Urlaubstage in Einzahl und Mehrzahl ohne Umbruch', () => {
    expect(urlaubstage(1)).toBe('1\u00a0Urlaubstag');
    expect(urlaubstage(9)).toBe('9\u00a0Urlaubstage');
  });

  it('nennt den Stand als Wort, ein offener Storno geht vor', () => {
    expect(statusAnzeige('requested', false)).toEqual({ text: 'Beantragt', ton: 'warnung' });
    expect(statusAnzeige('approved', true)).toEqual({ text: 'Storno beantragt', ton: 'warnung' });
    expect(statusAnzeige('rejected', false)?.ton).toBe('kritisch');
    expect(statusAnzeige('cancelled', false)?.text).toBe('Storniert');
  });
});
