import { createContext, useContext, useEffect, useRef } from 'react';

/**
 * Das freiwillige Abmelden anhalten, solange ungespeicherte Dokumentation im
 * Feld steht (FIX-014, `PROJECT_PRINCIPLES.md` §13).
 *
 * Der Navigationsschutz (FIX-011) erfasst jeden Seitenwechsel innerhalb der
 * Anwendung. Das Abmelden ist keiner: Es beendet die Sitzung, räumt den
 * Abfragespeicher ab und lässt die angemeldete Anwendung als Ganzes fallen —
 * `useBlocker` sieht davon nichts. Ein Tap auf „Abmelden" nahm den Text
 * deshalb bis hierher still mit; im Hausbesuch merkt man es erst danach.
 *
 * Der Weg dahin ist bewusst schmal:
 *
 *   * Die Kopfzeile **fragt** (`useAbmeldeanfrage`), statt selbst abzumelden.
 *   * Genau **eine** Seite kann sich als Wache anmelden (`useAbmeldewache`) —
 *     mehr als ein Dokumentationsformular ist nie gleichzeitig offen. Meldet
 *     sich eine zweite an, gilt sie; die erste ist dann ohnehin verschwunden.
 *   * Die Wache **übernimmt** die Rückfrage (sie gibt `true` zurück) und
 *     schließt sie später mit `abmelden()` ab. Sagt sie `false`, meldet die
 *     Anwendung unmittelbar ab.
 *
 * **Was hier ausdrücklich nicht hineingehört: die erzwungene Beendigung.**
 * Ablauf der Sitzung, „Alle Sitzungen beenden", die Abmeldung in einem zweiten
 * Tab und der Entzug der Berechtigung laufen über den Ereignisstrom von GoTrue
 * in den `SessionProvider` und kommen an dieser Stelle nie vorbei. Sie greifen
 * unverändert sofort. Eine Rückfrage wäre dort auch falsch: Wer ausgesperrt
 * wird, darf nicht mehr schreiben.
 */

export interface Abmeldeschutz {
  /**
   * Meldet den Wunsch abzumelden an. Übernimmt eine Wache, geschieht zunächst
   * nichts weiter — sie fragt.
   */
  anfordern: () => void;
  /** Meldet unmittelbar ab. Der Weg, den eine Wache am Ende nimmt. */
  abmelden: () => void;
  /**
   * Trägt die Wache ein. `null` nimmt sie zurück; das übernimmt
   * `useAbmeldewache` beim Verlassen der Seite.
   */
  setzeWache: (wache: (() => boolean) | null) => void;
}

export const AbmeldeschutzKontext = createContext<Abmeldeschutz | null>(null);

/**
 * Was die Kopfzeile beim Tap auf „Abmelden" aufruft.
 *
 * `null`, wenn kein Schutz eingerichtet ist — dann meldet die Kopfzeile wie
 * bisher unmittelbar ab. Das ist kein Schlupfloch, sondern der Zustand von
 * Tests und Vorschauen ohne angemeldete Anwendung.
 */
export function useAbmeldeanfrage(): (() => void) | null {
  return useContext(AbmeldeschutzKontext)?.anfordern ?? null;
}

/**
 * Meldet eine Seite als Wache an, solange sie offen ist.
 *
 * `wache` gibt `true` zurück, wenn sie die Rückfrage übernimmt. Sie muss dann
 * später `abmelden()` aufrufen — oder eben nicht, wenn die Person bleibt.
 *
 * Die Funktion wird **als Referenz gehalten**, nicht als Abhängigkeit: Sie
 * ändert sich bei jedem Tastendruck, und eine Neuanmeldung je Zeichen wäre
 * Verschwendung. Die Wache liest ihren Anlass selbst aus einer Referenz.
 */
export function useAbmeldewache(wache: () => boolean): (() => void) | null {
  const schutz = useContext(AbmeldeschutzKontext);
  const aktuelle = useRef(wache);
  aktuelle.current = wache;

  useEffect(() => {
    if (!schutz) return;
    schutz.setzeWache(() => aktuelle.current());
    return () => schutz.setzeWache(null);
  }, [schutz]);

  return schutz?.abmelden ?? null;
}
