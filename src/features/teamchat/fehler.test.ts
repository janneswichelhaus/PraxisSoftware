import { describe, expect, it, vi } from 'vitest';
import type * as Dokumentarten from '@/features/files/dokumentarten';
import type * as Metadaten from '@/features/files/metadaten';
import { enthaelt, webmAusChromium } from '@/features/platform/testvideos';

/**
 * Fehler des Teamchats ohne Netz (TEAM-002, Praxis-Sichtung): Nur Nachrichten
 * holt der Ausgang nach. Reagieren, Merken und Abhaken gehen direkt an den
 * Server; scheitert das, darf der Satz kein Nachholen versprechen.
 */

const rpc = vi.fn();
const upload = vi.fn();
const invoke = vi.fn();
vi.mock('@/lib/supabase', () => ({
  getSupabase: () => ({ rpc, storage: { from: () => ({ upload }) }, functions: { invoke } }),
}));
// Inhaltsprüfung und Bereinigung lesen die Bytes über den Browser; hier geht
// es nur um den Weg danach (Hochladen, Einordnen des Fehlers, Verwerfen).
vi.mock('@/features/files/dokumentarten', async (importOriginal) => ({
  ...(await importOriginal<typeof Dokumentarten>()),
  dateiInhaltAblehnungsgrund: () => Promise.resolve(null),
}));
vi.mock('@/features/files/metadaten', async (importOriginal) => ({
  ...(await importOriginal<typeof Metadaten>()),
  alleBytes: async (datei: Blob) => new Uint8Array(await datei.arrayBuffer()),
}));

const {
  ABGEBROCHEN,
  FALSCHE_AUFNAHME,
  SITZUNGSENDE,
  TeamchatFehler,
  aendereGemerkt,
  ladeAnhangHoch,
  merke,
  reagiere,
} = await import('./api');

const vorgaenge = [
  () => reagiere('n-1', 'daumen'),
  () => merke('n-1', null),
  () => aendereGemerkt('n-1', { erledigt: true }),
];

async function fehlerVon(
  vorgang: () => Promise<unknown>,
): Promise<InstanceType<typeof TeamchatFehler>> {
  const fehler: unknown = await vorgang().then(
    () => null,
    (e: unknown) => e,
  );
  expect(fehler).toBeInstanceOf(TeamchatFehler);
  return fehler as InstanceType<typeof TeamchatFehler>;
}

describe('Ohne Netz', () => {
  it('verspricht bei Reaktion, Merken und Abhaken kein Nachholen', async () => {
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    for (const vorgang of vorgaenge) {
      const fehler = await fehlerVon(vorgang);
      expect(fehler.netz).toBe(true);
      expect(fehler.message).toBe('Kein Netz – nicht angekommen. Bitte gleich noch einmal.');
      expect(fehler.message).not.toMatch(/gesendet/);
    }
  });

  it('nimmt einen Server, der gerade nicht bereit ist, wie fehlendes Netz', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'upstream' }, status: 503 });
    const fehler = await fehlerVon(vorgaenge[0]!);
    expect(fehler.netz).toBe(true);
    expect(fehler.message).toMatch(/noch einmal/);
  });

  it('nimmt eine Antwort der Datenbank als Ablehnung, auch als HTTP 500 (P0002)', async () => {
    // PostgREST schickt P0002 und andere P0-Codes als 500; der Ausgang darf
    // eine abgelehnte Nachricht nicht ohne Ende als „kein Netz“ wiederholen.
    rpc.mockResolvedValue({
      data: null,
      error: { message: 'team message not found', code: 'P0002' },
      status: 500,
    });
    const fehler = await fehlerVon(vorgaenge[0]!);
    expect(fehler.netz).toBe(false);
    expect(fehler.message).toBe('Das Gespräch oder die Nachricht gibt es nicht mehr.');
  });

  it('wiederholt bei Verbindungs- und Verklemmungsfehlern der Datenbank', async () => {
    for (const code of ['08006', '40001', '40P01', '53300', '57014']) {
      rpc.mockResolvedValue({ data: null, error: { message: 'x', code }, status: 500 });
      expect((await fehlerVon(vorgaenge[0]!)).netz).toBe(true);
    }
  });

  it('nennt eine Ablehnung des Servers als solche', async () => {
    rpc.mockResolvedValue({ data: null, error: { message: 'not allowed' }, status: 403 });
    const fehler = await fehlerVon(vorgaenge[0]!);
    expect(fehler.netz).toBe(false);
    expect(fehler.message).toBe('Dafür fehlt die Berechtigung.');
  });
});

