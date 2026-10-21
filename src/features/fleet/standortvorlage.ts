import type { Anrufnummer } from '@/components/ui/Anrufknoepfe';
import { telHref } from '@/lib/telefon';

/**
 * Standortabhängige Inhalte des Pannenablaufs an einer Stelle.
 *
 * Die Schrittstruktur des Assistenten (`src/features/fleet/pannenablauf.ts`)
 * ist standortunabhängig. Alles, was sich zwischen Köln und Tübingen ändern
 * kann - Werkstatt, Ruhetag, Depot, Transportoptionen, örtliche Texte - steht
 * hier und wird dort nur eingesetzt.
 *
 * Bewusst kein allgemeiner Regel- oder Workflow-Baukasten: es gibt wenige
 * standortabhängige Stellen, und die sollen gezielt änderbar sein.
 *
 * WICHTIG: Diese Datei enthält keine echten betrieblichen Kontaktdaten,
 * Telefonnummern, Ansprechpartner oder Zugangscodes. Die Vorlage stammt aus
 * dem Kölner Ablauf, ihre konkreten Werte sind durch Platzhalter ersetzt
 * (PROJECT_PRINCIPLES.md 3.3). Sie ist für Tübingen nicht geprüft und darf
 * nicht als freigegebene Betriebsanweisung gelesen werden.
 */

export interface Werkstatt {
  /** Anzeigename der Vertragswerkstatt. */
  name: string;
  telefon: string;
  mobil: string;
  /** Wochentag, an dem die Werkstatt geschlossen hat. */
  ruhetag: string;
}

export interface Depotzugang {
  bezeichnung: string;
  /**
   * Wie der Zugang beschrieben wird. Ein tatsächlicher Zugangscode wird hier
   * NICHT hinterlegt; er gehört in die Zugangsverwaltung der Praxis, nicht in
   * den Quelltext.
   */
  zugangHinweis: string;
}

interface Transportoption {
  id: string;
  /** Wie die Option im Ablauf angeboten wird. */
  label: string;
  /** Bedingung, unter der sie überhaupt in Frage kommt. */
  voraussetzung: string;
}

export interface Standortvorlage {
  id: string;
  /** Woher die Vorlage stammt. */
  herkunft: string;
  /** Ist der Ablauf für den tatsächlichen Betriebsstandort geprüft? */
  geprueft: boolean;
  /** Erklärung, solange `geprueft` false ist. */
  pruefhinweis: string;
  werkstatt: Werkstatt;
  depot: Depotzugang;
  transport: Transportoption[];
  /** Wer bei einer Panne zur Koordination informiert wird - als Rolle, nicht als Person. */
  zustaendigeRolle: string;
  /** Die Rufnummer dieser Rolle (Diensttelefon), nicht die einer Person (ANN-673). */
  zustaendigeRufnummer: string;
  /**
   * Wo diese Information sonst hingeht. Die Vorlage nannte hier einen
   * externen Dienst, dann einen Team-Kanal „Flotte“; seit TEAM-001 die
   * Nachrichten der Radflotte (ANN-613).
   */
  meldeweg: string;
  /** Was vom Rad mitzunehmen ist, bevor es zurückgelassen wird. */
  mitnehmen: string[];
}

const PLATZHALTER = 'noch nicht hinterlegt';

/**
 * Kölner Ablauf als Ausgangsvorlage.
 *
 * Struktur und Verzweigungen sind übernommen. Alle betrieblichen Werte sind
 * Platzhalter: die Vorlage soll den Ablauf zeigen, nicht Kölner Anweisungen
 * als Tübinger Betrieb ausgeben.
 */
export const standortvorlageKoeln: Standortvorlage = {
  id: 'koeln-vorlage',
  herkunft: 'Köln',
  geprueft: false,
  pruefhinweis:
    'Standortvorlage Köln – für Tübingen noch zu prüfen. Werkstatt, Ruhetag, ' +
    'Depot, Transportoptionen und Zuständigkeiten sind Platzhalter und keine ' +
    'freigegebene Betriebsanweisung.',
  werkstatt: {
    name: 'Vertragswerkstatt',
    telefon: PLATZHALTER,
    mobil: PLATZHALTER,
    ruhetag: 'Mittwoch',
  },
  depot: {
    bezeichnung: 'Raddepot',
    zugangHinweis:
      'Der Zugangscode wird nicht in der Anwendung gespeichert. Er kommt aus ' +
      'der Zugangsverwaltung der Praxis.',
  },
  transport: [
    {
      id: 'carsharing',
      label: 'Carsharing-Fahrzeug zur nächsten Behandlung',
      voraussetzung: 'Autoführerschein vorhanden und Fahrzeug in Gehweite',
    },
    {
      id: 'fahrdienst',
      label: 'Fahrdienst/Taxi zur nächsten Behandlung',
      voraussetzung: 'kein Führerschein oder kein Fahrzeug erreichbar',
    },
  ],
  zustaendigeRolle: 'Teamleitung',
  zustaendigeRufnummer: PLATZHALTER,
  meldeweg: 'Nachrichten der Radflotte',
  mitnehmen: ['Fahrradakku', 'Behandlungsliege'],
};

/** Aktuell verwendete Vorlage. Der Wechsel auf Tübingen ist ein Datenwechsel. */
export const aktiveStandortvorlage = standortvorlageKoeln;

/**
 * Eine Rufnummer der Vorlage als Knopf zum Wählen - keiner, solange sie ein
 * Platzhalter ist: Der Schritt sagt dann, dass sie fehlt, statt einen Anruf
 * zu verlangen, der nicht geht (BEF-176).
 */
function alsAnruf(label: string, nummer: string): Anrufnummer[] {
  return nummer === PLATZHALTER || nummer.trim() === ''
    ? []
    : [{ label, anzeige: nummer, href: telHref(nummer) }];
}

/** Die Rufnummern der Werkstatt, Telefon vor Mobil. */
export function werkstattNummern(werkstatt: Werkstatt): Anrufnummer[] {
  return [
    ...alsAnruf('Werkstatt', werkstatt.telefon),
    ...alsAnruf('Werkstatt mobil', werkstatt.mobil),
  ];
}

/** Die Rufnummer der zuständigen Rolle („Teamleitung anrufen“). */
export function zustaendigeNummern(vorlage: Standortvorlage): Anrufnummer[] {
  return alsAnruf(vorlage.zustaendigeRolle, vorlage.zustaendigeRufnummer);
}

const WOCHENTAGE = [
  'Sonntag',
  'Montag',
  'Dienstag',
  'Mittwoch',
  'Donnerstag',
  'Freitag',
  'Samstag',
] as const;

/** Der Wochentag eines Zeitpunkts in der Zeit der Praxis, etwa „Mittwoch“. */
export function wochentag(zeitpunkt: Date, zeitzone: string): string {
  const kurz = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: zeitzone }).format(
    zeitpunkt,
  );
  const index = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(kurz);
  return WOCHENTAGE[index] ?? '';
}

/**
 * Hat die Werkstatt heute Ruhetag? Die App weiß den Tag - die Panne fragt
 * nicht danach, sondern verzweigt selbst (BEF-176).
 */
export function istRuhetag(vorlage: Standortvorlage, zeitpunkt: Date, zeitzone: string): boolean {
  return wochentag(zeitpunkt, zeitzone) === vorlage.werkstatt.ruhetag;
}

export function transportLabel(vorlage: Standortvorlage, id: string): string {
  return vorlage.transport.find((option) => option.id === id)?.label ?? id;
}
