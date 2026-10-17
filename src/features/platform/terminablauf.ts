import {
  beginne,
  imAendern,
  kannZurueck,
  schrittText,
  weiter,
  type Abfolge,
} from '@/components/ui/abfolge';
import { TAGESZEITEN, TAGESZEIT_NAME, type Tageszeit } from './api';
import { wochentagMitDatum } from './zeit';

/**
 * Termin ändern, absagen und wünschen als geführter Ablauf (Überholung 6, G6;
 * POR-009, POR-010) - die reine Logik ohne Oberfläche: welche Seite folgt,
 * wann ein Ablauf vollständig ist, was die Zusammenfassung sagt und was an
 * den Server geht.
 *
 *   * **Ändern oder absagen** (`/p/termine/:terminId`): „Was möchten Sie?“ →
 *     beim Absagen der Hinweis zum Ausfallhonorar als eigene Seite, beim
 *     Ändern „Wann passt es Ihnen?“ → Zusammenfassung. Beide Wege haben drei
 *     Seiten; die Schrittzahl steht deshalb fest, auch bevor die Art gewählt
 *     ist.
 *   * **Wünschen** (`/p/termine/wunsch`): „Wann passt es Ihnen?“ →
 *     Zusammenfassung.
 *
 * „Wann passt es Ihnen?“ fragt Wochentage statt Daten (ANN-583):
 * Vierzehn Daten und die Tageszeiten passen bei 375 × 667 in 18 px nicht auf
 * eine Seite. Der Server bekommt weiter Kalendertage, wie er sie erwartet -
 * jeden gewählten Wochentag in den nächsten 14 Werktagen (`wunschtage`),
 * höchstens 14 und keiner vor morgen. Auch beim Ändern gilt die Seite erst
 * mit Tag und Tageszeit (oder „Egal“) als beantwortet (ANN-585); der
 * Server nähme einen Änderungswunsch auch ohne Tage.
 */

/** Wie viele Werktage zur Auswahl stehen - zugleich die Grenze des Servers. */
export const WUNSCHTAGE = 14;

/** Wie lang die Nachricht an die Praxis sein darf - die Grenze des Servers. */
export const NOTIZ_MAX = 500;

/** Montag bis Freitag, gezählt wie `Date.getDay()`. */
export const WOCHENTAGE = [1, 2, 3, 4, 5] as const;
export type Wochentag = (typeof WOCHENTAGE)[number];

export const WOCHENTAG_NAME: Record<Wochentag, string> = {
  1: 'Montag',
  2: 'Dienstag',
  3: 'Mittwoch',
  4: 'Donnerstag',
  5: 'Freitag',
};

/** Die gewählten Tageszeiten oder „Egal“ - jede Tageszeit. */
export type Zeitwahl = readonly Tageszeit[] | 'egal';

/** Die Antwort auf „Wann passt es Ihnen?“. */
export interface Wann {
  tage: readonly Wochentag[];
  zeiten: Zeitwahl;
}

/** Nichts vorbelegt: Tag und Tageszeit entscheidet die Person (Überholung 6, Muster 3). */
export const NICHTS_GEWAEHLT: Wann = { tage: [], zeiten: [] };

/** Ein Wochentag an oder aus; die Folge bleibt Montag bis Freitag. */
export function tagUmschalten(wann: Wann, tag: Wochentag): Wann {
  const neu = wann.tage.includes(tag) ? wann.tage.filter((t) => t !== tag) : [...wann.tage, tag];
  return { ...wann, tage: WOCHENTAGE.filter((t) => neu.includes(t)) };
}

/** Eine Tageszeit an oder aus; sie nimmt „Egal“ zurück. */
export function zeitUmschalten(wann: Wann, zeit: Tageszeit): Wann {
  const bisher = wann.zeiten === 'egal' ? [] : wann.zeiten;
  const neu = bisher.includes(zeit) ? bisher.filter((z) => z !== zeit) : [...bisher, zeit];
  return { ...wann, zeiten: TAGESZEITEN.filter((z) => neu.includes(z)) };
}

