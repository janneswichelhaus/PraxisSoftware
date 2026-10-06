import { useEffect, type ReactNode } from 'react';
import { Wortmarke } from '@/components/ui/Wortmarke';
import { ANMELDEN_TITEL } from './tabtitel';

/**
 * Eine Seite außerhalb des Anwendungsrahmens (AUTH-12, AUTH-13).
 *
 * Anmeldung, neues Kennwort, Anmelden per Link, gesperrter Zugang, der
 * Absturz und die Ladezustände davor stehen ohne Kopfzeile und Navigation da.
 * Bis UXR-002 baute jede ihre Hülle selbst: senkrecht zentriert in zwei
 * Breiten oder oben mit Abstand, den Titel in 24 px/600 ohne Token oder gar
 * keinen. Beim Übergang von der Anmeldung zur Sperrseite sprangen Marke und
 * Titel, und Vorlesesoftware fand auf den Fehlerseiten keine Überschrift.
 *
 * Was die Hülle zusichert:
 *
 *   * **Marke 40 px** über dem Titel. `mt-5` (20 px) hält den Schutzraum ein,
 *     den die MOTION-Zeile bei dieser Höhe verlangt (14,4 px), mit etwas Luft
 *     (MARKE-001).
 *   * **Ein `h1`** in der Rolle H3 des Systems (24 px, 700) und in der
 *     Hauptfarbe wie jeder Seitentitel. Nur Ladezustände haben keinen Titel -
 *     sie stehen einen Augenblick da und sagen, was geschieht.
 *   * **Ein `main`**, senkrecht zentriert, höchstens `max-w-sm` breit.
 *   * **Kleingedrucktes** unten in der heutigen Größe. Ob Hinweise dieser Art
 *     14 oder 12 px tragen, entscheidet Jannes (TOK-04); die Hülle hält den
 *     Wert an einer Stelle.
 *
 * Eigentlich ein Baustein für `src/components/ui`; er steht hier, weil der
 * Bereich des Rahmens ihn zuerst braucht.
 */
export function Vollseite({
  titel,
  einleitung,
  kleingedrucktes,
  children,
}: {
  /** Der Seitentitel. Ohne ihn - nur für Ladezustände - steht keine Überschrift da. */
  titel?: string;
  /** Ein Satz unter dem Titel. */
  einleitung?: ReactNode;
  /** Der Hinweis am Fuß der Seite. */
  kleingedrucktes?: ReactNode;
  children: ReactNode;
}) {
  // Der Tab heißt außerhalb des Rahmens „Anmelden – Own Motion" (BEF-050,
  // RAH-008) - auf der Anmeldemaske wie auf jeder Türseite davor und danach.
  // Nach dem Abmelden löst das den Titel der letzten Seite ab.
  useEffect(() => {
    document.title = ANMELDEN_TITEL;
  }, []);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-5 py-10">
      <div className="mb-8">
        <Wortmarke hoehe={40} />
        {titel ? <h1 className="text-accent text-h3 mt-5 font-bold">{titel}</h1> : null}
        {einleitung ? <p className="text-ink-muted mt-2 text-sm">{einleitung}</p> : null}
      </div>

      {children}

      {kleingedrucktes ? (
        <p className="text-ink-muted mt-8 text-xs leading-relaxed">{kleingedrucktes}</p>
      ) : null}
    </main>
  );
}
