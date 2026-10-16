import { uploadFleetPhoto } from './api';
import type { SeitenKey } from './checkupablauf';

/** Ein Foto, das nach dem Speichern einer Meldung an seine Stelle oder den Check-Up geht. */
export interface Fotoauftrag {
  spotId: string | null;
  checkupId: string | null;
  /** Ein Seitenfoto im Check-Up (FLT-007, ANN-568); sonst keins. */
  side?: SeitenKey | null;
  foto: Blob;
}

/**
 * Die Fotos einer Meldung nacheinander übertragen (ANN-552): Hängen können
 * sie erst, wenn Stelle oder Check-Up gespeichert sind. Was scheitert, bleibt
 * im Arbeitsspeicher der Seite und lässt sich erneut versuchen, solange sie
 * offen ist - kein Zwischenspeicher, keine Warteschlange (ADR-017 Punkt 33).
 */
export async function uebertrageFotos(
  auftraege: readonly Fotoauftrag[],
): Promise<{ fehlgeschlagen: Fotoauftrag[]; grund: string | null }> {
  const fehlgeschlagen: Fotoauftrag[] = [];
  let grund: string | null = null;
  for (const auftrag of auftraege) {
    try {
      await uploadFleetPhoto(auftrag);
    } catch (fehler) {
      fehlgeschlagen.push(auftrag);
      grund = fehler instanceof Error ? fehler.message : 'Das Foto konnte nicht übertragen werden.';
    }
  }
  return { fehlgeschlagen, grund };
}

export function fotoText(anzahl: number): string {
  return anzahl === 1 ? 'ein Foto' : `${anzahl} Fotos`;
}
