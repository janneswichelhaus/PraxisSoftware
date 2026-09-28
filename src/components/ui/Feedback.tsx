import { useRef, useState, type ReactNode } from 'react';
import { Button } from './Button';
import { istVersprechen } from './versprechen';

/** Ladezustand mit Textalternative statt reiner Animation. */
export function LoadingState({ label = 'Wird geladen …' }: { label?: string }) {
  return (
    <p role="status" className="text-ink-muted py-10 text-center text-sm">
      {label}
    </p>
  );
}

/**
 * Leerer Zustand einer Seite oder Liste.
 *
 * `aktion` ist der nächste Schritt, wenn es einen gibt - etwa ein
 * `ButtonLink` „Zahlung erfassen" oder ein `Textlink` (UIK-16). Bis UXR-001
 * setzten Seiten ihn als eigenen Link unter den Zustand oder nannten den Ort
 * nur im Satz.
 */
export function EmptyState({
  title,
  description,
  aktion,
}: {
  title: string;
  description?: string | undefined;
  aktion?: ReactNode;
}) {
  return (
    <div className="py-12 text-center">
      <p className="text-ink text-liste font-medium">{title}</p>
      {description ? <p className="text-ink-muted mt-1 text-sm">{description}</p> : null}
      {aktion ? <div className="mt-4 flex flex-wrap justify-center gap-3">{aktion}</div> : null}
    </div>
  );
}

/**
 * Fehlermeldung.
 *
 * PROJECT_PRINCIPLES.md 13: Bei unsicherem Zustand lieber blockieren und einen
 * verständlichen Fehler zeigen. Es werden bewusst keine technischen Details
 * ausgegeben, die Rückschlüsse auf fremde Daten erlauben.
 *
 * **Ein Weg aus dem Fehler (ZST-04, UIK-16).** Abfragen laufen ohne
 * automatische Wiederholung (`retry: false`), und ein Neuladen der Seite
 * verwirft im Funkloch die vorgehaltene Tagesliste (ANN-021). Mit `onErneut`
 * steht deshalb ein Knopf „Erneut versuchen" im Kasten, der meist nur
 * `abfrage.refetch()` aufruft. Liefert die Funktion ein Versprechen, heißt
 * der Knopf bis zu dessen Ende „Wird erneut geladen …" und nimmt keinen
 * zweiten Tipp an - sonst sähe ein langsamer Versuch aus wie keiner.
 *
 * Eine Beschreibung erzwingt der Baustein nicht; was zu tun ist, weiß die
 * Seite.
 */
export function ErrorState({
  title,
  description,
  onErneut,
}: {
  title: string;
  description?: ReactNode | undefined;
  onErneut?: (() => unknown) | undefined;
}) {
  const [laeuft, setLaeuft] = useState(false);
  // Zwischen dem Tipp und dem nächsten Zeichnen ist `laeuft` noch false.
  const laeuftGerade = useRef(false);

  async function erneut() {
    if (!onErneut || laeuftGerade.current) return;
    laeuftGerade.current = true;
    try {
      const ergebnis = onErneut();
      if (istVersprechen(ergebnis)) {
        setLaeuft(true);
        await ergebnis;
      }
    } catch {
      // Ein gescheiterter Versuch zeigt sich über die Abfrage selbst: Der
      // Kasten bleibt stehen und bietet den nächsten an.
    } finally {
      laeuftGerade.current = false;
      setLaeuft(false);
    }
  }

  return (
    <div role="alert" className="rounded-card border-danger/25 bg-danger-soft border px-4 py-3">
      {/* Titel und Erklärung sind Fließtext: eigene Zeilenlänge, seit das
          Gerüst die volle Fensterbreite nutzt (UI-001). */}
      <p className="text-danger text-liste max-w-prose font-medium">{title}</p>
      {description ? (
        <p className="text-ink-muted mt-1 max-w-prose text-sm">{description}</p>
      ) : null}
      {onErneut ? (
        <Button
          type="button"
          variant="secondary"
          groesse="kompakt"
          className="mt-3"
          disabled={laeuft}
          onClick={() => {
            void erneut();
          }}
        >
          {laeuft ? 'Wird erneut geladen …' : 'Erneut versuchen'}
        </Button>
      ) : null}
    </div>
  );
}
