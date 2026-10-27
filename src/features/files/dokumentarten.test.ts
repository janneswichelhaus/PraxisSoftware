import { describe, expect, it } from 'vitest';
import {
  DOKUMENTARTEN,
  dokumentartHinweise,
  dokumentartLabels,
  istKlinisch,
  sichtbarkeitHinweis,
} from './dokumentarten';

describe('Dokumentarten', () => {
  it('beschriftet jede Art und erklärt jede', () => {
    for (const art of DOKUMENTARTEN) {
      expect(dokumentartLabels[art]).toBeTruthy();
      expect(dokumentartHinweise[art]).toBeTruthy();
    }
  });

  it('grenzt das klinische Bild vom Foto der Person ab (ADR-017 Punkt 31)', () => {
    // Sonst läge ein Foto der Person ohne Einwilligung und mit zehn Jahren
    // Frist in der Akte.
    expect(dokumentartHinweise.klinisches_bild).toMatch(/ärztlicher oder klinischer Hand/);
    expect(dokumentartHinweise.klinisches_bild).toMatch(/Kein Foto, das die Praxis selbst/);
  });

  it('führt den Verordnungsscan als klinisch (ANN-011, ADR-017 Punkt 12)', () => {
    expect(istKlinisch('verordnungsscan')).toBe(true);
    expect(istKlinisch('befund')).toBe(true);
    expect(istKlinisch('einwilligung')).toBe(false);
    expect(istKlinisch('vertrag')).toBe(false);
  });

  it('sagt zu jeder Art, wer sie sieht und wer sie pflegt (E15, ADR-017 Punkt 13)', () => {
    expect(sichtbarkeitHinweis('verordnungsscan')).toMatch(/sichtbar für alle Praxisrollen/);
    // Der Scan folgt der Grundlage.
    expect(sichtbarkeitHinweis('verordnungsscan')).toMatch(/auch das Praxismanagement/);
    expect(sichtbarkeitHinweis('befund')).toMatch(
      /nur Praxisinhaber:in, Therapeut:innen und Teamleitung/,
    );
    // Der Name der Rolle, wie er im Konto steht.
    expect(sichtbarkeitHinweis('vertrag')).toMatch(/auch das Praxismanagement/);
    expect(sichtbarkeitHinweis('vertrag')).not.toMatch(/Verwaltung/);
  });
});
