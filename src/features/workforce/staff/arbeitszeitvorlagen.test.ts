import { describe, expect, it } from 'vitest';
import {
  ARBEITSZEITVORLAGEN,
  vorlageZu,
  vorlagenText,
  wochenplanDer,
  type Arbeitszeitvorlage,
} from './arbeitszeitvorlagen';

describe('Arbeitszeitvorlagen (Startinhalt G5)', () => {
  it('nennt die drei Vorlagen der Spec mit ihren Zeiten', () => {
    expect(
      ARBEITSZEITVORLAGEN.map((vorlage) => `${vorlage.titel}: ${vorlagenText(vorlage)}`),
    ).toEqual([
      'Vollzeit: Mo–Fr 8:00–12:30 und 13:00–16:30',
      'Teilzeit vormittags: Mo–Fr 8:00–12:00',
      'Teilzeit drei Tage: Mo, Mi, Do 8:00–12:30 und 13:00–16:30',
    ]);
  });

  it('speichert je Arbeitstag die Blöcke in HH:MM, aufsteigend nach Wochentag', () => {
    expect(wochenplanDer(vorlageZu('teilzeit-drei-tage'))).toEqual([
      [
        1,
        [
          { von: '08:00', bis: '12:30' },
          { von: '13:00', bis: '16:30' },
        ],
      ],
      [
        3,
        [
          { von: '08:00', bis: '12:30' },
          { von: '13:00', bis: '16:30' },
        ],
      ],
      [
        4,
        [
          { von: '08:00', bis: '12:30' },
          { von: '13:00', bis: '16:30' },
        ],
      ],
    ]);
    for (const vorlage of ARBEITSZEITVORLAGEN) {
      for (const [, bloecke] of wochenplanDer(vorlage)) {
        for (const block of bloecke) {
          expect(block.von).toMatch(/^\d{2}:\d{2}$/);
          expect(block.bis).toMatch(/^\d{2}:\d{2}$/);
          expect(block.von < block.bis).toBe(true);
        }
      }
    }
  });

  it('fasst abweichende Tage getrennt zusammen', () => {
    const gemischt: Arbeitszeitvorlage = {
      key: 'vollzeit',
      titel: 'Gemischt',
      tage: {
        1: [{ von: '08:00', bis: '16:30' }],
        2: [{ von: '08:00', bis: '16:30' }],
        5: [{ von: '08:00', bis: '12:00' }],
      },
    };
    expect(vorlagenText(gemischt)).toBe('Mo, Di 8:00–16:30 · Fr 8:00–12:00');
  });
});
