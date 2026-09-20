/**
 * Die Dokumentarten der Dateiablage — Beschriftung und Erläuterung (DAT-001).
 *
 * Verbindlich ist der Katalog in `public.patient_file_document_types`; er
 * trägt den Schlüssel und den Rollenschnitt (`is_clinical`). Hier stehen nur
 * die deutschen Wörter. Ein Datenbanktest hält beide Listen deckungsgleich —
 * dieselbe Aufteilung wie beim Retention Schedule (`klassen.ts`), damit die
 * SQL-Dateien frei von Umlauten bleiben, ohne dass die Oberfläche darunter
 * leidet.
 *
 * **Die Art ist keine Beschriftung, sondern eine Sichtbarkeitsgrenze**
 * (ADR-017 Punkt 12). Eine falsch gewählte Art ist eine Offenlegung nach
 * `PROJECT_PRINCIPLES.md` §13, kein Schönheitsfehler — deshalb steht neben
 * jeder Art, wer sie danach sehen kann.
 */

export const DOKUMENTARTEN = [
  'verordnungsscan',
  'befund',
  'arztbrief',
  'klinisches_bild',
  'einwilligung',
  'vertrag',
] as const;

export type Dokumentart = (typeof DOKUMENTARTEN)[number];

export const dokumentartLabels: Record<Dokumentart, string> = {
  verordnungsscan: 'Verordnungsscan',
  befund: 'Befund',
  arztbrief: 'Arztbrief',
  klinisches_bild: 'Klinisches Bild',
  einwilligung: 'Einwilligung',
  vertrag: 'Vertrag',
};

export const dokumentartHinweise: Record<Dokumentart, string> = {
  verordnungsscan: 'Foto oder Scan des Rezepts. Nur an einer Verordnung.',
  befund: 'Befund einer Untersuchung.',
  arztbrief: 'Schreiben einer ärztlichen Stelle.',
  klinisches_bild: 'Bildgebung oder Aufnahme mit klinischer Aussage.',
  einwilligung: 'Unterschriebene Einwilligung oder Datenschutzinformation.',
  vertrag: 'Behandlungsvertrag oder vergleichbare Vereinbarung.',
};

/**
 * Welche Arten klinisch sind.
 *
 * Spiegel von `patient_file_document_types.is_clinical`. Seit E15 sehen alle
 * vier Praxisrollen jede Art (ROL-002); die Einteilung bestimmt, wer eine
 * Datei hinzufügen, löschen und korrigieren darf (ADR-017 Punkt 13). Steuert
 * in der Oberfläche nur Auswahl und Hinweistext; verbindlich ist die Datenbank.
 */
export const KLINISCHE_DOKUMENTARTEN: readonly Dokumentart[] = [
  'verordnungsscan',
  'befund',
  'arztbrief',
  'klinisches_bild',
];

export function istKlinisch(art: Dokumentart): boolean {
  return KLINISCHE_DOKUMENTARTEN.includes(art);
}

export function sichtbarkeitHinweis(art: Dokumentart): string {
  return istKlinisch(art)
    ? 'Klinisch: sichtbar für alle Praxisrollen; hinzufügen und löschen nur Praxisinhaber:in, Therapeut:innen und Teamleitung.'
    : 'Organisatorisch: sichtbar für alle Praxisrollen; auch die Verwaltung darf sie hinzufügen und löschen.';
}

/**
 * Die zulässigen Formate (ADR-017 Punkt 18), doppelt durchgesetzt: am Bucket,
 * beim Vorbereiten und noch einmal bei der Bestätigung gegen das, was
 * tatsächlich abgelegt wurde.
 *
 * SVG und HTML fehlen mit Absicht — sie tragen Skript und würden auf der
 * Domäne des Anbieters ausgeliefert. Office-Dokumente, Archive und Videos
 * ebenso: ein Video ist eine eigene Risikoklasse mit eigener Einwilligung
 * (`IDEA-KOM-003`) und nicht Gegenstand dieses Epics.
 */
const ERLAUBTE_MIME_TYPEN = ['application/pdf', 'image/jpeg', 'image/png'] as const;

type ErlaubterMimeTyp = (typeof ERLAUBTE_MIME_TYPEN)[number];

/** Für das `accept`-Attribut des Dateiwählers. */
export const DATEI_ACCEPT = '.pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png';

export const MAX_BYTES = 10 * 1024 * 1024;

