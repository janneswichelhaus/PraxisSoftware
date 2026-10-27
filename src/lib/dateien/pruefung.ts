/**
 * Das Kennzeichen einer Datei, die die Prüfung am Server noch nicht bestanden hat (ADR-017 Punkt
 * 51): Typ, Prüfsumme und Metadaten hat bis dahin nur das Gerät geprüft.
 */
export const NICHT_SERVERSEITIG_GEPRUEFT = 'nicht serverseitig geprüft';

/** Ein geladenes PDF - der Typ des Blobs ist der geprüfte der Datei (`ladeDateiZumAnzeigen`). */
export function istPdf(daten: Blob): boolean {
  return daten.type === 'application/pdf';
}

/** Bilder und PDF zeigt die Anwendung selbst (ADR-017 Punkte 54 und 58, ANN-223). */
export function istAnzeigbar(mimeType: string): boolean {
  return mimeType === 'image/jpeg' || mimeType === 'image/png' || mimeType === 'application/pdf';
}

/**
 * Die zulässigen Formate (ADR-017 Punkt 18), auch am Bucket und bei der Bestätigung durchgesetzt.
 * SVG und HTML fehlen mit Absicht: Sie tragen Skript und kämen von der Domäne des Anbieters.
 * Office-Dokumente, Archive und Videos sind eigene Risikoklassen.
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

/** Die Größe einer Datei mit deutschem Komma: „1,2 MB", nicht „1.2 MB". */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${GANZE_ZAHL.format(bytes)} Byte`;
  if (bytes < 1024 * 1024) return `${GANZE_ZAHL.format(bytes / 1024)} KB`;
  return `${EINE_STELLE.format(bytes / (1024 * 1024))} MB`;
}

/**
 * Die ersten Bytes, an denen ein Format sich selbst zu erkennen gibt. Den Typ aus dem Dateiwähler
 * leitet der Browser aus der Endung ab, und die Ablage übernimmt ihn unverändert; der Inhalt ist
 * die einzige unabhängige Angabe.
 */
const MAGISCHE_BYTES: Record<ErlaubterMimeTyp, { name: string; kennung: readonly number[] }> = {
  'application/pdf': { name: 'PDF-Datei', kennung: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  'image/jpeg': { name: 'JPEG-Datei', kennung: [0xff, 0xd8, 0xff] },
  'image/png': { name: 'PNG-Datei', kennung: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
};

/** Nur der Kopf, über `FileReader`: `Blob.arrayBuffer()` fehlt in der Testumgebung (jsdom). */
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
 * Warum der Inhalt nicht zum angekündigten Format passt, `null` heißt: passt. Keine Virenprüfung
 * (ADR-017 Fassung 7), aber sie fängt die umbenannte Fremddatei ab, die sonst unbemerkt in die
 * Akte gelangte. Asynchron, weil sie Bytes liest, deshalb getrennt von `dateiAblehnungsgrund`.
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
 * Warum eine Datei nicht angenommen wird, in einem Satz, der sagt, was zu tun ist; `null` heißt: in
 * Ordnung. Ein iPhone liefert je nach Einstellung HEIC (offene Frage aus ADR-017), deshalb nennt
 * die Meldung den Ausweg statt einer Sackgasse.
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
