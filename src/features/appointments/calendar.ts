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

// Nur der Typ: `api.ts` liest diese Datei zur Laufzeit, nicht umgekehrt.
import type { EreignisFormValues } from './api';

const KALENDER_ANSICHTEN = ['tag', 'woche'] as const;
export type KalenderAnsicht = (typeof KALENDER_ANSICHTEN)[number];

/**
 * Werte des Statusfilters.
 *
 * `active` ist der Standard und umfasst alles außer der Absage: Jeder andere
 * Zustand belegt den Tag tatsächlich. Ein Filter, der nur bestätigte Termine
 * kennt, ließe jeden abgehakten Termin aus der Ansicht verschwinden (CAL-004).
 *
 * `done` fasst die drei erledigten Zustände zusammen — durchgeführt,
 * dokumentiert, abgerechnet. Wer im Kalender sucht, fragt „ist das erledigt?"
 * und nicht, ob die Dokumentation schon festgeschrieben ist; beide Gruppen
 * werden serverseitig aufgelöst (CAL-008a).
 */
const STATUS_FILTER = ['active', 'confirmed', 'done', 'no_show', 'cancelled', 'all'] as const;
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

/**
 * Kalenderwoche nach ISO 8601 (DIN 1355): Die Woche beginnt am Montag, und
 * Woche 1 ist die mit dem ersten Donnerstag des Jahres (BEF-039).
 */
export function kalenderwoche(iso: string): number {
  // Der Donnerstag derselben Woche entscheidet über das Jahr der Woche.
  const donnerstag = alsDate(tagePlus(wochenBeginn(iso), 3));
  const jahresBeginn = Date.UTC(donnerstag.getUTCFullYear(), 0, 1);
  return Math.floor((donnerstag.getTime() - jahresBeginn) / 86_400_000 / 7) + 1;
}

/** Erster Tag des Monats, in dem dieser Tag liegt. */
export function monatsBeginn(iso: string): string {
  return `${iso.slice(0, 7)}-01`;
}

/** Derselbe Monatserste, um ganze Monate verschoben. */
export function monatPlus(monatsErster: string, monate: number): string {
  const d = alsDate(monatsErster);
  d.setUTCMonth(d.getUTCMonth() + monate, 1);
  return alsIso(d);
}

/**
 * Die Tage, die ein Monatsblatt zeigt: ganze Wochen von Montag bis Sonntag,
 * vom Montag vor dem Ersten bis zum Sonntag nach dem Letzten (BEF-039).
 */