/** „Egal“ an oder aus; es nimmt die einzelnen Tageszeiten zurück. */
export function egalUmschalten(wann: Wann): Wann {
  return { ...wann, zeiten: wann.zeiten === 'egal' ? [] : 'egal' };
}

/** Was auf „Wann passt es Ihnen?“ noch fehlt, als Satz - `null`, wenn nichts fehlt. */
export function wannFehlt(wann: Wann): string | null {
  if (wann.tage.length === 0) return 'Bitte wählen Sie mindestens einen Tag.';
  if (wann.zeiten !== 'egal' && wann.zeiten.length === 0) {
    return 'Bitte wählen Sie eine Tageszeit oder „Egal“.';
  }
  return null;
}

/** Der Wochentag eines Kalendertags `YYYY-MM-DD`, gezählt wie `Date.getDay()`. */
function wochentagVon(kalendertag: string): number {
  return new Date(`${kalendertag}T12:00:00`).getDay();
}

/**
 * Die Kalendertage für den Server: jeder gewählte Wochentag unter den
 * angebotenen Werktagen (`naechsteWerktage(WUNSCHTAGE)`), in ihrer Folge.
 * Mehr als die Werktage selbst können es nie werden - höchstens 14.
 */
export function wunschtage(tage: readonly Wochentag[], werktage: readonly string[]): string[] {
  return werktage.filter((tag) => (tage as readonly number[]).includes(wochentagVon(tag)));
}

/** Die Tageszeiten für den Server: „Egal“ heißt keine Angabe - jede Tageszeit. */
export function wunschzeiten(zeiten: Zeitwahl): Tageszeit[] {
  return zeiten === 'egal' ? [] : TAGESZEITEN.filter((z) => zeiten.includes(z));
}

/** „Montag“, „Montag und Mittwoch“, „Montag, Mittwoch und Freitag“. */
function aufzaehlung(teile: readonly string[]): string {
  if (teile.length <= 1) return teile[0] ?? '';
  return `${teile.slice(0, -1).join(', ')} und ${teile[teile.length - 1]!}`;
}

/** Die Tage der Zusammenfassung, in der Folge der Woche. */
export function tageText(tage: readonly Wochentag[]): string {
  const gewaehlt = WOCHENTAGE.filter((t) => tage.includes(t));
  if (gewaehlt.length === WOCHENTAGE.length) return 'Montag bis Freitag';
  return aufzaehlung(gewaehlt.map((t) => WOCHENTAG_NAME[t]));
}

/** Die Tageszeit der Zusammenfassung. */
export function zeitenText(zeiten: Zeitwahl): string {
  if (zeiten === 'egal') return 'Jede Tageszeit';
  return aufzaehlung(wunschzeiten(zeiten).map((z) => TAGESZEIT_NAME[z]));
}

/** Bis wann die gewählten Tage reichen: „bis Mittwoch, 04.11.“ - der letzte gesendete Tag. */
export function zeitraumText(kalendertage: readonly string[]): string {
  const letzter = kalendertage[kalendertage.length - 1];
  return letzter ? `bis ${wochentagMitDatum(letzter)}` : '';
}

/** Ist die Nachricht zu lang? Dann der Satz dazu, sonst `null`. */
export function notizFehler(notiz: string): string | null {
  return notiz.trim().length > NOTIZ_MAX
    ? `Ihre Nachricht darf höchstens ${NOTIZ_MAX} Zeichen lang sein.`
    : null;
}

// -----------------------------------------------------------------------------
// Die Seitenfolge
// -----------------------------------------------------------------------------

export type Seite = 'art' | 'ausfallhonorar' | 'wann' | 'zusammenfassung';
export type Art = 'change' | 'cancel';
/** `aenderung`: einen Termin ändern oder absagen; `wunsch`: einen Termin wünschen. */
export type Ablauf = 'aenderung' | 'wunsch';

