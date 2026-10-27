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

/**
 * Der Stand in der Adresse, `ausfall=<Termin>.<Uhrstart>[.<Seite>]`: fester Länge, ohne Namen (ADR-011),
 * damit die Uhr ein Neuladen nach dem Wechsel in die Telefon-App übersteht. Wer abbricht, beginnt
 * wieder mit dem Klingeln, die Uhr läuft weiter (ANN-479).
 */
export const AUSFALL_PARAMETER = 'ausfall';

export interface AusfallStand {
  seit: number;
  seite: NiemandSeite | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Der Stand für diesen Termin; `null`, wenn die Adresse keinen für ihn trägt. */
export function ausfallAusAdresse(wert: string | null, terminId: string): AusfallStand | null {
  if (!wert) return null;
  const [id, seitText, seite] = wert.split('.');
  if (!id || !UUID.test(id) || id !== terminId || !seitText || !/^\d{1,15}$/.test(seitText)) {
    return null;
  }
  return {
    seit: Number(seitText),
    seite: FOLGE.find((s) => s === seite) ?? null,
  };
}

/** Der Wert für die Adresse. */
export function ausfallInAdresse(terminId: string, stand: AusfallStand): string {
  return [terminId, String(stand.seit), ...(stand.seite ? [stand.seite] : [])].join('.');
}

/** Die Folge bis zu einer Seite - damit „← Zurück“ nach dem Neuladen weiter geht. */
export function folgeBis(seite: NiemandSeite): NiemandSeite[] {
  return FOLGE.slice(0, FOLGE.indexOf(seite) + 1);
}
