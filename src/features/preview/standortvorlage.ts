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
  /** Wo diese Information hingeht. Die Vorlage nannte hier einen externen Dienst. */
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
    name: `Vertragswerkstatt (${PLATZHALTER})`,
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
  meldeweg: 'Team-Kanal „Flotte"',
  mitnehmen: ['Fahrradakku', 'Behandlungsliege'],
};

/** Aktuell verwendete Vorlage. Der Wechsel auf Tübingen ist ein Datenwechsel. */
export const aktiveStandortvorlage = standortvorlageKoeln;

export function transportLabel(vorlage: Standortvorlage, id: string): string {
  return vorlage.transport.find((option) => option.id === id)?.label ?? id;
}
