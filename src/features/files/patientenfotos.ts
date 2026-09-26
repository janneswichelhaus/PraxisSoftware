import { z } from 'zod';
import { getSupabase } from '@/lib/supabase';
import { ladeDateiHoch } from './api';

/**
 * Datenzugriff auf die Fotos einer Patient:in (DOK-006, ADR-017 Abschnitt G).
 *
 * Ein Patientenfoto ist eine Datei wie jede andere und nimmt denselben
 * Upload-Weg (`ladeDateiHoch`: zwei Phasen, Metadaten entfernt). Anders ist,
 * wie es **angezeigt** wird (Punkt 40):
 *
 *   * **Kein Downloadname.** Der Verweis wird ohne `download` signiert; die
 *     Antwort käme sonst als Anhang und läge im Download-Ordner des Handys.
 *   * **Kein Fenster auf den Verweis.** Die Anwendung lädt die Bytes selbst,
 *     mit `cache: 'no-store'` — der Browser liest die Antwort nicht aus seinem
 *     Zwischenspeicher und legt sie dort nicht ab —, und zeigt sie aus einer
 *     Objekt-URL, die die Ansicht beim Schließen freigibt.
 *   * **Ein Verweis je bewusstem Öffnen**, nie für die Liste (Punkt 15). Jede
 *     Ausstellung ist ein Auditeintrag (Punkt 20); der Vergleich zweier Fotos
 *     sind zwei (Punkt 39).
 *
 * Ob ein Foto (noch) nutzbar ist, entscheidet die Datenbank:
 * `app.patient_photo_accessible` fragt Einwilligung und Frist auf allen Wegen
 * (Punkt 36). Diese Datei blendet nichts aus.
 */

const fotoSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  taken_at: z.string(),
  taken_by_name: z.string().nullable(),
  delete_after: z.string(),
  object_missing: z.boolean(),
});

export type Patientenfoto = z.infer<typeof fotoSchema>;

export async function fetchPatientenfotos(patientId: string): Promise<Patientenfoto[]> {
  const { data, error } = (await getSupabase().rpc('list_patient_photos', {
    p_patient_id: patientId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Fotos konnten nicht geladen werden.');
  return z.array(fotoSchema).parse(data ?? []);
}

/**
 * Nimmt ein Foto aus dem Kameradialog in die Akte auf.
 *
 * Der einzige Weg zu einem Patientenfoto (Punkt 33): Der Aufrufer bekommt das
 * Bild aus dem Kameradialog, nie aus einem Dateiwähler. Ob die Einwilligung
 * vorliegt, prüft der Server bei der Vorbereitung und noch einmal bei der
 * Bestätigung.
 */
export async function speicherePatientenfoto(auftrag: {
  patientId: string;
  anzeigename: string;
  foto: Blob;
}): Promise<string> {
  try {
    return await ladeDateiHoch({
      patientId: auftrag.patientId,
      grundlageId: null,
      documentType: 'patientenfoto',
      displayName: auftrag.anzeigename,
      datei: auftrag.foto,
    });
  } catch (ursache) {
    // Die Meldungen des Upload-Wegs sprechen von „Datei"; hier geht es um ein
    // Foto, und der häufigste Grund ist die fehlende Einwilligung.
    const meldung = (ursache as Error).message;
    if (meldung.includes('Berechtigung')) {
      throw new Error(
        'Das Foto konnte nicht gespeichert werden. Liegt die Einwilligung vor, ist die Versorgung nicht seit mehr als drei Monaten abgeschlossen, und darf Ihre Rolle Fotos aufnehmen?',
      );
    }
    throw ursache;
  }
}

const verweisSchema = z.object({
  bucket_id: z.string(),
  object_key: z.string(),
});

/** Gültigkeit eines signierten Verweises in Sekunden (ADR-017 Punkt 15). */
const VERWEIS_GUELTIGKEIT_SEKUNDEN = 60;

/**
 * Lädt ein Foto zum Ansehen — in den Arbeitsspeicher, nicht auf das Gerät.
 *
 * Liefert die Bytes; die Ansicht macht daraus eine Objekt-URL und gibt sie
 * beim Schließen frei. Der signierte Verweis verlässt diese Funktion nicht.
 */
export async function ladePatientenfoto(fileId: string): Promise<Blob> {
  const { data, error } = (await getSupabase().rpc('issue_patient_file_link', {
    p_file_id: fileId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Das Foto konnte nicht geöffnet werden. Ist es noch freigegeben?');
  const verweis = z.array(verweisSchema).parse(data ?? [])[0];
  if (!verweis) throw new Error('Das Foto konnte nicht geöffnet werden.');

  // Bewusst ohne `download`: kein Anhang, kein Downloadname (Punkt 40).
  const { data: signiert, error: signaturFehler } = await getSupabase()
    .storage.from(verweis.bucket_id)
    .createSignedUrl(verweis.object_key, VERWEIS_GUELTIGKEIT_SEKUNDEN);

  if (signaturFehler || !signiert?.signedUrl) {
    throw new Error('Das Foto ist in der Ablage nicht auffindbar.');
  }

  const antwort = await fetch(signiert.signedUrl, { cache: 'no-store' });
  if (!antwort.ok) throw new Error('Das Foto konnte nicht geladen werden.');
  return antwort.blob();
}

const herausgabeSchema = z.object({
  bucket_id: z.string(),
  object_key: z.string(),
  display_name: z.string(),
});

/**
 * Die Kopie eines Fotos für die Person selbst (DOK-006d, ADR-017 Punkt 40).
 *
 * Der einzige Weg, auf dem ein Patientenfoto die Anwendung verlässt: nach
 * Art. 15 Abs. 3 und Art. 20 DSGVO, durch `owner`, als Einzeldatei, im
 * Protokoll als `patient_file.handed_out` (ANN-128). Den Dateinamen setzt die
 * Seite beim Sichern; der Verweis selbst bleibt ohne Downloadnamen.
 */
export async function gibPatientenfotoHeraus(
  fileId: string,
): Promise<{ name: string; bild: Blob }> {
  const { data, error } = (await getSupabase().rpc('hand_out_patient_photo', {
    p_file_id: fileId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Das Foto konnte nicht herausgegeben werden. Fehlt die Berechtigung?');
  const freigabe = z.array(herausgabeSchema).parse(data ?? [])[0];
  if (!freigabe) throw new Error('Das Foto konnte nicht herausgegeben werden.');

  const { data: signiert, error: signaturFehler } = await getSupabase()
    .storage.from(freigabe.bucket_id)
    .createSignedUrl(freigabe.object_key, VERWEIS_GUELTIGKEIT_SEKUNDEN);

  if (signaturFehler || !signiert?.signedUrl) {
    throw new Error('Das Foto ist in der Ablage nicht auffindbar.');
  }

  const antwort = await fetch(signiert.signedUrl, { cache: 'no-store' });
  if (!antwort.ok) throw new Error('Das Foto konnte nicht geladen werden.');
  return { name: freigabe.display_name, bild: await antwort.blob() };
}

/** Ein Dateiname aus dem Anzeigenamen: nur Buchstaben, Ziffern und wenige Zeichen. */
export function herausgabeDateiname(anzeigename: string): string {
  const sauber = anzeigename
    .normalize('NFC')
    .replace(/[^\p{L}\p{N} ._-]+/gu, '_')
    .trim()
    .slice(0, 120);
  return `${sauber || 'Foto'}.jpg`;
}
