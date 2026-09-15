import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import {
  KONTEN,
  PATIENTEN,
  anmelden,
  rpcAufrufen,
  supabaseKonfiguration,
  zugriffstoken,
} from './helpers';

/**
 * BEF-004: Dateien nur ueber den auditierten Weg - gegen die echte Storage-API.
 *
 * Browser/Client → Storage-API → RLS auf `storage.objects`, nichts gestubbt.
 * Geprueft wird, was ein angemeldetes Praxiskonto mit einem bekannten
 * Objektschluessel an der Anwendung vorbei versuchen kann: signieren, laden,
 * auflisten, loeschen. Den Schluessel liefert hier `prepare_patient_file_upload`
 * - dieselbe Kette aus Organisation, Bezug und Datei-ID, die jede Rolle aus der
 * Dateiliste zusammensetzen kann (BEF-004).
 *
 * Vorgesehen bleibt: Ein ueber `issue_patient_file_link` ausgestellter Zugriff
 * ergibt einen signierten Verweis, und dieser Verweis funktioniert seine
 * 60 Sekunden lang (ADR-017 Punkt 15). Alle Inhalte sind synthetisch
 * (PROJECT_PRINCIPLES.md 3.1).
 */
test.describe.configure({ mode: 'serial' });

const LAUF = Date.now();
const BUCKET = 'patientenakte';
const INHALT = Buffer.from(`%PDF-1.4\n% Synthetischer Testinhalt ${LAUF}\n%%EOF\n`);

function kopf(token: string, typ = 'application/json'): Record<string, string> {
  const { anonKey } = supabaseKonfiguration();
  return { apikey: anonKey, Authorization: `Bearer ${token}`, 'Content-Type': typ };
}

function storage(pfad: string): string {
  return `${supabaseKonfiguration().url}/storage/v1${pfad}`;
}

interface Datei {
  fileId: string;
  objectKey: string;
  name: string;
}

/** Legt eine klinische Datei an Max Mustermann ab - als Therapeutin, ueber die Anwendungswege. */
async function dateiAblegen(request: APIRequestContext, name: string): Promise<Datei> {
  const token = await zugriffstoken(request, KONTEN.therapist);
  const vorbereitet = await rpcAufrufen(request, token, 'prepare_patient_file_upload', {
    p_patient_id: PATIENTEN.max,
    p_prescription_id: null,
    p_document_type: 'befund',
    p_display_name: name,
    p_mime_type: 'application/pdf',
    p_byte_size: INHALT.length,
    p_checksum_sha256: 'a'.repeat(64),
  });
  expect(vorbereitet.status(), 'Upload vorbereiten').toBe(200);
  const [zeile] = (await vorbereitet.json()) as { file_id: string; object_key: string }[];

  const hochgeladen = await request.post(storage(`/object/${BUCKET}/${zeile!.object_key}`), {
    headers: { ...kopf(token, 'application/pdf'), 'x-upsert': 'false', 'cache-control': '0' },
    data: INHALT,
  });
  expect(hochgeladen.status(), 'Objekt hochladen').toBe(200);

  const bestaetigt = await rpcAufrufen(request, token, 'confirm_patient_file_upload', {
    p_file_id: zeile!.file_id,
  });
  expect(bestaetigt.status(), 'Upload bestaetigen').toBeLessThan(300);

  return { fileId: zeile!.file_id, objectKey: zeile!.object_key, name };
}

function signieren(request: APIRequestContext, token: string, key: string): Promise<APIResponse> {
  return request.post(storage(`/object/sign/${BUCKET}/${key}`), {
    headers: kopf(token),
    data: { expiresIn: 60 },
  });
}

function laden(request: APIRequestContext, token: string, key: string): Promise<APIResponse> {
  return request.get(storage(`/object/authenticated/${BUCKET}/${key}`), { headers: kopf(token) });
}

function auflisten(
  request: APIRequestContext,
  token: string,
  praefix: string,
): Promise<APIResponse> {
  return request.post(storage(`/object/list/${BUCKET}`), {
    headers: kopf(token),
    data: { prefix: praefix, limit: 100, offset: 0 },
  });
}

function entfernen(request: APIRequestContext, token: string, key: string): Promise<APIResponse> {
  return request.delete(storage(`/object/${BUCKET}`), {
    headers: kopf(token),
    data: { prefixes: [key] },
  });
}

