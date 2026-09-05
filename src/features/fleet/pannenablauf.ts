import type { Standortvorlage } from '@/features/preview/standortvorlage';
import { transportLabel } from '@/features/preview/standortvorlage';

/**
 * Schrittstruktur des Pannenablaufs.
 *
 * Übernommen aus der Team-App-Vorlage. Die Verzweigungen sind bewusst
 * unverändert erhalten - sie sind der eigentliche Wert der Vorlage. Was sich
 * zwischen Standorten unterscheidet (Werkstatt, Ruhetag, Depot,
 * Transportoptionen, Zuständigkeiten), steht ausschließlich in der
 * Standortvorlage und wird hier nur eingesetzt.
 *
 * Der Ablauf ist reine Logik ohne Oberfläche, damit die Verzweigungen und die
 * Rückwärtsnavigation testbar bleiben.
 */

export type SchrittId =
  | 'radwahl'
  | 'weiterfahrt'
  | 'weiterfahrtMoeglich'
  | 'schadensgroesse'
  | 'werkstattNah'
  | 'werkstattVorOrt'
  | 'werkstattReparieren'
  | 'ruhetag'
  | 'depotErreichbar'
  | 'depotBringen'
  | 'radZuruecklassen'
  | 'fuehrerschein'
  | 'fahrzeugErreichbar'
  | 'zusammenfassung'
  | 'vertragswerkstattNah'
  | 'vertragswerkstattKontakt'
  | 'vertragswerkstattReparieren'
  | 'vertragswerkstattUebergabe';

export type Abschlussart =
  | 'meldungOhneSperre'
  | 'lokalNichtMoeglich'
  | 'lokalRepariert'
  | 'depotAbgestellt'
  | 'vertragswerkstattRepariert'
  | 'transportFortsetzung';

export interface Abschluss {
  art: Abschlussart;
  /** Wird das Rad dadurch gesperrt („In Reparatur")? */
  sperrt: boolean;
  text: string;
}

export interface Ablaufzustand {
  radId: string | null;
  schritt: SchrittId;
  /** Für die Rückwärtsnavigation. Kein Verlauf heißt: erster Schritt. */
  verlauf: SchrittId[];
  /** Beschreibung bei weiterhin fahrbarem Rad. */
  freitext: string;
  /** Wo das zurückgelassene Rad steht. */
  standort: string;
  transport: string | null;
  /**
   * Aus welchem Zweig der Transportteil erreicht wurde. Die Zusammenfassung
   * unterscheidet sich danach.
   */
  herkunft: 'zuruecklassen' | 'uebergabe' | null;
}

/**
 * Startzustand des Ablaufs.
 *
 * `radId` ist das bereits bekannte Rad - etwa, weil der Ablauf von einer
 * Radkarte aus geöffnet wurde. Dann entfällt die Auswahl. `vorauswahl` ist
 * lediglich der Wert, mit dem die Auswahlliste vorbelegt wird; sie überspringt
 * den Schritt ausdrücklich nicht, sonst würde stillschweigend ein beliebiges
 * Rad gemeldet.
 */
export function ablaufStarten(
  radId: string | null,
  vorauswahl: string | null = null,
): Ablaufzustand {
  return {
    radId: radId ?? vorauswahl,
    schritt: radId ? 'weiterfahrt' : 'radwahl',
    verlauf: [],
    freitext: '',
    standort: '',
    transport: null,
    herkunft: null,
  };
}

export function gehe(zustand: Ablaufzustand, ziel: SchrittId): Ablaufzustand {
  return { ...zustand, schritt: ziel, verlauf: [...zustand.verlauf, zustand.schritt] };
}

export function kannZurueck(zustand: Ablaufzustand): boolean {
  return zustand.verlauf.length > 0;
}

export function zurueck(zustand: Ablaufzustand): Ablaufzustand {
  const verlauf = [...zustand.verlauf];
  const vorheriger = verlauf.pop();
  if (!vorheriger) return zustand;
  return { ...zustand, schritt: vorheriger, verlauf };
}

// -----------------------------------------------------------------------------
// Fragen und Antworten
// -----------------------------------------------------------------------------

export interface Antwort {
  label: string;
  ziel: SchrittId;
}