describe('Hochladen eines Anhangs (TEAM-003)', () => {
  it('wiederholt nur Vorübergehendes von selbst - ein Nein der Ablage nicht (Zweitreview, Runde 2)', async () => {
    for (const [status, netz] of [
      [403, false],
      [415, false],
      [429, true],
      [503, true],
    ] as const) {
      rpc.mockReset();
      rpc
        .mockResolvedValueOnce({
          data: [{ attachment_id: 'a1', bucket_id: 'teamchat', object_key: 'org/kanal/a1' }],
          error: null,
          status: 200,
        })
        .mockResolvedValue({ data: null, error: null, status: 204 });
      upload.mockResolvedValueOnce({ data: null, error: { message: 'nein', status } });
      const fehler = await fehlerVon(() =>
        ladeAnhangHoch('kanal', new Blob(['%PDF-1.4\n'], { type: 'application/pdf' }), 'Plan.pdf'),
      );
      expect(fehler.netz).toBe(netz);
      // Was vorbereitet war, fällt gleich wieder - nichts bleibt halb liegen.
      expect(rpc).toHaveBeenCalledWith('discard_team_attachment', { p_attachment_id: 'a1' });
    }
  });

  it('sagt ohne Netz schon beim Vorbereiten „nicht hochgeladen“ - und versucht es wieder', async () => {
    rpc.mockReset();
    rpc.mockRejectedValue(new TypeError('Failed to fetch'));
    const fehler = await fehlerVon(() =>
      ladeAnhangHoch('kanal', new Blob(['%PDF-1.4\n'], { type: 'application/pdf' }), 'Plan.pdf'),
    );
    expect(fehler.netz).toBe(true);
    expect(fehler.message).toBe('Nicht hochgeladen – kein Netz? Bitte noch einmal.');
  });
});

