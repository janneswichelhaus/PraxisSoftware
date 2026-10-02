import { describe, expect, it } from 'vitest';
import { fehlendeAnschrift } from './api';
import { anschriftZurPruefung } from '@/features/training/api';

/** Keine Rechnung ohne vollständige Anschrift (ABN-020, BEF-111). */
describe('fehlendeAnschrift', () => {
  it('nennt die fehlenden Felder in Worten', () => {
    expect(fehlendeAnschrift('house_number,postal_code')).toBe(
      'In der Anschrift des Empfängers fehlt: Hausnummer, PLZ. Bitte in den Kontaktdaten ergänzen und erneut ausstellen.',
    );
  });

  it('bleibt ohne Angabe des Servers verständlich', () => {
    expect(fehlendeAnschrift(undefined)).toMatch(/fehlt: Angaben\./);
  });
});

describe('anschriftZurPruefung', () => {
  it('meldet eine Hausnummer, die noch in der Straße steht', () => {
    expect(anschriftZurPruefung({ street: 'B 27', house_number: null })).toBe(true);
    expect(anschriftZurPruefung({ street: 'Trainingsweg', house_number: '5' })).toBe(false);
    expect(anschriftZurPruefung({ street: 'Hauptstrasse', house_number: null })).toBe(false);
  });
});
