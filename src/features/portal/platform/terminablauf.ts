import { beginne, kannZurueck, schrittText, weiter, type Abfolge } from '@/components/ui/abfolge';
import { TAGESZEITEN, type Tageszeit } from './api';

/**
 * Wünschen, Ändern und Absagen als reine Logik: welche Seite folgt, was fehlt, was an den Server
 * geht. Gefragt werden Wochentage statt Daten (ANN-583), gesendet Kalendertage; Ändern gilt erst
 * mit Tag und Tageszeit als beantwortet (ANN-585).
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

/** Ist die Nachricht zu lang? Dann der Satz dazu, sonst `null`. */
export function notizFehler(notiz: string): string | null {
  return notiz.trim().length > NOTIZ_MAX
    ? `Ihre Nachricht darf höchstens ${NOTIZ_MAX} Zeichen lang sein.`
    : null;
}

// -----------------------------------------------------------------------------
// Die Seitenfolge
// -----------------------------------------------------------------------------

export type Seite = 'ausfallhonorar' | 'wann' | 'zusammenfassung';
export type Art = 'change' | 'cancel';
/** `aenderung`: einen Termin ändern oder absagen; `wunsch`: einen Termin wünschen. */
export type Ablauf = 'aenderung' | 'wunsch';

/** `?art=cancel` oder `?art=change` aus der Adresse - sonst keine. */
export function artAusAdresse(wert: string | null): Art | null {
  return wert === 'cancel' || wert === 'change' ? wert : null;
}

/**
 * Zwei Seiten je Weg: Ändern und Absagen beginnen auf der Seite des Termins (ANN-778), Absagen mit
 * dem Hinweis zum Ausfallhonorar, Ändern und Wünschen mit „Wann passt es Ihnen?“.
 */
export function seitenfolge(ablauf: Ablauf, art: Art | null): readonly Seite[] {
  return [
    ablauf === 'aenderung' && art === 'cancel' ? 'ausfallhonorar' : 'wann',
    'zusammenfassung',
  ];
}

/** „Schritt 1 von 2“ mit dem Balken. */
export function stand(
  ablauf: Ablauf,
  art: Art | null,
  seite: Seite,
): { text: string; wert: number; von: number } {
  const folge = seitenfolge(ablauf, art);
  const wert = Math.max(1, folge.indexOf(seite) + 1);
  return { text: schrittText(wert, folge.length), wert, von: folge.length };
}

export function beginneAenderung(art: Art): Abfolge<Seite> {
  return beginne<Seite>(seitenfolge('aenderung', art)[0]!);
}

export function beginneWunsch(): Abfolge<Seite> {
  return beginne<Seite>('wann');
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
