import { describe, expect, it } from 'vitest';
import {
  DOKUMENTARTEN,
  MAX_BYTES,
  dateiAblehnungsgrund,
  dokumentartHinweise,
  dokumentartLabels,
  formatBytes,
  istErlaubterMimeTyp,
  istKlinisch,
  sichtbarkeitHinweis,
} from './dokumentarten';

/**
 * Die zweite von drei Durchsetzungen der Allowlist (ADR-017 Punkt 18).
 *
 * Die erste ist das `accept` am Dateifeld — sie filtert den Auswahldialog und
 * lässt sich mit einem Drag-and-drop umgehen. Die dritte steht am Server und
 * am Bucket. Diese hier ist die, die der Person eine Antwort gibt, statt den
 * Upload einfach scheitern zu lassen.
 */
describe('Dokumentarten und Dateiprüfung', () => {
  it('beschriftet jede Art und erklärt jede', () => {
    for (const art of DOKUMENTARTEN) {
      expect(dokumentartLabels[art]).toBeTruthy();
      expect(dokumentartHinweise[art]).toBeTruthy();
    }
  });

  it('führt den Verordnungsscan als klinisch (ANN-011, ADR-017 Punkt 12)', () => {
    expect(istKlinisch('verordnungsscan')).toBe(true);
    expect(istKlinisch('befund')).toBe(true);
    expect(istKlinisch('einwilligung')).toBe(false);
    expect(istKlinisch('vertrag')).toBe(false);
  });

  it('sagt zu jeder Art, wer sie danach sehen kann', () => {
    expect(sichtbarkeitHinweis('verordnungsscan')).toMatch(/nicht für die Verwaltung/);
    expect(sichtbarkeitHinweis('vertrag')).toMatch(/auch für die Verwaltung/);
  });

  it('lässt genau PDF, JPEG und PNG zu', () => {
    expect(istErlaubterMimeTyp('application/pdf')).toBe(true);
    expect(istErlaubterMimeTyp('image/jpeg')).toBe(true);
    expect(istErlaubterMimeTyp('image/png')).toBe(true);
    // Skriptfähig, würde auf der Domäne des Anbieters ausgeliefert.
    expect(istErlaubterMimeTyp('image/svg+xml')).toBe(false);
    expect(istErlaubterMimeTyp('text/html')).toBe(false);
    expect(istErlaubterMimeTyp('application/zip')).toBe(false);
    expect(istErlaubterMimeTyp('video/mp4')).toBe(false);
  });

  it('nennt bei einem fremden Format den Ausweg statt einer Sackgasse', () => {
    const grund = dateiAblehnungsgrund({ type: 'image/heic', size: 1000 });
    expect(grund).toMatch(/PDF, JPEG und PNG/);
    // Die offene Folgefrage aus ADR-017: ein iPhone liefert je nach
    // Einstellung HEIC. Die Meldung sagt, was zu tun ist.
    expect(grund).toMatch(/iPhone/);
  });

  it('nennt bei einer zu großen Datei ihre Größe und die Grenze', () => {
    const grund = dateiAblehnungsgrund({ type: 'application/pdf', size: MAX_BYTES + 1 });
    expect(grund).toMatch(/10.0 MB/);
  });

  it('lehnt eine leere Datei ab', () => {
    expect(dateiAblehnungsgrund({ type: 'application/pdf', size: 0 })).toBe('Die Datei ist leer.');
  });

  it('nimmt an, was passt', () => {
    expect(dateiAblehnungsgrund({ type: 'application/pdf', size: MAX_BYTES })).toBeNull();
    expect(dateiAblehnungsgrund({ type: 'image/jpeg', size: 1 })).toBeNull();
  });

  it('schreibt Größen so, wie man sie liest', () => {
    expect(formatBytes(512)).toBe('512 Byte');
    expect(formatBytes(204_800)).toBe('200 KB');
    expect(formatBytes(MAX_BYTES)).toBe('10.0 MB');
  });
});
