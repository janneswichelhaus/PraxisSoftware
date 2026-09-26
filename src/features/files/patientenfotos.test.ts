import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Der Anzeigeweg eines Patientenfotos (DOK-006, ADR-017 Punkt 40).
 *
 * Er ist festgelegt, weil der vorhandene das Gegenteil täte: Die Dateiliste
 * signiert mit Downloadnamen und öffnet ein Fenster auf den Verweis. Für ein
 * Foto gilt: Verweis ohne Downloadnamen, Laden per `fetch` mit
 * `cache: 'no-store'` in den Speicher der Seite, nie ein Fenster.
 */

const rpc = vi.fn();
const createSignedUrl = vi.fn();
const from = vi.fn(() => ({ createSignedUrl }));

vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc, storage: { from } }),
}));

const { ladePatientenfoto, fetchPatientenfotos } = await import('./patientenfotos');

describe('ladePatientenfoto', () => {
  const holen = vi.fn();
  const oeffnen = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    rpc.mockResolvedValue({
      data: [
        {
          bucket_id: 'patientenfotos',
          object_key: 'org/patient/f1',
          display_name: 'Knie',
          mime_type: 'image/jpeg',
        },
      ],
      error: null,
    });
    createSignedUrl.mockResolvedValue({
      data: { signedUrl: 'https://beispiel.invalid/signiert' },
      error: null,
    });
    holen.mockResolvedValue(new Response(new Blob(['jpeg'], { type: 'image/jpeg' })));
    vi.stubGlobal('fetch', holen);
    vi.stubGlobal('open', oeffnen);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('signiert ohne Downloadnamen, lädt ohne Zwischenspeicher und öffnet kein Fenster', async () => {
    const bild = await ladePatientenfoto('f1');

    expect(rpc).toHaveBeenCalledWith('issue_patient_file_link', { p_file_id: 'f1' });
    expect(from).toHaveBeenCalledWith('patientenfotos');
    // Genau zwei Argumente: Schlüssel und Gültigkeit - keine Optionen, also kein `download`.
    expect(createSignedUrl).toHaveBeenCalledWith('org/patient/f1', 60);
    expect(createSignedUrl.mock.calls[0]).toHaveLength(2);
    expect(holen).toHaveBeenCalledWith('https://beispiel.invalid/signiert', { cache: 'no-store' });
    expect(oeffnen).not.toHaveBeenCalled();
    // Node liefert seinen eigenen Blob, jsdom einen anderen - geprüft wird der Inhalt.
    expect(bild.size).toBeGreaterThan(0);
  });

  it('stellt ohne Freigabe des Servers keinen Verweis aus', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'file not accessible' } });

    await expect(ladePatientenfoto('f1')).rejects.toThrow(/noch freigegeben/);
    expect(createSignedUrl).not.toHaveBeenCalled();
    expect(holen).not.toHaveBeenCalled();
  });

  it('meldet eine gescheiterte Übertragung, statt ein leeres Bild zu zeigen', async () => {
    holen.mockResolvedValue(new Response(null, { status: 400 }));
    await expect(ladePatientenfoto('f1')).rejects.toThrow(/nicht geladen/);
  });
});

describe('fetchPatientenfotos', () => {
  it('fragt die eigene Liste der Fotos, nicht die Dateiliste', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await fetchPatientenfotos('p1');
    expect(rpc).toHaveBeenCalledWith('list_patient_photos', { p_patient_id: 'p1' });
  });
});
