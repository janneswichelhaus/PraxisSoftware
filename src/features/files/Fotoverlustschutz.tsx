import { useEffect } from 'react';
import { useBlocker } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Dialogfenster } from '@/components/ui/Dialogfenster';

/**
 * Ein aufgenommenes Foto geht nicht unbemerkt verloren (DOK-006, ADR-017
 * Punkt 33, `PROJECT_PRINCIPLES.md` §13).
 *
 * Bis zum Upload liegt ein Foto aus dem Kameradialog nur im Arbeitsspeicher
 * der Seite — kein Zwischenspeicher, keine Warteschlange. Scheitert der
 * Upload, lässt er sich wiederholen, solange die Seite offen ist. Wer sie
 * verlässt, verwirft das Foto; das soll eine Entscheidung sein und kein
 * Versehen:
 *
 *   * vor einem Seitenwechsel in der Anwendung eine Rückfrage;
 *   * vor Neuladen und Schließen die Warnung des Browsers.
 *
 * Eingehängt wird die Komponente **nur**, solange ein Foto aussteht. Der
 * Router kennt eine Sperre zur Zeit; eine Dateiliste je Verordnung mit je
 * einer ständigen Sperre stünde sich sonst gegenseitig im Weg.
 */
export function Fotoverlustschutz() {
  useEffect(() => {
    function warnen(event: BeforeUnloadEvent) {
      event.preventDefault();
      event.returnValue = '';
    }
    window.addEventListener('beforeunload', warnen);
    return () => window.removeEventListener('beforeunload', warnen);
  }, []);

  const sperre = useBlocker(
    ({ currentLocation, nextLocation }) => currentLocation.pathname !== nextLocation.pathname,
  );

  if (sperre.state !== 'blocked') return null;

  return (
    <Dialogfenster titel="Das Foto ist noch nicht in der Akte" onSchliessen={() => sperre.reset()}>
      <p className="text-ink text-sm">
        Es liegt nur auf dieser Seite und nirgends sonst. Wer weitergeht, verwirft es.
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" data-autofocus onClick={() => sperre.reset()}>
          Hier bleiben
        </Button>
        <Button type="button" variant="secondary" onClick={() => sperre.proceed()}>
          Foto verwerfen und weitergehen
        </Button>
      </div>
    </Dialogfenster>
  );
}
