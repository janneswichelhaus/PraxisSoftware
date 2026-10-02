import { describe, expect, it, vi } from 'vitest';
import { erstelleInstanz, fehlendeEinrichtung } from './instanz';

/**
 * Der Draht zur eigenen Instanz (ABN-025): welche Adresse, welcher Schlüssel,
 * welche Antwort. `abrufen` ist eingesetzt.
 */

const EINRICHTUNG = {
  supabaseUrl: 'http://127.0.0.1:54321/',
  dienstKey: 'dienst-schluessel',
  anonKey: 'oeffentlich',
};
const DATEI = '0a0a0a0a-0a0a-4a0a-8a0a-0a0a0a0a0a0a';
const PERSON = '11111111-1111-4111-8111-000000000002';

function abruf(antwort: Response) {
  return vi.fn<typeof fetch>().mockResolvedValue(antwort);
}

describe('Instanz', () => {
  it('nennt fehlende Einrichtung beim Namen, ohne Werte', () => {
    expect(fehlendeEinrichtung({ supabaseUrl: '', dienstKey: '', anonKey: 'x' })).toEqual([
      'SUPABASE_URL',
      'PATIENT_FILE_VERIFY_SERVICE_KEY',
    ]);
  });

  it('prueft die Sitzung mit dem Token der Person und dem oeffentlichen Schluessel', async () => {
    const f = abruf(Response.json({ id: PERSON }));
    const ergebnis = await erstelleInstanz(EINRICHTUNG, f).person('Bearer abc');
    expect(ergebnis).toEqual({ ok: true, wert: PERSON });
    const [adresse, optionen] = f.mock.calls[0]!;
    expect(adresse).toBe('http://127.0.0.1:54321/auth/v1/user');
    expect(optionen?.headers).toEqual({ Authorization: 'Bearer abc', apikey: 'oeffentlich' });
  });

  it('kennt ohne Token und bei abgelehnter Sitzung niemanden', async () => {
    const f = abruf(new Response('', { status: 401 }));
    const instanz = erstelleInstanz(EINRICHTUNG, f);
    expect(await instanz.person(null)).toEqual({ ok: true, wert: null });
    expect(f).not.toHaveBeenCalled();
    expect(await instanz.person('Bearer abc')).toEqual({ ok: true, wert: null });
  });

  it('holt die Ankuendigung mit dem Dienstschluessel', async () => {
    const f = abruf(
      Response.json([
        {
          bucket_id: 'patientenakte',
          object_key: 'a/b/c',
          mime_type: 'application/pdf',
          byte_size: '42',
          checksum_sha256: 'e'.repeat(64),
          already_verified: false,
        },
      ]),
    );
    const ergebnis = await erstelleInstanz(EINRICHTUNG, f).ankuendigung(DATEI, PERSON);
    expect(ergebnis.ok && ergebnis.wert?.byte_size).toBe(42);
    const [adresse, optionen] = f.mock.calls[0]!;
    expect(adresse).toBe('http://127.0.0.1:54321/rest/v1/rpc/patient_file_for_verification');
    expect(optionen?.headers).toMatchObject({ Authorization: 'Bearer dienst-schluessel' });
    expect(JSON.parse(optionen?.body as string)).toEqual({ p_file_id: DATEI, p_user_id: PERSON });
  });

  it('liest das Objekt ueber die Storage-API', async () => {
    const f = abruf(new Response(new Uint8Array([1, 2, 3])));
    const ergebnis = await erstelleInstanz(EINRICHTUNG, f).objekt('patientenakte', 'org/pat/datei');
    expect(ergebnis).toEqual({ ok: true, wert: new Uint8Array([1, 2, 3]) });
    expect(f.mock.calls[0]![0]).toBe(
      'http://127.0.0.1:54321/storage/v1/object/patientenakte/org/pat/datei',
    );
  });

  it('traegt das Ergebnis ein und nimmt nur bekannte Antworten an', async () => {
    const instanz = erstelleInstanz(EINRICHTUNG, abruf(Response.json('rejected')));
    expect(
      await instanz.eintragen(DATEI, {
        content_type_ok: true,
        checksum_ok: false,
        metadata_ok: null,
      }),
    ).toEqual({ ok: true, wert: 'rejected' });
    const unbekannt = erstelleInstanz(EINRICHTUNG, abruf(Response.json('irgendwas')));
    expect(
      await unbekannt.eintragen(DATEI, {
        content_type_ok: true,
        checksum_ok: true,
        metadata_ok: null,
      }),
    ).toEqual({ ok: false });
  });

  it('macht aus einem Netzfehler eine Fehlerklasse', async () => {
    const f = vi.fn<typeof fetch>().mockRejectedValue(new Error('weg'));
    expect(await erstelleInstanz(EINRICHTUNG, f).objekt('b', 'k')).toEqual({ ok: false });
  });
});
