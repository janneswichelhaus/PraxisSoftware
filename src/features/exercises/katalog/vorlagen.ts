import type { Katalogvorlage } from './typen';

/**
 * Mitgelieferte Zusammenstellungen (Plan-Vorlagen) des Katalogs.
 *
 * Nach Region und Ziel benannt, nie nach Diagnose ausgewählt: Die Liste liest
 * keine Angaben einer Person und schlägt nichts vor (ADR-006 Punkt 10). Die
 * Fachperson wählt von Hand.
 *
 * Noch leer: Die Vorlagen verweisen auf Einträge mehrerer Gruppen und kommen
 * mit ihnen (Welle A Inhalt). Die Datenbank kennt Vorlagen noch nicht; sie
 * folgen mit eigener Migration.
 */
export const KATALOG_VORLAGEN: readonly Katalogvorlage[] = [];
