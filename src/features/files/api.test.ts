import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Der Weg einer Datei in die Akte (ADR-017 Punkt 7) endet hier, bevor er
 * beginnt: Was seinem angekündigten Format nicht entspricht, wird abgewiesen,
 * **ehe** Phase (a) eine Zeile anlegt und ehe ein Byte fließt (R3-014).
 */

const rpc = vi.fn();
const upload = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc, storage: { from: () => ({ upload }) } }),
}));

const { fuehreLoeschauftragAus, ladeDateiHoch, merkeVerwaisteZurLoeschungVor } =
  await import('./api');
const { enthaelt, jpegVomHandy } = await import('./testbilder');
const { alleBytes } = await import('./metadaten');

const PATIENT = '66666666-6666-4666-8666-000000000002';

function auftrag(bytes: number[], typ: string) {
  return {
    patientId: PATIENT,
    grundlageId: null,
    documentType: 'sonstiges' as const,
    displayName: 'Befund',
    datei: new File([new Uint8Array(bytes)], 'befund.pdf', { type: typ }),
  };
}

describe('ladeDateiHoch', () => {
  it('weist eine umbenannte Fremddatei ab, ohne etwas anzulegen (R3-014)', async () => {
    // MZ statt %PDF-: eine Windows-Programmdatei mit der Endung .pdf.
    await expect(
      ladeDateiHoch(auftrag([0x4d, 0x5a, 0x90, 0x00], 'application/pdf')),
    ).rejects.toThrow(/keine PDF-Datei/);

    expect(rpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
});

/**
 * ADR-017 Punkt 34 (DOK-006): Ein Bild verliert seine Aufnahmemetadaten, bevor
 * es das Gerät verlässt - und alles, was der Server erfährt, gilt der
 * bereinigten Fassung.
 */
describe('ladeDateiHoch — Metadaten', () => {
  beforeEach(() => {
    rpc.mockReset();
    upload.mockReset();
  });

  it('lädt ein Handyfoto ohne Ort und Vorschaubild hoch; Größe und Prüfsumme gelten den bereinigten Bytes', async () => {
    rpc.mockImplementation((name: string) =>
      Promise.resolve(
        name === 'prepare_patient_file_upload'
          ? {
              data: [{ file_id: 'f1', bucket_id: 'patientenakte', object_key: 'o/p/f1' }],
              error: null,
            }
          : { data: null, error: null },
      ),
    );
    upload.mockResolvedValue({ error: null });

    const handy = jpegVomHandy();
    await ladeDateiHoch({
      patientId: PATIENT,
      grundlageId: null,
      documentType: 'befund',
      displayName: 'Foto',
      datei: new File([handy as BlobPart], 'IMG_4711.jpg', { type: 'image/jpeg' }),
    });

    const hochgeladen = upload.mock.calls[0]![1] as Blob;
    // FileReader statt `Response`: jsdom liest einen Blob dort als Text.
    const bytes = await alleBytes(hochgeladen);
    expect(enthaelt(bytes, 'GPSORT')).toBe(false);
    expect(enthaelt(bytes, 'VORSCHAUBILD')).toBe(false);
    expect(enthaelt(bytes, 'Testkamera')).toBe(false);
    expect(bytes.length).toBeLessThan(handy.length);

    const vorbereitung = rpc.mock.calls.find(([name]) => name === 'prepare_patient_file_upload')!;
    const parameter = vorbereitung[1] as { p_byte_size: number; p_checksum_sha256: string };
    expect(parameter.p_byte_size).toBe(bytes.length);

    const summe = await crypto.subtle.digest('SHA-256', bytes as BufferSource);
    const hex = Array.from(new Uint8Array(summe), (b) => b.toString(16).padStart(2, '0')).join('');
    expect(parameter.p_checksum_sha256).toBe(hex);
  });

  it('lädt ein Bild, das sich nicht bereinigen lässt, gar nicht erst hoch', async () => {
    // Beginnt wie ein JPEG, ist aber keins.
    const kaputt = new Uint8Array([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02]);
    await expect(
      ladeDateiHoch({
        patientId: PATIENT,
        grundlageId: null,
        documentType: 'befund',
        displayName: 'Foto',
        datei: new File([kaputt], 'kaputt.jpg', { type: 'image/jpeg' }),
      }),
    ).rejects.toThrow(/beschädigt/);
    expect(rpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });
});

/**
 * G6c, ANN-115: Abgewiesene Löschpfade antworten mit HTTP 403 ohne
 * Fehlerobjekt. Das darf weder als „0 vorgemerkt" noch als offener Auftrag
 * durchgehen.
 */
describe('Abweisung ohne Fehlerobjekt', () => {
  beforeEach(() => rpc.mockReset());

  it('meldet ein abgewiesenes Vormerken als Fehler statt als null Objekte', async () => {
    rpc.mockResolvedValue({ data: null, error: null, status: 403 });
    await expect(merkeVerwaisteZurLoeschungVor()).rejects.toThrow(/nicht vorgemerkt/);
  });

  it('bricht eine abgewiesene Löschfreigabe ab, bevor etwas entfernt wird', async () => {
    rpc.mockResolvedValue({ data: [], error: [], status: 403 });
    await expect(fuehreLoeschauftragAus('77777777-7777-4777-8777-000000000001')).rejects.toThrow(
      /nicht ausgeführt/,
    );
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});
