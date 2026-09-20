import { describe, expect, it, vi } from 'vitest';

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

const { ladeDateiHoch } = await import('./api');

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