/**
 * Die Verzweigungen als Tabelle.
 *
 * Schritte mit Freitext, Anweisungstexten oder Abschlussschaltflächen stehen
 * nicht hier, sondern in der Ansicht - ihre Weiterleitung hängt an einer
 * Eingabe und nicht an einer reinen Auswahl.
 */
export function antworten(schritt: SchrittId): Antwort[] {
  switch (schritt) {
    case 'weiterfahrt':
      return [
        { label: 'Ja', ziel: 'schadensgroesse' },
        { label: 'Nein', ziel: 'weiterfahrtMoeglich' },
      ];
    case 'schadensgroesse':
      return [
        { label: 'Klein', ziel: 'werkstattNah' },
        { label: 'Groß', ziel: 'ruhetag' },
      ];
    case 'werkstattNah':
      return [
        { label: 'Ja', ziel: 'werkstattVorOrt' },
        { label: 'Nein', ziel: 'ruhetag' },
      ];
    case 'werkstattVorOrt':
      return [{ label: 'Ja', ziel: 'werkstattReparieren' }];
    case 'ruhetag':
      return [
        { label: 'Ja', ziel: 'depotErreichbar' },
        { label: 'Nein', ziel: 'vertragswerkstattNah' },
      ];
    case 'depotErreichbar':
      return [
        { label: 'Ja', ziel: 'depotBringen' },
        { label: 'Nein', ziel: 'radZuruecklassen' },
      ];
    case 'fuehrerschein':
      return [{ label: 'Ja', ziel: 'fahrzeugErreichbar' }];
    case 'vertragswerkstattNah':
      return [
        { label: 'Ja', ziel: 'vertragswerkstattKontakt' },
        { label: 'Nein', ziel: 'radZuruecklassen' },
      ];
    case 'vertragswerkstattKontakt':
      return [
        { label: 'Ja', ziel: 'vertragswerkstattReparieren' },
        { label: 'Nein', ziel: 'vertragswerkstattUebergabe' },
      ];
    default:
      return [];
  }
}

export function frage(schritt: SchrittId, vorlage: Standortvorlage): string {
  switch (schritt) {
    case 'radwahl':
      return 'Welches Rad betrifft es?';
    case 'weiterfahrt':
      return 'Ist die Weiterfahrt gehindert?';
    case 'weiterfahrtMoeglich':
      return 'Rad ist weiter fahrbar. Was genau ist auffällig?';
    case 'schadensgroesse':
      return 'Wie groß ist der Schaden?';
    case 'werkstattNah':
      return 'Werkstatt in der Nähe (15–30 Minuten Fußweg)?';
    case 'werkstattVorOrt':
      return 'Anruf Werkstatt: Reparatur direkt vor Ort möglich?';
    case 'werkstattReparieren':
      return 'Rad vor Ort reparieren lassen.';
    case 'ruhetag':
      return `Ist heute ${vorlage.werkstatt.ruhetag}?`;
    case 'depotErreichbar':
      return `War das die letzte Therapie am Tag UND ist das ${vorlage.depot.bezeichnung} 15–30 Minuten entfernt?`;
    case 'depotBringen':
      return `Lastenrad ins ${vorlage.depot.bezeichnung} bringen.`;
    case 'radZuruecklassen':
      return 'Fahrrad zurücklassen. Wo genau steht es?';
    case 'fuehrerschein':
      return 'Hast du einen Autoführerschein?';
    case 'fahrzeugErreichbar':
      return 'Ist ein Carsharing-Fahrzeug in 15 Minuten Fußweg erreichbar?';
    case 'zusammenfassung':
      return 'Zusammenfassung – bitte prüfen:';
    case 'vertragswerkstattNah':
      return `${vorlage.werkstatt.name} in der Nähe (15–30 Minuten Fußweg)?`;
    case 'vertragswerkstattKontakt':
      return 'Reparatur direkt vor Ort möglich?';
    case 'vertragswerkstattReparieren':
      return 'Reparatur durchführen lassen.';
    case 'vertragswerkstattUebergabe':
      return `${vorlage.zustaendigeRolle} informieren und mit dem Ersatzrad weiterarbeiten.`;
  }
}

// -----------------------------------------------------------------------------
// Abschlüsse
// -----------------------------------------------------------------------------