/** Was bisher beantwortet ist. */
export interface Angaben {
  art: Art | null;
  /** Den Hinweis zum Ausfallhonorar gelesen („Verstanden, weiter“). */
  verstanden: boolean;
  wann: Wann;
}

/** `?art=cancel` oder `?art=change` aus der Adresse - sonst keine. */
export function artAusAdresse(wert: string | null): Art | null {
  return wert === 'cancel' || wert === 'change' ? wert : null;
}

/** Die Seiten eines Wegs in ihrer Folge; ohne gewählte Art gilt die Länge beider. */
export function seitenfolge(ablauf: Ablauf, art: Art | null): readonly Seite[] {
  if (ablauf === 'wunsch') return ['wann', 'zusammenfassung'];
  return ['art', art === 'cancel' ? 'ausfallhonorar' : 'wann', 'zusammenfassung'];
}

/** „Schritt 2 von 3“ mit dem Balken - beide Wege haben eine feste Schrittzahl. */
export function stand(
  ablauf: Ablauf,
  art: Art | null,
  seite: Seite,
): { text: string; wert: number; von: number } {
  const folge = seitenfolge(ablauf, art);
  const wert = Math.max(1, folge.indexOf(seite) + 1);
  return { text: schrittText(wert, folge.length), wert, von: folge.length };
}

/** Ob alles für die Zusammenfassung da ist. */
export function vollstaendig(ablauf: Ablauf, angaben: Angaben): boolean {
  if (ablauf === 'wunsch' || angaben.art === 'change') return wannFehlt(angaben.wann) === null;
  return angaben.art === 'cancel' && angaben.verstanden;
}

/**
 * Der Anfang von „Termin ändern oder absagen“. Mit `?art=` beginnt gleich die
 * passende Seite; „Was möchten Sie?“ liegt dann als beantwortet davor, und
 * „← Zurück“ führt dorthin.
 */
export function beginneAenderung(art: Art | null): Abfolge<Seite> {
  const start = beginne<Seite>('art');
  return art ? weiter(start, seiteNachDerArt(art)) : start;
}

export function beginneWunsch(): Abfolge<Seite> {
  return beginne<Seite>('wann');
}

function seiteNachDerArt(art: Art): Seite {
  return art === 'cancel' ? 'ausfallhonorar' : 'wann';
}

/**
 * Die Antwort auf „Was möchten Sie?“. Aus der Zusammenfassung geändert führt
 * dieselbe Art gleich zurück, sobald alles da ist. Eine andere Art beginnt
 * ihren Weg neu: Ihre Seiten waren nie zu sehen, und „← Zurück“ aus ihrer
 * Zusammenfassung soll nicht auf eine Seite des anderen Wegs führen.
 */
export function nachDerArt(abfolge: Abfolge<Seite>, bisher: Angaben, art: Art): Abfolge<Seite> {
  const naechste = seiteNachDerArt(art);
  if (!imAendern(abfolge)) return weiter(abfolge, naechste);
  if (bisher.art === art) return weiter(abfolge, naechste, vollstaendig('aenderung', bisher));
  return weiter(beginne<Seite>('art'), naechste);
}

/** „Verstanden, weiter“ und „Weiter“ nach „Wann passt es Ihnen?“: zur Zusammenfassung. */
export function zurZusammenfassung(abfolge: Abfolge<Seite>): Abfolge<Seite> {
  return weiter(abfolge, 'zusammenfassung', true);
}

/**
 * Ob beim Weggehen etwas verloren ginge: ab der zweiten Seite und sobald
 * etwas gewählt oder geschrieben ist. Dann fragt das ✕, und die Zurückgeste
 * des Telefons geht einen Schritt zurück statt aus dem Ablauf.
 */
export function ungespeichert(abfolge: Abfolge<Seite>, wann: Wann, notiz: string): boolean {
  return (
    kannZurueck(abfolge) ||
    wann.tage.length > 0 ||
    wann.zeiten === 'egal' ||
    wann.zeiten.length > 0 ||
    notiz.trim() !== ''
  );
}
