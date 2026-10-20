import { describe, expect, it } from 'vitest';
import { fotosVerlorenText } from './fotoauftraege';

describe('fotosVerlorenText (BEF-175)', () => {
  it('setzt das Verb in die Zahl der Fotos', () => {
    expect(fotosVerlorenText(1)).toBe(
      'Ein Foto ist noch nicht übertragen und geht beim Weitergehen verloren.',
    );
    expect(fotosVerlorenText(3)).toBe(
      '3 Fotos sind noch nicht übertragen und gehen beim Weitergehen verloren.',
    );
  });
});
