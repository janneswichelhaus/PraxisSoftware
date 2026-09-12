/**
 * Feldfehler eines Formulars, aufbereitet für die Zusammenfassung (UX-012).
 *
 * Getrennt von der Komponente wie `rueckweg.ts` von `Rueckweg.tsx`: Die
 * Aufbereitung ist reine Logik, für sich prüfbar und ohne React.
 */

export interface Formularfehler {
  /** Kennung des Feldes, auf das der Eintrag springt (`feldId`). */
  feldId: string;
  /** Beschriftung des Feldes, damit der Eintrag ohne Blick verständlich ist. */
  feld: string;
  meldung: string;
}

/**
 * Baut die Zusammenfassung aus den Feldfehlern eines Formulars.
 *
 * Die Reihenfolge folgt der Feldreihenfolge und nicht der Fundreihenfolge der
 * Prüfung: Wer die Liste von oben abarbeitet, geht damit durch das Formular
 * und nicht kreuz und quer.
 */
export function alsFormularfehler<F extends string>(
  reihenfolge: readonly F[],
  beschriftungen: Readonly<Record<F, string>>,
  fehler: Partial<Record<F, string>>,
  feldId: (feld: F) => string,
): Formularfehler[] {
  return reihenfolge
    .filter((feld) => Boolean(fehler[feld]))
    .map((feld) => ({
      feldId: feldId(feld),
      feld: beschriftungen[feld],
      meldung: fehler[feld]!,
    }));
}
