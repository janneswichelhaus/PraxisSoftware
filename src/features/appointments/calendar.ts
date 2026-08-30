/**
 * Kalenderlogik ohne Oberfläche.
 *
 * Hier passiert ausschließlich Kalenderarithmetik auf `YYYY-MM-DD`, also auf
 * bereits festgelegten Kalendertagen. Das ist bewusst KEINE
 * Zeitzonenarithmetik: welcher Tag "heute" ist und wie ein Kalendertag in
 * Zeitstempel übersetzt wird, entscheiden `todayInTimeZone` beziehungsweise
 * die Datenbank mit der Zeitzone der Organisation.
 *
 * Gerechnet wird über UTC-verankerte `Date`-Objekte. Sie dienen nur als
 * Kalenderrechner; eine Ortszeit wird daraus nie abgeleitet.
 */

export const KALENDER_ANSICHTEN = ['tag', 'woche'] as const;
export type KalenderAnsicht = (typeof KALENDER_ANSICHTEN)[number];

/**
 * Werte des Statusfilters.
 *
 * `active` ist der Standard und umfasst geplante UND abgeschlossene Termine.
 * Beide belegen den Tag tatsächlich; ein Filter, der nur `scheduled` kennt,
 * ließe jeden abgehakten Termin aus der Ansicht verschwinden (CAL-004).
 */
export const STATUS_FILTER = ['active', 'scheduled', 'completed', 'cancelled', 'all'] as const;
export type StatusFilter = (typeof STATUS_FILTER)[number];

const ISO_DATUM = /^\d{4}-\d{2}-\d{2}$/;

/** Prüft ein `YYYY-MM-DD` samt tatsächlicher Existenz des Tages. */
export function istIsoDatum(wert: string | null | undefined): wert is string {
  if (!wert || !ISO_DATUM.test(wert)) return false;
  const d = new Date(`${wert}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return false;
  // Fängt den 31. Februar ab: Date normalisiert still auf den 3. März.
  return d.toISOString().slice(0, 10) === wert;
}

function alsDate(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`);
}

function alsIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Verschiebt einen Kalendertag um ganze Tage. */
export function tagePlus(iso: string, tage: number): string {
  const d = alsDate(iso);
  d.setUTCDate(d.getUTCDate() + tage);
  return alsIso(d);
}

/** Montag der Woche, in der dieser Tag liegt. */
export function wochenBeginn(iso: string): string {
  const d = alsDate(iso);
  // getUTCDay: 0 = Sonntag. Die Woche beginnt am Montag.
  const versatz = (d.getUTCDay() + 6) % 7;
  return tagePlus(iso, -versatz);
}

export interface Zeitbereich {
  /** Erster Kalendertag, einschließlich. */
  von: string;
  /** Erster Kalendertag NACH dem Bereich - halboffen wie die Termine selbst. */
  bis: string;
}

export function bereichFuer(ansicht: KalenderAnsicht, datum: string): Zeitbereich {
  if (ansicht === 'tag') return { von: datum, bis: tagePlus(datum, 1) };
  const start = wochenBeginn(datum);
  return { von: start, bis: tagePlus(start, 7) };
}

/** Alle Kalendertage eines Bereichs, aufsteigend. */
export function tageImBereich({ von, bis }: Zeitbereich): string[] {
  const tage: string[] = [];
  for (let tag = von; tag < bis; tag = tagePlus(tag, 1)) tage.push(tag);
  return tage;
}

/** Einen Bereich um eine ganze Ansichtslänge vor oder zurück schieben. */
export function blaettern(ansicht: KalenderAnsicht, datum: string, richtung: 1 | -1): string {
  return tagePlus(datum, richtung * (ansicht === 'tag' ? 1 : 7));
}

// -----------------------------------------------------------------------------
// Query-Parameter
//
// Ungültige Werte fallen still auf den Standard zurück. Eine Fehlermeldung für
// eine verstellte Adresszeile wäre für die bedienende Person wertlos.
// -----------------------------------------------------------------------------

