/**
 * Farbe: sRGB vor dem Entfernen der Metadaten (ABN-026, ADR-017 Fassung 3,
 * Punkt 53).
 *
 * Die Bereinigung entfernt Farbprofile, weil ihr Kopf Hersteller und Gerät
 * trägt (ANN-125). Ein Bild, dessen Farben auf ein eingebettetes Profil
 * angewiesen sind — etwa ein Weitraumfoto aus der Kamera-App —, zeigte danach
 * falsche Farben. Deshalb rechnet das Gerät ein solches Bild **vorher** nach
 * sRGB um und kodiert es neu; danach braucht es kein Profil mehr.
 *
 * **Nur mit einem Profil, das nicht sRGB ist.** Ohne eingebettetes Profil
 * bleibt es bei Punkt 34: Die Bilddaten bleiben byte-gleich. Dasselbe gilt
 * für ein Profil, das selbst sRGB beschreibt: Ein Bild ohne Profil zeigt jeder
 * Browser in sRGB, das Entfernen ändert dort keine Farbe. So bleiben die
 * Bilder aus dem Kameradialog unberührt — Chromium bettet in jedes
 * Canvas-JPEG ein sRGB-Profil ein, entgegen der Annahme in Punkt 53, dass sie
 * keins tragen (ANN-125 Fassung 3).
 *
 * **Die Ausrichtung bleibt erhalten**, indem die Umrechnung sie in die Pixel
 * übernimmt (`imageOrientation: 'from-image'`): Das neue Bild steht aufrecht
 * und braucht keine Angabe mehr.
 *
 * Die Prüfsumme wird wie bisher über die abgelegten Bytes gebildet — über das
 * Ergebnis dieser Umrechnung und der anschließenden Bereinigung.
 */

import { alleBytes, istBereinigbar, jpegSegmente, pngChunks } from './metadaten';

/** Qualität der Neukodierung eines JPEG — hoch, damit ein Dokument lesbar bleibt. */
export const JPEG_QUALITAET = 0.95;

const NICHT_UMRECHENBAR =
  'Das Bild trägt ein Farbprofil und konnte nicht in Standardfarben umgerechnet werden. Bitte als JPEG ohne Farbprofil oder als PDF ablegen.';

function beginntMit(bytes: Uint8Array, at: number, text: string): boolean {
  for (let i = 0; i < text.length; i += 1) {
    if (bytes[at + i] !== text.charCodeAt(i)) return false;
  }
  return true;
}

/** Steht „sRGB" im Profil, als ASCII oder als UTF-16 (Beschreibung `desc`/`mluc`)? */
function beschreibtSrgb(profil: Uint8Array): boolean {
  // Farbraum im Kopf (Byte 16 bis 19) muss RGB sein.
  if (!beginntMit(profil, 16, 'RGB ')) return false;
  const ascii = 'sRGB';
  for (let i = 0; i + 8 <= profil.length; i += 1) {
    if (beginntMit(profil, i, ascii)) return true;
    if (
      profil[i] === 0 &&
      profil[i + 1] === 0x73 &&
      profil[i + 2] === 0 &&
      profil[i + 3] === 0x52 &&
      profil[i + 4] === 0 &&
      profil[i + 5] === 0x47 &&
      profil[i + 6] === 0 &&
      profil[i + 7] === 0x42
    ) {
      return true;
    }
  }
  return false;
}

async function entpacke(daten: Uint8Array): Promise<Uint8Array> {
  // Über `Response` und nicht über `Blob.stream()`: Beides gibt es im Browser,
  // aber nur `Response` auch in der Testumgebung (jsdom).
  const strom = new Response(daten as BodyInit).body!.pipeThrough(
    new DecompressionStream('deflate'),
  );
  return new Uint8Array(await new Response(strom).arrayBuffer());
}

