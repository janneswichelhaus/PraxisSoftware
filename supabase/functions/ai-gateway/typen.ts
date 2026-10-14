/**
 * Die Typen zwischen Browser, Gateway und Adapter (KI-EPIC-001, ADR-005).
 *
 * Wie beim Kartendienst steht der Vertrag hier und nicht in `src/`: Die
 * Function läuft in Deno und wird aus ihrem eigenen Verzeichnis gebündelt.
 * Die Gegenseite im Browser ist `src/lib/ki/gateway.ts`; `vertrag.test.ts`
 * hält beide aneinander - wer hier eine Fehlerklasse oder einen Abschnitt
 * erfindet, bekommt einen roten Test, keinen stillen Drift.
 *
 * **Datenminimierung als Typsache** (PROJECT_PRINCIPLES.md 6.1): Die
 * Anfragen an den Adapter tragen Audio, Format, Sprache und die Regeln des
 * Zwecks - kein Feld für Termin, Person, Konto oder Token. Was keinen Platz
 * im Typ hat, kann den Gateway nicht versehentlich verlassen.
 */

/** Die Sprache eines Diktats. Mehr als Deutsch gibt es nicht. */
export type Sprache = 'de';

/**
 * Fehlerklassen der Antwort (wie beim Kartendienst, ANN-090): `not_configured`
 * ist „hier ist nichts eingerichtet" und bewusst kein Ausfall; `forbidden`
 * heißt, die Datenbank hat das Diktat zu diesem Termin abgelehnt.
 */
export type Fehlerklasse =
  | 'session_invalid'
  | 'invalid_request'
  | 'forbidden'
  | 'not_configured'
  | 'too_large'
  | 'unavailable'
  | 'timeout';

/** Dieselbe Liste zur Laufzeit - der Vertragstest hängt daran. */
export const FEHLERKLASSEN = [
  'session_invalid',
  'invalid_request',
  'forbidden',
  'not_configured',
  'too_large',
  'unavailable',
  'timeout',
] as const satisfies readonly Fehlerklasse[];

/**
 * Woher die Antwort stammt. Steht in jeder Antwort, weil die Oberfläche es
 * sagen muss: Die Nachbildung liefert einen festen Text, gleich was gesprochen
 * wurde. Welcher Anbieter es war, erfährt der Fachcode nicht (ADR-005 Punkt 1).
 */
export type Quelle = 'anbieter' | 'nachbildung';

/** Ein Abschnitt der Dokumentationsvorlage mit dem eingeordneten Text. */
export interface Abschnitt {
  readonly titel: string;
  readonly text: string;
}

/**
 * `message` ist eine technische Meldung ohne Inhalt: kein Stück Transkript,
 * keine Kennung, keine Größe. Die Oberfläche zeigt eigene Sätze je `code`.
 */
export interface Gatewayfehler {
  readonly code: Fehlerklasse;
  readonly message: string;
}

/** Der Antwortkörper der Function. */
export type Antwort =
  | {
      readonly ok: true;
      readonly transkript: string;
      readonly abschnitte: readonly Abschnitt[];
      readonly quelle: Quelle;
    }
  | { readonly ok: false; readonly error: Gatewayfehler };

/**
 * Die Antwort auf die Frage vor „Sprechen“ (`GET`): Wird der Zweck hier
 * bedient? Nur ja oder nein - kein Anbieter, keine Quelle.
 */
export interface Statusantwort {
  readonly ok: true;
  readonly verfuegbar: boolean;
}

/** Was ein Adapter zurückgibt: Ergebnis oder eine der zwei Ausfallklassen. */
export type Adapterergebnis<T> =
  | { readonly ok: true; readonly value: T }
  | {
      readonly ok: false;
      readonly error: { readonly code: 'unavailable' | 'timeout'; readonly message: string };
    };

/** An den Adapter zur Spracherkennung: nur Audio, Format und Sprache. */
export interface Transkriptionsanfrage {
  readonly audio: Uint8Array;
  /** Grundformat ohne Parameter, etwa `audio/webm`. */
  readonly mime: string;
  readonly sprache: Sprache;
}

/** An den Adapter zur Einordnung: der Text, die Sprache und die Regeln des Zwecks. */
export interface Strukturierungsanfrage {
  readonly transkript: string;
  readonly sprache: Sprache;
  /** Die Strukturierungsregeln des Zwecks als Text (`zwecke.ts`). */
  readonly regeln: string;
  /** Die Abschnitte der Vorlage, in dieser Reihenfolge. */
  readonly abschnitte: readonly string[];
}

/**
 * Ein Anbieter hinter dem Gateway. Heute gibt es nur die Nachbildung
 * (`mock.ts`); ein echter Adapter entsteht erst nach der Anbieterentscheidung
 * und der Prüfung nach ADR-002 (ADR-005 Punkte 8 und 9).
 */
export interface Sprachadapter {
  /** Kennung für Zweckliste und Log, zum Beispiel `mock`. */
  readonly id: string;
  readonly quelle: Quelle;
  transkribiere(
    anfrage: Transkriptionsanfrage,
    signal: AbortSignal,
  ): Promise<Adapterergebnis<{ readonly transkript: string }>>;
  strukturiere(
    anfrage: Strukturierungsanfrage,
    signal: AbortSignal,
  ): Promise<Adapterergebnis<{ readonly abschnitte: readonly Abschnitt[] }>>;
}

/**
 * Was ein Fehler im Log hinterlässt (ADR-011): Zweck, Anbieterkennung,
 * Fehlerklasse und Dauer. Kein Feld für Inhalt, Kennung oder Größe der
 * Aufnahme - was nicht hineinpasst, kann nicht hineingeraten.
 */
export interface Protokolleintrag {
  /** Der geprüfte Zweck - nie der Wert aus der Anfrage, der beliebig sein kann. */
  readonly zweck: 'dokumentation.diktat' | 'unbekannt';
  /** Anbieterkennung oder die Stelle davor: `sitzung`, `berechtigung`, `gate`. */
  readonly anbieter: string;
  /** `gate_rejected`: Die Nachbildung ist in der Produktion ausgeschlossen. */
  readonly code: Fehlerklasse | 'gate_rejected';
  readonly dauerMs: number;
}
