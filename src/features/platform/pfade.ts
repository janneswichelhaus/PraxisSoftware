/**
 * Das Pfadpräfix der Plattform (ADR-023 Punkt 25). In einer eigenen Datei,
 * damit Seiten es importieren können, ohne an `PlattformApp` zu hängen.
 */
export const PLATTFORM_PFAD = '/p';

/**
 * Wohin die Einladung nach „PIN speichern“ führt: Es gibt keine eigene
 * Fertig-Seite, „Willkommen“ sagt einmal „Anmeldung eingerichtet“ (ANN-685,
 * `useEinmaligeRueckmeldung('eingerichtet')`).
 */
export const NACH_DER_EINRICHTUNG = `${PLATTFORM_PFAD}?eingerichtet=1`;

/** Der gewählte Bereich als Suchparameter, damit Links ihn mitnehmen (D6). */
export function bereichParameter(suche: URLSearchParams): string {
  return new URLSearchParams(
    Object.fromEntries([...suche.entries()].filter(([k]) => k === 'bereich' || k === 'zugang')),
  ).toString();
}
