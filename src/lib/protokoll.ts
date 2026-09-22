/**
 * Der eine Ausgang für Betriebslogs (ADR-011, OPS-004).
 *
 * ADR-011 Punkt 6 verlangt **eine** Stelle, die Ausgaben filtert, bevor sie
 * das Programm verlassen — strukturell dieselbe Entscheidung wie beim AI
 * Gateway aus ADR-005 und aus demselben Grund: Was viele Stellen ausgeben,
 * prüft niemand. `src/protokollierung.test.ts` hält fest, dass es im ganzen
 * Repository bei den erklärten Ausgängen bleibt.
 *
 * **Die Redaction arbeitet mit einer Erlaubnisliste, nicht mit einer
 * Verbotsliste.** Das ist der Kern dieses Moduls und der Grund, warum es
 * überhaupt eines gibt. Die Verbotsliste aus ADR-011 Punkt 2 nennt unter
 * anderem Patientennamen — kein Muster der Welt erkennt einen Namen
 * zuverlässig, und ein Filter, der es behauptet, ist schlimmer als keiner. Hier
 * kommt deshalb nur heraus, was vorher als unbedenklich **beschrieben** wurde:
 * ein fester Bezeichner aus dem Quelltext, interne UUIDs und endliche Zahlen.
 * Alles andere wird zu `[entfernt]`. Ein Name fällt damit nicht auf, weil er
 * als Name erkannt würde, sondern weil er keine UUID ist.
 *
 * Die Verbotsliste ist trotzdem nicht nur Vorsatz: `protokoll.test.ts` liest
 * sie aus `ADR-011` und schickt zu jedem ihrer Punkte eine Probe hier hindurch.
 * Das ist die Antwort auf die offene Folgefrage des ADR („Wie wird die
 * Verbotsliste automatisiert geprüft — in CI, zur Laufzeit, oder beides?"):
 * beides, und die Erlaubnisliste ist der Mechanismus, die Verbotsliste das
 * Prüfziel.
 *
 * **Was hier nicht hineingehört:** Audit- und Sicherheitsereignisse. ADR-011
 * Punkt 1 trennt die drei Logarten, weil sie verschiedene Empfänger und
 * verschiedene Fristen haben; in einem Topf gilt am Ende für alle die laxeste
 * Regel. Auditereignisse entstehen über `log_patient_record_view` und
 * `log_account_security_event` in der Datenbank (ADR-010) — ein Eintrag hier
 * erzeugt keinen Auditeintrag, auch wenn er denselben Vorgang beschreibt.
 */

/**
 * Frist für Betriebslogs aus ADR-011 Punkt 4, in Tagen.
 *
 * **Anker für ANN-001** („Interne Initialfristen des Retention Schedule") für
 * die Klasse Betriebslogs. Das Register nennt dort `public.retention_classes`
 * als einzige Stelle — für diese Klasse trifft das nicht zu und kann es nicht:
 * Betriebslogs liegen nicht in unserer Datenbank, sondern beim
 * Plattformbetrieb. Bis zu dieser Zeile hatte der Wert deshalb als einziger
 * der Tabelle keinen Ort im Code.
 *
 * **R14 ist damit nicht erledigt, sondern sichtbar.** Der Plattformbetrieb
 * hält Logs unterhalb von Enterprise 1 bis 28 Tage (OPS-001) — die Zahl hier
 * ist die *Anforderung* aus dem ADR, nicht der gemessene Zustand. Die Lücke
 * schließt entweder eine andere Frist (neue Fassung von ADR-011) oder ein
 * Ausleitungsweg (ein zweiter Auftragsverarbeiter mit eigenem Prüfkatalog);
 * beides gehört Jannes und steht in `docs/STATUS.md`. Bis dahin gilt: Was
 * länger als diese Frist nachweisbar sein muss, darf hier nicht der einzige
 * Nachweis sein — das ist derselbe Satz wie „Audit gehört nicht hierher",
 * nur von der Frist her gelesen.
 *
 * `src/protokollierung.test.ts` hält den Wert gegen die Tabelle in ADR-011.
 */
export const BETRIEBSLOG_FRIST_TAGE = 30;

/** Was anstelle eines nicht beschriebenen Wertes ausgegeben wird. */
export const ENTFERNT = '[entfernt]';

/**
 * Ein fester Bezeichner: `bereich.vorgang`, kleingeschrieben, ohne Leerzeichen.
 *
 * Absichtlich so eng, dass eine Zeichenkette mit Inhalt durchfällt. Wer
 * `` `Akte ${name} nicht lesbar` `` übergibt, bekommt `[entfernt]` — nicht,
 * weil der Name erkannt wurde, sondern weil das Muster keine Leerzeichen und
 * keine Großbuchstaben kennt.
 *
 * Dasselbe Muster gilt für die **Schlüssel** von `ids` und `werte`, und
 * deshalb heißen sie `dauer_ms` und nicht `dauerMs`: Ein Schlüssel, der aus
 * Daten gebaut wird (`{ [person.vorname]: … }`), soll genauso auffallen wie
 * ein Wert. Der Restfall bleibt und sei benannt — ein einzelner
 * kleingeschriebener Vorname als Schlüssel käme durch. Dagegen hilft keine
 * Redaction, sondern nur die Regel davor, und ADR-011 sagt das selbst: „Sie
 * ist die zweite Verteidigungslinie hinter der Regel, sensible Inhalte gar
 * nicht erst zu loggen."
 */
