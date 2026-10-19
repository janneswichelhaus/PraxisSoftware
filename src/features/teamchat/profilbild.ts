import { alleBytes, entferneMetadaten } from '@/features/files/metadaten';

/**
 * Ein Profilbild entsteht auf dem Gerät (TEAM-007, ADR-017 Abschnitt O): aus
 * einem gewählten Foto ein Quadrat von 256 × 256 Bildpunkten, aus Pixeln neu
 * als JPEG gerechnet. Das Original verlässt das Gerät nie - kein Ort, keine
 * Aufnahmezeit, kein Vorschaubild (Punkt 34); was der Browser beim Kodieren
 * dennoch an Segmenten mitgibt, entfernt `entferneMetadaten`. Der Server
 * prüft dasselbe noch einmal am Inhalt (`app.profile_picture_problem`).
 */

/** Kantenlänge in Bildpunkten - wie `app.profile_picture_side()`. */
export const PROFILBILD_SEITE = 256;
/** Höchstgröße in Bytes - wie `app.profile_picture_max_bytes()`. */
export const PROFILBILD_MAX_BYTES = 65536;
/** Größer wird ein gewähltes Foto gar nicht erst geöffnet. */
export const FOTO_MAX_BYTES = 30 * 1024 * 1024;

/** Von gut zu klein: die erste Stufe, die unter die Höchstgröße passt, gilt. */
const QUALITAETEN = [0.86, 0.75, 0.62, 0.5] as const;

export const FOTO_NICHT_LESBAR =
  'Dieses Foto lässt sich nicht öffnen. Bitte ein Foto als JPEG oder PNG wählen.';
const FOTO_ZU_GROSS = 'Das Foto ist zu groß. Bitte ein kleineres wählen.';

export interface Zuschnitt {
  x: number;
  y: number;
  seite: number;
}

/**
 * Das größte Quadrat im Bild: waagerecht in der Mitte, bei einem Hochformat
 * aus dem oberen Teil - dort steht in einem Porträt das Gesicht. Keine
 * Gesichtserkennung (ADR-017 Punkt 39 sinngemäß); wem der Ausschnitt nicht
 * gefällt, wählt ein anderes Foto.
 */
export function zuschnitt(breite: number, hoehe: number): Zuschnitt {
  const seite = Math.min(breite, hoehe);
  return {
    x: Math.floor((breite - seite) / 2),
    y: hoehe > breite ? Math.floor((hoehe - seite) / 4) : Math.floor((hoehe - seite) / 2),
    seite,
  };
}

/**
 * Kodiert in absteigender Qualität, bis das Bild unter die Höchstgröße passt;
 * `kodiere` ist im Browser `canvas.toBlob`, im Test ein Ersatz.
 */
export async function kleinGenug(kodiere: (qualitaet: number) => Promise<Blob>): Promise<Blob> {
  for (const qualitaet of QUALITAETEN) {
    const bild = await kodiere(qualitaet);
    if (bild.size <= PROFILBILD_MAX_BYTES) return bild;
  }
  throw new Error(FOTO_ZU_GROSS);
}

/** Bytes als Base64 - so nimmt der Server das Bild an. */
export function alsBase64(bytes: Uint8Array): string {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(text);
}

/** Base64 vom Server als Bild zum Anzeigen. */
export function ausBase64(text: string): Blob {
  const roh = atob(text);
  const bytes = new Uint8Array(roh.length);
  for (let i = 0; i < roh.length; i += 1) bytes[i] = roh.charCodeAt(i);
  return new Blob([bytes], { type: 'image/jpeg' });
}

async function ladeFoto(datei: Blob): Promise<HTMLImageElement> {
  const adresse = URL.createObjectURL(datei);
  try {
    const bild = new Image();
    bild.src = adresse;
    // `decode` wendet die Ausrichtung aus dem EXIF an, wie jedes <img>.
    await bild.decode();
    return bild;
  } catch {
    URL.revokeObjectURL(adresse);
    throw new Error(FOTO_NICHT_LESBAR);
  }
}

/**
 * Aus einem gewählten Foto das Profilbild: Quadrat, 256 × 256, JPEG ohne
 * Metadaten, höchstens 64 KiB. Wirft mit einem Satz für die Person.
 */
export async function rechneProfilbild(datei: Blob): Promise<Blob> {
  if (datei.size > FOTO_MAX_BYTES) throw new Error(FOTO_ZU_GROSS);
  const foto = await ladeFoto(datei);
  try {
    const { x, y, seite } = zuschnitt(foto.naturalWidth, foto.naturalHeight);
    if (seite < 1) throw new Error(FOTO_NICHT_LESBAR);
    const flaeche = document.createElement('canvas');
    flaeche.width = PROFILBILD_SEITE;
    flaeche.height = PROFILBILD_SEITE;
    const stift = flaeche.getContext('2d');
    if (!stift) throw new Error(FOTO_NICHT_LESBAR);
    stift.imageSmoothingEnabled = true;
    stift.imageSmoothingQuality = 'high';
    stift.drawImage(foto, x, y, seite, seite, 0, 0, PROFILBILD_SEITE, PROFILBILD_SEITE);
    const kodiert = await kleinGenug(
      (qualitaet) =>
        new Promise<Blob>((fertig, fehlgeschlagen) =>
          flaeche.toBlob(
            (blob) => (blob ? fertig(blob) : fehlgeschlagen(new Error(FOTO_NICHT_LESBAR))),
            'image/jpeg',
            qualitaet,
          ),
        ),
    );
    const sauber = entferneMetadaten(await alleBytes(kodiert), 'image/jpeg');
    return new Blob([sauber as BlobPart], { type: 'image/jpeg' });
  } finally {
    URL.revokeObjectURL(foto.src);
  }
}
