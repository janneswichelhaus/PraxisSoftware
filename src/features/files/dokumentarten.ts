import { ANMELDEBOGEN_ANKER } from '@/features/patients/akte';

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
  'dokumentationsfoto',
  'patientenfoto',
  'einwilligung',
  'vertrag',
] as const;

export type Dokumentart = (typeof DOKUMENTARTEN)[number];

export const dokumentartLabels: Record<Dokumentart, string> = {
  verordnungsscan: 'Verordnungsscan',
  befund: 'Befund',
  arztbrief: 'Arztbrief',
  klinisches_bild: 'Klinisches Bild',
  dokumentationsfoto: 'Dokumentationsfoto',
  // ADR-017 Punkt 43: Der Schlüssel bleibt, die Oberfläche sagt „Arbeitshilfe".
  patientenfoto: 'Arbeitshilfe',
  einwilligung: 'Einwilligung',
  vertrag: 'Vertrag',
};

export const dokumentartHinweise: Record<Dokumentart, string> = {
  verordnungsscan: 'Foto oder Scan des Rezepts. Nur an einer Verordnung.',
  befund: 'Befund einer Untersuchung.',
  arztbrief: 'Schreiben einer ärztlichen Stelle.',
  // ADR-017 Punkte 31 und 43: nie ein Foto, das die Praxis selbst von der
  // Person macht - das wäre ein Weg am Kameradialog und an der Wahl der Art
  // vorbei.
  klinisches_bild:
    'Röntgen, MRT, Ultraschall oder ein Bild aus ärztlicher oder klinischer Hand. Kein Foto, das die Praxis selbst von der Person macht.',
  // ADR-017 Abschnitte G und H: Beide Fotoarten entstehen nur im Kameradialog
  // im Verlauf, nie hier über den Dateiwähler - die Dateiliste bietet sie
  // nicht an.
  dokumentationsfoto:
    'Foto der Person, das für die Dokumentation der Behandlung erforderlich ist. Teil der Akte (zehn Jahre), keine Einwilligung, nur über die Kamera der Anwendung, löschen nur am Aufnahmetag.',
  patientenfoto:
    'Foto der Person für Übergabe und Vergleich, das die Dokumentation nicht braucht. Nur mit Einwilligung, nur über die Kamera der Anwendung, gelöscht nach spätestens zwölf Monaten.',
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
  'dokumentationsfoto',
  'patientenfoto',
];

export function istKlinisch(art: Dokumentart): boolean {
  return KLINISCHE_DOKUMENTARTEN.includes(art);
}

/**
 * Wer eine Datei dieser Art sieht und pflegt - mit den Namen der Rollen, wie
 * sie im Konto stehen (DAT-23, WRT-12): „Praxismanagement", nicht „die
 * Verwaltung".
 */
export function sichtbarkeitHinweis(art: Dokumentart): string {
  // Der Scan folgt der Grundlage, und die erfasst seit PRX-010 auch das
  // Praxismanagement (ANN-011).
  if (art === 'verordnungsscan') {
    return 'Klinisch: sichtbar für alle Praxisrollen; hinzufügen und löschen darf wie die Grundlage auch das Praxismanagement.';
  }
  return istKlinisch(art)
    ? 'Klinisch: sichtbar für alle Praxisrollen; hinzufügen und löschen nur Praxisinhaber:in, Therapeut:innen und Teamleitung.'
    : 'Organisatorisch: sichtbar für alle Praxisrollen; auch das Praxismanagement darf sie hinzufügen und löschen.';
}

/**
 * Das Kennzeichen an einer Datei, die die Prüfung am Server noch nicht
 * bestanden hat (ADR-017 Punkt 51). Bis OPS-001 die Edge Runtime freigibt,
 * trägt es jede Datei — ehrlich, nicht als Warnung: Typ, Prüfsumme und
 * Metadaten hat bis dahin nur das Gerät geprüft.
 */
export const NICHT_SERVERSEITIG_GEPRUEFT = 'nicht serverseitig geprüft';

