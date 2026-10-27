import { describe, expect, it } from 'vitest';
import { abmeldenAufraeumen } from '@/lib/abmelden';
import { textUebergeben, uebergebenerText } from './uebernahme';

describe('Übergabe eines Textes aus dem Konfliktfall', () => {
  it('fällt beim Abmelden und beim Kontowechsel (ANN-320)', () => {
    textUebergeben('doku-1', 'Nicht abgeholt');
    expect(uebergebenerText('doku-1')).toBe('Nicht abgeholt');

    abmeldenAufraeumen();

    expect(uebergebenerText('doku-1')).toBeUndefined();
  });
});
