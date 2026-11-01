import { describe, expect, it } from 'vitest';
import { abmeldenAufraeumen } from '@/lib/abmelden';
import {
  textUebergeben,
  uebergabeDiktiert,
  uebergabeErledigt,
  uebergebenerText,
} from './uebernahme';

describe('Übergabe eines Textes aus dem Konfliktfall', () => {
  it('fällt beim Abmelden und beim Kontowechsel (ANN-320)', () => {
    textUebergeben('doku-1', 'Nicht abgeholt');
    expect(uebergebenerText('doku-1')).toBe('Nicht abgeholt');

    abmeldenAufraeumen();

    expect(uebergebenerText('doku-1')).toBeUndefined();
  });

  it('trägt „mit Diktat“ mit dem Text und vergisst es beim Abholen (ANN-825)', () => {
    textUebergeben('doku-2', 'Aus der Aufnahme', true);
    expect(uebergabeDiktiert('doku-2')).toBe(true);
    textUebergeben('doku-2', 'Getippt');
    expect(uebergabeDiktiert('doku-2')).toBe(false);
    textUebergeben('doku-2', 'Aus der Aufnahme', true);
    uebergabeErledigt('doku-2');
    expect(uebergabeDiktiert('doku-2')).toBe(false);
  });
});
