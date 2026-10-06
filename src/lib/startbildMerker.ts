/**
 * Der Merker des Startbilds: einmal je Sitzung (Handoff Rahmen vom
 * 2026-10-05, Abschnitt 6; Entscheidung Jannes; ANN-243).
 *
 * `sessionStorage` statt `localStorage`: Der Wert lebt genau so lange wie der
 * Tab. Ein neuer Tab ist ein neuer Start und bekommt das Intro; ein Neuladen,
 * ein Seitenwechsel oder das Zurückkehren aus dem Hintergrund nicht. Beim
 * Abmelden wird er gelöscht (`SessionProvider`), damit die nächste Anmeldung
 * wieder mit dem Intro beginnt.
 *
 * Ein Wahrheitswert, kein Inhalt: Es steht nichts über die Person, die Praxis
 * oder eine Akte darin (ANN-019 bleibt gewahrt). Ohne Speicher - privates
 * Fenster, gesperrter Speicher - gilt „noch nicht gezeigt", und der
 * Fehler bleibt still: Ein Intro zu viel ist kein Schaden, ein Absturz beim
 * Start wäre einer.
 */
export const STARTBILD_MERKER = 'startbild-gezeigt';

function speicher(): Storage | undefined {
  try {
    return window.sessionStorage;
  } catch {
    return undefined;
  }
}

/** Steht das Intro in dieser Sitzung noch aus? */
export function startbildFaellig(): boolean {
  try {
    return speicher()?.getItem(STARTBILD_MERKER) !== '1';
  } catch {
    return true;
  }
}

/** Beim Start des Intros - nicht erst am Ende, damit ein Abbruch nicht wiederholt. */
export function startbildVormerken(): void {
  try {
    speicher()?.setItem(STARTBILD_MERKER, '1');
  } catch {
    // Ohne Speicher kein Merker; siehe oben.
  }
}

/** Beim Abmelden: Die nächste Anmeldung beginnt wieder mit dem Intro. */
export function startbildZuruecksetzen(): void {
  try {
    speicher()?.removeItem(STARTBILD_MERKER);
  } catch {
    // Ohne Speicher gibt es nichts zu löschen.
  }
}
