import { alleBytes, entferneMetadaten } from '@/lib/dateien/metadaten';

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
 * Gesichtserkennung (ADR-017 Punkt 39 sinngemäß). So beginnt der Ausschnitt;
 * verschieben und vergrößern kann ihn die Person selbst (ADR-017 Fassung 11).
 */
export function zuschnitt(breite: number, hoehe: number): Zuschnitt {
  const seite = Math.min(breite, hoehe);
  return {
    x: Math.floor((breite - seite) / 2),
    y: hoehe > breite ? Math.floor((hoehe - seite) / 4) : Math.floor((hoehe - seite) / 2),
    seite,
  };
}

/** Stärker wird nicht vergrößert: Darüber wird ein Telefonfoto unscharf (ANN-670). */
export const VERGROESSERUNG_MAX = 3;

/**
 * Der gewählte Ausschnitt, wie die Person ihn verschiebt: Mitte in
 * Bildpunkten des Fotos und Vergrößerung (1 = das größte Quadrat).
 */
export interface Ausschnittstand {
  mitteX: number;
  mitteY: number;
  vergroesserung: number;
}

const zwischen = (wert: number, unten: number, oben: number) =>
  Math.min(oben, Math.max(unten, wert));

/** Der Anfang: der feste Ausschnitt von bisher, ohne Vergrößerung. */
export function startStand(breite: number, hoehe: number): Ausschnittstand {
  const { x, y, seite } = zuschnitt(breite, hoehe);
  return { mitteX: x + seite / 2, mitteY: y + seite / 2, vergroesserung: 1 };
}

/** Das Quadrat zu einem Stand - immer ganz im Foto. */
export function ausschnitt(breite: number, hoehe: number, stand: Ausschnittstand): Zuschnitt {
  const vergroesserung = zwischen(stand.vergroesserung, 1, VERGROESSERUNG_MAX);
  const seite = Math.max(1, Math.round(Math.min(breite, hoehe) / vergroesserung));
  return {
    x: zwischen(Math.round(stand.mitteX - seite / 2), 0, breite - seite),
    y: zwischen(Math.round(stand.mitteY - seite / 2), 0, hoehe - seite),
    seite,
  };
}

/**
 * Ein neuer Stand, der im Foto bleibt: Wer über den Rand hinaus zieht oder
 * vergrößert, landet am Rand - die Mitte folgt dem Quadrat.
 */
export function begrenzt(breite: number, hoehe: number, stand: Ausschnittstand): Ausschnittstand {
  const vergroesserung = zwischen(stand.vergroesserung, 1, VERGROESSERUNG_MAX);
  const { x, y, seite } = ausschnitt(breite, hoehe, { ...stand, vergroesserung });
  return { mitteX: x + seite / 2, mitteY: y + seite / 2, vergroesserung };
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

/**
 * Ein gewähltes Foto, geöffnet im Arbeitsspeicher der Seite - zum Zuschneiden.
 * Die Adresse ist eine Objekt-URL; `schliesseFoto` gibt sie frei.
 */
export interface Foto {
  bild: HTMLImageElement;
  adresse: string;
  breite: number;
  hoehe: number;
}

/** Öffnet ein gewähltes Foto. Wirft mit einem Satz für die Person. */
export async function oeffneFoto(datei: Blob): Promise<Foto> {
  if (datei.size > FOTO_MAX_BYTES) throw new Error(FOTO_ZU_GROSS);
  const adresse = URL.createObjectURL(datei);
  try {
    const bild = new Image();
    bild.src = adresse;
    // `decode` wendet die Ausrichtung aus dem EXIF an, wie jedes <img>.
    await bild.decode();
    if (bild.naturalWidth < 1 || bild.naturalHeight < 1) throw new Error(FOTO_NICHT_LESBAR);
    return { bild, adresse, breite: bild.naturalWidth, hoehe: bild.naturalHeight };
  } catch {
    URL.revokeObjectURL(adresse);
    throw new Error(FOTO_NICHT_LESBAR);
  }
}

export function schliesseFoto(foto: Foto): void {
  URL.revokeObjectURL(foto.adresse);
}

/**
 * Aus dem gewählten Ausschnitt eines Fotos das Profilbild: Quadrat,
 * 256 × 256, JPEG ohne Metadaten, höchstens 64 KiB. Wirft mit einem Satz für
 * die Person.
 */
export async function rechneProfilbild(foto: Foto, stand: Ausschnittstand): Promise<Blob> {
  const { x, y, seite } = ausschnitt(foto.breite, foto.hoehe, stand);
  const flaeche = document.createElement('canvas');
  flaeche.width = PROFILBILD_SEITE;
  flaeche.height = PROFILBILD_SEITE;
  const stift = flaeche.getContext('2d');
  if (!stift) throw new Error(FOTO_NICHT_LESBAR);
  stift.imageSmoothingEnabled = true;
  stift.imageSmoothingQuality = 'high';
  stift.drawImage(foto.bild, x, y, seite, seite, 0, 0, PROFILBILD_SEITE, PROFILBILD_SEITE);
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
}
