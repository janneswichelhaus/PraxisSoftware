import { formatLocalTime } from './api';
import type { Zeitband } from './calendar';
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

/** Ein Termin am Tag eines Vorschlags - es zählen nur seine Zeiten. */
export interface Zeitraum {
  readonly starts_at: string;
  readonly ends_at: string;
}

/**
 * Die Termine davor und danach am Tag eines Vorschlags, gleich welcher Art -
 * auch Video, Ereignis oder Training, nicht nur Termine mit Ort wie in der
 * Tagesroute: davor der, der zuletzt endet, ohne den Beginn zu überschneiden;
 * danach der, der zuerst beginnt, nach dem Ende. `beginn` und `ende` in
 * Millisekunden.
 */
export function nachbarZeiten<T extends Zeitraum>(
  termine: readonly T[],
  beginn: number,
  ende: number,
): { vorher: T | null; nachher: T | null } {
  let vorher: T | null = null;
  let nachher: T | null = null;
  for (const termin of termine) {
    const terminEnde = Date.parse(termin.ends_at);
    const terminBeginn = Date.parse(termin.starts_at);
    if (terminEnde <= beginn && (!vorher || terminEnde > Date.parse(vorher.ends_at))) {
      vorher = termin;
    }
    if (terminBeginn >= ende && (!nachher || terminBeginn < Date.parse(nachher.starts_at))) {
      nachher = termin;
    }
  }
  return { vorher, nachher };
}

/** Das Arbeitszeitband um eine Minute des Tages; aneinanderstoßende Bänder zählen als eines. */
function bandUm(baender: readonly Zeitband[], minute: number): Zeitband | null {
  const sortiert = [...baender].sort((a, b) => a.vonMinute - b.vonMinute);
  const zusammen: Zeitband[] = [];
  for (const band of sortiert) {
    const letztes = zusammen.at(-1);
    if (letztes && band.vonMinute <= letztes.bisMinute) {
      zusammen[zusammen.length - 1] = {
        vonMinute: letztes.vonMinute,
        bisMinute: Math.max(letztes.bisMinute, band.bisMinute),
      };
    } else {
      zusammen.push(band);
    }
  }
  return zusammen.find((b) => b.vonMinute <= minute && minute < b.bisMinute) ?? null;
}

/**
 * Wie viele Minuten ab dem Beginn eines Vorschlags frei sind: bis zum
 * nächsten Termin (`nachher` aus `nachbarZeiten`) oder bis zum Ende des
 * Arbeitszeitbands, in dem er beginnt - eine Pause beendet es. `null`, wenn
 * keins von beidem eine Grenze setzt.
 */
export function freieMinuten({
  beginn,
  beginnMinute,
  nachher,
  baender,
}: {
  /** Beginn in Millisekunden. */
  beginn: number;
  /** Beginn als Minute des Tages, wie die Arbeitszeitbänder. */
  beginnMinute: number;
  nachher: Zeitraum | null;
  baender: readonly Zeitband[];
}): number | null {
  const grenzen: number[] = [];
  if (nachher) grenzen.push(Math.floor((Date.parse(nachher.starts_at) - beginn) / 60_000));
  const band = bandUm(baender, beginnMinute);
  if (band) grenzen.push(band.bisMinute - beginnMinute);
  return grenzen.length > 0 ? Math.min(...grenzen) : null;
}

/**
 * Die mögliche Dauer: geplante Dauer plus die Luft danach, auf das Raster der
 * Praxis abgerundet (ohne Angabe 5 Minuten, wie in der Datenbank).
 */
export function moeglicheDauer(dauer: number, luft: number, raster: number | null): number {
  const schritt = raster && raster > 0 ? raster : 5;
  return dauer + Math.floor(Math.max(0, luft) / schritt) * schritt;
}

/** „bis 90 Min. möglich“; über zwei Stunden genügt die Grenze. */
export function moeglichText(minuten: number): string {
  return minuten > 120 ? 'über 2 Std. möglich' : `bis ${minuten} Min. möglich`;
}

/**
 * Wie lang der Termin von seinem Beginn an dauern dürfte (ANN-535): bis zur
 * Weiterfahrt - die Luft der geprüften Seite, am Tagesrand bis zur Rückfahrt
 * zum Arbeitsende - und höchstens bis zum nächsten Termin jeder Art oder zum
 * Ende des Arbeitszeitbands (`frei`, aus `freieMinuten`). Keine Angabe,
 * solange die Weiterfahrt ungeprüft oder die Belegung des Tages unbekannt ist:
 * lieber nichts als eine Dauer, die nicht geht.
 */
export function dauerangabe(
  pruefung: Wegpruefung,
  {
    dauer,
    raster,
    frei,
  }: {
    dauer: number;
    raster: number | null;
    /** `unbekannt`: Termine oder Arbeitszeit des Tages ließen sich nicht laden. */
    frei: number | null | 'unbekannt';
  },
): string | null {
  if (frei === 'unbekannt') return null;
  const luefte: number[] = frei === null ? [] : [frei - dauer];
  if (pruefung.stand === 'bereit') {
    const weiter = pruefung.weiter;
    if (weiter.stand === 'geprueft') luefte.push(weiter.luft);
    else if (weiter.stand !== 'offen') return null;
  } else if (pruefung.stand !== 'aus') {
    // Lädt, nicht verortet, veraltet oder gescheitert: Der Weg ist unbekannt.
    return null;
  }
  if (luefte.length === 0) return null;
  return moeglichText(moeglicheDauer(dauer, Math.min(...luefte), raster));
}

export interface Wegangabe {
  /** `warnung` als Zeichen und Wort; was passt oder ungeprüft ist, steht leise da. */
  readonly ton: 'warnung' | 'neutral';
  readonly wort: string;
}

type Geprueft = Extract<Seite, { stand: 'geprueft' }>;

/**
 * Was die Zeile über die Wege sagt: „Wege passen“, „Weg knapp“ oder „Weg
 * ungeprüft“. `null`, wo es nichts zu prüfen gab - am Videotermin oder ohne
 * Termin und Tagesrand mit Ort. Passende Wege sind hier der Regelfall - was
 * nicht passt, steht gar nicht da (ANN-535) - und tragen deshalb kein
 * Abzeichen (DESIGN.md Regel 5); nur „Weg knapp“ ist Zeichen und Wort.
 */
export function wegangabe(pruefung: Wegpruefung): Wegangabe | null {
  if (pruefung.stand === 'aus' || pruefung.stand === 'laedt') return null;
  if (pruefung.stand !== 'bereit') return { ton: 'neutral', wort: 'Weg ungeprüft' };

  const seiten = [pruefung.an, pruefung.weiter];
  if (seiten.some((s) => s.stand === 'nicht_geprueft' || s.stand === 'nachbar_nicht_verortet')) {
    return { ton: 'neutral', wort: 'Weg ungeprüft' };
  }
  const geprueft = seiten.filter((s): s is Geprueft => s.stand === 'geprueft');
  if (geprueft.length === 0) return null;
  if (geprueft.some((s) => s.stufe === 'knapp')) return { ton: 'warnung', wort: 'Weg knapp' };
  return { ton: 'neutral', wort: geprueft.length === 2 ? 'Wege passen' : 'Weg passt' };
}

/**
 * „davor 08:00–08:45 · danach 11:30“: nur Zeiten, nie ein Name (wie „Passt
 * es?“) - die Termine aus `nachbarZeiten`.
 */
export function nachbarText(
  vorher: Zeitraum | null,
  nachher: Zeitraum | null,
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
