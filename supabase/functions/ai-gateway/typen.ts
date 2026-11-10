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
 * Die Antwort auf „Ordnen“: die Sätze des getippten Textes im Wortlaut, je Abschnitt der
 * Vorlage. Der Text selbst geht nicht zurück - die Seite hat ihn.
 */
export interface Ordnungsantwort {
  readonly ok: true;
  readonly art: 'ordnen';
  readonly abschnitte: readonly Abschnitt[];
  readonly quelle: Quelle;
}

/**
 * Die Antwort aufs Umformen: je Satz der Eingabe genau ein Satz, in derselben Reihenfolge.
 * `unveraendert` heißt, dort steht die Eingabe im Wortlaut (`waechter.ts`).
 */
export interface Umformungsantwort {
  readonly ok: true;
  readonly art: 'umformen';
  readonly saetze: readonly { readonly text: string; readonly unveraendert: boolean }[];
  readonly quelle: Quelle;
}

/**
 * Die Antwort auf den Auszug: je Eintrag die gewählten Sätze im Wortlaut, in der Reihenfolge
 * der Eingabe. Ein Eintrag ohne gewählten Satz fehlt.
 */
export interface Auszugsantwort {
  readonly ok: true;
  readonly art: 'auszug';
  readonly auszuege: readonly { readonly id: string; readonly saetze: readonly string[] }[];
  readonly quelle: Quelle;
}

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

/** An den Adapter zur Einordnung: die Sätze des Transkripts, die Sprache und die Regeln des Zwecks. */
export interface Zuordnungsanfrage {
  /** In der Reihenfolge des Diktats, zerlegt vom Gateway (`inhaltstreue.ts`). */
  readonly saetze: readonly string[];
  readonly sprache: Sprache;
  /** Die Regeln des Zwecks als Text (`zwecke.ts`). */
  readonly regeln: string;
  /** Die Abschnitte der Vorlage, in dieser Reihenfolge. */
  readonly abschnitte: readonly string[];
}

/**
 * Ein Anbieter hinter dem Gateway; bis zur Freischaltung eines echten nach ADR-005 Punkt 8
 * nur die Nachbildung (`mock.ts`). Er ordnet je Satz einen Titel zu und liefert keinen
 * Text (ANN-824).
 */
export interface Sprachadapter {
  /** Kennung für Zweckliste und Protokolleintrag, zum Beispiel `mock`. */
  readonly id: string;
  readonly quelle: Quelle;
  transkribiere(
    anfrage: Transkriptionsanfrage,
    signal: AbortSignal,
  ): Promise<Adapterergebnis<{ readonly transkript: string }>>;
  ordneZu(
    anfrage: Zuordnungsanfrage,
    signal: AbortSignal,
  ): Promise<Adapterergebnis<{ readonly zuordnung: readonly string[] }>>;
}

/** An den Adapter zum Umformen: die Sätze, was mit ihnen geschehen soll, und die Regeln. */
export interface Umformanfrage {
  /** In der Reihenfolge des Textes, zerlegt vom Gateway (`waechter.ts`). */
  readonly saetze: readonly string[];
  readonly aufgabe: 'ausformulieren' | 'alltagssprache';
  readonly sprache: Sprache;
  readonly regeln: string;
}

/** An den Adapter zur Auswahl: je Eintrag seine Sätze - keine Kennung, kein Datum, kein Name. */
export interface Auswahlanfrage {
  /** Die Einträge in der Reihenfolge der Anfrage, jeder als Liste seiner Sätze. */
  readonly eintraege: readonly (readonly string[])[];
  readonly hoechstJeEintrag: number;
  readonly sprache: Sprache;
  readonly regeln: string;
}

/** Eine Stelle der Eingabe: der wievielte Eintrag, der wievielte Satz darin (ab 0). */
export interface Satzstelle {
  readonly eintrag: number;
  readonly satz: number;
}

/**
 * Ein Anbieter für die Hilfen ohne Ton. Was er liefert, ist eine Behauptung, bis der Gateway
 * sie an der Eingabe geprüft hat: Er nennt Stellen, den Wortlaut setzt der Gateway.
 */
export interface Assistenzadapter {
  readonly id: string;
  readonly quelle: Quelle;
  ordneZu(
    anfrage: Zuordnungsanfrage,
    signal: AbortSignal,
  ): Promise<Adapterergebnis<{ readonly zuordnung: readonly string[] }>>;
  /** Je Satz genau ein Satz, in derselben Reihenfolge. */
  formuliere(
    anfrage: Umformanfrage,
    signal: AbortSignal,
  ): Promise<Adapterergebnis<{ readonly saetze: readonly string[] }>>;
  /** Nur Stellen der Eingabe - kein Text. */
  waehleAus(
    anfrage: Auswahlanfrage,
    signal: AbortSignal,
  ): Promise<Adapterergebnis<{ readonly auswahl: readonly Satzstelle[] }>>;
}

/**
 * Was der Handler zu einem Fehler meldet (ADR-011) - einen Ausgang ins
 * Betriebslog gibt es dafür noch nicht (`index.ts`): Zweck, Anbieterkennung,
 * Fehlerklasse und Dauer. Kein Feld für Inhalt, Kennung oder Größe der
 * Aufnahme - was nicht hineinpasst, kann nicht hineingeraten.
 */
export interface Protokolleintrag {
  /** Der geprüfte Zweck - nie der Wert aus der Anfrage, der beliebig sein kann. */
  readonly zweck:
    | 'dokumentation.diktat'
    | 'dokumentation.ordnen'
    | 'nachricht.entwurf'
    | 'nachricht.alltagssprache'
    | 'verlauf.auszug'
    | 'unbekannt';
  /** Anbieterkennung oder die Stelle davor: `sitzung`, `berechtigung`, `gate`. */
  readonly anbieter: string;
  /** `gate_rejected`: Die Nachbildung ist in der Produktion ausgeschlossen. */
  readonly code: Fehlerklasse | 'gate_rejected';
  readonly dauerMs: number;
}
