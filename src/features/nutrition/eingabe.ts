import { zahl } from './texte';

/** Akte oder Trainingsverhältnis (ADR-021). */
export type Verhaeltnisart = 'treatment' | 'training';

/** „72,5“ und „72.5“ gelten beide; leer heißt keine Angabe. */
export function leseZahl(text: string): number | null {
  const sauber = text.trim().replace(',', '.');
  if (sauber === '') return null;
  const wert = Number(sauber);
  return Number.isFinite(wert) ? wert : null;
}

/** Grenzen eines Zielwerts, wie die Tabelle sie prüft. */
export interface Zielwertgrenze {
  min: number;
  max: number;
  einheit: string;
  /** In Litern eingegeben, in Millilitern gespeichert (auf 10 ml). */
  liter?: true;
}

/**
 * Ein überschriebener Zielwert für den Server oder ein Fehler. Ganze Zahlen
 * ohne Punkt und Komma - „1.500“ wäre sonst 1,5 -, Liter mit höchstens einer
 * Stelle nach dem Komma. Leer heißt: der berechnete Wert gilt.
 */
export function leseZielwert(
  text: string,
  { min, max, einheit, liter }: Zielwertgrenze,
): { wert: number | null } | { fehler: string } {
  const sauber = text.trim();
  if (sauber === '') return { wert: null };
  const grenzen = `${zahl(min, liter ? 1 : 0)} bis ${zahl(max, liter ? 1 : 0)} ${einheit}`;
  if (liter) {
    const l = /^\d+([.,]\d)?$/.test(sauber) ? leseZahl(sauber) : null;
    if (l === null || l < min || l > max)
      return { fehler: `Bitte in Litern angeben, etwa 2,5; ${grenzen} - oder leer lassen.` };
    return { wert: Math.round(l * 100) * 10 };
  }
  const n = /^\d+$/.test(sauber) ? Number(sauber) : null;
  if (n === null || n < min || n > max)
    return { fehler: `Bitte als ganze Zahl angeben, ${grenzen} - oder leer lassen.` };
  return { wert: n };
}

/** Wohin die Formulare zurückkehren: in den Reiter Ernährung. */
export function ernaehrungsReiter(art: Verhaeltnisart, verhaeltnisId: string): string {
  return art === 'treatment'
    ? `/patienten/${verhaeltnisId}/ernaehrung`
    : `/training/${verhaeltnisId}?bereich=ernaehrung`;
}

/** Der Anfang der Formularadressen: `…/ernaehrung/neu`, `/bearbeiten`, `/zielwerte`. */
export function ernaehrungsFormulare(art: Verhaeltnisart, verhaeltnisId: string): string {
  return art === 'treatment'
    ? `/patienten/${verhaeltnisId}/ernaehrung`
    : `/training/${verhaeltnisId}/ernaehrung`;
}

/** ERN-012: der Weg zum Beratungstermin - `…/ernaehrung/termin`. */
export function beratungsterminPfad(art: Verhaeltnisart, verhaeltnisId: string): string {
  return `${ernaehrungsFormulare(art, verhaeltnisId)}/termin`;
}
