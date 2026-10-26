import { tabstaendeLeeren, tabstandLegen, tabstandLesen } from '@/lib/tabstand';

// „Tag umplanen“ ohne Oberfläche: erst absagen (Grund, Auswahl, Rückfrage), dann je Person anrufen.
// Die Anrufliste liegt im Tab, die Adresse trägt nur ihre Kennung (ANN-574): So bleibt der Rückweg aus
// der Akte kurz, wie viele Termine der Tag auch hat, und am Server entsteht kein Anrufprotokoll.

export type UmplanSeite =
  | { art: 'grund' }
  | { art: 'termine' }
  | { art: 'absagen' }
  | { art: 'anruf'; id: string }
  | { art: 'fertig' };

export type Anrufergebnis = 'erreicht' | 'nicht';
export type Anrufstand = Readonly<Record<string, Anrufergebnis>>;

/** Parameter der Anrufliste: nur die Kennung des Vorgangs. */
export const ANRUFLISTE_PARAM = 'anrufliste';

const KENNUNG = /^[\w-]{1,64}$/;

/** Höchstens so viele Kennungen je Liste - mehr Termine hat kein Tag. */
const HOECHSTENS = 100;

function kennungen(wert: unknown): string[] {
  if (!Array.isArray(wert)) return [];
  return wert
    .filter((kennung): kennung is string => typeof kennung === 'string' && KENNUNG.test(kennung))
    .slice(0, HOECHSTENS);
}

/** Die eben abgesagten Termine in ihrer Reihenfolge und wer schon angerufen wurde. */
export interface Anrufliste {
  abgesagt: string[];
  stand: Anrufstand;
}

/** Eine Spanne der Arbeitszeit in Ortszeit, „08:00“ bis „12:00“. */
export interface Zeitspanne {
  von: string;
  bis: string;
}

/**
 * Parameter der Zeiten des Tages, in denen Termine bleiben können, nach einer
 * Teiländerung: nach einer Arbeitszeitänderung die neue Arbeitszeit, nach
 * einem Freizeitausgleich alles außer der freien Zeit - etwa
 * `zeiten=08:00-12:30,13:30-18:00`. Nur Uhrzeiten, keine Namen (ADR-011).
 */
