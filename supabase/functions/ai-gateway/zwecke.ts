// Die Zweckliste des Gateways (ADR-005, PROJECT_PRINCIPLES.md 6.1): Ein Aufruf ohne Zweck aus
// dieser Liste geht nirgendwohin. Je Zweck stehen Eingabe, Gegenstand der Berechtigung, Adapter,
// Ausgabe und Regeln fest; Grenzen und Abschnitte hängen über `vertrag.test.ts` am Browser.

import type { Sprache } from './typen.ts';

/** Die Kennung eines Zwecks. */
export type Zweckkennung =
  | 'dokumentation.diktat'
  | 'dokumentation.ordnen'
  | 'nachricht.entwurf'
  | 'nachricht.alltagssprache'
  | 'verlauf.auszug'
  | 'verordnung.felder';

/**
 * Audioformate, die ein Browser mit `MediaRecorder` liefert oder die ein
 * Gerät als Datei kennt - verglichen ohne Parameter (`audio/webm;codecs=opus`
 * ist `audio/webm`).
 */
export const AUDIOFORMATE = [
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
] as const;

/**
 * Höchstens 5 MiB je Aufnahme (ANN-523): fünf Minuten bei bis zu 140 kbit/s.
 * Die Tonlänge selbst misst der Gateway nicht; mit 64 kbit/s passen knapp
 * elf Minuten hinein.
 */
export const HOECHST_BYTES = 5 * 1024 * 1024;

/** Höchstens fünf Minuten je Aufnahme (ANN-523). */
export const HOECHST_DAUER_S = 300;

/**
 * Die Abschnitte der Dokumentationsvorlage (ANN-522), in dieser Reihenfolge.
 * Aussage der Patient:in und eigene Beobachtung bleiben getrennt (6.3).
 */
export const DIKTAT_ABSCHNITTE = [
  'Angaben der Patient:in',
  'Befund',
  'Behandlung',
  'Plan',
] as const;

/**
 * Die Arbeitsanweisung für jeden künftigen Adapter, der Wortlaut von §6.3 und ADR-006 Punkt 8.
 * Ein Adapter liefert nur Titel, den Text setzt der Gateway zusammen (ANN-824).
 */
export const DIKTAT_REGELN = [
  'Aufgabe: jedem Satz aus dem Diktat einer Physiotherapeut:in genau einen Abschnitt der Dokumentationsvorlage zuordnen. Nur einordnen, nicht interpretieren.',
  'Antwort: je Satz, in derselben Reihenfolge, genau ein Titel aus der Liste der Abschnitte - kein Text, keine Erklärung. Den Vorschlag setzt der Gateway aus den Sätzen im Wortlaut zusammen.',
  'Nichts ergänzen: keine Diagnose, keine Bewertung, keine Empfehlung, keine Schlussfolgerung und nichts, was nicht gesprochen wurde.',
  'Nichts auslassen: jeder Satz bekommt einen Abschnitt; nicht zusammenfassen, nicht verdichten.',
  'Nicht umformulieren: Sätze bleiben im Wortlaut, sie werden nur einem Abschnitt zugeordnet.',
  'Erhalten bleiben Zahlen, Einheiten, Körperseiten, Verneinungen und geäußerte Unsicherheiten.',
  'Die Aussage der Patient:in (Angaben der Patient:in) bleibt von der eigenen Beobachtung der Therapeut:in (Befund) unterschieden.',
  'Unverständliche Stellen stehen als [unverständlich] im Satz und werden nie geraten.',
  'Ausdrücklich diktierte Einschätzungen und Pläne der Therapeut:in bleiben erhalten; sie sind ihre Aussage, keine Ergänzung.',
  `Abschnitte: ${DIKTAT_ABSCHNITTE.join(', ')}. Was nicht vorkommt, bleibt leer und wird weggelassen.`,
].join('\n');

/** Höchstens so lang wie ein Eintrag der Behandlungsdokumentation. */
export const ORDNEN_HOECHST_ZEICHEN = 20_000;

