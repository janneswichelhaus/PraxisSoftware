import { describe, expect, it } from 'vitest';
import {
  FREE_DAY,
  blocksFromForm,
  formFromBlocks,
  needsBreak,
  suggestedEnd,
  withBreak,
  withoutBreak,
} from './dayForm';

describe('Ein Tag im Formular (ANN-592)', () => {
  it('liest zwei Blöcke als Beginn, Pause und Ende und schreibt sie zurück', () => {
    const form = formFromBlocks([
      { von: '13:00', bis: '18:00' },
      { von: '08:00', bis: '12:00' },
    ]);
    expect(form).toEqual({ start: '08:00', end: '18:00', breakStart: '12:00', breakMinutes: 60 });
    expect(blocksFromForm({ ...form!, breakStart: '12:30', breakMinutes: 45 })).toEqual([
      { von: '08:00', bis: '12:30' },
      { von: '13:15', bis: '18:00' },
    ]);
  });

  it('kennt freie Tage, Tage ohne Pause und lässt mehr als eine Pause, wie sie ist', () => {
    expect(formFromBlocks([])).toEqual(FREE_DAY);
    expect(blocksFromForm(FREE_DAY)).toEqual([]);
    expect(formFromBlocks([{ von: '08:00', bis: '13:00' }])).toEqual({
      start: '08:00',
      end: '13:00',
      breakStart: null,
      breakMinutes: null,
    });
    expect(
      formFromBlocks([
        { von: '08:00', bis: '10:00' },
        { von: '10:30', bis: '12:00' },
        { von: '13:00', bis: '16:00' },
      ]),
    ).toBeNull();
  });

  it('lässt Unvollständiges und eine Pause außerhalb des Tages nicht durch', () => {
    expect(
      blocksFromForm({ start: '08:00', end: '', breakStart: null, breakMinutes: null }),
    ).toBeNull();
    expect(
      blocksFromForm({ start: '12:00', end: '08:00', breakStart: null, breakMinutes: null }),
    ).toBeNull();
    expect(
      blocksFromForm({ start: '08:00', end: '12:00', breakStart: '11:45', breakMinutes: 30 }),
    ).toBeNull();
    expect(
      blocksFromForm({ start: '08:00', end: '12:00', breakStart: '08:00', breakMinutes: 30 }),
    ).toBeNull();
  });

  it('bietet eine Pause erst über sechs Stunden an und legt sie in die Mitte', () => {
    const kurz = { start: '08:00', end: '14:00', breakStart: null, breakMinutes: null };
    expect(needsBreak(kurz)).toBe(false);
    const lang = { ...kurz, end: '15:00' };
    expect(needsBreak(lang)).toBe(true);
    const mitPause = withBreak(lang);
    expect(mitPause).toEqual({
      start: '08:00',
      end: '15:00',
      breakStart: '11:15',
      breakMinutes: 30,
    });
    expect(needsBreak(mitPause)).toBe(false);
    expect(withoutBreak(mitPause)).toEqual(lang);
    // Über neun Stunden Arbeit 45 Minuten.
    expect(withBreak({ ...kurz, end: '18:00' }).breakMinutes).toBe(45);
  });

  it('schlägt ein späteres Ende vor, wenn die Pause die Arbeitszeit kürzt', () => {
    const laengerePause = { start: '08:00', end: '18:00', breakStart: '12:00', breakMinutes: 90 };
    expect(suggestedEnd(laengerePause, 540)).toBe('18:30');
    expect(suggestedEnd({ ...laengerePause, breakMinutes: 60 }, 540)).toBeNull();
    expect(suggestedEnd(FREE_DAY, 540)).toBeNull();
  });
});