describe('Hochladen einer Sprachnachricht (TEAM-004, ADR-017 Punkt 84)', () => {
  function vorbereitetUndBestaetigt() {
    rpc.mockReset();
    upload.mockReset();
    rpc
      .mockResolvedValueOnce({
        data: [{ attachment_id: 's1', bucket_id: 'teamchat', object_key: 'org/kanal/s1' }],
        error: null,
        status: 200,
      })
      .mockResolvedValue({ data: null, error: null, status: 204 });
    upload.mockResolvedValue({ data: {}, error: null });
  }

  it('leert die Aufnahme, nimmt den Typ ohne Codec und meldet die Dauer in ganzen Sekunden', async () => {
    vorbereitetUndBestaetigt();
    const aufnahme = new Blob(
      [webmAusChromium({ bild: false, ton: true, datum: true }) as BlobPart],
      {
        type: 'audio/webm;codecs=opus',
      },
    );
    const anhang = await ladeAnhangHoch('kanal', aufnahme, 'Sprachnachricht 18.10., 19:34', 41.6);
    expect(rpc).toHaveBeenCalledWith(
      'prepare_team_attachment_upload',
      expect.objectContaining({ p_mime_type: 'audio/webm', p_duration_seconds: 42 }),
    );
    const hochgeladen = upload.mock.calls[0]![1] as Blob;
    expect(hochgeladen.type).toBe('audio/webm');
    // Programm und Datum sind fort (wie beim Video, Punkt 64).
    const bytes = new Uint8Array(await hochgeladen.arrayBuffer());
    expect(enthaelt(bytes, 'Chrome')).toBe(false);
    expect(anhang).toMatchObject({ mime_type: 'audio/webm', duration_seconds: 42 });
  });

  it('nimmt Ton ohne Dauer nicht an - etwa aus dem Dateiwähler (Punkt 82)', async () => {
    vorbereitetUndBestaetigt();
    const datei = new Blob([webmAusChromium({ bild: false, ton: true }) as BlobPart], {
      type: 'audio/webm',
    });
    const fehler = await fehlerVon(() => ladeAnhangHoch('kanal', datei, 'Mitschnitt.webm'));
    expect(fehler.netz).toBe(false);
    expect(fehler.message).toMatch(/^Dieses Format wird nicht angenommen/);
    expect(rpc).not.toHaveBeenCalled();
  });

  it('sendet keine Aufnahme mit Bildspur und sagt, was zu tun ist', async () => {
    vorbereitetUndBestaetigt();
    const aufnahme = new Blob([webmAusChromium({ ton: true }) as BlobPart], { type: 'audio/webm' });
    const fehler = await fehlerVon(() => ladeAnhangHoch('kanal', aufnahme, 'Sprachnachricht', 12));
    expect(fehler.netz).toBe(false);
    expect(fehler.message).toBe(FALSCHE_AUFNAHME);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('Abbruch des Hochladens (Zweitreview TEAM-005)', () => {
  const pdf = () => new Blob(['%PDF-1.4\n'], { type: 'application/pdf' });

  it('geht abgebrochen keinen Schritt mehr zum Server', async () => {
    rpc.mockReset();
    upload.mockReset();
    const abbruch = new AbortController();
    abbruch.abort();
    const fehler = await fehlerVon(() =>
      ladeAnhangHoch('kanal', pdf(), 'Plan.pdf', undefined, abbruch.signal),
    );
    expect(fehler.message).toBe(ABGEBROCHEN);
    expect(fehler.netz).toBe(false);
    expect(rpc).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
  });

  it('lädt nach dem Vorbereiten nicht mehr hoch und verwirft, was vorbereitet war', async () => {
    rpc.mockReset();
    upload.mockReset();
    const abbruch = new AbortController();
    rpc
      .mockImplementationOnce(() => {
        // Während das Vorbereiten läuft, fällt der Anhang.
        abbruch.abort();
        return Promise.resolve({
          data: [{ attachment_id: 'a1', bucket_id: 'teamchat', object_key: 'org/kanal/a1' }],
          error: null,
          status: 200,
        });
      })
      .mockResolvedValue({ data: null, error: null, status: 204 });
    const fehler = await fehlerVon(() =>
      ladeAnhangHoch('kanal', pdf(), 'Plan.pdf', undefined, abbruch.signal),
    );
    expect(fehler.message).toBe(ABGEBROCHEN);
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith('discard_team_attachment', { p_attachment_id: 'a1' });
  });

  /** Vorbereiten gelingt; während des Hochladens fällt der Anhang - mit `grund`. */
  async function abbruchBeimHochladen(grund?: string) {
    rpc.mockReset();
    upload.mockReset();
    const abbruch = new AbortController();
    rpc
      .mockResolvedValueOnce({
        data: [{ attachment_id: 'a1', bucket_id: 'teamchat', object_key: 'org/kanal/a1' }],
        error: null,
        status: 200,
      })
      .mockResolvedValue({ data: null, error: null, status: 204 });
    upload.mockImplementationOnce(() => {
      abbruch.abort(grund);
      return Promise.resolve({ data: { path: 'org/kanal/a1' }, error: null });
    });
    return fehlerVon(() => ladeAnhangHoch('kanal', pdf(), 'Plan.pdf', undefined, abbruch.signal));
  }

  it('bestätigt nach einem Abbruch während des Hochladens nicht und verwirft (Runde 3, B3)', async () => {
    const fehler = await abbruchBeimHochladen();
    expect(fehler.message).toBe(ABGEBROCHEN);
    expect(rpc).not.toHaveBeenCalledWith('confirm_team_attachment_upload', expect.anything());
    expect(rpc).toHaveBeenCalledWith('discard_team_attachment', { p_attachment_id: 'a1' });
  });

  /** Hochladen gelingt; während des Bestätigens fällt der Anhang - mit `grund`. */
  async function abbruchBeimBestaetigen(grund?: string) {
    rpc.mockReset();
    upload.mockReset();
    invoke.mockReset();
    invoke.mockResolvedValue({ data: { ergebnis: 'passed' }, error: null });
    upload.mockResolvedValue({ data: { path: 'org/kanal/a1' }, error: null });
    const abbruch = new AbortController();
    rpc
      .mockResolvedValueOnce({
        data: [{ attachment_id: 'a1', bucket_id: 'teamchat', object_key: 'org/kanal/a1' }],
        error: null,
        status: 200,
      })
      .mockImplementationOnce(() => {
        abbruch.abort(grund);
        return Promise.resolve({ data: null, error: null, status: 204 });
      });
    return ladeAnhangHoch('kanal', pdf(), 'Plan.pdf', undefined, abbruch.signal).then(
      (anhang) => anhang,
      (e: unknown) => e,
    );
  }

  it('prüft nach dem Abmelden während des Bestätigens nicht mehr am Server (Runde 3, B1)', async () => {
    const ergebnis = await abbruchBeimBestaetigen(SITZUNGSENDE);
    expect(ergebnis).toBeInstanceOf(TeamchatFehler);
    expect((ergebnis as Error).message).toBe(ABGEBROCHEN);
    expect(invoke).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalledWith('discard_team_attachment', expect.anything());
  });

  it('lädt einen dabei entfernten Anhang fertig - verworfen wird er danach', async () => {
    // `hochladen` verwirft ihn dann am Server (entwurfsanhaenge.test.ts).
    const ergebnis = await abbruchBeimBestaetigen();
    expect(ergebnis).toMatchObject({ id: 'a1', verified: true });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('geht nach dem Abmelden auch zum Verwerfen nicht mehr zum Server (Runde 3, B1)', async () => {
    // Es ginge unter der nächsten Sitzung hinaus; der Server räumt nach 24 Stunden auf.
    const fehler = await abbruchBeimHochladen(SITZUNGSENDE);
    expect(fehler.message).toBe(ABGEBROCHEN);
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith('prepare_team_attachment_upload', expect.anything());
  });
});
