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
 * Ein Eintrag ist gesperrt, solange er hier steht. Der einzige Weg, eine
 * Funktion zu öffnen, ist, ihren Eintrag zu entfernen — ein sichtbarer Diff an
 * genau einer Datei, den `mdr.test.ts` rot macht, solange
 * `REGULATORISCHE_PRUEFUNG` fehlt.
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
}

/**
 * Die dokumentierte regulatorische Prüfung nach ADR-006 Punkt 6 und 7.
 *
 * `null` — es gibt sie nicht, und der Typ lässt nichts anderes zu. Das ist
 * Absicht: Wäre hier ein Wahrheitswert oder eine Umgebungsvariable, wäre die
 * Sperre ein Schalter, und genau das verbietet Punkt 13. Wer die Prüfung
 * vorlegt, ändert den Typ mit — ein Eingriff, der im Diff steht und nicht in
 * einer Konfiguration verschwindet.
 */
export const REGULATORISCHE_PRUEFUNG: null = null;

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
      'Screening-Antwort oder Verlauf abgeleitet ist — Katalog, Suche und Vorlagen bleiben.',
    pfade: [],
  },
  {
    id: 'verbot-verlaufsbewertung',
    bezeichnung: 'Bewertung von Schmerzskala oder Verlauf',
    grundlage: ['ADR-006 Punkt 11 und 13', 'PROJECT_PRINCIPLES.md §17 Verbot 2'],
    keineAusgabe:
      'Kein eigener Score, keine Risikoklasse, keine Ampel, kein Schwellenwertalarm und kein ' +
      '„Verschlechterung" — die Kurve über die Zeit bleibt, die Aussage über sie entsteht nicht.',
    pfade: [],
  },
  {
    id: 'verbot-screening-freigabe',
    bezeichnung: 'Trainingsfreigabe aus einem Screening-Fragebogen',
    grundlage: ['ADR-006 Punkt 12 und 13', 'PROJECT_PRINCIPLES.md §17 Verbot 3'],
    keineAusgabe:
      'Keine Eignung, Freigabe, Kontraindikation, kein Abbruch und keine Empfehlung zum ' +
      'Arztbesuch aus den Antworten — auch nicht als Zwischenergebnis oder Vorbelegung.',
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
      'ROADMAP.md Etappe TR, Navigationspunkt 15; „Nicht in V1"',
    ],
    keineAusgabe:
      'Keine aus Trainings-, Screening- oder Verlaufsdaten abgeleitete Einschätzung, ' +
      'Empfehlung oder Bewertung — auch nicht hinter dem Gateway aus ADR-005.',
    pfade: ['/training/ki-analyse'],
  },
  {
    id: 'uebungsanalyse',
    bezeichnung: 'Übungsanalyse über die Zeit',
    grundlage: ['ROADMAP.md Etappe TR, Navigationspunkt 7; „Nicht in V1"'],
    keineAusgabe:
      'Die ableitende Hälfte entsteht nicht; was bliebe, wäre die anzeigende und ' +
      'aufzeichnende (ADR-006 Punkt 13).',
    pfade: ['/training/uebungsanalyse'],
  },
  {
    id: 'progression-regelwerk',
    bezeichnung: 'Automatische Progression nach Regelwerk',
    grundlage: ['ROADMAP.md „Nicht in V1" (Progression, §17 Verbot 1, bis B10)'],
    keineAusgabe:
      'Keine vorgeschlagene oder vorbelegte Steigerung von Last, Umfang oder Intensität aus ' +
      'erfassten Daten — auch nicht im Schattenbetrieb mit offengelegter Regel.',
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
export function mdrSperre(pfad: string): MdrEintrag | undefined {
  return MDR_REVIEW_REQUIRED.find((eintrag) =>
    eintrag.pfade.some((reserviert) => pfad === reserviert || pfad.startsWith(`${reserviert}/`)),
  );
}