export function istErlaubterMimeTyp(typ: string): typ is ErlaubterMimeTyp {
  return (ERLAUBTE_MIME_TYPEN as readonly string[]).includes(typ);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} Byte`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Die ersten Bytes, an denen ein Format sich selbst zu erkennen gibt.
 *
 * Der Typ aus dem Dateiwähler stammt vom Browser und der leitet ihn aus der
 * **Dateiendung** ab; die Storage-API schreibt denselben Wert unverändert nach
 * `metadata.mimetype`. Die serverseitige Prüfung in Phase (c) vergleicht
 * deshalb zwei Angaben derselben Quelle (R3-014). Hier kommt eine dritte dazu:
 * der Inhalt selbst.
 */
const MAGISCHE_BYTES: Record<ErlaubterMimeTyp, { name: string; kennung: readonly number[] }> = {
  'application/pdf': { name: 'PDF-Datei', kennung: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  'image/jpeg': { name: 'JPEG-Datei', kennung: [0xff, 0xd8, 0xff] },
  'image/png': { name: 'PNG-Datei', kennung: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
};

/**
 * Die ersten `anzahl` Bytes einer Datei.
 *
 * Über `FileReader` und nicht über `Blob.arrayBuffer()`: Beides gibt es im
 * Browser, aber nur der Reader auch in der Testumgebung (jsdom). Gelesen wird
 * ausschließlich der Kopf, nie die ganze Datei.
 */
function ersteBytes(datei: Blob, anzahl: number): Promise<Uint8Array> {
  return new Promise((fertig, fehlgeschlagen) => {
    const leser = new FileReader();
    leser.onload = () => fertig(new Uint8Array(leser.result as ArrayBuffer));
    leser.onerror = () =>
      fehlgeschlagen(leser.error ?? new Error('Die Datei konnte nicht gelesen werden.'));
    leser.readAsArrayBuffer(datei.slice(0, anzahl));
  });
}

/**
 * Warum der Inhalt einer Datei nicht zu ihrem angekündigten Format passt —
 * `null` heißt: passt.
 *
 * Bewusst getrennt von `dateiAblehnungsgrund`: Diese Prüfung muss die Bytes
 * lesen und ist deshalb asynchron. Sie ersetzt keine Virenprüfung (ADR-017)
 * und hält niemanden auf, der den Browser selbst steuert — sie fängt den Fall
 * ab, der ohne sie unbemerkt in die Akte gelangt: eine umbenannte Fremddatei.
 */
export async function dateiInhaltAblehnungsgrund(datei: Blob): Promise<string | null> {
  // Formate, die schon die Formprüfung abweist, gehen diesen Weg nie.
  if (!istErlaubterMimeTyp(datei.type)) return null;

  const { name, kennung } = MAGISCHE_BYTES[datei.type];
  const kopf = await ersteBytes(datei, kennung.length);
  const passt = kennung.every((byte, i) => kopf[i] === byte);

  return passt
    ? null
    : `Der Inhalt ist keine ${name}. Bitte die Originaldatei wählen — eine umbenannte Datei wird nicht angenommen.`;
}

/**
 * Warum eine Datei nicht angenommen wird — in einem Satz, der sagt, was zu tun
 * ist (`PROJECT_PRINCIPLES.md` §13). `null` heißt: alles in Ordnung.
 *
 * **HEIC ist die offene Folgefrage aus ADR-017.** Ein iPhone liefert je nach
 * Einstellung `image/heic`; der Dateiwähler wandelt in vielen, aber nicht in
 * allen Fällen nach JPEG um. Diese Meldung ist deshalb kein Sackgassenhinweis,
 * sondern nennt den Ausweg.
 */
export function dateiAblehnungsgrund(datei: { type: string; size: number }): string | null {
  if (!istErlaubterMimeTyp(datei.type)) {
    return `Dieses Format wird nicht angenommen. Erlaubt sind PDF, JPEG und PNG. Fotos vom iPhone bitte als „Sehr kompatibel“ (JPEG) aufnehmen oder vorher umwandeln.`;
  }
  if (datei.size <= 0) {
    return 'Die Datei ist leer.';
  }
  if (datei.size > MAX_BYTES) {
    return `Die Datei ist mit ${formatBytes(datei.size)} zu groß. Erlaubt sind bis zu ${formatBytes(MAX_BYTES)}.`;
  }
  return null;
}