/**
 * Lässt sich die Datei in der Anwendung zeigen (ADR-017 Punkte 54 und 58)?
 * Bilder und seit BEF-133 auch PDF (ANN-223, Option a); daneben bleibt
 * „Herunterladen" (Punkt 55).
 */
/** Ein geladenes PDF - der Typ des Blobs ist der geprüfte der Datei (`ladeDateiZumAnzeigen`). */
export function istPdf(daten: Blob): boolean {
  return daten.type === 'application/pdf';
}

export function istAnzeigbar(mimeType: string): boolean {
  return mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'application/pdf';
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

const GANZE_ZAHL = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 0 });
const EINE_STELLE = new Intl.NumberFormat('de-DE', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

/** Die Größe einer Datei mit deutschem Komma: „1,2 MB", nicht „1.2 MB" (DAT-23). */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${GANZE_ZAHL.format(bytes)} Byte`;
  if (bytes < 1024 * 1024) return `${GANZE_ZAHL.format(bytes / 1024)} KB`;
  return `${EINE_STELLE.format(bytes / (1024 * 1024))} MB`;
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
    : `Der Inhalt ist keine ${name}. Bitte die Originaldatei wählen – eine umbenannte Datei wird nicht angenommen.`;
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

/**
 * Wo in der Akte eine Datei steht (AKTE-007): Den Bereich „Dateien" gibt es
 * nicht mehr, jede Datei erscheint im Reiter ihres Bereichs - die eine Stelle
 * dieser Zuordnung.
 *
 *   * `grundlagen`  - Behandlungsgrundlagen: der Verordnungsscan;
 *   * `doku`        - Doku: was zu Befund und Behandlung gehört;
 *   * `anmeldebogen`- Stammdaten, beim Anmeldebogen: Einwilligung und Vertrag;
 *   * `sonstige`    - Stammdaten, „Sonstige Dateien": eine Art, die hier
 *     (noch) niemand zugeordnet hat. So fällt keine Datei durch.
 *
 * Die beiden Fotoarten stehen ohnehin in der Doku (`FotosImVerlauf`); die
 * Dateiliste bekommt sie vom Server gar nicht erst.
 */
export type Dateibereich = 'grundlagen' | 'doku' | 'anmeldebogen' | 'sonstige';

const DATEIBEREICHE: Record<Dokumentart, Dateibereich> = {
  verordnungsscan: 'grundlagen',
  befund: 'doku',
  arztbrief: 'doku',
  klinisches_bild: 'doku',
  dokumentationsfoto: 'doku',
  patientenfoto: 'doku',
  einwilligung: 'anmeldebogen',
  vertrag: 'anmeldebogen',
};

export function dateibereich(art: string): Dateibereich {
  return (DATEIBEREICHE as Record<string, Dateibereich | undefined>)[art] ?? 'sonstige';
}

/** Welche Arten in einem Bereich hinzugefügt werden - die Rolle filtert danach noch. */
export function artenImBereich(bereich: Dateibereich): readonly Dokumentart[] {
  return DOKUMENTARTEN.filter(
    (art) =>
      DATEIBEREICHE[art] === bereich &&
      // Fotos entstehen nur über die Kamera im Verlauf (ADR-017 G und H), der
      // Scan nur an seiner Grundlage (Punkt 10).
      art !== 'dokumentationsfoto' &&
      art !== 'patientenfoto' &&
      art !== 'verordnungsscan',
  );
}

/** Der Reiter der Akte, in dem eine Datei dieser Art steht (AKTE-007). */
export function aktenortDerDatei(patientId: string, art: string): string {
  const ort: Record<Dateibereich, string> = {
    grundlagen: 'verordnungen',
    doku: 'doku',
    anmeldebogen: `stammdaten#${ANMELDEBOGEN_ANKER}`,
    sonstige: 'stammdaten',
  };
  return `/patienten/${patientId}/${ort[dateibereich(art)]}`;
}
