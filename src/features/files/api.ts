import { z } from 'zod';
import { abgewiesen } from '@/lib/abgewiesen';
import { getSupabase } from '@/lib/supabase';
import { dateiAblehnungsgrund, dateiInhaltAblehnungsgrund } from './dokumentarten';

/**
 * Datenzugriff auf die Dateiablage der Patientenakte (DAT-001, ADR-017).
 *
 * Diese Datei ist die einzige Stelle im Frontend, die mit dem Objektspeicher
 * spricht. Drei Regeln aus dem ADR sind hier verankert und stehen nirgends
 * sonst:
 *
 *   * **Zwei Phasen mit Bestätigung** (Punkt 7). Ohne Phase (a) gäbe es keine
 *     Stelle für die Berechtigungsprüfung, ohne (c) wäre „hochgeladen" eine
 *     Behauptung dieses Browsers.
 *   * **`cacheControl: '0'`** (Punkt 16). Der Standardwert der Bibliothek ist
 *     `3600`, und eine am CDN zwischengespeicherte Antwort kann weiter
 *     ausgeliefert werden, **nachdem das Token abgelaufen ist**. Ohne diese
 *     eine Zeile wäre die Gültigkeit von 60 Sekunden eine Zusage, die der
 *     Cache nicht hält.
 *   * **60 Sekunden, je Zugriff neu, nie auf Vorrat** (Punkt 15). Es gibt
 *     keine Funktion, die Verweise für eine Liste erzeugt — sie wäre der
 *     bequeme Weg an Punkt 21 vorbei.
 *
 * Der Objektschlüssel kommt ausschließlich aus zwei Serverfunktionen und wird
 * nirgends zwischengespeichert (ANN-052).
 */

// -----------------------------------------------------------------------------
// Lesen
// -----------------------------------------------------------------------------

const patientFileSchema = z.object({
  id: z.string(),
  treatment_basis_id: z.string().nullable(),
  document_type: z.string(),
  is_clinical: z.boolean(),
  display_name: z.string(),
  mime_type: z.string(),
  byte_size: z.coerce.number(),
  uploaded_at: z.string().nullable(),
  uploaded_by_name: z.string().nullable(),
  object_missing: z.boolean(),
});

export type PatientFile = z.infer<typeof patientFileSchema>;

