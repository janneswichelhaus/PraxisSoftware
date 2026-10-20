import { createContext, useContext } from 'react';

/**
 * Wohin ein Fenster (`Dialogfenster`) gezeichnet wird.
 *
 * Ohne Angabe an `document.body`. Die Sitzungssperre (SEC-EPIC-001) setzt ein
 * Ziel **innerhalb** des Bereichs, den sie verbirgt: Sonst stünde ein offenes
 * Fenster - eine Rückfrage, die Kamera mit einem Foto - über der Sperrseite
 * und bliebe bedienbar (Zweitreview, ADR-025 Punkte 3 und 5).
 */
/**
 * Kennzeichen eines Ziels, das nicht `document.body` ist. Ein Fenster sperrt
 * beim Öffnen alles daneben (`inert`), ein solches Ziel aber nicht selbst -
 * sonst läge ein Fenster, das später dort aufgeht, unter der Sperre (BEF-175).
 */
export const FENSTERZIEL = 'data-fensterziel';

export const PortalZielKontext = createContext<HTMLElement | null>(null);

export function usePortalZiel(): HTMLElement {
  return useContext(PortalZielKontext) ?? document.body;
}
