import { createContext } from 'react';

/**
 * Ein Nachladen des Profils ist gescheitert, die Anwendung läuft weiter
 * (BEF-046, Entscheidung Jannes 2026-10-09).
 *
 * Bis UX-006b ersetzte jede gescheiterte Profilabfrage die ganze Anwendung
 * durch eine Vollseite - auch dann, wenn das Profil längst geladen war und nur
 * das Aktualisieren nach einem Funkloch scheiterte. Der Baum wurde abgebaut,
 * und mit ihm die vorgehaltene Tagesliste (ANN-021) und ein halb getippter
 * Text. Das ist genau der stille Verlust, den §13 ausschließt.
 *
 * Seitdem gilt: Ist ein Profil geladen, bleibt die Anwendung stehen, und
 * diese Zeile sagt, was los ist. Die Oberfläche zeigt bis zum nächsten
 * gelungenen Laden womöglich einen älteren Rollenstand; ein Recht erweitert
 * das nicht, denn Rollen und Sperre prüft die Datenbank bei jeder Anfrage
 * selbst (ADR-004, ANN-044). „Kein Profil" und „Zugang gesperrt" ersetzen
 * weiter sofort (`App.tsx`).
 *
 * Der Wert kommt über einen Kontext statt über Eigenschaften: Der Rahmen
 * (`AppShell`) und das Gerüst der Plattform (`PlattformApp`) zeigen die
 * Zeile, entschieden wird in `App.tsx`.
 */
export interface Nachladefehler {
  /** Was nicht aktualisiert werden konnte, als ganzer erster Satz. */
  satz: string;
  erneut: () => Promise<unknown>;
}

/**
 * `undefined`: kein Anbieter darüber (Tests, Vorschauen) - dann steht gar
 * nichts im Baum. `null`: angemeldet, kein Fehler - dann steht die leere
 * Live-Region bereit.
 */
export const NachladefehlerContext = createContext<Nachladefehler | null | undefined>(undefined);