test.describe('BEF-004: Storage-API am auditierten Weg vorbei', () => {
  test('verweigert Signieren, Laden und Auflisten ohne ausgestellten Verweis', async ({
    request,
  }) => {
    const datei = await dateiAblegen(request, `BEF-004 ohne Verweis ${LAUF}.pdf`);
    const praefix = datei.objectKey.split('/').slice(0, 2).join('/');

    for (const konto of [KONTEN.therapist, KONTEN.office, KONTEN.owner]) {
      const token = await zugriffstoken(request, konto);

      const signiert = await signieren(request, token, datei.objectKey);
      expect(signiert.status(), `${konto} signiert ohne Verweis`).not.toBe(200);

      const geladen = await laden(request, token, datei.objectKey);
      expect(geladen.status(), `${konto} laedt ohne Verweis`).not.toBe(200);

      const liste = await auflisten(request, token, praefix);
      expect(await liste.text(), `${konto} listet ohne Verweis`).not.toContain(datei.fileId);
    }
  });

  test('gibt je Ausstellung genau einen signierten Verweis, der seine 60 Sekunden haelt', async ({
    request,
  }) => {
    const datei = await dateiAblegen(request, `BEF-004 mit Verweis ${LAUF}.pdf`);
    const token = await zugriffstoken(request, KONTEN.office);

    const ausgestellt = await rpcAufrufen(request, token, 'issue_patient_file_link', {
      p_file_id: datei.fileId,
    });
    expect(ausgestellt.status(), 'Ausstellung ueber die Anwendung').toBe(200);

    const signiert = await signieren(request, token, datei.objectKey);
    expect(signiert.status(), 'der eine vorgesehene Verweis').toBe(200);
    const { signedURL } = (await signiert.json()) as { signedURL: string };

    // Vorgesehene Nutzung: der ausgestellte Verweis gilt seine 60 Sekunden,
    // auch fuer ein erneutes Laden.
    for (let versuch = 1; versuch <= 2; versuch += 1) {
      const inhalt = await request.get(storage(signedURL));
      expect(inhalt.status(), `Laden ueber den Verweis, Versuch ${versuch}`).toBe(200);
      expect(Buffer.from(await inhalt.body()).equals(INHALT)).toBe(true);
    }

    // Nach dem erlaubten Oeffnen ist der Schluessel bekannt - er allein
    // oeffnet nichts mehr.
    const zweiter = await signieren(request, token, datei.objectKey);
    expect(zweiter.status(), 'zweiter Verweis ohne neue Ausstellung').not.toBe(200);
    const direkt = await laden(request, token, datei.objectKey);
    expect(direkt.status(), 'direktes Laden nach dem Oeffnen').not.toBe(200);

    const erneut = await rpcAufrufen(request, token, 'issue_patient_file_link', {
      p_file_id: datei.fileId,
    });
    expect(erneut.status()).toBe(200);
    expect((await signieren(request, token, datei.objectKey)).status()).toBe(200);
  });

  test('kopiert ohne Ausstellung kein Objekt in eine eigene Ablage', async ({ request }) => {
    const quelle = await dateiAblegen(request, `BEF-004 Kopierquelle ${LAUF}.pdf`);
    const token = await zugriffstoken(request, KONTEN.therapist);

    // Ein eigenes, noch nicht bestaetigtes Ziel: dorthin darf die Therapeutin
    // hochladen. Die Storage-API liest die Quelle beim Kopieren mit ihrer Rolle.
    const ziel = await rpcAufrufen(request, token, 'prepare_patient_file_upload', {
      p_patient_id: PATIENTEN.max,
      p_prescription_id: null,
      p_document_type: 'befund',
      p_display_name: `BEF-004 Kopierziel ${LAUF}.pdf`,
      p_mime_type: 'application/pdf',
      p_byte_size: INHALT.length,
      p_checksum_sha256: 'a'.repeat(64),
    });
    expect(ziel.status()).toBe(200);
    const [zeile] = (await ziel.json()) as { object_key: string }[];

    const kopiert = await request.post(storage('/object/copy'), {
      headers: kopf(token),
      data: { bucketId: BUCKET, sourceKey: quelle.objectKey, destinationKey: zeile!.object_key },
    });
    expect(kopiert.status(), 'Kopieren ohne Ausstellung').not.toBe(200);
  });

  test('entfernt das Objekt eines Loeschauftrags nur mit Loeschfreigabe', async ({ request }) => {
    const datei = await dateiAblegen(request, `BEF-004 Loeschen ${LAUF}.pdf`);
    const therapeutin = await zugriffstoken(request, KONTEN.therapist);
    const geloescht = await rpcAufrufen(request, therapeutin, 'delete_patient_file', {
      p_file_id: datei.fileId,
    });
    expect(geloescht.status()).toBeLessThan(300);

    const inhaberin = await zugriffstoken(request, KONTEN.owner);
    expect((await signieren(request, inhaberin, datei.objectKey)).status()).not.toBe(200);
    const ohneFreigabe = await entfernen(request, inhaberin, datei.objectKey);
    expect(await ohneFreigabe.json(), 'Entfernen ohne Loeschfreigabe').toEqual([]);

    // Den Auftrag zu diesem Objekt finden: die Liste traegt keinen Schluessel,
    // erst die Freigabe nennt ihn.
    const offen = await rpcAufrufen(request, inhaberin, 'list_storage_deletion_orders', {});
    const auftraege = (await offen.json()) as { id: string; object_present: boolean }[];
    let auftragId: string | undefined;
    for (const auftrag of auftraege.filter((a) => a.object_present)) {
      const freigabe = await rpcAufrufen(request, inhaberin, 'claim_storage_deletion_order', {
        p_order_id: auftrag.id,
      });
      const [schluessel] = (await freigabe.json()) as { object_key: string }[];
      if (schluessel?.object_key === datei.objectKey) {
        auftragId = auftrag.id;
        break;
      }
    }
    expect(auftragId, 'offener Auftrag zur Datei').toBeDefined();

    const mitFreigabe = await entfernen(request, inhaberin, datei.objectKey);
    expect(mitFreigabe.status()).toBe(200);
    expect(((await mitFreigabe.json()) as unknown[]).length).toBe(1);

    const quittung = await rpcAufrufen(request, inhaberin, 'receipt_storage_deletion_order', {
      p_order_id: auftragId,
    });
    expect(quittung.status(), 'Quittung').toBeLessThan(300);
  });

  test('oeffnet eine Datei aus der Akte weiterhin', async ({ page, request }) => {
    const datei = await dateiAblegen(request, `BEF-004 Oeffnen ${LAUF}.pdf`);

    await anmelden(page, KONTEN.therapist);
    await page.goto(`/patienten/${PATIENTEN.max}/dateien`);

    const zeile = page.getByRole('listitem').filter({ hasText: datei.name });
    await expect(zeile).toBeVisible();

    const neueSeite = page.context().waitForEvent('page');
    await zeile.getByRole('button', { name: 'Öffnen' }).click();
    await neueSeite;

    await expect(zeile.getByText('Die Datei ist in der Ablage nicht auffindbar.')).toHaveCount(0);
  });
});
