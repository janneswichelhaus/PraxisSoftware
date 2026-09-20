import { describe, expect, it } from 'vitest';
import {
  DOKUMENTARTEN,
  MAX_BYTES,
  dateiAblehnungsgrund,
  dateiInhaltAblehnungsgrund,
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

  it('sagt zu jeder Art, wer sie sieht und wer sie pflegt (E15, ADR-017 Punkt 13)', () => {
    expect(sichtbarkeitHinweis('verordnungsscan')).toMatch(/sichtbar für alle Praxisrollen/);
    expect(sichtbarkeitHinweis('verordnungsscan')).toMatch(
      /nur Praxisinhaber:in, Therapeut:innen und Teamleitung/,
    );
    expect(sichtbarkeitHinweis('vertrag')).toMatch(/auch die Verwaltung/);
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

describe('dateiInhaltAblehnungsgrund (R3-014)', () => {
  function datei(bytes: number[], typ: string): File {
    return new File([new Uint8Array(bytes)], 'datei', { type: typ });
  }

  const PDF = [0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37];
  const JPEG = [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46];
  const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  /** Eine Windows-Programmdatei: MZ am Anfang. */
  const PROGRAMM = [0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00];

  it('nimmt an, was seinen eigenen ersten Bytes entspricht', async () => {
    expect(await dateiInhaltAblehnungsgrund(datei(PDF, 'application/pdf'))).toBeNull();
    expect(await dateiInhaltAblehnungsgrund(datei(JPEG, 'image/jpeg'))).toBeNull();
    expect(await dateiInhaltAblehnungsgrund(datei(PNG, 'image/png'))).toBeNull();
  });

  it('weist eine umbenannte Fremddatei ab, die sich als PDF ausgibt', async () => {
    // Genau der Fall, den die bisherige Pruefung nicht sah: Der Browser
    // leitet den Typ aus der Endung ab, die Storage-API schreibt denselben
    // Wert in metadata.mimetype - zwei Angaben derselben Quelle.
    const grund = await dateiInhaltAblehnungsgrund(datei(PROGRAMM, 'application/pdf'));
    expect(grund).toMatch(/keine PDF-Datei/);
  });

  it('weist auch ein vertauschtes Bildformat ab', async () => {
    expect(await dateiInhaltAblehnungsgrund(datei(PNG, 'image/jpeg'))).toMatch(/JPEG/);
    expect(await dateiInhaltAblehnungsgrund(datei(JPEG, 'image/png'))).toMatch(/PNG/);
  });

  it('haelt sich aus Formaten heraus, die schon die Formpruefung abweist', async () => {
    // Fuer image/heic gibt es hier nichts zu sagen - dateiAblehnungsgrund hat
    // die Datei da laengst mit dem Hinweis auf JPEG zurueckgegeben.
    expect(await dateiInhaltAblehnungsgrund(datei(PROGRAMM, 'image/heic'))).toBeNull();
  });

  it('weist eine Datei ab, die kuerzer ist als ihre Kennung', async () => {
    expect(await dateiInhaltAblehnungsgrund(datei([0x25, 0x50], 'application/pdf'))).toMatch(
      /keine PDF-Datei/,
    );
  });
});
