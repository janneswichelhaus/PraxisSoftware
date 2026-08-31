/**
 * Fachliche Typen des Vorschaugerüsts.
 *
 * Diese Typen beschreiben ausschließlich Bereiche, deren Hintergrundfunktionen
 * noch nicht gebaut sind. Sie sind bewusst KEINE Datenbankmodelle: sie legen
 * weder Tabellen noch Schnittstellen des Gesamtprodukts fest (ADR-014). Wenn
 * ein Bereich seine echte Anbindung bekommt, ersetzt das Fachmodell diese
 * Typen - deshalb liegen sie hier und nicht in einem gemeinsamen Kernmodul.
 *
 * Die Struktur folgt der bereitgestellten Team-App-Vorlage, damit die
 * Übernahme prüfbar bleibt.
 */

// -----------------------------------------------------------------------------
// Radflotte
// -----------------------------------------------------------------------------

export type Radstatus = 'verfuegbar' | 'einsatz' | 'reparatur';

export const radstatusLabels: Record<Radstatus, string> = {
  verfuegbar: 'Verfügbar',
  einsatz: 'Im Einsatz',
  reparatur: 'In Reparatur',
};

export type Wochentag = 'mo' | 'di' | 'mi' | 'do' | 'fr' | 'sa' | 'so';

export const wochentage: Wochentag[] = ['mo', 'di', 'mi', 'do', 'fr', 'sa', 'so'];

export const wochentagLabels: Record<Wochentag, string> = {
  mo: 'Mo',
  di: 'Di',
  mi: 'Mi',
  do: 'Do',
  fr: 'Fr',
  sa: 'Sa',
  so: 'So',
};

export type Belegung = 'frei' | 'belegt';

export interface Depot {
  id: string;
  name: string;
  /** Ein Depot ist ein betrieblicher Ort, kein Behandlungsraum. */
  hinweis: string;
}

export interface Schluesselvorgang {
  id: string;
  inhaber: string;
  entnommen: string;
  zurueckgelegt: string | null;
}

export interface Pannenmeldung {
  id: string;
  zeitpunkt: string;
  text: string;
  /** Wurde das Rad durch diese Meldung gesperrt? */
  gesperrt: boolean;
}

export type Checkupbewertung = 'ok' | 'beobachten' | 'problem';

export interface Checkupbefund {
  frage: string;
  bewertung: Checkupbewertung;
  notiz: string;
}

export interface Checkup {
  id: string;
  zeitpunkt: string;
  geprueftVon: string;
  befunde: Checkupbefund[];
  notiz: string;
  /** Anzahl angehängter Fotos. Die Bilder selbst verlassen die Vorschau nicht. */
  fotos: number;
  unterschrift: boolean;
}

export interface Rad {
  id: string;
  name: string;
  /** Wo das Rad eigentlich hingehört. */
  stammdepotId: string;
  /** Wo es gerade wirklich steht. */
  depotId: string;
  /** Bezeichnung, wenn das Rad an einem Sonderstandort steht. */
  sonderstandort: string;
  ersatzrad: boolean;
  stammnutzerId: string | null;
  status: Radstatus;
  /** Abweichende:r Nutzer:in, etwa beim Ersatzrad. */
  aktuellerNutzerId: string | null;
  akku: string;
  /** Nur für die administrative Praxisrolle sichtbar. */
  schluesselcode: string;
  wochenplan: Record<Wochentag, Belegung>;
  notiz: string;
  schluesselInhaber: string | null;
  schluesselSeit: string | null;
  schluesselverlauf: Schluesselvorgang[];
  pannenverlauf: Pannenmeldung[];
  checkups: Checkup[];
}

// -----------------------------------------------------------------------------
// Personal
// -----------------------------------------------------------------------------

export type Personalkategorie = 'Physiotherapie' | 'Office' | 'Leitung';

export interface Mitarbeitende {
  id: string;
  name: string;
  /** Freitext, wie in der Vorlage: „Physiotherapeutin", „Praxismanagement". */
  rolle: string;
  kategorie: Personalkategorie;
  /** Erfahrungsstufe, optional und nur für Physiotherapie vorgesehen. */
  stufe: '' | 'Senior' | 'Junior';
  telefon: string;
  email: string;
  // ---- ab hier: geschützte Personalangaben, nicht im Teamverzeichnis ----
  geburtstag: string;
  imTeamSeit: string;
  urlaubsanspruch: number;
  resturlaubVorjahr: number;
  notfallkontaktName: string;
  notfallkontaktTelefon: string;
  notiz: string;
}

// -----------------------------------------------------------------------------
// Urlaub
// -----------------------------------------------------------------------------

export type Urlaubsstatus = 'beantragt' | 'genehmigt' | 'abgelehnt';

export const urlaubsstatusLabels: Record<Urlaubsstatus, string> = {
  beantragt: 'Beantragt',
  genehmigt: 'Genehmigt',
  abgelehnt: 'Abgelehnt',
};

export interface Urlaubsantrag {
  id: string;
  mitarbeiterId: string;
  von: string;
  bis: string;
  tage: number;
  grund: string;
  status: Urlaubsstatus;
  eingereichtAm: string;
  entschiedenVon: string;
  entschiedenAm: string;
  ablehnungsgrund: string;
  unterschrift: boolean;
}

// -----------------------------------------------------------------------------
// Zeitkonto
// -----------------------------------------------------------------------------