export async function fetchPatientFiles(
  patientId: string,
  grundlageId?: string | null,
): Promise<PatientFile[]> {
  const { data, error } = (await getSupabase().rpc('list_patient_files', {
    p_patient_id: patientId,
    p_treatment_basis_id: grundlageId ?? null,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Dateien konnten nicht geladen werden.');
  return z.array(patientFileSchema).parse(data ?? []);
}

// -----------------------------------------------------------------------------
// Hochladen
// -----------------------------------------------------------------------------

const vorbereitetSchema = z.object({
  file_id: z.string(),
  bucket_id: z.string(),
  object_key: z.string(),
});

export interface UploadAuftrag {
  patientId: string;
  grundlageId: string | null;
  documentType: string;
  displayName: string;
  datei: File;
}

/**
 * SHA-256 der Bytes, als Hexstring.
 *
 * Sie wird **vor** dem Hochladen gerechnet und in Phase (a) mitgegeben, damit
 * sie zu genau dieser Fassung gehört. Was sie belegt und was nicht, steht in
 * ANN-053: Die Datenbank sieht die Bytes nie und kann sie nicht nachrechnen —
 * die Summe ist eine festgehaltene Erklärung, kein serverseitig erhobener
 * Messwert. Sie wird zum Nachweis, sobald jemand sie gegen eine zweite Messung
 * hält (ADR-017 Punkt 9).
 */
async function pruefsumme(datei: Blob): Promise<string> {
  const bytes = await datei.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Der vollständige Weg aus ADR-017 Punkt 7 — und der einzige, auf dem eine
 * Datei in die Akte kommt.
 *
 * Scheitert (b) oder (c), wird die vorbereitete Zeile verworfen. Ohne diesen
 * Rückweg bliebe bei jedem Abbruch eine unsichtbare `pending`-Zeile stehen,
 * bis der tägliche Lauf sie nach 24 Stunden aufräumt — und ein zweiter Versuch
 * liefe ins Leere.
 */
export async function ladeDateiHoch(auftrag: UploadAuftrag): Promise<string> {
  const grund = dateiAblehnungsgrund(auftrag.datei);
  if (grund) throw new Error(grund);

  // Noch vor (a): Passt der Inhalt zum angekündigten Format? Der Typ kommt
  // sonst allein aus der Dateiendung, und Phase (c) vergleicht ihn gegen
  // `metadata.mimetype` — also gegen denselben Wert aus demselben Upload
  // (R3-014). Eine umbenannte Fremddatei fällt erst hier auf.
  const inhaltsGrund = await dateiInhaltAblehnungsgrund(auftrag.datei);
  if (inhaltsGrund) throw new Error(inhaltsGrund);

  const summe = await pruefsumme(auftrag.datei);

  // (a) Berechtigung prüfen, bevor Bytes fließen.
  const { data, error } = (await getSupabase().rpc('prepare_patient_file_upload', {
    p_patient_id: auftrag.patientId,
    p_treatment_basis_id: auftrag.grundlageId,
    p_document_type: auftrag.documentType,
    p_display_name: auftrag.displayName,
    p_mime_type: auftrag.datei.type,
    p_byte_size: auftrag.datei.size,
    p_checksum_sha256: summe,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Datei konnte nicht angenommen werden. Fehlt die Berechtigung?');
  const vorbereitet = z.array(vorbereitetSchema).parse(data ?? [])[0];
  if (!vorbereitet) throw new Error('Die Datei konnte nicht angenommen werden.');

  try {
    // (b) Der Browser lädt unter genau diesem Schlüssel hoch.
    //
    // `upsert: false` und `cacheControl: '0'` sind keine Vorlieben, sondern
    // Punkt 8 und Punkt 16. Ein `upsert: true` liefe ohnehin ins Leere: auf
    // storage.objects gibt es keine UPDATE-Policy.
    const { error: uploadFehler } = await getSupabase()
      .storage.from(vorbereitet.bucket_id)
      .upload(vorbereitet.object_key, auftrag.datei, {
        contentType: auftrag.datei.type,
        cacheControl: '0',
        upsert: false,
      });

    if (uploadFehler) throw new Error('Die Datei konnte nicht übertragen werden.');

    // (c) Serverseitig prüfen und sichtbar machen.
    const { error: bestaetigungsFehler } = (await getSupabase().rpc('confirm_patient_file_upload', {
      p_file_id: vorbereitet.file_id,
    })) as { error: unknown };

    if (bestaetigungsFehler) {
      throw new Error('Die übertragene Datei stimmte nicht mit der angekündigten überein.');
    }
  } catch (fehler) {
    await verwirfVorbereitung(vorbereitet.file_id);
    throw fehler;
  }

  return vorbereitet.file_id;
}

/**
 * Räumt eine vorbereitete Zeile nach einem gescheiterten Upload weg.
 *
 * Bewusst ohne eigenen Fehler: Dieser Aufruf steht im Fehlerpfad. Was der
 * Person angezeigt wird, ist der ursprüngliche Grund — nicht, dass auch noch
 * das Aufräumen misslang. Bleibt die Zeile stehen, verwirft der tägliche Lauf
 * sie nach 24 Stunden.
 */
async function verwirfVorbereitung(fileId: string): Promise<void> {
  try {
    await getSupabase().rpc('discard_patient_file_upload', { p_file_id: fileId });
  } catch {
    // Siehe oben: der ursprüngliche Grund ist die Meldung, nicht dieser hier.
  }
}

// -----------------------------------------------------------------------------
// Öffnen
// -----------------------------------------------------------------------------

const verweisSchema = z.object({
  bucket_id: z.string(),
  object_key: z.string(),
  display_name: z.string(),
  mime_type: z.string(),
});

/** Gültigkeit eines signierten Verweises in Sekunden (ADR-017 Punkt 15). */
const VERWEIS_GUELTIGKEIT_SEKUNDEN = 60;

/**
 * Erzeugt genau einen kurzlebigen Verweis auf genau eine Datei.
 *
 * Zwei Schritte, und die Reihenfolge ist der Punkt: Erst holt
 * `issue_patient_file_link` den Objektschlüssel, protokolliert die Ausstellung
 * (Punkt 20) und legt eine einmalige Freigabe an; dann unterschreibt die
 * Storage-API und verbraucht diese Freigabe (FIX-015, ANN-052). Ohne den ersten
 * Schritt verweigert die Storage-API das Signieren — auch mit bekanntem
 * Schlüssel und auch nach einem früheren Öffnen.
 *
 * Was der Eintrag belegt und was nicht, steht in Punkt 21: Wer den Verweis
 * erzeugt hat, **hatte** den Zugriff. Ob die Bytes geflossen sind, sieht diese
 * Anwendung nicht — die Anfrage läuft zwischen Browser und Anbieter.
 *
 * Der Verweis wird **nicht** zurückgegeben, um ihn irgendwo abzulegen: Er lebt
 * eine Minute, ist nicht widerrufbar (Punkt 17) und gehört deshalb nirgendwo
 * hin außer in genau diesen einen Aufruf.
 */
export async function oeffneDatei(fileId: string): Promise<string> {
  const { data, error } = (await getSupabase().rpc('issue_patient_file_link', {
    p_file_id: fileId,
  })) as { data: unknown; error: unknown };

  if (error) throw new Error('Die Datei konnte nicht geöffnet werden. Fehlt die Berechtigung?');
  const verweis = z.array(verweisSchema).parse(data ?? [])[0];
  if (!verweis) throw new Error('Die Datei konnte nicht geöffnet werden.');

  const { data: signiert, error: signaturFehler } = await getSupabase()
    .storage.from(verweis.bucket_id)
    .createSignedUrl(verweis.object_key, VERWEIS_GUELTIGKEIT_SEKUNDEN, {
      download: verweis.display_name,
    });

  if (signaturFehler || !signiert?.signedUrl) {
    throw new Error('Die Datei ist in der Ablage nicht auffindbar.');
  }

  return signiert.signedUrl;
}

// -----------------------------------------------------------------------------
// Löschen und korrigieren (DAT-002)
// -----------------------------------------------------------------------------

/**
 * Löscht die Zeile. Das Objekt folgt über den Löschauftrag (ADR-017 Punkt 25).
 *
 * Bewusst löscht diese Funktion das Objekt **nicht** gleich mit: Wer die Datei
 * aus der Akte nimmt, ist selten dieselbe Person, die den Objektspeicher
 * aufräumt, und der Nachweis hängt an der Quittung. Was hier passiert, ist die
 * eine Hälfte — und sie ist die, die sofort wirkt.
 */
export async function loescheDatei(fileId: string): Promise<void> {
  const { error } = (await getSupabase().rpc('delete_patient_file', {
    p_file_id: fileId,
  })) as { error: unknown };

  if (error) throw new Error('Die Datei konnte nicht gelöscht werden. Fehlt die Berechtigung?');
}

/**
 * Korrigiert die Dokumentart — und damit, wer die Datei sehen kann.
 *
 * Kein Feld unter vielen: ADR-017 Punkt 13 nennt es ausdrücklich einen
 * protokollierten Vorgang der therapeutischen Rollen, weil es eine
 * Sichtbarkeitsgrenze verschiebt.
 */
export async function korrigiereDokumentart(fileId: string, documentType: string): Promise<void> {
  const { error } = (await getSupabase().rpc('set_patient_file_document_type', {
    p_file_id: fileId,
    p_document_type: documentType,
  })) as { error: unknown };

  if (error) throw new Error('Die Dokumentart konnte nicht geändert werden.');
}

// -----------------------------------------------------------------------------
// Löschaufträge (DAT-002, ADR-017 Punkt 25)
// -----------------------------------------------------------------------------

const loeschauftragSchema = z.object({
  id: z.string(),
  bucket_id: z.string(),
  ordered_at: z.string(),
  object_present: z.boolean(),
});

export type Loeschauftrag = z.infer<typeof loeschauftragSchema>;

export async function fetchLoeschauftraege(): Promise<Loeschauftrag[]> {
  const { data, error } = (await getSupabase().rpc('list_storage_deletion_orders')) as {
    data: unknown;
    error: unknown;
  };

  if (error) throw new Error('Die offenen Löschaufträge konnten nicht geladen werden.');
  return z.array(loeschauftragSchema).parse(data ?? []);
}

const auftragsschluesselSchema = z.object({
  bucket_id: z.string(),
  object_key: z.string(),
});

/**
 * Führt einen Löschauftrag aus: Objekt entfernen, dann quittieren.
 *
 * `claim_storage_deletion_order` protokolliert die Ausführung
 * (`storage_deletion.claimed`) und gibt genau dieses eine Objekt für ein
 * einziges Entfernen frei, nicht zum Lesen (FIX-015, ANN-052); ohne diesen
 * Schritt lässt die Storage-API das Objekt nicht entfernen. Die Quittung wird **verdient**, nicht behauptet — `receipt_storage_deletion_order`
 * prüft selbst, dass das Objekt weg ist, und verweigert sonst. Diese Funktion
 * kann deshalb nicht so scheitern, dass am Ende eine Quittung ohne Löschung
 * steht; sie kann nur scheitern, und dann bleibt der Auftrag offen.
 */
export async function fuehreLoeschauftragAus(orderId: string): Promise<void> {
  const freigabe = (await getSupabase().rpc('claim_storage_deletion_order', {
    p_order_id: orderId,
  })) as { data: unknown; error: unknown; status: number };

  if (abgewiesen(freigabe)) throw new Error('Der Löschauftrag konnte nicht ausgeführt werden.');
  const auftrag = z.array(auftragsschluesselSchema).parse(freigabe.data ?? [])[0];
  if (!auftrag) throw new Error('Der Löschauftrag ist nicht mehr offen.');

  const { error: entfernenFehler } = await getSupabase()
    .storage.from(auftrag.bucket_id)
    .remove([auftrag.object_key]);

  if (entfernenFehler) {
    throw new Error('Die Datei konnte in der Ablage nicht entfernt werden.');
  }

  const quittung = (await getSupabase().rpc('receipt_storage_deletion_order', {
    p_order_id: orderId,
  })) as { error: unknown; status: number };

  if (abgewiesen(quittung)) {
    throw new Error(
      'Die Ablage meldet die Datei weiterhin als vorhanden. Der Auftrag bleibt offen.',
    );
  }
}

// -----------------------------------------------------------------------------
// Abgleich (DAT-003, ADR-017 Punkt 27)
// -----------------------------------------------------------------------------

const fehlendeDateiSchema = z.object({
  file_id: z.string(),
  patient_id: z.string(),
  patient_name: z.string(),
  document_type: z.string(),
  display_name: z.string(),
  uploaded_at: z.string().nullable(),
});

export type FehlendeDatei = z.infer<typeof fehlendeDateiSchema>;

export async function fetchFehlendeDateien(): Promise<FehlendeDatei[]> {
  const { data, error } = (await getSupabase().rpc('list_missing_patient_file_objects')) as {
    data: unknown;
    error: unknown;
  };

  if (error) throw new Error('Der Abgleich der Dateiablage konnte nicht geladen werden.');
  return z.array(fehlendeDateiSchema).parse(data ?? []);
}

export async function fetchVerwaisteAnzahl(): Promise<number> {
  const { data, error } = (await getSupabase().rpc('count_orphaned_patient_file_objects')) as {
    data: unknown;
    error: unknown;
  };

  if (error) throw new Error('Der Abgleich der Dateiablage konnte nicht geladen werden.');
  return z.coerce.number().parse(data ?? 0);
}

/**
 * Merkt verwaiste Objekte zur Löschung vor.
 *
 * Kein zweiter Löschweg: Es entstehen gewöhnliche Löschaufträge, die danach
 * ausgeführt und quittiert werden wie alle anderen (ADR-017 Punkt 25 und 27).
 */
export async function merkeVerwaisteZurLoeschungVor(): Promise<number> {
  const antwort = (await getSupabase().rpc('order_orphaned_object_deletion')) as {
    data: unknown;
    error: unknown;
    status: number;
  };

  // Sonst meldete eine Abweisung „0 vorgemerkt" (ANN-115).
  // Zweite Sicherung: Ein gelungenes Vormerken liefert immer eine Anzahl.
  if (abgewiesen(antwort) || antwort.data == null) {
    throw new Error('Die verwaisten Objekte konnten nicht vorgemerkt werden.');
  }
  return z.coerce.number().parse(antwort.data);
}
