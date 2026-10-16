/**
 * Die Abfolge eines geführten Ablaufs ohne Oberfläche (Überholung 6,
 * ANN-572): welche Seite gerade gilt, woher man kam und ob gerade aus dem
 * Abschluss heraus geändert wird.
 *
 * Welche Seite auf welche folgt, weiß der einzelne Ablauf - die Verzweigung
 * ist seine reine Logik (`fleet/pannenablauf.ts`, `appointments/nichtangetroffen.ts`).
 * Hier steht nur, was jeder Ablauf gleich braucht:
 *
 *   * **Weiter** legt die Seite auf den Weg und geht zur nächsten.
 *   * **Zurück** - auch die Zurückgeste des Telefons - geht dorthin, woher man
 *     kam, nicht auf eine Seite, die nie zu sehen war (Praxis-Review FLT-005).
 *   * **Ändern** aus dem Abschluss: Die gewählte Seite öffnet sich, und sobald
 *     der Ablauf wieder vollständig ist, geht es zurück zum Abschluss statt
 *     durch alle übrigen Seiten. Fehlt nach der Änderung noch eine Angabe -
 *     etwa weil eine andere Antwort eine Folgefrage braucht -, führt der
 *     Ablauf erst durch sie. „← Zurück“ führt aus dem Ändern ebenfalls zum
 *     Abschluss zurück.
 *
 * Seiten sind beliebige Werte; verglichen wird nichts. Der Weg ist ein Stapel.
 */
export interface Abfolge<S> {
  seite: S;
  /** Die Seiten davor, die letzte zuoberst. Leer heißt: erste Seite. */
  verlauf: readonly S[];
  /** Aus dem Abschluss heraus geändert: dorthin geht es zurück. */
  rueckkehr: { seite: S; verlauf: readonly S[] } | null;
}

export function beginne<S>(seite: S): Abfolge<S> {
  return { seite, verlauf: [], rueckkehr: null };
}

/**
 * Zur nächsten Seite. Wird gerade aus dem Abschluss geändert und ist der
 * Ablauf mit dieser Antwort `vollstaendig`, geht es zurück zum Abschluss -
 * mit dem Weg, den er vor dem Ändern hatte.
 */
export function weiter<S>(abfolge: Abfolge<S>, naechste: S, vollstaendig = false): Abfolge<S> {
  if (abfolge.rueckkehr && vollstaendig) {
    return { ...abfolge.rueckkehr, rueckkehr: null };
  }
  return {
    seite: naechste,
    verlauf: [...abfolge.verlauf, abfolge.seite],
    rueckkehr: abfolge.rueckkehr,
  };
}

/** Ob „← Zurück“ etwas zu tun hat; auf der ersten Seite nicht. */
export function kannZurueck<S>(abfolge: Abfolge<S>): boolean {
  return abfolge.verlauf.length > 0;
}

/**
 * Eine Seite zurück, dorthin, woher man kam. `null` auf der ersten Seite -
 * dort fragt das Fenster wie beim Schließen.
 */
export function zurueck<S>(abfolge: Abfolge<S>): Abfolge<S> | null {
  if (abfolge.verlauf.length === 0) return null;
  const verlauf = abfolge.verlauf.slice(0, -1);
  const seite = abfolge.verlauf[abfolge.verlauf.length - 1]!;
  // Zurück bis zum Abschluss, aus dem geändert wurde: Das Ändern ist vorbei.
  const zumAbschluss = abfolge.rueckkehr && verlauf.length === abfolge.rueckkehr.verlauf.length;
  return { seite, verlauf, rueckkehr: zumAbschluss ? null : abfolge.rueckkehr };
}

/** Aus dem Abschluss eine Seite ändern; danach geht es dorthin zurück. */
export function aendern<S>(abfolge: Abfolge<S>, ziel: S): Abfolge<S> {
  return {
    seite: ziel,
    verlauf: [...abfolge.verlauf, abfolge.seite],
    rueckkehr: abfolge.rueckkehr ?? { seite: abfolge.seite, verlauf: abfolge.verlauf },
  };
}

/** Ob gerade aus dem Abschluss heraus geändert wird. */
export function imAendern<S>(abfolge: Abfolge<S>): boolean {
  return abfolge.rueckkehr !== null;
}

/** „Schritt 2 von 4“ - ohne feste Zahl (ein verzweigter Weg) nur „Schritt 2“. */
export function schrittText(nummer: number, von?: number): string {
  return von ? `Schritt ${nummer} von ${von}` : `Schritt ${nummer}`;
}