export type Buchungsart = 'geleistet' | 'abgebaut';

export interface Zeitbuchung {
  id: string;
  mitarbeiterId: string;
  art: Buchungsart;
  datum: string;
  stunden: number;
  grund: string;
}

// -----------------------------------------------------------------------------
// Erstattungen
// -----------------------------------------------------------------------------

export type Erstattungsart = 'strom' | 'einkauf';

/**
 * Bearbeitungsstände einer Erstattung.
 *
 * Bewusst feiner als die Vorlage, die nur „offen" und „erstattet" kennt:
 * Einreichen, Entscheiden und tatsächliches Auszahlen sind verschiedene
 * Vorgänge und dürfen nicht denselben Status teilen.
 */
export type Erstattungsstand = 'eingereicht' | 'genehmigt' | 'abgelehnt' | 'ausgezahlt';

export const erstattungsstandLabels: Record<Erstattungsstand, string> = {
  eingereicht: 'Eingereicht',
  genehmigt: 'Genehmigt',
  abgelehnt: 'Abgelehnt',
  ausgezahlt: 'Ausgezahlt',
};

export interface Erstattungsposition {
  id: string;
  bezeichnung: string;
  /** Betrag in Cent - Geldwerte niemals als Gleitkommazahl (ADR-014). */
  betragCent: number;
}

export interface Erstattung {
  id: string;
  mitarbeiterId: string;
  art: Erstattungsart;
  iban: string;
  /** Nur bei Strom: Monat `YYYY-MM`. */
  zeitraumVon: string;
  zeitraumBis: string;
  arbeitstage: number;
  /** Nur bei Einkauf. */
  positionen: Erstattungsposition[];
  /** Anzahl angehängter Belege. Die Bilder verlassen die Vorschau nicht. */
  belege: number;
  notiz: string;
  unterschrift: boolean;
  stand: Erstattungsstand;
  eingereichtAm: string;
  entschiedenVon: string;
  entschiedenAm: string;
  ausgezahltAm: string;
  ablehnungsgrund: string;
}

// -----------------------------------------------------------------------------
// Teamkommunikation
// -----------------------------------------------------------------------------

export type Vorgangsart = 'termin' | 'tour' | 'panne' | 'urlaub';

export interface Vorgangsbezug {
  art: Vorgangsart;
  /** Anzeigetext. Ein Link erweitert keine Berechtigung. */
  label: string;
}

export interface Kanal {
  id: string;
  name: string;
  beschreibung: string;
  art: 'kanal' | 'direkt';
  mitgliedIds: string[];
}

export interface Nachricht {
  id: string;
  kanalId: string;
  autorId: string;
  zeitpunkt: string;
  text: string;
  /** Bei Antworten: die ID der Ausgangsnachricht. */
  threadVon: string | null;
  erwaehnungen: string[];
  bezug: Vorgangsbezug | null;
  gelesen: boolean;
}

// -----------------------------------------------------------------------------
// Touren
// -----------------------------------------------------------------------------

export type Stoppart = 'start' | 'besuch' | 'pause' | 'ende';

export interface Tourstopp {
  id: string;
  art: Stoppart;
  beginn: string;
  dauerMinuten: number;
  titel: string;
  ort: string;
  /** Wegzeit zum vorigen Stopp in Minuten. */
  wegMinuten: number | null;
  /**
   * Wie die Wegzeit entstanden ist. „geschaetzt" heißt: von Hand eingetragen.
   * Es gibt keinen Routingdienst - ein geschätzter Wert darf nicht wie ein
   * berechnetes Ergebnis aussehen.
   */
  wegHerkunft: 'geschaetzt' | 'offen';
}

export interface Tour {
  id: string;
  mitarbeiterId: string;
  datum: string;
  stopps: Tourstopp[];
}

// -----------------------------------------------------------------------------
// Abrechnung
// -----------------------------------------------------------------------------

export interface Katalogleistung {
  id: string;
  bezeichnung: string;
  /** Version der Preisvereinbarung (§19: Katalog und Preise sind versioniert). */
  version: number;
  gueltigAb: string;
  preisCent: number;
  dauerMinuten: number;
  steuerhinweis: string;
}

export type Leistungsstand = 'offen' | 'abrechenbar' | 'abgerechnet';

export interface ErbrachteLeistung {
  id: string;
  datum: string;
  patient: string;
  leistungId: string;
  mitarbeiterId: string;
  stand: Leistungsstand;
  /** Erst mit finalisierter Dokumentation ist eine Leistung abrechenbar (§19). */
  dokumentationFinalisiert: boolean;
}

export type Rechnungsstand = 'entwurf' | 'ausgestellt' | 'bezahlt' | 'storniert';

export const rechnungsstandLabels: Record<Rechnungsstand, string> = {
  entwurf: 'Entwurf',
  ausgestellt: 'Ausgestellt',
  bezahlt: 'Bezahlt',
  storniert: 'Storniert',
};

export interface Rechnung {
  id: string;
  /** Erst bei Ausstellung vergeben (§19). */
  nummer: string | null;
  empfaenger: string;
  patient: string;
  datum: string;
  betragCent: number;
  offenCent: number;
  stand: Rechnungsstand;
  leistungIds: string[];
}

export interface Zahlung {
  id: string;
  rechnungId: string;
  datum: string;
  betragCent: number;
  art: 'Überweisung' | 'Bar' | 'Rückzahlung';
}
