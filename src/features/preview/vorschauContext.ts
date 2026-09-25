import { createContext, useContext } from 'react';
import type {
  Depot,
  ErbrachteLeistung,
  Erstattung,
  Kanal,
  Katalogleistung,
  Mitarbeitende,
  Nachricht,
  Rad,
  Rechnung,
  Urlaubsantrag,
  Zahlung,
  Zeitbuchung,
} from './types';

/**
 * Zustand des Vorschaugerüsts.
 *
 * Er lebt ausschließlich im Arbeitsspeicher dieser Sitzung. Es gibt bewusst
 * keine Persistenz - weder auf dem Server noch im Browserspeicher: Eine
 * gespeicherte Vorschau würde genau den Eindruck erwecken, den dieser Bereich
 * vermeiden soll, nämlich dass hier bereits echte Vorgänge entstehen. Ein
 * Neuladen setzt den Stand deshalb sichtbar zurück.
 */
export interface Vorschauzustand {
  depots: Depot[];
  raeder: Rad[];
  mitarbeitende: Mitarbeitende[];
  urlaub: Urlaubsantrag[];
  zeitbuchungen: Zeitbuchung[];
  erstattungen: Erstattung[];
  kanaele: Kanal[];
  nachrichten: Nachricht[];
  katalog: Katalogleistung[];
  leistungen: ErbrachteLeistung[];
  rechnungen: Rechnung[];
  zahlungen: Zahlung[];
  checkupfragen: string[];
  /** Erstattungssatz je Kilowattstunde in Cent. */
  stromsatzCent: number;
  /** Stichtag, auf den die synthetischen Daten gerechnet wurden. */
  stichtag: string;
}

/**
 * Ein simulierter Vorgang.
 *
 * Das Protokoll ist kein Auditlog, sondern die sichtbare Antwort auf die
 * Frage „was wäre passiert?". Es macht die Folgen einer Aktion prüfbar, ohne
 * dass irgendwo ein Erfolg behauptet wird, den es nicht gibt.
 */
export interface Protokolleintrag {
  id: string;
  zeitpunkt: string;
  bereich: string;
  vorgang: string;
  /** Was in der echten Plattform daraus folgen müsste. */
  folgen: string[];
  /** Was ausdrücklich NICHT passiert ist. */
  nichtGeschehen: string[];
}

export interface Simulation {
  bereich: string;
  vorgang: string;
  folgen?: string[];
  nichtGeschehen?: string[];
}

export interface Vorschau {
  zustand: Vorschauzustand;
  protokoll: Protokolleintrag[];
  /**
   * Führt eine Vorschauänderung aus und protokolliert sie.
   *
   * Beides zusammen, damit keine Änderung ohne die dazugehörige Einordnung
   * stattfinden kann. Der zurückgegebene Eintrag ist zugleich die Rückmeldung
   * für die auslösende Ansicht.
   */
  simuliere: (
    simulation: Simulation,
    aenderung?: (zustand: Vorschauzustand) => Vorschauzustand,
  ) => Protokolleintrag;
  zuruecksetzen: () => void;
}

export const VorschauContext = createContext<Vorschau | undefined>(undefined);

export function useVorschau(): Vorschau {
  const context = useContext(VorschauContext);
  if (!context) {
    throw new Error('useVorschau muss innerhalb von VorschauProvider verwendet werden.');
  }
  return context;
}

// -----------------------------------------------------------------------------
// Kleine Abfragen auf dem Zustand
// -----------------------------------------------------------------------------

export function mitarbeiterName(zustand: Vorschauzustand, id: string | null): string {
  if (!id) return '–';
  return zustand.mitarbeitende.find((person) => person.id === id)?.name ?? 'Unbekannt';
}

export function depotName(
  zustand: Vorschauzustand,
  rad: Rad,
  welches: 'aktuell' | 'stamm',
): string {
  const id = welches === 'stamm' ? rad.stammdepotId : rad.depotId;
  const depot = zustand.depots.find((eintrag) => eintrag.id === id);
  if (depot?.id === 'd3' && rad.sonderstandort.trim()) return rad.sonderstandort.trim();
  return depot?.name ?? 'Unbekannter Standort';
}

/**
 * Ist die Person an diesem Kalendertag genehmigt abwesend?
 *
 * Der Punkt, an dem Personal und Flotte zusammenhängen: Ein Rad, dessen
 * Stammnutzer:in im Urlaub ist, ist an diesem Tag tatsächlich frei - auch
 * wenn im Wochenplan „belegt" steht. Nur genehmigte Abwesenheiten zählen;
 * ein offener Antrag gibt noch nichts frei.
 */
export function hatUrlaub(
  zustand: Vorschauzustand,
  mitarbeiterId: string | null,
  tag: string,
): boolean {
  if (!mitarbeiterId) return false;
  return zustand.urlaub.some(
    (antrag) =>
      antrag.mitarbeiterId === mitarbeiterId &&
      antrag.status === 'genehmigt' &&
      antrag.von <= tag &&
      tag <= antrag.bis,
  );
}
