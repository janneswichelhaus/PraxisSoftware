/**
 * Die Zweckliste des Gateways (ADR-005, PROJECT_PRINCIPLES.md 6.1).
 *
 * Ein Aufruf ohne Zweck aus dieser Liste geht nirgendwohin. Je Zweck steht
 * fest, welche Eingabe erlaubt ist, welche Adapter ihn bedienen dürfen, welche
 * Form die Ausgabe hat - und nach welchen Regeln ein Adapter arbeiten muss.
 * Heute gibt es genau einen Zweck: das Diktat zur Behandlungsdokumentation
 * (BEF-153, PROJECT_PRINCIPLES.md 6.3, ADR-006 Punkt 8).
 *
 * Grenzen und Abschnitte stehen ein zweites Mal im Browser: Der Anker der
 * Annahmen ANN-522 und ANN-523 ist `src/lib/ki/gateway.ts`, diese Kopie hängt
 * über `vertrag.test.ts` daran.
 */

import type { Sprache } from './typen.ts';

/** Die Kennung eines Zwecks. */
export type Zweckkennung = 'dokumentation.diktat';

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

/** Was zu einem Zweck festgelegt ist. */
export interface Zweck {
  readonly kennung: Zweckkennung;
  readonly eingabe: {
    readonly formate: readonly string[];
    readonly hoechstBytes: number;
    readonly hoechstDauerS: number;
    readonly sprache: Sprache;
  };
  /**
   * Die Adapter, die diesen Zweck bedienen dürfen (das „erlaubte Modell" aus
   * 6.1). Ein echter Anbieter kommt erst nach seiner Freischaltung dazu
   * (ADR-005 Punkt 8); bis dahin nur die Nachbildung.
   */
  readonly adapter: readonly string[];
  readonly ausgabe: { readonly abschnitte: readonly string[] };
  readonly regeln: string;
}

export const ZWECKE: Readonly<Record<Zweckkennung, Zweck>> = {
  'dokumentation.diktat': {
    kennung: 'dokumentation.diktat',
    eingabe: {
      formate: AUDIOFORMATE,
      hoechstBytes: HOECHST_BYTES,
      hoechstDauerS: HOECHST_DAUER_S,
      sprache: 'de',
    },
    adapter: ['mock'],
    ausgabe: { abschnitte: DIKTAT_ABSCHNITTE },
    regeln: DIKTAT_REGELN,
  },
};

/** Der Zweck zu einem Wert aus der Anfrage - oder `null`, wenn es ihn nicht gibt. */
export function zweckAus(wert: unknown): Zweck | null {
  if (wert !== 'dokumentation.diktat') return null;
  return ZWECKE[wert];
}
