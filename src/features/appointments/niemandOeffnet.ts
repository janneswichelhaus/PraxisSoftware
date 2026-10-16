/**
 * „Niemand öffnet?“ am Hausbesuch, geführt (Überholung 6, G1, ANN-573) - die
 * Folge ohne Oberfläche.
 *
 * Das Protokoll ist das aus ADR-018 Punkt 9: geklingelt, 15 Minuten
 * gewartet, angerufen. Die Reihenfolge der Seiten folgt dem Referenzabgleich
 * (Lieferdienste: erst Kontakt, dann die Uhr): Wer gleich anruft, während die
 * Uhr läuft, bekommt die Tür vielleicht noch auf, bevor die Viertelstunde um
 * ist - und spart eine Seite. Die Uhr läuft ab dem Tipp auf „Niemand öffnet?“
 * (ANN-479) und steht auf der letzten Seite; vermerkt wird erst nach 15
 * Minuten oder mit der ausdrücklichen Angabe, schon vorher gewartet zu haben.
 * Bestätigt werden alle drei Schritte wie bisher mit einem Aufruf von
 * `record_no_show` - am Server ändert sich nichts.
 */

export type NiemandSeite = 'geklingelt' | 'angerufen' | 'gewartet';

/** Wie lange vor Ort gewartet wird (ADR-018 Punkt 9, Schritt 2). */
export const WARTEZEIT_MS = 15 * 60 * 1000;

const FOLGE: readonly NiemandSeite[] = ['geklingelt', 'angerufen', 'gewartet'];

export const FRAGE: Record<NiemandSeite, string> = {
  geklingelt: 'An der Tür geklingelt?',
  angerufen: 'Angerufen?',
  gewartet: '15 Minuten gewartet?',
};

/** Die Seite nach einer bestätigten; nach der letzten keine. */
export function naechsteSeite(seite: NiemandSeite): NiemandSeite | null {
  return FOLGE[FOLGE.indexOf(seite) + 1] ?? null;
}

/** „Schritt 2 von 3“ mit Balken - der Weg verzweigt nicht. */
export function niemandStand(seite: NiemandSeite): { text: string; wert: number; von: number } {
  const nummer = FOLGE.indexOf(seite) + 1;
  return { text: `Schritt ${nummer} von ${FOLGE.length}`, wert: nummer, von: FOLGE.length };
}

/** `3:05` - Minuten und Sekunden. */
export function minutenSekunden(ms: number): string {
  const sekunden = Math.floor(ms / 1000);
  return `${Math.floor(sekunden / 60)}:${String(sekunden % 60).padStart(2, '0')}`;
}

/** Wie lange schon gewartet wird, höchstens die Viertelstunde. */
export function gewartet(seit: number, jetzt: number): { vergangen: number; um: boolean } {
  const vergangen = Math.min(WARTEZEIT_MS, Math.max(0, jetzt - seit));
  return { vergangen, um: vergangen >= WARTEZEIT_MS };
}

/**
 * Ob vermerkt werden darf: die Viertelstunde ist um, oder die Person sagt
 * ausdrücklich, dass sie schon vor dem Tipp gewartet hat (die Uhr startet
 * erst mit ihm, nicht bei der Ankunft). Gespeichert wird das nicht - es ist
 * die Bestätigung des Protokollschritts, wie der Haken vorher.
 */
export function darfVermerken(um: boolean, schonVorher: boolean): boolean {
  return um || schonVorher;
}
