import { createContext, useContext, useEffect, useRef } from 'react';

/**
 * Das freiwillige Abmelden anhalten, solange ungespeicherte Eingaben im
 * Formular stehen (FIX-014, `PROJECT_PRINCIPLES.md` §13).
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
 *   * Jede Seite mit schützenswerten Eingaben meldet sich als Wache an
 *     (`useAbmeldewache`). Seit UXR-002 dürfen es **mehrere zugleich** sein
 *     (NAV-01, DAT-04): Der Schutz gilt nicht mehr nur der Dokumentation,
 *     sondern auch Formularen wie Patient:in anlegen, und ein ausstehendes Foto
 *     kann neben einem Formular stehen.
 *   * Eine Wache **übernimmt** die Rückfrage (sie gibt `true` zurück) und
 *     schließt sie später mit `abmelden()` ab. Dann fragen die übrigen Wachen
 *     derselben Runde der Reihe nach; erst wenn keine mehr etwas zu sagen hat,
 *     endet die Sitzung. Sagen alle `false`, meldet die Anwendung unmittelbar
 *     ab.
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
  /**
   * Der Weg, den eine Wache am Ende nimmt: Die übrigen Wachen der laufenden
   * Runde fragen noch; hat keine mehr etwas zu sagen, endet die Sitzung.
   * Außerhalb einer Runde meldet das unmittelbar ab.
   */
  abmelden: () => void;
  /**
   * Trägt eine Wache ein und liefert, wie sie wieder ausgetragen wird. Das
   * übernimmt `useAbmeldewache` beim Verlassen der Seite.
   */
  meldeWacheAn: (wache: () => boolean) => () => void;
  /**
   * Ob die Sitzung gerade beendet wird: wahr vom Augenblick an, in dem keine
   * Wache mehr etwas zu sagen hat und die Anwendung wirklich abmeldet. Die
   * Kopfzeile zeigt daraufhin „Wird abgemeldet …" (RAH-003), bis die
   * Anmeldemaske steht. Ein Tap, den eine Wache noch anhält, zählt nicht.
   */
  laeuft: boolean;
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
 * Ob die Anwendung gerade abmeldet (`Abmeldeschutz.laeuft`); ohne Schutz
 * `false` - dann weiß es die Kopfzeile selbst, weil sie unmittelbar abmeldet.
 */
export function useAbmeldung(): boolean {
  return useContext(AbmeldeschutzKontext)?.laeuft ?? false;
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
    return schutz.meldeWacheAn(() => aktuelle.current());
  }, [schutz]);

  return schutz?.abmelden ?? null;
}