const BEZEICHNER = /^[a-z][a-z0-9._]*$/;

/** Obergrenze für einen Bezeichner. Ein Freitext ist selten so kurz. */
const BEZEICHNER_MAXLAENGE = 64;

/** Interne Objekt- und Request-IDs (ADR-011 Punkt 3) sind UUIDs. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Schlüsselnamen, die nie in ein Betriebslog gehören — unabhängig vom Wert.
 *
 * Die Erlaubnisliste für Werte deckt fast alles ab: Ein Kennwort ist keine
 * UUID. Sie deckt **nicht** den Fall ab, dass ein Geheimnis zufällig wie eine
 * UUID aussieht — manche Sitzungs- und API-Schlüssel tun das. Diese Zeile ist
 * die Antwort darauf, und sie ist die einzige Stelle des Moduls, die wirklich
 * eine Verbotsliste ist: Sie prüft den Namen, den der Quelltext vergibt, nicht
 * den Inhalt, den ein Fremder bestimmt.
 */
const VERBOTENE_SCHLUESSEL =
  /passwor|kennwort|token|cookie|authoriz|secret|geheim|bearer|api[-_]?key|jwt|session/i;

/** Ein Betriebsereignis: was geschah, woran es hängt, wie lange es dauerte. */
export interface Betriebsereignis {
  /**
   * Fester Bezeichner aus dem Quelltext, z. B. `auth.abmeldung_fehlgeschlagen`.
   * Kein Freitext, keine Fehlermeldung eines Fremdsystems, keine Vorlage mit
   * eingesetzten Werten.
   */
  ereignis: string;
  /** Interne Objekt- und Request-IDs zur Korrelation (ADR-011 Punkt 3). */
  ids?: Record<string, unknown>;
  /** Technische Messwerte ohne Personenbezug, etwa eine Dauer in Millisekunden. */
  werte?: Record<string, unknown>;
}

function istBezeichner(wert: unknown): wert is string {
  return typeof wert === 'string' && wert.length <= BEZEICHNER_MAXLAENGE && BEZEICHNER.test(wert);
}

/** Ein Paar `schluessel=wert`; beide Seiten müssen beschrieben sein. */
function paar(schluessel: string, wert: string): string {
  if (!istBezeichner(schluessel) || VERBOTENE_SCHLUESSEL.test(schluessel)) {
    return `${ENTFERNT}=${ENTFERNT}`;
  }
  return `${schluessel}=${wert}`;
}

/**
 * Die zentrale Redaction (ADR-011 Punkt 6).
 *
 * Eigene Funktion und ausdrücklich exportiert, damit sie prüfbar ist, ohne
 * dass ein Test die Konsole belauschen muss: Was diese Funktion zurückgibt,
 * ist genau das, was das Programm verlässt.
 */
export function redigiere(ereignis: Betriebsereignis): string {
  const teile: string[] = [istBezeichner(ereignis.ereignis) ? ereignis.ereignis : ENTFERNT];

  for (const [schluessel, wert] of Object.entries(ereignis.ids ?? {})) {
    teile.push(paar(schluessel, typeof wert === 'string' && UUID.test(wert) ? wert : ENTFERNT));
  }

  for (const [schluessel, wert] of Object.entries(ereignis.werte ?? {})) {
    const zahl = typeof wert === 'number' && Number.isFinite(wert) ? String(wert) : ENTFERNT;
    teile.push(paar(schluessel, zahl));
  }

  return teile.join(' ');
}

/*
 * Ab hier die einzigen beiden `console`-Aufrufe in `src/`. Dass sie die
 * einzigen bleiben, sichert nicht ein Kommentar, sondern zweierlei: Die
 * Lint-Regel `no-console` ist ausnahmslos scharf und wird in
 * `eslint.config.js` **nur für diese Datei** aufgehoben, und
 * `src/protokollierung.test.ts` prüft beides gegen den Quelltext — auch für
 * die Edge Function, die ihre eigene Laufzeit hat und diese Datei nicht
 * importieren kann.
 */

/** Ein Betriebsfehler: etwas ging schief und jemand sollte es sehen. */
export function protokolliereFehler(ereignis: Betriebsereignis): void {
  console.error(redigiere(ereignis));
}

/** Eine Auffälligkeit, die den Ablauf nicht aufhält. */
export function protokolliereWarnung(ereignis: Betriebsereignis): void {
  console.warn(redigiere(ereignis));
}
