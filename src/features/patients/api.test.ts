import { describe, expect, it } from 'vitest';
import { ageInYears, formatDate, fullName } from './api';

describe('ageInYears', () => {
  const heute = new Date('2026-08-28T12:00:00');

  it('rechnet ein bereits gefeiertes Geburtsdatum korrekt', () => {
    expect(ageInYears('1990-01-15', heute)).toBe(36);
  });

  it('zieht ein noch nicht gefeiertes Geburtsdatum ab', () => {
    expect(ageInYears('1990-12-31', heute)).toBe(35);
  });

  it('behandelt den Geburtstag selbst als vollendetes Lebensjahr', () => {
    expect(ageInYears('1990-08-28', heute)).toBe(36);
  });

  it('gibt null zurueck, wenn kein Geburtsdatum vorliegt', () => {
    expect(ageInYears(null, heute)).toBeNull();
    expect(ageInYears('unsinn', heute)).toBeNull();
  });
});

describe('formatDate', () => {
  it('formatiert ein Datum deutsch', () => {
    expect(formatDate('2026-02-10')).toBe('10.02.2026');
  });

  it('zeigt einen Platzhalter statt eines leeren Feldes', () => {
    expect(formatDate(null)).toBe('—');
  });
});

describe('fullName', () => {
  it('setzt Vor- und Nachname zusammen', () => {
    expect(fullName({ given_name: 'Max', family_name: 'Mustermann' })).toBe('Max Mustermann');
  });
});
