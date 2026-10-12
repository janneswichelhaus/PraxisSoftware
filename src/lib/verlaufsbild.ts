import { ERFASSUNGSGROESSEN, type Erfassungsgroesse } from './erfassungsgroessen';

/**
 * Welche Angaben als Punktbild stehen (OUT-001, IDEA-OUT-005; Praxis und
 * Plattform teilen die Regel wie `erfassungsgroessen.ts`).
 *
 * Ein Bild bekommt jede **Frage** mit einer Zahl auf einer Skala oder mit
 * Einheit. Eine Auswahl (Schmerzart, Seite) und eine Angabe zum Zusammenhang
 * (Schmerzmittel) bleiben in der Tabelle: Ihre Zahl ist ein Wort, kein Maß,
 * und als Höhe gezeichnet sähe „brennend“ größer aus als „dumpf“.
 *
 * Die Punkte sind die Rohwerte, unverändert – kein Mittel, keine Glättung,
 * keine Verbindung (ADR-006 Punkt 11).
 */
export interface Bildreihe {
  groesse: Erfassungsgroesse;
  punkte: { datum: string; wert: number }[];
}

// ANN-364: Auswahl und Zusammenhang bleiben in der Tabelle.
export function alsBild(groesse: Erfassungsgroesse): boolean {
  return groesse.rolle === 'frage' && groesse.optionen === undefined;
}

export function bildreihen(
  erfassungen: readonly { datum: string; werte: Record<string, number> }[],
): Bildreihe[] {
  return ERFASSUNGSGROESSEN.filter(alsBild)
    .map((groesse) => ({
      groesse,
      punkte: erfassungen
        .filter((e) => e.werte[groesse.key] !== undefined)
        .map((e) => ({ datum: e.datum, wert: e.werte[groesse.key]! }))
        .sort((a, b) => a.datum.localeCompare(b.datum)),
    }))
    .filter((reihe) => reihe.punkte.length > 0);
}