export interface KalenderParameter {
  ansicht: KalenderAnsicht;
  datum: string;
  person: string | null;
  standort: string | null;
  status: StatusFilter;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function leseParameter(suche: URLSearchParams, heute: string): KalenderParameter {
  const ansicht = suche.get('ansicht');
  const datum = suche.get('datum');
  const person = suche.get('person');
  const standort = suche.get('standort');
  const status = suche.get('status');

  return {
    ansicht: KALENDER_ANSICHTEN.includes(ansicht as KalenderAnsicht)
      ? (ansicht as KalenderAnsicht)
      : 'woche',
    datum: istIsoDatum(datum) ? datum : heute,
    person: person && UUID.test(person) ? person : null,
    standort: standort && UUID.test(standort) ? standort : null,
    status: STATUS_FILTER.includes(status as StatusFilter) ? (status as StatusFilter) : 'active',
  };
}

/**
 * Schreibt die Parameter zurück in die Adresszeile.
 *
 * Standardwerte werden weggelassen, damit die Adresse lesbar bleibt - mit
 * Ausnahme von Ansicht und Datum: die sollen beim Teilen eines Links
 * ausdrücklich mitkommen.
 */
export function schreibeParameter(p: KalenderParameter): URLSearchParams {
  const suche = new URLSearchParams();
  suche.set('ansicht', p.ansicht);
  suche.set('datum', p.datum);
  if (p.person) suche.set('person', p.person);
  if (p.standort) suche.set('standort', p.standort);
  if (p.status !== 'active') suche.set('status', p.status);
  return suche;
}

// -----------------------------------------------------------------------------
// Anordnung in der Wochenansicht
// -----------------------------------------------------------------------------

export interface ZeitPosition {
  /** Abstand von oben in Prozent des dargestellten Tagesfensters. */
  top: number;
  /** Höhe in Prozent des dargestellten Tagesfensters. */
  hoehe: number;
}

/**
 * Ordnet einen Termin proportional in ein Tagesfenster ein.
 *
 * `beginnMinute` und `endeMinute` sind Minuten seit Mitternacht in der
 * Praxiszeitzone; sie werden von der Anzeige aus `Intl` gewonnen, nicht hier
 * berechnet.
 */
export function position(
  beginnMinute: number,
  endeMinute: number,
  fenster: { vonMinute: number; bisMinute: number },
): ZeitPosition {
  const spanne = Math.max(1, fenster.bisMinute - fenster.vonMinute);
  const roh = ((beginnMinute - fenster.vonMinute) / spanne) * 100;
  const rohHoehe = ((endeMinute - beginnMinute) / spanne) * 100;
  const top = Math.min(100, Math.max(0, roh));
  // Mindesthöhe, damit ein sehr kurzer Termin anklickbar bleibt.
  const hoehe = Math.min(100 - top, Math.max(4, rohHoehe));
  return { top, hoehe };
}

/**
 * Bestimmt das dargestellte Tagesfenster.
 *
 * Grundlage sind übliche Praxiszeiten; liegt ein Termin davor oder danach,
 * wächst das Fenster auf volle Stunden mit. Ohne diese Anpassung wäre ein
 * Frühtermin schlicht unsichtbar.
 */
export function tagesFenster(
  minuten: { beginn: number; ende: number }[],
  standard = { vonMinute: 7 * 60, bisMinute: 20 * 60 },
): { vonMinute: number; bisMinute: number } {
  let von = standard.vonMinute;
  let bis = standard.bisMinute;
  for (const m of minuten) {
    if (m.beginn < von) von = Math.floor(m.beginn / 60) * 60;
    if (m.ende > bis) bis = Math.ceil(m.ende / 60) * 60;
  }
  return { vonMinute: von, bisMinute: Math.max(bis, von + 60) };
}

/**
 * Verteilt zeitlich überlappende Termine nebeneinander.
 *
 * Für dieselbe behandelnde Person kann es Überschneidungen nicht geben - das
 * verhindert die Datenbank. Verschiedene Personen arbeiten aber zeitgleich;
 * ohne Aufteilung lägen ihre Termine im selben Tag übereinander.
 *
 * Erwartet nach Beginn sortierte Einträge und liefert je Eintrag Spalte und
 * Spaltenzahl seiner Überlappungsgruppe.
 */
export function spalten(
  eintraege: { beginn: number; ende: number }[],
): { spalte: number; anzahl: number }[] {
  const ergebnis: { spalte: number; anzahl: number }[] = eintraege.map(() => ({
    spalte: 0,
    anzahl: 1,
  }));

  let gruppe: number[] = [];
  let gruppenEnde = -1;

  const gruppeAbschliessen = () => {
    if (gruppe.length === 0) return;
    const anzahl = Math.max(...gruppe.map((i) => ergebnis[i]!.spalte)) + 1;
    for (const i of gruppe) ergebnis[i]!.anzahl = anzahl;
    gruppe = [];
    gruppenEnde = -1;
  };

  for (let i = 0; i < eintraege.length; i++) {
    const e = eintraege[i]!;
    if (gruppe.length > 0 && e.beginn >= gruppenEnde) gruppeAbschliessen();

    const belegt = new Set(
      gruppe.filter((j) => eintraege[j]!.ende > e.beginn).map((j) => ergebnis[j]!.spalte),
    );
    let spalte = 0;
    while (belegt.has(spalte)) spalte += 1;

    ergebnis[i]!.spalte = spalte;
    gruppe.push(i);
    gruppenEnde = Math.max(gruppenEnde, e.ende);
  }
  gruppeAbschliessen();

  return ergebnis;
}

/**
 * Breite und Versatz einer Kachel innerhalb ihrer Überlappungsgruppe.
 *
 * Strikt geteilte Spalten werden bei drei zeitgleichen Personen so schmal,
 * dass nur noch ein Buchstabe lesbar bleibt. Die Kacheln überlappen deshalb
 * leicht und werden nach Spalte gestapelt: jede bleibt links breit genug für
 * Namen und Uhrzeit, die spätere legt sich über den rechten Rand der früheren.
 */
export function kachelBreite(
  spalte: number,
  anzahl: number,
  ueberlappung = 1.7,
): { links: number; breite: number } {
  const anteil = 100 / anzahl;
  const links = spalte * anteil;
  const breite = Math.min(100 - links, anteil * ueberlappung);
  return { links, breite };
}

// -----------------------------------------------------------------------------
// Zeitgitter in Pixeln (CAL-006)
//
// Bis CAL-002 wurde proportional in Prozent gerechnet. Für das Verschieben per
// Zeigegerät ist das ungeeignet: dort muss aus einem Mauswert in Pixeln eine
// Uhrzeit werden, und umgekehrt. Eine feste Höhe je Stunde macht beide
// Richtungen zu einer Multiplikation - und den Tag beim Blättern gleich hoch.
// -----------------------------------------------------------------------------

/** Höhe einer Stunde im Zeitgitter. Grundlage aller Umrechnungen. */
export const STUNDEN_HOEHE = 56;

export function minuteZuPixel(minute: number, fensterVon: number): number {
  return ((minute - fensterVon) / 60) * STUNDEN_HOEHE;
}

export function pixelZuMinute(pixel: number, fensterVon: number): number {
  return fensterVon + (pixel / STUNDEN_HOEHE) * 60;
}

/**
 * Rundet eine Minute auf das Praxisraster.
 *
 * Gerechnet wird auf Minuten seit Mitternacht der Praxiszeitzone - dieselbe
 * Grundlage, die der Server prüft (CAL-005). Ohne gültiges Raster wird auf
 * volle Minuten gerundet statt stillschweigend etwas anderes anzunehmen.
 */
export function aufRaster(minute: number, raster: number | null | undefined): number {
  const schritt = raster && raster > 0 ? raster : 1;
  return Math.round(minute / schritt) * schritt;
}

/** `HH:MM` als Minuten seit Mitternacht. Ortszeit, keine Zeitzonenrechnung. */
export function zeitZuMinute(wert: string): number {
  const [stunde, minute] = wert.split(':');
  return Number(stunde) * 60 + Number(minute ?? 0);
}

/** Minuten seit Mitternacht als `HH:MM`, für die Übergabe an den Server. */
export function minuteZuZeit(minute: number): string {
  const begrenzt = Math.max(0, Math.min(24 * 60, Math.round(minute)));
  const h = String(Math.floor(begrenzt / 60)).padStart(2, '0');
  const m = String(begrenzt % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** ISO-8601-Wochentag eines Kalendertags: 1 = Montag … 7 = Sonntag. */
export function isoWochentag(tag: string): number {
  const d = new Date(`${tag}T00:00:00Z`);
  return ((d.getUTCDay() + 6) % 7) + 1;
}

export interface Arbeitsblock {
  staff_member_id: string;
  weekday: number;
  starts_at: string;
  ends_at: string;
}

export interface Arbeitsausnahme {
  staff_member_id: string;
  on_date: string;
  kind: 'unavailable' | 'block';
  starts_at: string | null;
  ends_at: string | null;
}

export interface Zeitband {
  vonMinute: number;
  bisMinute: number;
}

/**
 * Arbeitszeit einer Person an einem Kalendertag als Minutenbänder.
 *
 * Bildet bewusst dieselbe Regel ab wie `app.is_within_working_hours`: eine
 * datumsbezogene Abweichung ERSETZT den Wochenplan für diesen Tag; ein Tag mit
 * Abwesenheit hat gar keine Bänder. Das hier ist reine Darstellung - ob ein
 * Termin außerhalb liegt, entscheidet ausschließlich der Server.
 */
export function arbeitszeitBaender(
  staffMemberId: string,
  tag: string,
  wochenplan: readonly Arbeitsblock[],
  ausnahmen: readonly Arbeitsausnahme[],
): Zeitband[] {
  const desTages = ausnahmen.filter(
    (a) => a.staff_member_id === staffMemberId && a.on_date === tag,
  );

  if (desTages.length > 0) {
    if (desTages.some((a) => a.kind === 'unavailable')) return [];
    return desTages
      .filter((a) => a.starts_at !== null && a.ends_at !== null)
      .map((a) => ({ vonMinute: zeitZuMinute(a.starts_at!), bisMinute: zeitZuMinute(a.ends_at!) }))
      .sort((a, b) => a.vonMinute - b.vonMinute);
  }

  const wochentag = isoWochentag(tag);
  return wochenplan
    .filter((w) => w.staff_member_id === staffMemberId && w.weekday === wochentag)
    .map((w) => ({ vonMinute: zeitZuMinute(w.starts_at), bisMinute: zeitZuMinute(w.ends_at) }))
    .sort((a, b) => a.vonMinute - b.vonMinute);
}

/**
 * Erweitert das Tagesfenster um die hinterlegten Arbeitszeiten.
 *
 * Ohne diesen Schritt endete das Gitter bei einem leeren Tag am Standardfenster
 * und die Arbeitszeit einer Frühschicht wäre nicht sichtbar.
 */
export function fensterMitArbeitszeit(
  fenster: { vonMinute: number; bisMinute: number },
  baender: readonly Zeitband[],
): { vonMinute: number; bisMinute: number } {
  let von = fenster.vonMinute;
  let bis = fenster.bisMinute;
  for (const b of baender) {
    if (b.vonMinute < von) von = Math.floor(b.vonMinute / 60) * 60;
    if (b.bisMinute > bis) bis = Math.ceil(b.bisMinute / 60) * 60;
  }
  return { vonMinute: von, bisMinute: Math.max(bis, von + 60) };
}

