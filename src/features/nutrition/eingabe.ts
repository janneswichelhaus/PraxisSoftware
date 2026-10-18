/** Akte oder Trainingsverhältnis (ADR-021). */
export type Verhaeltnisart = 'treatment' | 'training';

/** „72,5“ und „72.5“ gelten beide; leer heißt keine Angabe. */
export function leseZahl(text: string): number | null {
  const sauber = text.trim().replace(',', '.');
  if (sauber === '') return null;
  const wert = Number(sauber);
  return Number.isFinite(wert) ? wert : null;
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
