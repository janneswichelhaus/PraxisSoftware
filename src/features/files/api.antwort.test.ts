import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Was die Oberfläche zeigt, wenn eine Serverfunktion der Dateien und Fotos
 * etwas Unerwartetes zurückgibt (BEF-070, Muster R3-023).
 *
 * Bis UX-006a prüften diese Wege ihre Antwort mit `parse`; dessen Meldung ist
 * englisches JSON, und die Seiten zeigen sie unverändert an. Geprüft wird
 * deshalb der Satz, der wirklich im Bildschirm landet - auf dem Löschpfad
 * (ADR-008) ebenso wie beim Hinzufügen, Öffnen und Herausgeben.
 */

const rpc = vi.fn();
const upload = vi.fn();
const remove = vi.fn();
const createSignedUrl = vi.fn();

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({
    rpc,
    storage: { from: () => ({ upload, remove, createSignedUrl }) },
    functions: { invoke: vi.fn() },
  }),
}));

const { fuehreLoeschauftragAus, ladeDateiHoch, ladeDateiZumAnzeigen } = await import('./api');
const { gibPatientenfotoHeraus, ladePatientenfoto } = await import('./patientenfotos');

const PATIENT = '66666666-6666-4666-8666-000000000002';
const DATEI = '99999999-9999-4999-8999-000000000001';

async function meldung(vorgang: () => Promise<unknown>): Promise<string> {
  try {
    await vorgang();
  } catch (fehler) {
    return (fehler as Error).message;
  }
  throw new Error('Der Vorgang hätte scheitern müssen.');
}

function keinPrueftext(satz: string) {
  expect(satz.startsWith('[')).toBe(false);
  expect(satz).not.toMatch(/expected|invalid_type/);
}

describe('Unerwartete Antwortform bei Dateien und Fotos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Kein Fehler, aber auch keine Liste: genau die Lage, in der bisher der
    // ZodError-Text im Bildschirm stand.
    rpc.mockResolvedValue({ data: 'abc', error: null, status: 200 });
  });

  it('Datei hinzufügen: deutscher Satz, nichts übertragen', async () => {
    const satz = await meldung(() =>
      ladeDateiHoch({
        patientId: PATIENT,
        grundlageId: null,
        documentType: 'sonstiges',
        displayName: 'Befund',
        datei: new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31])], 'befund.pdf', {
          type: 'application/pdf',
        }),
      }),
    );
    expect(satz).toBe('Die Datei konnte nicht angenommen werden.');
    keinPrueftext(satz);
    expect(upload).not.toHaveBeenCalled();
  });

  it('Datei öffnen', async () => {
    const satz = await meldung(() => ladeDateiZumAnzeigen(DATEI));
    expect(satz).toBe('Die Datei konnte nicht geöffnet werden.');
    keinPrueftext(satz);
  });

  it('Löschauftrag: deutscher Satz, nichts entfernt (ADR-008)', async () => {
    const satz = await meldung(() => fuehreLoeschauftragAus(DATEI));
    expect(satz).toBe('Der Löschauftrag konnte nicht ausgeführt werden.');
    keinPrueftext(satz);
    expect(remove).not.toHaveBeenCalled();
  });

  it('Foto öffnen', async () => {
    const satz = await meldung(() => ladePatientenfoto(DATEI));
    expect(satz).toBe('Das Foto konnte nicht geöffnet werden.');
    keinPrueftext(satz);
  });

  it('Foto herausgeben: deutscher Satz, kein Verweis', async () => {
    const satz = await meldung(() => gibPatientenfotoHeraus(DATEI));
    expect(satz).toBe('Das Foto konnte nicht herausgegeben werden.');
    keinPrueftext(satz);
    expect(createSignedUrl).not.toHaveBeenCalled();
  });
});