export function monatsRaster(monatsErster: string): string[][] {
  const erster = wochenBeginn(monatsErster);
  const naechster = monatPlus(monatsErster, 1);
  const wochen: string[][] = [];
  for (let montag = erster; montag < naechster; montag = tagePlus(montag, 7)) {
    wochen.push(Array.from({ length: 7 }, (_, i) => tagePlus(montag, i)));
  }
  return wochen;
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
  /**
   * Eingrenzung auf eine Patient:in (AKTE-003).
   *
   * Der Weg aus der Akte in den Kalender: „zeig mir diese Person im Kalender".
   * Anders als die übrigen Filter grenzt er nicht den Lesepfad ein, sondern
   * nur, was im Gitter hervorgehoben bleibt - der Kalender liest ohnehin
   * ausschließlich die Termine der eigenen Praxis (ADR-004).
   *
   * In der Adresse steht die Kennung, niemals der Name: Adressen landen in
   * Verläufen und Protokollen (ADR-011).
   */
  patient: string | null;
  /**
   * Verordnung, aus deren Kontingent terminiert wird (CAL-015c).
   *
   * Der Weg „von der Verordnung in den Kalender": Wer aus der Akte an einer
   * Verordnung hierher kommt, soll die freie Stelle antippen und den Termin
   * anlegen können, **ohne** Patient:in und Verordnung noch einmal zu suchen.
   * Wie `patient` grenzt sie den Lesepfad nicht ein - sie reist als Kontext
   * mit, bis der Termin angelegt ist. Nur zusammen mit `patient` sinnvoll.
   *
   * In der Adresse steht die Kennung, niemals eine Diagnose oder ein Name
   * (ADR-011). Das Ganze ist ANN-050.
   */
  verordnung: string | null;
  /** Höhe einer Stunde in Pixeln (CAL-011). */
  zoom: Zoomstufe;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function leseParameter(suche: URLSearchParams, heute: string): KalenderParameter {
  const ansicht = suche.get('ansicht');
  const datum = suche.get('datum');
  const person = suche.get('person');
  const standort = suche.get('standort');
  const status = suche.get('status');
  const patient = suche.get('patient');
  const verordnung = suche.get('verordnung');
  const zoom = Number(suche.get('zoom'));

  return {
    ansicht: KALENDER_ANSICHTEN.includes(ansicht as KalenderAnsicht)
      ? (ansicht as KalenderAnsicht)
      : 'woche',
    datum: istIsoDatum(datum) ? datum : heute,
    person: person && UUID.test(person) ? person : null,
    standort: standort && UUID.test(standort) ? standort : null,
    status: STATUS_FILTER.includes(status as StatusFilter) ? (status as StatusFilter) : 'active',
    patient: patient && UUID.test(patient) ? patient : null,
    // Ohne Patient:in ist die Verordnung gegenstandslos - sie gehört zu ihr.
    verordnung: patient && verordnung && UUID.test(verordnung) ? verordnung : null,
    zoom: istZoomstufe(zoom) ? zoom : ZOOM_STANDARD,
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
  if (p.patient) suche.set('patient', p.patient);
  if (p.verordnung) suche.set('verordnung', p.verordnung);
  // Die Zoomstufe reist mit, sobald sie von der Voreinstellung abweicht: sie
  // ueberlebt damit das Neuladen, ohne jede Adresse zu verlaengern.
  if (p.zoom !== ZOOM_STANDARD) suche.set('zoom', String(p.zoom));
  return suche;
}

/**
 * Parameter, mit dem der Kalender eine gerade eingetragene Fehlzeit meldet
 * (KAL-22).
 *
 * Wie `neu` beim Termin (FIX-016): Er steht nur für den Moment der Rückkehr in
 * der Adresse, `schreibeParameter` schreibt ihn beim nächsten Blättern nicht
 * zurück. Der Wert sagt nur, **was** eingetragen wurde - keine Bezeichnung,
 * keine Person (ADR-011).
 */
export const FEHLZEIT_EINGETRAGEN_PARAM = 'eingetragen';

export type EingetrageneFehlzeit = 'fehlzeit' | 'dauerfehlzeit';

/**
 * Hängt die Meldung „Fehlzeit eingetragen" an einen Rückweg in den Kalender.
 * Andere Rückwege bleiben, wie sie sind - dort gibt es keine Stelle für die
 * Meldung.
 */
export function mitEingetragenerFehlzeit(rueckweg: string, art: EingetrageneFehlzeit): string {
  if (!rueckweg.startsWith('/kalender')) return rueckweg;
  const trenner = rueckweg.includes('?') ? '&' : '?';
  return `${rueckweg}${trenner}${FEHLZEIT_EINGETRAGEN_PARAM}=${art}`;
}

/** Die gemeldete Fehlzeit aus der Adresse; ein fremder Wert zählt nicht. */
export function leseEingetrageneFehlzeit(suche: URLSearchParams): EingetrageneFehlzeit | null {
  const wert = suche.get(FEHLZEIT_EINGETRAGEN_PARAM);
  return wert === 'fehlzeit' || wert === 'dauerfehlzeit' ? wert : null;
}

/**
 * Wofür eine Fehlzeit steht, als Aufzählung (KAL-27).
 *
 * Dieselben Beispiele in der Anlegen-Leiste und auf beiden Formularen - bisher
 * standen dort drei verschiedene Reihen. Die Reihe ist die aus dem Kommentar
 * an `BEGRIFFE.fehlzeit` (CAL-021); gehört sie einmal in `begriffe.ts`, zieht
 * dieser Wert dorthin um.
 */
export const FEHLZEIT_BEISPIELE = 'Meeting, Puffer, Pause';

/**
 * Die Felder einer Fehlzeit, die einen Fehler tragen können - in der
 * Reihenfolge des Formulars (KAL-17).
 *
 * Eine eigene Liste statt der Schlüssel von `EreignisFormValues`: `api.ts`
 * liest diese Datei, nicht umgekehrt, und die Art des Orts trägt nie einen
 * Fehler.
 */
export const EREIGNIS_FEHLERFELDER = [
  'title',
  'staff_member_ids',
  'location_id',
  'date',
  'start_time',
  'end_time',
] as const;
export type EreignisFehlerfeld = (typeof EREIGNIS_FEHLERFELDER)[number];

/**
 * Feste Kennungen der Fehlzeitfelder (KAL-17, UX-012): Die
 * Fehlerzusammenfassung springt auf das Feld, und eine mit `useId` erzeugte
 * Kennung wäre von außen nicht bekannt. Die Beteiligten springen auf ihr
 * erstes Kästchen.
 */
export const EREIGNIS_FELD_IDS: Readonly<Record<EreignisFehlerfeld, string>> = {
  title: 'fehlzeit-bezeichnung',
  staff_member_ids: 'fehlzeit-beteiligte',
  location_id: 'fehlzeit-standort',
  date: 'fehlzeit-datum',
  start_time: 'fehlzeit-beginn',
  end_time: 'fehlzeit-ende',
};

/** Wie die Fehlerzusammenfassung die Felder nennt - ohne Pflichtsternchen. */
export const EREIGNIS_BESCHRIFTUNGEN: Readonly<Record<EreignisFehlerfeld, string>> = {
  title: 'Bezeichnung',
  staff_member_ids: 'Beteiligte Personen',
  location_id: 'Standort',
  date: 'Datum',
  start_time: 'Beginn',
  end_time: 'Ende',
};

/**
 * Weicht eine Fehlzeit vom Stand ab, mit dem ihr Formular begann? (KAL-20,
 * TER-05)
 *
 * Danach richtet sich der Schutz ungespeicherter Eingaben: Was aus dem
 * Kalender vorbelegt oder aus dem Bestand geladen wurde, ist keine Eingabe,
 * und ein Weggehen davon braucht keine Rückfrage. Die Reihenfolge der
 * Beteiligten zählt nicht.
 */
export function ereignisGeaendert(werte: EreignisFormValues, anfang: EreignisFormValues): boolean {
  const beteiligte = (w: EreignisFormValues) => [...w.staff_member_ids].sort().join(',');
  return (
    werte.title !== anfang.title ||
    werte.appointment_type !== anfang.appointment_type ||
    werte.date !== anfang.date ||
    werte.start_time !== anfang.start_time ||
    werte.end_time !== anfang.end_time ||
    werte.location_id !== anfang.location_id ||
    beteiligte(werte) !== beteiligte(anfang)
  );
}

// -----------------------------------------------------------------------------
// Anordnung in der Wochenansicht
// -----------------------------------------------------------------------------

interface ZeitPosition {
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

/**
 * Zoomstufen des Zeitgitters als Höhe einer Stunde in Pixeln (CAL-011).
 *
 * Bis 2026-09-11 gab es genau eine Höhe: 56 px je Stunde. Darin misst eine
 * Viertelstunde 14 px und das Praxisraster von fünf Minuten 4,7 px — zu wenig,
 * um es zu zeichnen. Das Gitter zeigte deshalb nur Stundenlinien, während im
 * Hintergrund auf fünf Minuten genau terminiert wird. Wer einen Termin um zehn
 * Minuten verschieben wollte, zog gegen ein Raster, das er nicht sah.
 *
 * Die Stufen wachsen um je rund die Hälfte. Sie decken beide Fragen ab: den
 * Überblick über eine ganze Woche (40) und das genaue Legen eines Termins
 * (208).
 */
export const ZOOMSTUFEN = [40, 64, 96, 144, 208] as const;
export type Zoomstufe = (typeof ZOOMSTUFEN)[number];

/**
 * Voreinstellung: die kleinste Stufe, auf der das Fünf-Minuten-Raster noch
 * sichtbar ist (96 px je Stunde sind 8 px je fünf Minuten).
 */
export const ZOOM_STANDARD: Zoomstufe = 96;

function istZoomstufe(wert: unknown): wert is Zoomstufe {
  return ZOOMSTUFEN.includes(wert as Zoomstufe);
}

/** Eine Stufe hinauf oder hinunter; an den Enden bleibt es stehen. */
export function zoomSchritt(aktuell: Zoomstufe, richtung: 1 | -1): Zoomstufe {
  const index = ZOOMSTUFEN.indexOf(aktuell);
  const ziel = Math.min(
    ZOOMSTUFEN.length - 1,
    Math.max(0, (index < 0 ? ZOOMSTUFEN.indexOf(ZOOM_STANDARD) : index) + richtung),
  );
  return ZOOMSTUFEN[ziel]!;
}

/**
 * Abstand in Pixeln, unter dem eine Rasterlinie keine Hilfe mehr ist.
 *
 * Enger gezeichnet verschwimmen die Linien zu einer grauen Fläche: sie
 * kosten Aufmerksamkeit, ohne eine Zeit ablesbar zu machen.
 */
const LINIEN_MINDESTABSTAND = 7;

interface Gitterlinien {
  /** Feinste gezeichnete Stufe in Minuten; null, wenn dafür kein Platz ist. */
  fein: number | null;
  /** Halbe Stunden als mittlere Betonung zwischen fein und Stunde. */
  halbeStunde: boolean;
}

/**
 * Welche Linien bei dieser Zoomstufe gezeichnet werden.
 *
 * Die feinste Stufe ist das **Praxisraster** selbst und nicht eine fest
 * gewählte Zahl: gezeichnet wird, worauf ein Termin tatsächlich einrastet
 * (CAL-005). Stellt die Praxis auf zehn oder fünfzehn Minuten um, folgt das
 * Gitter. Passt das Praxisraster nicht mehr in den Mindestabstand, tritt die
 * Viertelstunde an seine Stelle; reicht auch die nicht, bleiben Stunden.
 */
export function gitterlinien(stundenHoehe: number, praxisRaster: number | null): Gitterlinien {
  const passt = (schritt: number) => (stundenHoehe * schritt) / 60 >= LINIEN_MINDESTABSTAND;
  const raster = praxisRaster && praxisRaster > 0 ? praxisRaster : 5;
  return {
    fein: passt(raster) ? raster : passt(15) ? 15 : null,
    halbeStunde: passt(30),
  };
}

/** Alle Linien einer Stufe im Fenster, als Minuten seit Mitternacht. */
export function linienAchse(vonMinute: number, bisMinute: number, schritt: number): number[] {
  if (schritt <= 0) return [];
  const linien: number[] = [];
  for (let m = Math.ceil(vonMinute / schritt) * schritt; m < bisMinute; m += schritt)
    linien.push(m);
  return linien;
}

export function minuteZuPixel(minute: number, fensterVon: number, stundenHoehe: number): number {
  return ((minute - fensterVon) / 60) * stundenHoehe;
}

export function pixelZuMinute(pixel: number, fensterVon: number, stundenHoehe: number): number {
  return fensterVon + (pixel / stundenHoehe) * 60;
}

/**
 * Trifft ein Tipp die gezeichnete Fläche einer Punktauswahl? (KAL-09)
 *
 * „Dasselbe Feld: aufheben" (BEF-036) verglich bisher die gerundete
 * Rasterminute - bei fünf Minuten und 96 px je Stunde ein Ziel von 8 px, bei
 * der kleinsten Zoomstufe 3 px. Gezeichnet ist die Auswahl aber mindestens
 * `mindestHoehe` Pixel hoch (BEF-037), und genau dorthin tippt, wer sie lösen
 * will. Ein Tipp irgendwo in dieser Fläche zählt deshalb als dasselbe Feld;
 * kürzere Spannen entstehen durch Ziehen oder auf einer feineren Zoomstufe.
 *
 * Nur für einen Punkt: Eine fertige Spanne ist schon eine Antwort, der nächste
 * Tipp beginnt eine neue Auswahl (`naechsteAuswahl`).
 */
export function trifftPunktauswahl(
  auswahl: { spalteId: string; vonMinute: number; bisMinute: number } | null,
  tipp: { spalteId: string; pixel: number },
  fensterVon: number,
  stundenHoehe: number,
  mindestHoehe: number,
): boolean {
  if (!auswahl || auswahl.vonMinute !== auswahl.bisMinute) return false;
  if (auswahl.spalteId !== tipp.spalteId) return false;
  const oben = minuteZuPixel(auswahl.vonMinute, fensterVon, stundenHoehe);
  return tipp.pixel >= oben && tipp.pixel <= oben + mindestHoehe;
}

/**
 * Wo der Kasten der Verschieben-Rückfrage in der Spalte steht, als Abstand von
 * oben (KAL-13).
 *
 * Bis KAL-13 rechnete das Raster mit 200 px Kastenhöhe; tatsächlich sind es
 * 250 bis 400 px, und spät am Tag lag der Kasten dann über der neuen Kachel
 * oder ragte unter das Raster. Die Höhe kommt jetzt gemessen herein:
 *
 *   * unter der neuen Kachel, wenn er dort ganz ins Raster passt;
 *   * sonst darüber, wenn er dort passt;
 *   * passt beides nicht, in den sichtbaren Teil der Spalte - so nah unter der
 *     Kachel wie möglich, aber nie über das Raster hinaus. Sonst rollte der
 *     Rasterkasten innen senkrecht, und die Knöpfe wären zu suchen.
 *
 * `sichtbarVon` und `sichtbarBis` sind der Teil der Spalte, der gerade im
 * Fenster steht, in Pixeln von ihrem oberen Rand.
 */
export function rueckfrageOben({
  kachelOben,
  kachelHoehe,
  kastenHoehe,
  spaltenHoehe,
  sichtbarVon,
  sichtbarBis,
  abstand = 4,
}: {
  kachelOben: number;
  kachelHoehe: number;
  kastenHoehe: number;
  spaltenHoehe: number;
  sichtbarVon: number;
  sichtbarBis: number;
  abstand?: number;
}): number {
  const darunter = kachelOben + kachelHoehe + abstand;
  if (darunter + kastenHoehe <= spaltenHoehe) return darunter;

  const darueber = kachelOben - abstand - kastenHoehe;
  if (darueber >= 0) return darueber;

  let oben = Math.min(darunter, sichtbarBis - kastenHoehe);
  oben = Math.max(oben, sichtbarVon);
  oben = Math.min(oben, spaltenHoehe - kastenHoehe);
  return Math.max(0, oben);
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

/**
 * Die Zeit außerhalb der Arbeitszeit innerhalb des Tagesfensters (UX-005c).
 *
 * Bis UX-005c lag die Arbeitszeit selbst als graues Band im Gitter - und
 * genau das las sich als „hier nicht": Jannes sah den Kalender und fand die
 * Arbeitszeit nicht. Grau ist, wo jemand nicht arbeitet; die Arbeitszeit ist
 * die freie, weiße Fläche. Diese Funktion liefert das Gegenstück der Bänder:
 * die Lücken davor, dazwischen und danach, bezogen auf das gezeichnete
 * Fenster. Überlappende Bänder werden zusammengelegt; ohne Bänder ist der
 * ganze Tag außerhalb - ein Tag ohne hinterlegte Arbeitszeit sieht damit so
 * aus wie ein freier Tag, und beides stimmt.
 *
 * Reine Darstellung: Ob ein Termin außerhalb liegt, entscheidet allein der
 * Server (`app.is_within_working_hours`).
 */
export function ausserhalbArbeitszeit(
  baender: readonly Zeitband[],
  fenster: { vonMinute: number; bisMinute: number },
): Zeitband[] {
  const sortiert = [...baender]
    .filter((b) => b.bisMinute > b.vonMinute)
    .sort((a, b) => a.vonMinute - b.vonMinute);
  const luecken: Zeitband[] = [];
  let stand = fenster.vonMinute;
  for (const band of sortiert) {
    if (band.vonMinute > stand) {
      luecken.push({ vonMinute: stand, bisMinute: Math.min(band.vonMinute, fenster.bisMinute) });
    }
    stand = Math.max(stand, band.bisMinute);
    if (stand >= fenster.bisMinute) break;
  }
  if (stand < fenster.bisMinute) luecken.push({ vonMinute: stand, bisMinute: fenster.bisMinute });
  return luecken.filter((l) => l.bisMinute > l.vonMinute && l.bisMinute > fenster.vonMinute);
}

/**
 * Wie viele ganze Zeilen eine Kachel dieser Höhe trägt (BEF-072), mindestens
 * eine: Der Name steht immer da, Zeit und Ort nur, wenn sie ganz passen.
 */
export function kachelZeilen(hoehePx: number): number {
  return Math.max(1, Math.floor((hoehePx - 10) / 16));
}

/**
 * Belegte Zeiten einer Person an einem Kalendertag als Minutenbänder
 * (ABN-021, BEF-112). Ein Block über Mitternacht wird an den Tagesgrenzen
 * abgeschnitten. Reine Darstellung - ob ein Termin passt, prüft der Server.
 */
export function belegtBaender(
  bloecke: readonly { staff_member_id: string; starts_at: string; ends_at: string }[],
  staffMemberId: string,
  tag: string,
  zone: string,
  minuten: (iso: string, zone: string) => number,
  tagDes: (iso: string, zone: string) => string,
): Zeitband[] {
  return bloecke
    .filter((b) => b.staff_member_id === staffMemberId)
    .flatMap((b) => {
      const beginnTag = tagDes(b.starts_at, zone);
      const endeTag = tagDes(b.ends_at, zone);
      if (beginnTag > tag || endeTag < tag) return [];
      const von = beginnTag < tag ? 0 : minuten(b.starts_at, zone);
      const bis = endeTag > tag ? 24 * 60 : minuten(b.ends_at, zone);
      return bis > von ? [{ vonMinute: von, bisMinute: bis }] : [];
    });
}
