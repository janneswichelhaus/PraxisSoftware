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