/** Die Arbeitsanweisung fürs Ordnen getippter Notizen; der Adapter liefert nur Titel. */
export const ORDNEN_REGELN = [
  'Aufgabe: jedem Satz aus den getippten Notizen einer Physiotherapeut:in genau einen Abschnitt der Dokumentationsvorlage zuordnen. Nur einordnen, nicht interpretieren.',
  'Antwort: je Satz, in derselben Reihenfolge, genau ein Titel aus der Liste der Abschnitte - kein Text, keine Erklärung. Den Vorschlag setzt der Gateway aus den Sätzen im Wortlaut zusammen.',
  'Nichts ergänzen: keine Diagnose, keine Bewertung, keine Empfehlung, keine Schlussfolgerung und nichts, was nicht dasteht.',
  'Nichts auslassen: jeder Satz bekommt einen Abschnitt; nicht zusammenfassen, nicht verdichten.',
  'Nicht umformulieren: Sätze bleiben im Wortlaut, sie werden nur einem Abschnitt zugeordnet.',
  'Die Aussage der Patient:in (Angaben der Patient:in) bleibt von der eigenen Beobachtung der Therapeut:in (Befund) unterschieden.',
  `Abschnitte: ${DIKTAT_ABSCHNITTE.join(', ')}. Was nicht vorkommt, bleibt leer und wird weggelassen.`,
].join('\n');

/** So lang wie eine Antwort an die Person höchstens. */
export const NACHRICHT_HOECHST_ZEICHEN = 2000;

/** Was für jedes Umformen gilt: ein Satz je Quelle, nichts dazu, nichts weg. */
const UMFORMEN_GRUNDREGELN = [
  'Antwort: je Abschnitt, in derselben Reihenfolge, genau ein Satz - kein weiterer Satz, kein Nebensatz mit Neuem, keine Anrede, kein Gruß.',
  'Nichts ergänzen: kein Rat, keine Empfehlung, keine Diagnose, keine Bewertung, keine Prognose und nichts, was im Abschnitt nicht steht.',
  'Nichts auslassen: Jeder Abschnitt kommt vor, mit allem, was er sagt.',
  'Erhalten bleiben Zahlen als Ziffern, Einheiten, Körperseiten, Verneinungen und geäußerte Unsicherheiten.',
  'Was sich nicht sicher umformen lässt, bleibt im Wortlaut des Abschnitts.',
];

/** Die Arbeitsanweisung fürs Ausformulieren: Stichpunkte der Praxis werden ganze Sätze. */
export const ENTWURF_REGELN = [
  'Aufgabe: aus jedem Stichpunkt einer Praxis einen ganzen Satz für eine Nachricht an eine Patient:in oder Kund:in machen. Nur ausformulieren, nichts beantworten: Die Frage der Person liegt nicht vor.',
  ...UMFORMEN_GRUNDREGELN,
].join('\n');

/** Die Arbeitsanweisung für Alltagssprache: dieselbe Aussage in verständlichen Wörtern. */
export const ALLTAG_REGELN = [
  'Aufgabe: jeden Satz einer Nachricht der Praxis in Alltagssprache fassen: Fachwörter durch verständliche Wörter ersetzen oder in Klammern kurz erklären. Die Aussage bleibt dieselbe.',
  ...UMFORMEN_GRUNDREGELN,
  'Ein Satz ohne Fachwort bleibt im Wortlaut.',
].join('\n');

/** Der Auszug nimmt höchstens so viele Einträge, je zwei Sätze daraus (ANN-861). */
export const AUSZUG_HOECHST_EINTRAEGE = 12;
export const AUSZUG_HOECHST_JE_EINTRAG = 2;
/** Alle Einträge zusammen - genug für sechs Termine, weit unter einer ganzen Akte. */
export const AUSZUG_HOECHST_ZEICHEN = 60_000;

/** Die Arbeitsanweisung für den Auszug: auswählen, nie formulieren. */
export const AUSZUG_REGELN = [
  'Aufgabe: aus den Einträgen einer Behandlungsdokumentation je Eintrag höchstens zwei Sätze auswählen, die für sich lesbar sind.',
  'Antwort: nur Stellen - der wievielte Eintrag, der wievielte Satz. Kein Text, keine Erklärung, keine Reihenfolge nach Wichtigkeit. Den Wortlaut setzt der Gateway.',
  'Nichts ergänzen und nichts folgern: keine Zusammenfassung in eigenen Worten, keine Bewertung, kein Verlaufsurteil wie „besser“ oder „schlechter“, keine Diagnose, keine Empfehlung.',
  'Kein Satz steht für mehr als sich selbst: Der Auszug ist unvollständig und sagt das auch.',
].join('\n');

/** Das Foto einer Verordnung: Allowlist und Grenze der Ablage (ADR-017 Punkt 18). */
export const SCAN_FORMATE = ['image/jpeg', 'image/png', 'application/pdf'] as const;
export const SCAN_HOECHST_BYTES = 10 * 1024 * 1024;