export const ZEITEN_PARAM = 'zeiten';
const SPANNE = /^([01]\d|2[0-3]):[0-5]\d-([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Die Zeiten, in denen Termine an diesem Tag bleiben können, wenn „Tag
 * umplanen“ nach einer Teiländerung kommt (genehmigte Arbeitszeitänderung,
 * Freizeitausgleich): Vorgewählt sind dann nur die Termine außerhalb
 * (Praxis-Review Überholung 9). Ohne den Parameter oder mit einer ungültigen
 * Angabe fällt der ganze Tag aus wie bisher; eine leere Liste heißt: keine
 * Zeit mehr an dem Tag.
 */
export function leseZeiten(suche: URLSearchParams): Zeitspanne[] | null {
  const wert = suche.get(ZEITEN_PARAM);
  if (wert === null) return null;
  const teile = wert.split(',').filter((teil) => teil !== '');
  if (teile.length > 6 || !teile.every((teil) => SPANNE.test(teil))) return null;
  return teile.map((teil) => {
    const [von = '', bis = ''] = teil.split('-');
    return { von, bis };
  });
}

/** `08:00-12:00,13:00-16:00` - die Spannen für die Adresse. */
export function zeitenText(spannen: readonly Zeitspanne[]): string {
  return spannen.map((spanne) => `${spanne.von}-${spanne.bis}`).join(',');
}

/** Die Adresse von „Tag umplanen“ für eine Person und einen Tag, ohne Rückweg. */
export function tagUmplanenAdresse(
  person: string,
  datum: string,
  zeiten?: readonly Zeitspanne[],
): string {
  return `/kalender/tag-umplanen?person=${person}&datum=${datum}${
    zeiten ? `&${ZEITEN_PARAM}=${zeitenText(zeiten)}` : ''
  }`;
}

/** Ob ein Termin (Beginn und Ende in Ortszeit) ganz in einer der Spannen liegt. */
export function liegtInZeiten(
  beginn: string,
  ende: string,
  spannen: readonly Zeitspanne[],
): boolean {
  return spannen.some((spanne) => spanne.von <= beginn && ende <= spanne.bis);
}

/**
 * Die Anrufliste dieses Vorgangs - oder `null` vor der Absage, in einem anderen Tab oder Konto.
 * Die Kennungen filtern nur den geladenen Tagesplan und gehen nie an den Server.
 */
export function leseAnrufliste(
  suche: URLSearchParams,
  konto: string,
  person: string,
  datum: string,
): { kennung: string; liste: Anrufliste } | null {
  const kennung = suche.get(ANRUFLISTE_PARAM);
  if (kennung === null || !KENNUNG.test(kennung)) return null;
  const gelegt = tabstandLesen(konto, kennung);
  if (typeof gelegt !== 'object' || gelegt === null) return null;
  const roh = gelegt as Record<string, unknown>;
  // Eine Liste gilt nur für die Person und den Tag, für die sie angelegt wurde.
  if (roh.person !== person || roh.datum !== datum) return null;
  const abgesagt = kennungen(roh.abgesagt);
  const stand: Record<string, Anrufergebnis> = {};
  if (typeof roh.stand === 'object' && roh.stand !== null) {
    for (const [id, ergebnis] of Object.entries(roh.stand as Record<string, unknown>)) {
      if (abgesagt.includes(id) && (ergebnis === 'erreicht' || ergebnis === 'nicht')) {
        stand[id] = ergebnis;
      }
    }
  }
  return { kennung, liste: { abgesagt, stand } };
}

/** Legt die Liste ab; eine frühere Liste dieses Tabs fällt dabei, es bleibt nur die jüngste. */
export function merkeAnrufliste(
  konto: string,
  kennung: string,
  person: string,
  datum: string,
  liste: Anrufliste,
): void {
  tabstaendeLeeren({ konto, vorgang: kennung });
  tabstandLegen(konto, kennung, { person, datum, abgesagt: liste.abgesagt, stand: liste.stand });
}

/** Die Adresse mit der Kennung der Anrufliste; alles andere bleibt. */
export function mitAnruflistenKennung(suche: URLSearchParams, kennung: string): URLSearchParams {
  const naechste = new URLSearchParams(suche);
  naechste.set(ANRUFLISTE_PARAM, kennung);
  return naechste;
}

/** Wer als Nächstes dran ist: die erste Person ohne Ergebnis, sonst niemand. */
export function naechsterAnruf(
  reihenfolge: readonly string[],
  stand: Anrufstand,
  nach?: string,
): string | null {
  const ab = nach === undefined ? 0 : reihenfolge.indexOf(nach) + 1;
  return (
    reihenfolge.slice(ab).find((id) => stand[id] === undefined) ??
    reihenfolge.find((id) => stand[id] === undefined) ??
    null
  );
}

/** Die erste Seite der Anrufliste: wer noch fehlt, sonst der Abschluss. */
export function ersteAnrufseite(reihenfolge: readonly string[], stand: Anrufstand): UmplanSeite {
  const id = naechsterAnruf(reihenfolge, stand);
  return id ? { art: 'anruf', id } : { art: 'fertig' };
}

/** Kennung einer Seite für den Baustein (Tippsperre, neuer Fokus). */
export function seitenKennung(seite: UmplanSeite): string {
  return seite.art === 'anruf' ? `anruf-${seite.id}` : seite.art;
}

const ABSAGE_SEITEN = ['grund', 'termine', 'absagen'] as const;

/** „Schritt 2 von 3“ beim Absagen, „Anruf 2 von 5“ beim Anrufen. */
export function umplanStand(
  seite: UmplanSeite,
  reihenfolge: readonly string[],
): { text: string; wert: number; von: number } | undefined {
  if (seite.art === 'anruf') {
    const nummer = reihenfolge.indexOf(seite.id) + 1;
    return {
      text: `Anruf ${nummer} von ${reihenfolge.length}`,
      wert: nummer,
      von: reihenfolge.length,
    };
  }
  if (seite.art === 'fertig') return undefined;
  const nummer = ABSAGE_SEITEN.indexOf(seite.art) + 1;
  return {
    text: `Schritt ${nummer} von ${ABSAGE_SEITEN.length}`,
    wert: nummer,
    von: ABSAGE_SEITEN.length,
  };
}

/** „1 Termin“, aber „2 Termine“ - eine Schaltfläche darf nicht falsch klingen. */
export function terminWort(anzahl: number): string {
  return anzahl === 1 ? 'Termin' : 'Termine';
}

/** „mit 1 Termin“, aber „mit 2 Terminen“ - der Dativ. */
export function terminDativ(anzahl: number): string {
  return anzahl === 1 ? 'Termin' : 'Terminen';
}