/**
 * Trägt das Bild ein eingebettetes Farbprofil, das **nicht** sRGB ist? JPEG:
 * die APP2-Segmente „ICC_PROFILE" (zusammengesetzt); PNG: der `iCCP`-Chunk
 * (entpackt), es sei denn, ein `sRGB`-Chunk erklärt das Bild ohnehin zu sRGB.
 * Ein Profil, das sich nicht lesen lässt, gilt als abweichend — dann wird
 * umgerechnet statt geraten. Ein unlesbares Bild hat hier keins; dass es
 * unlesbar ist, meldet die Bereinigung danach.
 */
export async function hatFarbprofil(
  bytes: Uint8Array,
  mimeTyp: 'image/jpeg' | 'image/png',
): Promise<boolean> {
  try {
    if (mimeTyp === 'image/jpeg') {
      const teile = jpegSegmente(bytes)
        .filter((s) => s.marker === 0xe2 && beginntMit(bytes, s.start + 4, 'ICC_PROFILE\0'))
        // Kopf des Segments: Marker, Länge, „ICC_PROFILE\0", Nummer, Anzahl.
        .map((s) => bytes.subarray(s.start + 4 + 14, s.ende));
      if (teile.length === 0) return false;
      const profil = new Uint8Array(teile.reduce((n, t) => n + t.length, 0));
      let pos = 0;
      for (const teil of teile) {
        profil.set(teil, pos);
        pos += teil.length;
      }
      return !beschreibtSrgb(profil);
    }
    const chunks = pngChunks(bytes);
    const iccp = chunks.find((c) => c.typ === 'iCCP');
    if (!iccp) return false;
    if (chunks.some((c) => c.typ === 'sRGB')) return false;
    const daten = bytes.subarray(iccp.start + 8, iccp.ende - 4);
    const nameEnde = daten.indexOf(0);
    if (nameEnde < 0) return true;
    try {
      // Nach dem Namen: ein Byte Kompressionsart, dann zlib-Daten.
      return !beschreibtSrgb(await entpacke(daten.subarray(nameEnde + 2)));
    } catch {
      return true;
    }
  } catch {
    return false;
  }
}

/** Rechnet ein Bild nach sRGB um; austauschbar für Tests ohne Browser. */
export type Umrechner = (bild: Blob) => Promise<Blob>;

/**
 * Die Umrechnung im Browser: dekodieren mit Farbumrechnung und Ausrichtung,
 * in eine sRGB-Fläche zeichnen, im selben Format neu kodieren.
 */
export const imBrowserUmrechnen: Umrechner = async (bild) => {
  const bitmap = await createImageBitmap(bild, {
    colorSpaceConversion: 'default',
    imageOrientation: 'from-image',
  });
  try {
    const flaeche = document.createElement('canvas');
    flaeche.width = bitmap.width;
    flaeche.height = bitmap.height;
    const kontext = flaeche.getContext('2d', { colorSpace: 'srgb' });
    if (!kontext) throw new Error(NICHT_UMRECHENBAR);
    kontext.drawImage(bitmap, 0, 0);
    const ergebnis = await new Promise<Blob | null>((fertig) =>
      flaeche.toBlob(fertig, bild.type, bild.type === 'image/jpeg' ? JPEG_QUALITAET : undefined),
    );
    if (!ergebnis || ergebnis.type !== bild.type) throw new Error(NICHT_UMRECHENBAR);
    return ergebnis;
  } finally {
    bitmap.close();
  }
};

/**
 * Dieselbe Datei in sRGB, wenn sie ein Farbprofil trägt; sonst unverändert.
 * Andere Formate als JPEG und PNG kommen immer unverändert zurück.
 */
export async function nachSrgb(
  datei: Blob,
  umrechnen: Umrechner = imBrowserUmrechnen,
): Promise<Blob> {
  if (!istBereinigbar(datei.type)) return datei;
  if (!(await hatFarbprofil(await alleBytes(datei), datei.type))) return datei;
  try {
    return await umrechnen(datei);
  } catch {
    throw new Error(NICHT_UMRECHENBAR);
  }
}