/** Die Felder eines Vorschlags und wie oft je Feld; Heilmittel stehen in eigenen Zeilen. */
export const VERORDNUNG_FELDER = {
  ausgestellt_am: 1,
  art: 1,
  verordnende: 1,
  icd10: 1,
  diagnose: 1,
  heilmittel: 4,
  hausbesuch: 1,
} as const;

export type Verordnungsfeld = keyof typeof VERORDNUNG_FELDER;

/** Eine Verordnung ist eine Seite: Mehr oder längere Zeilen liefert kein brauchbarer Adapter. */
export const SCAN_HOECHST_ZEILEN = 80;
export const SCAN_HOECHST_ZEICHEN_JE_ZEILE = 200;

/** Die Arbeitsanweisung fürs Foto: abschreiben, dann Stellen nennen - nie deuten. */
export const FELDER_REGELN = [
  'Erkennen: den Text des Fotos einer Heilmittelverordnung zeilenweise so abschreiben, wie er dasteht. Nichts ergänzen, nichts korrigieren; Unleserliches als [unleserlich].',
  'Fundstellen: je Feld nur die Stelle im erkannten Text - Zeile, erstes und letztes Zeichen. Kein Text; den Wortlaut schneidet der Gateway aus.',
  'Nichts raten oder ableiten: Was nicht lesbar dasteht, bekommt keine Stelle; keine Diagnose, keine Kodierung, keine Menge ergänzen.',
].join('\n');

/**
 * Die Adapter, die einen Zweck bedienen dürfen (das „erlaubte Modell" aus 6.1): bis zur
 * Freischaltung eines Anbieters (ADR-005 Punkt 8) nur die Nachbildung.
 */
const NUR_NACHBILDUNG: readonly string[] = ['mock'];

/** Das Diktat: Ton hinein, Transkript und eingeordnete Sätze heraus. */
export interface Diktatzweck {
  readonly kennung: 'dokumentation.diktat';
  readonly art: 'diktat';
  readonly eingabe: {
    readonly formate: readonly string[];
    readonly hoechstBytes: number;
    readonly hoechstDauerS: number;
    readonly sprache: Sprache;
  };
  readonly adapter: readonly string[];
  readonly ausgabe: { readonly abschnitte: readonly string[] };
  readonly regeln: string;
}

/** Ordnen: getippter Text hinein, dieselben Sätze je Abschnitt heraus. */
export interface Ordnungszweck {
  readonly kennung: 'dokumentation.ordnen';
  readonly art: 'ordnen';
  /** Woran die Datenbank die Berechtigung prüft (`berechtigung.ts`). */
  readonly gegenstand: 'termin';
  readonly eingabe: { readonly hoechstZeichen: number; readonly sprache: Sprache };
  readonly adapter: readonly string[];
  readonly ausgabe: { readonly abschnitte: readonly string[] };
  readonly regeln: string;
}

interface Umformgrund<Kennung extends string, Aufgabe extends string> {
  readonly kennung: Kennung;
  readonly art: 'umformen';
  readonly gegenstand: 'rueckfrage';
  readonly aufgabe: Aufgabe;
  readonly eingabe: { readonly hoechstZeichen: number; readonly sprache: Sprache };
  readonly adapter: readonly string[];
  readonly regeln: string;
}

/** Umformen: Text der Praxis hinein, je Satz ein Satz heraus. */
export type Umformzweck =
  | Umformgrund<'nachricht.entwurf', 'ausformulieren'>
  | Umformgrund<'nachricht.alltagssprache', 'alltagssprache'>;

/** Auszug: Einträge hinein, daraus gewählte Sätze im Wortlaut heraus. */
export interface Auszugszweck {
  readonly kennung: 'verlauf.auszug';
  readonly art: 'auszug';
  readonly gegenstand: 'akte';
  readonly eingabe: {
    readonly hoechstEintraege: number;
    readonly hoechstZeichen: number;
    readonly sprache: Sprache;
  };
  readonly adapter: readonly string[];
  readonly ausgabe: { readonly hoechstJeEintrag: number; readonly titel: readonly string[] };
  readonly regeln: string;
}

