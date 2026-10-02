/**
 * `MDR_REVIEW_REQUIRED` — wo die Klassifikation geführt wird und wie sie wirkt.
 *
 * ADR-006 Punkt 6 verlangt, Features an der MDR-Grenze zu klassifizieren. Die
 * „Konsequenzen" desselben ADR verlangen mehr: geführt, **sichtbar** und
 * **technisch wirksam** — ein so markiertes Feature darf produktiv nicht
 * erreichbar sein, solange die regulatorische Prüfung nicht dokumentiert
 * vorliegt. Punkt 13 schließt die Hintertür: „Ein Feature-Flag ersetzt die
 * Prüfung nicht." Seit `PROJECT_PRINCIPLES.md` 0.13 §17 steht dieselbe Pflicht
 * an Rang 1. Bis hierher stand `MDR_REVIEW_REQUIRED` an keiner Codestelle,
 * sondern nur in der Dokumentation (ADR-006, „Offene Folgefragen"). Diese Datei
 * ist sie — und die einzige.
 *
 * **Zwei Hälften, und sie sind nicht dasselbe.**
 *
 *   * Einträge **ohne Pfad** sind Ausgabeverbote. ADR-006 nimmt ihre
 *     technische Durchsetzung ausdrücklich aus („Bewusst nicht Bestandteil":
 *     kein Schema, keine Migration, kein Code, kein Test) — ein Verbot, etwas
 *     **nicht** zu bauen, lässt sich nicht erzwingen. Sie stehen hier, damit
 *     der Zuschnitt eines Loops sie benennen kann und der Zweitreview eine
 *     Liste hat. Wer an ihnen einen Riegel sucht, sucht am falschen Ort.
 *   * Einträge **mit Pfad** sind Funktionen, die es einmal geben könnte und
 *     die dann eine Adresse hätten. Die Adresse ist reserviert und gesperrt:
 *     `mdrSperre` fängt sie in `src/routes/AuthenticatedRoutes.tsx` ab, bevor
 *     die Routentabelle überhaupt gefragt wird. Eine später eingetragene Route
 *     gewinnt dagegen nicht — das ist der Unterschied zu einem Eintrag, der
 *     nur in einer Prüfliste steht.
 *
 * **Eine reservierte Adresse ist keine Planung.** Sie sagt nicht, dass die
 * Funktion kommt oder wo sie hinkäme; sie sagt, dass dort nichts erreichbar
 * wird. Bekommt die Funktion später eine andere Adresse, wandert sie im
 * Eintrag mit — der Eintrag selbst bleibt, weil `mdr.test.ts` die Vollzähligkeit
 * gegen die Dokumente hält.
 *
 * **Es gibt keinen Schalter.** Kein Feld, keine Umgebungsvariable, kein Flag:
 * Ein Eintrag ist gesperrt, solange er keinen **Freigabevermerk** trägt. Seit
 * ABN-019 (BEF-110, Abnahme Jannes 2026-10-02) genügt das Entfernen des
 * Eintrags nicht mehr — `mdr.test.ts` hält die Vollzähligkeit —, sondern eine
 * Funktion öffnet erst mit einer dokumentierten MDR-Prüfung am Eintrag: wer,
 * wann, mit welchem Ergebnis, und der Verweis auf das Prüfdokument im
 * Repository. Ein Vermerk ist kein Schalter: Er ist ein Nachweis, der im Diff
 * steht, und `mdr.test.ts` prüft jedes Feld und dass das Dokument existiert.
 * Auf dem Server antwortet `app.mdr_released(id)`; jede künftige
 * Serverfunktion eines klassifizierten Bereichs fragt sie (heute für jede
 * Kennung `false`).
 *
 * Diese Verortung ist **ANN-089**.
 */

/** Ein Merkmal, das nach ADR-006 Punkt 6 klassifiziert ist. */
export interface MdrEintrag {
  /** Stabil über die Zeit; Test, Zuschnitt und Bericht nennen ihn. */
  id: string;
  bezeichnung: string;
  /** Woher die Klassifikation kommt — mindestens eine Fundstelle je Eintrag. */
  grundlage: readonly string[];
  /**
   * Die Ausgabe, die nicht entsteht.
   *
   * Ein Satz, kein Absatz: Der Zuschnitt eines Loops muss ihn abschreiben
   * können (ADR-006, „Konsequenzen": der Zuschnitt sagt, welche Ausgabe nicht
   * entsteht).
   */
  keineAusgabe: string;
  /**
   * Reservierte Adressen als Pfadanfänge.
   *
   * Leer bei einem Ausgabeverbot: Es hat keine eigene Adresse, sondern
   * betrifft, was auf ohnehin vorhandenen Seiten steht.
   */
  pfade: readonly string[];
  /**
   * Der Freigabevermerk nach dokumentierter MDR-Prüfung (ADR-006 Punkt 6 und
   * 7, ABN-019, BEF-110). Fehlt er, ist der Eintrag gesperrt.
   */
  freigabe?: MdrFreigabe;
}

/** Der Nachweis einer MDR-Prüfung - kein Wahrheitswert, sondern vier Angaben. */
export interface MdrFreigabe {
  /** Wer geprüft hat: Person oder Stelle, etwa die externe Prüfung B1. */
  geprueftVon: string;
  /** Tag der Prüfung, `YYYY-MM-DD`. */
  geprueftAm: string;
  /** Das Ergebnis im Wortlaut der Prüfung, ein Satz. */
  ergebnis: string;
  /** Pfad des Prüfdokuments im Repository, etwa `docs/regulatorik/….md`. */
  verweis: string;
}

