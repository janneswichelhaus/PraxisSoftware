import { createContext, useContext, useEffect, useRef } from 'react';

/**
 * Offene Texte vor der Sitzungssperre sichern (ADR-025 Punkt 4).
 *
 * Eine Seite mit ungesicherten Eingaben meldet eine Sicherung an. Vor der
 * Sperre ruft die Sitzungssperre alle auf: Jede sichert ihren Text auf dem Weg,
 * den „Speichern" im Navigationsschutz nimmt (ANN-046), und meldet, ob danach
 * nichts mehr offen ist. Sagen alle ja, gibt die Sperre die Seiten frei. Sagt
 * eine nein - kein Netz, kein Entwurfsweg, Server schon gesperrt -, bleibt die
 * Seite verborgen im Speicher stehen und erscheint nach der Freigabe wieder
 * (ANN-257). Dauerhaft auf dem Gerät abgelegt wird nichts (ADR-001).
 */
export type Sicherung = () => Promise<boolean>;

export interface Sperrsicherung {
  meldeAn: (sicherung: Sicherung) => () => void;
}

export const SperrsicherungKontext = createContext<Sperrsicherung | null>(null);

/**
 * Meldet eine Sicherung an, solange die Seite steht. Ohne Sitzungssperre
 * (Tests, Prüfseiten) geschieht nichts.
 */
export function useSperrsicherung(sicherung: Sicherung): void {
  const kontext = useContext(SperrsicherungKontext);
  const aktuelle = useRef(sicherung);
  aktuelle.current = sicherung;
  useEffect(() => {
    if (!kontext) return;
    return kontext.meldeAn(() => aktuelle.current());
  }, [kontext]);
}
