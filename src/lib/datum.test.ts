import { describe, expect, it } from 'vitest';
import { formatDate } from './datum';

describe('formatDate', () => {
  it('formatiert ein Datum deutsch', () => {
    expect(formatDate('2026-02-10')).toBe('10.02.2026');
  });

  it('zeigt einen Platzhalter statt eines leeren Feldes', () => {
    expect(formatDate(null)).toBe('—');
  });

  it('zeigt denselben Platzhalter bei einem unlesbaren Wert', () => {
    expect(formatDate('kein datum')).toBe('—');
  });
});
