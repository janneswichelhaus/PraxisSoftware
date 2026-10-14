import type { Tagesstopp } from '@/features/tours/tagesroute';
import { formatLocalTime } from './api';
import type { Seite, Wegpruefung } from './wegpruefung';

// -----------------------------------------------------------------------------
// Folgetermin nach der Doku (Befund B8)
//
// Die Vorschläge stehen als Zeilen: Tag und Zeit, Therapeut:in, die Termine
// davor und danach (nur Zeiten), ob die Wege aufgehen und wie lang der Termin
// sein dürfte. Geprüft wird jeder Kandidat wie „Passt es?“ im Terminformular
// (`useWegpruefung`: Nachbarn und Tagesränder). Hier stehen die reinen
// Regeln dazu; die Seite steht in `FolgeterminVorschlaege.tsx`.
// -----------------------------------------------------------------------------

const WOCHENTAG = new Intl.DateTimeFormat('de-DE', { weekday: 'short', timeZone: 'UTC' });

/** „Di 20.10.“ aus einem Kalendertag. */
export function tagKurz(tag: string): string {
  const [, monat, t] = tag.split('-');
  return `${WOCHENTAG.format(new Date(`${tag}T12:00:00Z`)).replace('.', '')} ${t}.${monat}.`;
}

/** Was die Prüfung eines Kandidaten ergibt. */
export type Urteil = 'laedt' | 'faellt_weg' | 'bleibt';

/**
 * ANN-535: Ein Kandidat mit einer zu knappen Seite fällt weg - auch wenn die
 * andere passt. Ungeprüfte (kein Kartendienst, Adresse nicht verortet) bleiben;
 * die Zeile sagt dann „Weg ungeprüft“. Bis die Nachbarn und alle Seiten
 * entschieden sind, lädt er.
 */
export function urteilAus(pruefung: Wegpruefung, nachbarnGeladen: boolean): Urteil {
  if (pruefung.stand === 'laedt') return 'laedt';
  if (pruefung.stand === 'bereit') {
    const seiten = [pruefung.an, pruefung.weiter];
    if (seiten.some((s) => s.stand === 'geprueft' && s.stufe === 'nicht')) return 'faellt_weg';
    if (seiten.some((s) => s.stand === 'laedt')) return 'laedt';
  }
  return nachbarnGeladen ? 'bleibt' : 'laedt';
}

export interface Kandidat {
  readonly schluessel: string;
  /** Kalendertag, `YYYY-MM-DD` - je Tag steht höchstens ein Vorschlag. */
  readonly tag: string;
}

export interface Plan {
  /** Diese Kandidaten werden geprüft. */
  readonly pruefen: ReadonlySet<string>;
  /** Diese stehen da, in der Reihenfolge der Kandidaten. */
  readonly zeigen: readonly string[];
  /** Eine Prüfung steht noch aus; was nach ihr kommt, wartet. */
  readonly offen: boolean;
}

/**
 * Welche Kandidaten geprüft werden und welche dastehen.
 *
 * In der Reihenfolge der Kandidaten - gleiche Zeit nächste Woche zuerst, dann
 * die Plätze der Terminsuche - je Tag einer, bis `ziel` dastehen. Ein
 * Kandidat, der wegfällt, gibt seinen Tag frei: Der nächste Platz rückt nach,
 * auch am selben Tag. Ein Kandidat, dessen Prüfung noch läuft, hält seinen
 * Tag; gezeigt wird nur bis zu ihm, damit keine Zeile nachträglich verrutscht
 * oder verschwindet, während jemand tippt. Geprüft werden höchstens
 * `hoechstens` Kandidaten.
 */
