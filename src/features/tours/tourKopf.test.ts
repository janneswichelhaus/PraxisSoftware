import { describe, expect, it } from 'vitest';
import { ortsZeile, tagKurz } from './tourKopf';

describe('tourKopf (Runde 3)', () => {
  it('schreibt den Tag kurz mit Wochentag', () => {
    expect(tagKurz('2026-10-06')).toBe('Di, 06.10.');
  });

  it('fasst gleiche Orte zusammen', () => {
    expect(ortsZeile('standort', 'standort')).toBe('Start und Ende: Praxis');
    expect(ortsZeile('garage', 'garage')).toBe('Start und Ende: Garage');
  });

  it('nennt verschiedene Orte einzeln', () => {
    expect(ortsZeile('garage', 'besuch')).toBe('Start: Garage · Ende: letzter Besuch');
    expect(ortsZeile('besuch', 'besuch')).toBe('Start: erster Besuch · Ende: letzter Besuch');
  });
});