/** Felder vom Foto: ein Scan hinein, Fundstellen im erkannten Text heraus. */
export interface Felderzweck {
  readonly kennung: 'verordnung.felder';
  readonly art: 'felder';
  readonly gegenstand: 'scan';
  readonly eingabe: {
    readonly formate: readonly string[];
    readonly hoechstBytes: number;
    readonly sprache: Sprache;
  };
  readonly adapter: readonly string[];
  readonly ausgabe: {
    readonly felder: Readonly<Record<Verordnungsfeld, number>>;
    readonly hoechstZeilen: number;
    readonly hoechstZeichenJeZeile: number;
  };
  readonly regeln: string;
}

/** Was zu einem Zweck festgelegt ist. */
export type Zweck = Diktatzweck | Ordnungszweck | Umformzweck | Auszugszweck | Felderzweck;

/** Ein Zweck ohne Ton; ihn bedient der Assistenzadapter. */
export type Assistenzzweck = Exclude<Zweck, Diktatzweck>;

export const ZWECKE = {
  'dokumentation.diktat': {
    kennung: 'dokumentation.diktat',
    art: 'diktat',
    eingabe: {
      formate: AUDIOFORMATE,
      hoechstBytes: HOECHST_BYTES,
      hoechstDauerS: HOECHST_DAUER_S,
      sprache: 'de',
    },
    adapter: NUR_NACHBILDUNG,
    ausgabe: { abschnitte: DIKTAT_ABSCHNITTE },
    regeln: DIKTAT_REGELN,
  },
  'dokumentation.ordnen': {
    kennung: 'dokumentation.ordnen',
    art: 'ordnen',
    gegenstand: 'termin',
    eingabe: { hoechstZeichen: ORDNEN_HOECHST_ZEICHEN, sprache: 'de' },
    adapter: NUR_NACHBILDUNG,
    ausgabe: { abschnitte: DIKTAT_ABSCHNITTE },
    regeln: ORDNEN_REGELN,
  },
  'nachricht.entwurf': {
    kennung: 'nachricht.entwurf',
    art: 'umformen',
    gegenstand: 'rueckfrage',
    aufgabe: 'ausformulieren',
    eingabe: { hoechstZeichen: NACHRICHT_HOECHST_ZEICHEN, sprache: 'de' },
    adapter: NUR_NACHBILDUNG,
    regeln: ENTWURF_REGELN,
  },
  'nachricht.alltagssprache': {
    kennung: 'nachricht.alltagssprache',
    art: 'umformen',
    gegenstand: 'rueckfrage',
    aufgabe: 'alltagssprache',
    eingabe: { hoechstZeichen: NACHRICHT_HOECHST_ZEICHEN, sprache: 'de' },
    adapter: NUR_NACHBILDUNG,
    regeln: ALLTAG_REGELN,
  },
  'verlauf.auszug': {
    kennung: 'verlauf.auszug',
    art: 'auszug',
    gegenstand: 'akte',
    eingabe: {
      hoechstEintraege: AUSZUG_HOECHST_EINTRAEGE,
      hoechstZeichen: AUSZUG_HOECHST_ZEICHEN,
      sprache: 'de',
    },
    adapter: NUR_NACHBILDUNG,
    // Die Titel der Vorlage sind Gliederung eines Eintrags und nie ein Satz des Auszugs.
    ausgabe: { hoechstJeEintrag: AUSZUG_HOECHST_JE_EINTRAG, titel: DIKTAT_ABSCHNITTE },
    regeln: AUSZUG_REGELN,
  },
  'verordnung.felder': {
    kennung: 'verordnung.felder',
    art: 'felder',
    gegenstand: 'scan',
    eingabe: { formate: SCAN_FORMATE, hoechstBytes: SCAN_HOECHST_BYTES, sprache: 'de' },
    adapter: NUR_NACHBILDUNG,
    ausgabe: {
      felder: VERORDNUNG_FELDER,
      hoechstZeilen: SCAN_HOECHST_ZEILEN,
      hoechstZeichenJeZeile: SCAN_HOECHST_ZEICHEN_JE_ZEILE,
    },
    regeln: FELDER_REGELN,
  },
} as const satisfies { readonly [K in Zweckkennung]: Extract<Zweck, { kennung: K }> };

/** Der Zweck zu einem Wert aus der Anfrage - oder `null`, wenn es ihn nicht gibt. */
export function zweckAus(wert: unknown): Zweck | null {
  if (typeof wert !== 'string' || !Object.keys(ZWECKE).includes(wert)) return null;
  return ZWECKE[wert as Zweckkennung];
}