export function plane(
  kandidaten: readonly Kandidat[],
  urteile: ReadonlyMap<string, Urteil>,
  { ziel = 3, hoechstens = 6 }: { ziel?: number; hoechstens?: number } = {},
): Plan {
  const pruefen = new Set<string>();
  const zeigen: string[] = [];
  const tage = new Set<string>();
  let offen = false;
  for (const kandidat of kandidaten) {
    if (tage.size >= ziel || pruefen.size >= hoechstens) break;
    if (tage.has(kandidat.tag)) continue;
    pruefen.add(kandidat.schluessel);
    const urteil = urteile.get(kandidat.schluessel) ?? 'laedt';
    if (urteil === 'faellt_weg') continue;
    tage.add(kandidat.tag);
    if (urteil === 'laedt') offen = true;
    else if (!offen) zeigen.push(kandidat.schluessel);
  }
  return { pruefen, zeigen, offen };
}

/**
 * Die mögliche Dauer: geplante Dauer plus die Luft zur Weiterfahrt, auf das
 * Raster der Praxis abgerundet (ohne Angabe 5 Minuten, wie in der Datenbank).
 */
export function moeglicheDauer(dauer: number, luft: number, raster: number | null): number {
  const schritt = raster && raster > 0 ? raster : 5;
  return dauer + Math.floor(Math.max(0, luft) / schritt) * schritt;
}

/** „bis 90 Min. möglich“; über zwei Stunden genügt die Grenze. */
export function moeglichText(minuten: number): string {
  return minuten > 120 ? 'über 2 Std. möglich' : `bis ${minuten} Min. möglich`;
}

export interface Wegangabe {
  /** `positiv` und `warnung` als Zeichen und Wort, `neutral` leise. */
  readonly ton: 'positiv' | 'warnung' | 'neutral';
  readonly wort: string;
  /** Nur, wenn die Weiterfahrt (oder die Rückfahrt zum Tagesende) geprüft ist. */
  readonly dauer: string | null;
}

type Geprueft = Extract<Seite, { stand: 'geprueft' }>;

/**
 * Was die Zeile über die Wege sagt: „Wege passen“, „Weg knapp“ oder „Weg
 * ungeprüft“, dazu die mögliche Dauer. `null`, wo es nichts zu prüfen gab -
 * am Videotermin oder ohne Termin und Tagesrand mit Ort.
 */
export function wegangabe(
  pruefung: Wegpruefung,
  dauer: number,
  raster: number | null,
): Wegangabe | null {
  if (pruefung.stand === 'aus' || pruefung.stand === 'laedt') return null;
  if (pruefung.stand !== 'bereit') return { ton: 'neutral', wort: 'Weg ungeprüft', dauer: null };

  const seiten = [pruefung.an, pruefung.weiter];
  const geprueft = seiten.filter((s): s is Geprueft => s.stand === 'geprueft');
  const weiter = pruefung.weiter;
  const text =
    weiter.stand === 'geprueft' ? moeglichText(moeglicheDauer(dauer, weiter.luft, raster)) : null;
  if (seiten.some((s) => s.stand === 'nicht_geprueft' || s.stand === 'nachbar_nicht_verortet')) {
    return { ton: 'neutral', wort: 'Weg ungeprüft', dauer: text };
  }
  if (geprueft.length === 0) return null;
  if (geprueft.some((s) => s.stufe === 'knapp')) {
    return { ton: 'warnung', wort: 'Weg knapp', dauer: text };
  }
  return { ton: 'positiv', wort: geprueft.length === 2 ? 'Wege passen' : 'Weg passt', dauer: text };
}

/**
 * „davor 08:00–08:45 · danach 11:30“: nur Zeiten, nie ein Name (wie „Passt
 * es?“). Nachbarn sind die Termine mit Ort aus der Tagesroute derselben
 * Person - dieselben, gegen die der Weg geprüft wird.
 */
export function nachbarText(
  vorher: Tagesstopp | null,
  nachher: Tagesstopp | null,
  zeitzone: string,
): string {
  const teile: string[] = [];
  if (vorher) {
    teile.push(
      `davor ${formatLocalTime(vorher.starts_at, zeitzone)}–${formatLocalTime(vorher.ends_at, zeitzone)}`,
    );
  }
  if (nachher) teile.push(`danach ${formatLocalTime(nachher.starts_at, zeitzone)}`);
  return teile.length > 0 ? teile.join(' · ') : 'kein Termin davor oder danach';
}