export interface Abschlusskontext {
  vorlage: Standortvorlage;
  /** Name des Ersatzrads, falls eines vorhanden ist. */
  ersatzrad: string;
  zustand: Ablaufzustand;
}

export function abschluss(art: Abschlussart, kontext: Abschlusskontext): Abschluss {
  const { vorlage, ersatzrad, zustand } = kontext;
  const rolle = vorlage.zustaendigeRolle;

  switch (art) {
    case 'meldungOhneSperre':
      return {
        art,
        sperrt: false,
        text: `Weiterfahrt möglich: ${zustand.freitext.trim() || 'ohne nähere Angabe'}`,
      };
    case 'lokalNichtMoeglich':
      return {
        art,
        sperrt: true,
        text:
          'Lokale Werkstatt: Reparatur vor Ort nicht möglich. Betroffene Behandlung telefonisch ' +
          'abgesagt, Kalender und Praxismanagement informiert.',
      };
    case 'lokalRepariert':
      return {
        art,
        sperrt: true,
        text:
          'Vor Ort bei einer lokalen Werkstatt repariert. Betroffene Behandlung telefonisch ' +
          'abgesagt, Kalender und Praxismanagement informiert.',
      };
    case 'depotAbgestellt':
      return {
        art,
        sperrt: true,
        text:
          `Ins ${vorlage.depot.bezeichnung} gebracht (${vorlage.werkstatt.ruhetag}, letzte ` +
          `Therapie des Tages). ${rolle} zur Koordination informiert. Bis zur Freigabe wird ` +
          `${ersatzrad} genutzt.`,
      };
    case 'vertragswerkstattRepariert':
      return {
        art,
        sperrt: true,
        text: `Bei ${vorlage.werkstatt.name} repariert.`,
      };
    case 'transportFortsetzung': {
      const transport = zustand.transport
        ? transportLabel(vorlage, zustand.transport)
        : 'Weiterfahrt offen';
      if (zustand.herkunft === 'uebergabe') {
        return {
          art,
          sperrt: true,
          text:
            `Rad bei ${vorlage.werkstatt.name} übergeben – Reparatur vor Ort nicht möglich. ` +
            `${transport}. Ab dem nächsten Werktag wird ${ersatzrad} genutzt, bis die ${rolle} ` +
            'das Rad wieder freigibt.',
        };
      }
      return {
        art,
        sperrt: true,
        text:
          `Fahrrad zurückgelassen${zustand.standort.trim() ? ` – Standort: ${zustand.standort.trim()}` : ''}. ` +
          `Standort an ${vorlage.werkstatt.name} durchgegeben, ${rolle} über ${vorlage.meldeweg} ` +
          `informiert. ${vorlage.mitnehmen.join(' und ')} entfernt, Rad angekettet. ${transport}. ` +
          `Ab dem nächsten Werktag wird ${ersatzrad} genutzt, bis die ${rolle} das Rad wieder freigibt.`,
      };
    }
  }
}

/** Punkte der Zusammenfassung vor dem Abschluss. */
export function zusammenfassungspunkte(kontext: Abschlusskontext): string[] {
  const { vorlage, ersatzrad, zustand } = kontext;
  const transport = zustand.transport
    ? transportLabel(vorlage, zustand.transport)
    : 'Weiterfahrt noch offen';

  if (zustand.herkunft === 'uebergabe') {
    return [
      `${vorlage.werkstatt.name} kontaktiert – Rad übergeben`,
      transport,
      `Ab dem nächsten Werktag ${ersatzrad} nutzen, bis die ${vorlage.zustaendigeRolle} das Rad wieder freigibt`,
    ];
  }

  return [
    `Standort: ${zustand.standort.trim() || '– nicht angegeben –'}`,
    `Werkstatt informiert: ${vorlage.werkstatt.name}`,
    `${vorlage.zustaendigeRolle} über ${vorlage.meldeweg} informiert`,
    `${vorlage.mitnehmen.join(' und ')} entfernt, Rad angekettet`,
    transport,
    `Ab dem nächsten Werktag ${ersatzrad} nutzen, bis die ${vorlage.zustaendigeRolle} das Rad wieder freigibt`,
  ];
}
