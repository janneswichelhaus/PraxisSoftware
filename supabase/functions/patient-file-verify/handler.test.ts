// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { entferneMetadaten } from '../../../src/lib/dateien/metadaten';
import { CHROMIUM_PNG, basis, jpegVomHandy } from '../../../src/lib/dateien/testbilder';
import { erstelleHandler } from './handler';
import type { Instanz } from './instanz';
import { sha256 } from './pruefung';
import { bereinigeTon, bereinigeVideo } from '../../../src/features/platform/videometadaten';
import { alleBytes } from '../../../src/lib/dateien/metadaten';
import { webmAusChromium } from '../../../src/features/platform/testvideos';
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
    expect(i.eintragen).toHaveBeenCalledWith(
      DATEI,
      { content_type_ok: true, checksum_ok: true, metadata_ok: true },
      'datei',
    );
    expect(log).toHaveLength(1);
    expect(log[0]).toMatchObject({ dateiId: DATEI, klasse: 'passed' });
    expect(typeof log[0]!.dauerMs).toBe('number');
  });

  it('meldet einen Befund, ohne die Bytes anzufassen (Punkt 52)', async () => {
    const original = jpegVomHandy(6);
    const i = instanz({
      objekt: vi.fn().mockResolvedValue({ ok: true, wert: original }),
      eintragen: vi.fn().mockResolvedValue({ ok: true, wert: 'rejected' }),
    });
    const { rumpf } = await lauf(i);
    expect(rumpf).toEqual({ ergebnis: 'rejected' });
    expect(i.eintragen).toHaveBeenCalledWith(
      DATEI,
      { content_type_ok: true, checksum_ok: false, metadata_ok: false },
      'datei',
    );
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

  it('beantwortet den Preflight des Browsers und traegt CORS an jeder Antwort', async () => {
    const handler = erstelleHandler({ instanz: instanz(), protokolliere: () => undefined });
    const vorab = await handler(
      new Request('http://localhost/functions/v1/patient-file-verify', { method: 'OPTIONS' }),
    );
    expect(vorab.status).toBe(204);
    expect(vorab.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    const antwort = await handler(anfrage());
    expect(antwort.headers.get('Access-Control-Allow-Origin')).toBe('*');
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

  it('prueft einen Anhang an einer Rueckfrage mit eigenen Datenbankfunktionen (KOM-006)', async () => {
    const ergebnis = await bereinigeVideo(
      new Blob([webmAusChromium() as BlobPart], { type: 'video/webm' }),
    );
    if (!ergebnis.ok) throw new Error('Testvideo');
    const video = await alleBytes(ergebnis.video);
    const i = instanz({
      ankuendigung: vi.fn(async () => ({
        ok: true as const,
        wert: await ankuendigung({
          bucket_id: 'rueckfrageanhang',
          mime_type: 'video/webm',
          byte_size: video.length,
          checksum_sha256: await sha256(video),
        }),
      })),
      objekt: vi.fn().mockResolvedValue({ ok: true, wert: video }),
    });
    const { rumpf } = await lauf(i, anfrage({ attachment_id: DATEI }));
    expect(rumpf).toEqual({ ergebnis: 'passed' });
    expect(i.ankuendigung).toHaveBeenCalledWith(DATEI, PERSON, 'anhang');
    expect(i.eintragen).toHaveBeenCalledWith(
      DATEI,
      { content_type_ok: true, checksum_ok: true, metadata_ok: true, no_audio_ok: true },
      'anhang',
    );
  });

  it('ein Anhang mit Ton oder Programmangabe ist ein Befund (Punkte 63, 64)', async () => {
    const roh = webmAusChromium({ ton: true });
    const i = instanz({
      ankuendigung: vi.fn(async () => ({
        ok: true as const,
        wert: await ankuendigung({
          bucket_id: 'rueckfrageanhang',
          mime_type: 'video/webm',
          byte_size: roh.length,
          checksum_sha256: await sha256(roh),
        }),
      })),
      objekt: vi.fn().mockResolvedValue({ ok: true, wert: roh }),
      eintragen: vi.fn().mockResolvedValue({ ok: true, wert: 'rejected' }),
    });
    await lauf(i, anfrage({ attachment_id: DATEI }));
    expect(i.eintragen).toHaveBeenCalledWith(
      DATEI,
      { content_type_ok: true, checksum_ok: true, metadata_ok: false, no_audio_ok: false },
      'anhang',
    );
  });

  it('nimmt genau eine Kennung an: Datei oder Anhang', async () => {
    expect((await lauf(instanz(), anfrage({ file_id: DATEI, attachment_id: DATEI }))).status).toBe(
      400,
    );
    expect((await lauf(instanz(), anfrage({ attachment_id: 'x' }))).status).toBe(400);
  });

  it('prueft ein Foto am Rad wie ein Patientenfoto, mit eigenen Datenbankfunktionen (FLT-002)', async () => {
    const i = instanz({
      ankuendigung: vi.fn(async () => ({
        ok: true as const,
        wert: await ankuendigung({ bucket_id: 'radflotte' }),
      })),
    });
    const { status, rumpf, log } = await lauf(i, anfrage({ photo_id: DATEI }));
    expect(status).toBe(200);
    expect(rumpf).toEqual({ ergebnis: 'passed' });
    expect(i.ankuendigung).toHaveBeenCalledWith(DATEI, PERSON, 'radfoto');
    expect(i.objekt).toHaveBeenCalledWith('radflotte', SCHLUESSEL);
    // Keine Tonspurfrage: ein Foto ist kein Video.
    expect(i.eintragen).toHaveBeenCalledWith(
      DATEI,
      { content_type_ok: true, checksum_ok: true, metadata_ok: true },
      'radfoto',
    );
    expect(log).toEqual([expect.objectContaining({ dateiId: DATEI, klasse: 'passed' })]);
  });

  it('ein Foto am Rad mit Aufnahmemetadaten oder in einem anderen Format ist ein Befund (ANN-552)', async () => {
    const handy = jpegVomHandy(6);
    const png = basis(CHROMIUM_PNG);
    for (const [bytes, erwartet] of [
      [handy, { content_type_ok: true, checksum_ok: true, metadata_ok: false }],
      [png, { content_type_ok: false, checksum_ok: true, metadata_ok: false }],
    ] as const) {
      const i = instanz({
        ankuendigung: vi.fn(async () => ({
          ok: true as const,
          wert: await ankuendigung({
            bucket_id: 'radflotte',
            byte_size: bytes.length,
            checksum_sha256: await sha256(bytes),
          }),
        })),
        objekt: vi.fn().mockResolvedValue({ ok: true, wert: bytes }),
        eintragen: vi.fn().mockResolvedValue({ ok: true, wert: 'rejected' }),
      });
      const { rumpf } = await lauf(i, anfrage({ photo_id: DATEI }));
      expect(rumpf).toEqual({ ergebnis: 'rejected' });
      expect(i.eintragen).toHaveBeenCalledWith(DATEI, erwartet, 'radfoto');
    }
  });

  it('prueft einen Beleg wie eine Datei der Akte, mit eigenen Datenbankfunktionen (ERS-001)', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7\n1 0 obj<<>>endobj\n%%EOF');
    for (const [mime, bytes, erwartet] of [
      ['image/jpeg', BILD, { content_type_ok: true, checksum_ok: true, metadata_ok: true }],
      // Ein PDF bekommt keine Metadatenfrage (Punkt 49) - wie in der Akte.
      ['application/pdf', pdf, { content_type_ok: true, checksum_ok: true, metadata_ok: null }],
    ] as const) {
      const i = instanz({
        ankuendigung: vi.fn(async () => ({
          ok: true as const,
          wert: await ankuendigung({
            bucket_id: 'erstattungsbelege',
            mime_type: mime,
            byte_size: bytes.length,
            checksum_sha256: await sha256(bytes),
          }),
        })),
        objekt: vi.fn().mockResolvedValue({ ok: true, wert: bytes }),
      });
      const { status, rumpf } = await lauf(i, anfrage({ receipt_id: DATEI }));
      expect(status).toBe(200);
      expect(rumpf).toEqual({ ergebnis: 'passed' });
      expect(i.ankuendigung).toHaveBeenCalledWith(DATEI, PERSON, 'beleg');
      expect(i.objekt).toHaveBeenCalledWith('erstattungsbelege', SCHLUESSEL);
      expect(i.eintragen).toHaveBeenCalledWith(DATEI, erwartet, 'beleg');
    }
  });

  it('prueft einen Anhang im Teamchat wie eine Datei der Akte, eine Sprachnachricht an ihrer Struktur (TEAM-003, TEAM-004)', async () => {
    const pdf = new TextEncoder().encode('%PDF-1.7\n1 0 obj<<>>endobj\n%%EOF');
    const aufnahme = await bereinigeTon(
      new Blob([webmAusChromium({ bild: false, ton: true }) as BlobPart], { type: 'audio/webm' }),
    );
    if (!aufnahme.ok) throw new Error(aufnahme.grund);
    const ton = await alleBytes(aufnahme.ton);
    for (const [mime, bytes, erwartet] of [
      ['image/jpeg', BILD, { content_type_ok: true, checksum_ok: true, metadata_ok: true }],
      ['application/pdf', pdf, { content_type_ok: true, checksum_ok: true, metadata_ok: null }],
      ['audio/webm', ton, { content_type_ok: true, checksum_ok: true, metadata_ok: true }],
    ] as const) {
      const i = instanz({
        ankuendigung: vi.fn(async () => ({
          ok: true as const,
          wert: await ankuendigung({
            bucket_id: 'teamchat',
            mime_type: mime,
            byte_size: bytes.length,
            checksum_sha256: await sha256(bytes),
          }),
        })),
        objekt: vi.fn().mockResolvedValue({ ok: true, wert: bytes }),
      });
      const { status, rumpf } = await lauf(i, anfrage({ team_attachment_id: DATEI }));
      expect(status).toBe(200);
      expect(rumpf).toEqual({ ergebnis: 'passed' });
      expect(i.ankuendigung).toHaveBeenCalledWith(DATEI, PERSON, 'teamanhang');
      expect(i.objekt).toHaveBeenCalledWith('teamchat', SCHLUESSEL);
      expect(i.eintragen).toHaveBeenCalledWith(DATEI, erwartet, 'teamanhang');
    }
  });

  it('nimmt genau eine Kennung an: Datei, Anhang, Foto am Rad, Beleg oder Anhang im Teamchat', async () => {
    for (const rumpf of [
      { file_id: DATEI, photo_id: DATEI },
      { attachment_id: DATEI, photo_id: DATEI },
      { file_id: DATEI, attachment_id: DATEI, photo_id: DATEI },
      { photo_id: 'x' },
      { photo_id: 42 },
      { photo_id: DATEI, attachment_id: null },
      { receipt_id: DATEI, photo_id: DATEI },
      { receipt_id: DATEI, file_id: DATEI },
      { receipt_id: 'x' },
      { receipt_id: DATEI, attachment_id: null },
      { team_attachment_id: DATEI, receipt_id: DATEI },
      { team_attachment_id: DATEI, attachment_id: DATEI },
      { team_attachment_id: 'x' },
      { team_attachment_id: DATEI, file_id: null },
    ]) {
      const i = instanz();
      expect((await lauf(i, anfrage(rumpf))).status, JSON.stringify(rumpf)).toBe(400);
      expect(i.person).not.toHaveBeenCalled();
    }
  });
});
