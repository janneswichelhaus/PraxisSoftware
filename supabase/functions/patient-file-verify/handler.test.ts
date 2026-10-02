import { describe, expect, it, vi } from 'vitest';
import { entferneMetadaten } from '../../../src/features/files/metadaten';
import { jpegVomHandy } from '../../../src/features/files/testbilder';
import { erstelleHandler } from './handler';
import type { Instanz } from './instanz';
import { sha256 } from './pruefung';
import type { Ankuendigung, Protokolleintrag } from './typen';

/**
 * Der Ablauf der Function (ABN-025). Die Laufzeit fehlt in der
 * Cloud-Umgebung, der Ablauf nicht: Sitzung, Ankündigung, Objekt, Prüfung,
 * Eintrag, Log. Die Instanz ist eingesetzt.
 */

const DATEI = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
const PERSON = '11111111-1111-4111-8111-000000000002';
const SCHLUESSEL = '22222222-2222-4222-8222-000000000001/66666666/abcdef';

const BILD = entferneMetadaten(jpegVomHandy(6), 'image/jpeg');

async function ankuendigung(rest: Partial<Ankuendigung> = {}): Promise<Ankuendigung> {
  return {
    bucket_id: 'patientenakte',
    object_key: SCHLUESSEL,
    mime_type: 'image/jpeg',
    byte_size: BILD.length,
    checksum_sha256: await sha256(BILD),
    already_verified: false,
    ...rest,
  };
}

function instanz(rest: Partial<Instanz> = {}): Instanz & { eintragen: ReturnType<typeof vi.fn> } {
  return {
    person: vi.fn().mockResolvedValue({ ok: true, wert: PERSON }),
    ankuendigung: vi.fn(async () => ({ ok: true as const, wert: await ankuendigung() })),
    objekt: vi.fn().mockResolvedValue({ ok: true, wert: BILD }),
    eintragen: vi.fn().mockResolvedValue({ ok: true, wert: 'passed' }),
    ...rest,
  } as Instanz & { eintragen: ReturnType<typeof vi.fn> };
}

function anfrage(rumpf: unknown = { file_id: DATEI }, methode = 'POST'): Request {
  return new Request('http://localhost/functions/v1/patient-file-verify', {
    method: methode,
    headers: { Authorization: 'Bearer token', 'Content-Type': 'application/json' },
    body: methode === 'POST' ? JSON.stringify(rumpf) : null,
  });
}

async function lauf(i: Instanz | null, a: Request = anfrage()) {
  const log: Protokolleintrag[] = [];
  const handler = erstelleHandler({ instanz: i, protokolliere: (e) => log.push(e) });
  const antwort = await handler(a);
  return { status: antwort.status, rumpf: (await antwort.json()) as { ergebnis: string }, log };
}

describe('patient-file-verify', () => {
  it('prueft eine bereinigte Datei und traegt das bestandene Ergebnis ein', async () => {
    const i = instanz();
    const { status, rumpf, log } = await lauf(i);
    expect(status).toBe(200);
    expect(rumpf).toEqual({ ergebnis: 'passed' });
    expect(i.eintragen).toHaveBeenCalledWith(DATEI, {
      content_type_ok: true,
      checksum_ok: true,
      metadata_ok: true,
    });
    expect(log).toEqual([{ dateiId: DATEI, klasse: 'passed', dauerMs: expect.any(Number) }]);
  });

  it('meldet einen Befund, ohne die Bytes anzufassen (Punkt 52)', async () => {
    const original = jpegVomHandy(6);
    const i = instanz({
      objekt: vi.fn().mockResolvedValue({ ok: true, wert: original }),
      eintragen: vi.fn().mockResolvedValue({ ok: true, wert: 'rejected' }),
    });
    const { rumpf } = await lauf(i);
    expect(rumpf).toEqual({ ergebnis: 'rejected' });
    expect(i.eintragen).toHaveBeenCalledWith(DATEI, {
      content_type_ok: true,
      checksum_ok: false,
      metadata_ok: false,
    });
    // Die Function schreibt nur das Ergebnis - kein Upload, kein Ueberschreiben.
    expect(Object.keys(i)).not.toContain('hochladen');
  });

  it('prueft nichts ohne Sitzung', async () => {
    const i = instanz({ person: vi.fn().mockResolvedValue({ ok: true, wert: null }) });
    const { status, rumpf } = await lauf(i);
    expect(status).toBe(401);
    expect(rumpf.ergebnis).toBe('session_rejected');
    expect(i.ankuendigung).not.toHaveBeenCalled();
  });

  it('behandelt eine fremde oder unbestaetigte Datei als nicht gefunden', async () => {
    const i = instanz({ ankuendigung: vi.fn().mockResolvedValue({ ok: true, wert: null }) });
    const { status, rumpf } = await lauf(i);
    expect(status).toBe(404);
    expect(rumpf.ergebnis).toBe('not_found');
    expect(i.objekt).not.toHaveBeenCalled();
  });

  it('liest eine schon gepruefte Datei nicht noch einmal', async () => {
    const i = instanz({
      ankuendigung: vi.fn(async () => ({
        ok: true as const,
        wert: await ankuendigung({ already_verified: true }),
      })),
    });
    const { rumpf } = await lauf(i);
    expect(rumpf.ergebnis).toBe('already_verified');
    expect(i.objekt).not.toHaveBeenCalled();
    expect(i.eintragen).not.toHaveBeenCalled();
  });

  it('antwortet ohne Einrichtung mit not_configured', async () => {
    const { status, rumpf } = await lauf(null);
    expect(status).toBe(503);
    expect(rumpf.ergebnis).toBe('not_configured');
  });

  it('weist eine Anfrage ohne gueltige Datei-Kennung oder mit falscher Methode ab', async () => {
    expect((await lauf(instanz(), anfrage({ file_id: 'x' }))).status).toBe(400);
    expect((await lauf(instanz(), anfrage({}))).status).toBe(400);
    expect((await lauf(instanz(), anfrage(undefined, 'GET'))).status).toBe(405);
  });

  it('meldet einen Fehler der Instanz als Klasse, ohne Inhalt', async () => {
    const i = instanz({ objekt: vi.fn().mockResolvedValue({ ok: false }) });
    const { status, rumpf, log } = await lauf(i);
    expect(status).toBe(502);
    expect(rumpf).toEqual({ ergebnis: 'instance_error' });
    expect(JSON.stringify(log)).not.toContain(SCHLUESSEL);
  });
});