/** Ist der Vermerk vollständig? Nur dann öffnet er etwas. */
export function freigabeVollstaendig(freigabe: MdrFreigabe | undefined): boolean {
  return (
    freigabe !== undefined &&
    freigabe.geprueftVon.trim() !== '' &&
    /^\d{4}-\d{2}-\d{2}$/.test(freigabe.geprueftAm) &&
    freigabe.ergebnis.trim() !== '' &&
    freigabe.verweis.trim() !== ''
  );
}

/**
 * Was heute als `MDR_REVIEW_REQUIRED` geführt wird.
 *
 * Jeder Eintrag steht in einem verbindlichen Dokument — hier wird nichts
 * klassifiziert, was dort nicht schon klassifiziert ist. Umgekehrt gilt:
 * Klassifiziert ein neuer ADR oder eine neue Fassung ein Merkmal, kommt es
 * hierher, sonst ist es nur eine Behauptung.
 */
export const MDR_REVIEW_REQUIRED: readonly MdrEintrag[] = [
  {
    id: 'verbot-uebungsauswahl',
    bezeichnung: 'Übungsauswahl aus Diagnose oder Befund',
    grundlage: ['ADR-006 Punkt 10 und 13', 'PROJECT_PRINCIPLES.md §17 Verbot 1'],
    keineAusgabe:
      'Keine Liste, Sortierung, Vorbelegung oder Dosierung, die aus Diagnose, Befund, ' +
      'Screening-Antwort oder Verlauf abgeleitet ist – Katalog, Suche und Vorlagen bleiben.',
    pfade: [],
  },
  {
    id: 'verbot-verlaufsbewertung',
    bezeichnung: 'Bewertung von Schmerzskala oder Verlauf',
    grundlage: ['ADR-006 Punkt 11 und 13', 'PROJECT_PRINCIPLES.md §17 Verbot 2'],
    keineAusgabe:
      'Kein eigener Score, keine Risikoklasse, keine Ampel, kein Schwellenwertalarm und kein ' +
      '„Verschlechterung“ – die Kurve über die Zeit bleibt, die Aussage über sie entsteht nicht.',
    pfade: [],
  },
  {
    id: 'verbot-screening-freigabe',
    bezeichnung: 'Trainingsfreigabe aus einem Screening-Fragebogen',
    grundlage: ['ADR-006 Punkt 12 und 13', 'PROJECT_PRINCIPLES.md §17 Verbot 3'],
    keineAusgabe:
      'Keine Eignung, Freigabe, Kontraindikation, kein Abbruch und keine Empfehlung zum ' +
      'Arztbesuch aus den Antworten – auch nicht als Zwischenergebnis oder Vorbelegung.',
    pfade: [],
  },
  {
    id: 'cutoff-anzeige',
    bezeichnung: 'Cut-off, MCID und MDC neben dem eigenen Wert',
    grundlage: [
      'ADR-006 Punkt 6',
      'ADR-006, offene Folgefrage zum veröffentlichten Cutoff',
      'src/features/assessments/schema.ts (interpretationSchema)',
    ],
    keineAusgabe:
      'Gespeichert wird im Wortlaut der Quelle, angezeigt wird nichts davon: Ob ein ' +
      'veröffentlichter Schwellenwert neben dem eigenen Wert stehen darf, gehört in die ' +
      'externe Prüfung B1.',
    pfade: [],
  },
  {
    id: 'ki-analyse',
    bezeichnung: 'KI-Analyse im Trainingsbereich',
    grundlage: [
      'ADR-006 Punkt 13 (einer der drei MDR-nahen Bereiche)',
      'ROADMAP.md Etappe TR, Navigationspunkt 15; „Nicht in V1“',
    ],
    keineAusgabe:
      'Keine aus Trainings-, Screening- oder Verlaufsdaten abgeleitete Einschätzung, ' +
      'Empfehlung oder Bewertung – auch nicht hinter dem Gateway aus ADR-005.',
    pfade: ['/training/ki-analyse'],
  },
  {
    id: 'uebungsanalyse',
    bezeichnung: 'Übungsanalyse über die Zeit',
    grundlage: ['ROADMAP.md Etappe TR, Navigationspunkt 7; „Nicht in V1“'],
    keineAusgabe:
      'Die ableitende Hälfte entsteht nicht; was bliebe, wäre die anzeigende und ' +
      'aufzeichnende (ADR-006 Punkt 13).',
    pfade: ['/training/uebungsanalyse'],
  },
  {
    id: 'progression-regelwerk',
    bezeichnung: 'Automatische Progression nach Regelwerk',
    grundlage: ['ROADMAP.md „Nicht in V1“ (Progression, §17 Verbot 1, bis B10)'],
    keineAusgabe:
      'Keine vorgeschlagene oder vorbelegte Steigerung von Last, Umfang oder Intensität aus ' +
      'erfassten Daten – auch nicht im Schattenbetrieb mit offengelegter Regel.',
    pfade: ['/training/progression'],
  },
];

/**
 * Der Eintrag, der eine Adresse sperrt — oder `undefined`.
 *
 * Pfadanfang wie in `aktiverBereich`: `/training/ki-analyse` sperrt alles
 * darunter, aber nicht `/training/ki-analysen`. Ein Ausgabeverbot ohne Pfad
 * kommt hier nie heraus; es hat keine Adresse, an der es zu sperren wäre.
 */
export function mdrSperre(
  pfad: string,
  register: readonly MdrEintrag[] = MDR_REVIEW_REQUIRED,
): MdrEintrag | undefined {
  return register.find(
    (eintrag) =>
      !freigabeVollstaendig(eintrag.freigabe) &&
      eintrag.pfade.some((reserviert) => pfad === reserviert || pfad.startsWith(`${reserviert}/`)),
  );
}
