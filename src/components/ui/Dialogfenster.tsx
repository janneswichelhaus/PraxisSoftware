import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Button } from './Button';

/**
 * Fenster über dem aktuellen Inhalt (FIX-016, ANN-058).
 *
 * Bis dahin standen Rückfragen als Kasten **im Fluss der Seite** — bewusst
 * kein modaler Dialog (UI-000). Der Befund BEF-016 hat gezeigt, wo das
 * scheitert: Wer am Ende eines langen Formulars auf „Termin anlegen" drückt,
 * sieht eine Rückfrage am Seitenanfang nicht und hält den Klick für wirkungslos.
 * Festlegung von Jannes (2026-09-18): Solche Rückfragen erscheinen **immer**
 * als Fenster über dem Inhalt.
 *
 * Was das Fenster leistet, damit es niemandem etwas wegnimmt:
 *
 *   * `role="dialog"` mit `aria-modal`, benannt über die Überschrift;
 *   * der Fokus wandert beim Öffnen hinein (auf `data-autofocus`, sonst auf
 *     das erste bedienbare Element) und bleibt drin (Tab läuft im Kreis);
 *   * Escape und ein Klick neben das Fenster schließen es — das ist immer
 *     das Abbrechen, nie das Bestätigen;
 *   * beim Schließen kehrt der Fokus dorthin zurück, wo er vorher war.
 *
 * Gezeichnet wird über ein Portal am `body`, damit das Fenster über der
 * Kopfleiste und der Navigation liegt. Kein Paket: `<dialog>` hätte in
 * jsdom keinen `showModal`, und ein eigener Fokuskreis ist zwanzig Zeilen.
 */
export function Dialogfenster({
  titel,
  onSchliessen,
  children,
}: {
  /** Überschrift und zugängliche Bezeichnung des Fensters. */
  titel: string;
  /** Escape, Klick daneben: das Abbrechen. */
  onSchliessen: () => void;
  children: ReactNode;
}) {
  const titelId = useId();
  const fensterRef = useRef<HTMLDivElement>(null);
  const schliessenRef = useRef(onSchliessen);
  schliessenRef.current = onSchliessen;

  useEffect(() => {
    const vorher = document.activeElement as HTMLElement | null;
    const fenster = fensterRef.current;
    const start = fenster?.querySelector<HTMLElement>('[data-autofocus]') ?? bedienbare(fenster)[0];
    start?.focus();
    return () => {
      // Zurück, wo der Fokus herkam - sofern die Stelle noch da ist.
      if (vorher && vorher.isConnected) vorher.focus();
    };
  }, []);

  function tastatur(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      schliessenRef.current();
      return;
    }
    if (event.key !== 'Tab') return;
    const elemente = bedienbare(fensterRef.current);
    if (elemente.length === 0) return;
    const erstes = elemente[0]!;
    const letztes = elemente[elemente.length - 1]!;
    if (event.shiftKey && document.activeElement === erstes) {
      event.preventDefault();
      letztes.focus();
    } else if (!event.shiftKey && document.activeElement === letztes) {
      event.preventDefault();
      erstes.focus();
    }
  }

  return createPortal(
    // Der Schleier faengt den Klick daneben; das Fenster selbst stoppt ihn.
    <div
      className="bg-ink/40 fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) schliessenRef.current();
      }}
    >
      <div
        ref={fensterRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titelId}
        onKeyDown={tastatur}
        // Radius 14, 24 innen wie die Rueckfrage-Karte (DS-001); unten auf dem
        // Telefon, mittig auf dem Bildschirm - mit dem Daumen erreichbar.
        className="bg-surface border-line-strong rounded-card max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto border p-6 shadow-lg"
      >
        <h2 id={titelId} className="text-ink text-base font-semibold">
          {titel}
        </h2>
        <div className="mt-3">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

/** Alles im Fenster, was per Tab erreichbar ist, in Dokumentreihenfolge. */
function bedienbare(fenster: HTMLElement | null): HTMLElement[] {
  if (!fenster) return [];
  return Array.from(
    fenster.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ),
  );
}

/**
 * Ein Hinweis, der eine Antwort verlangt, als Fenster (FIX-016).
 *
 * Für den Fall „der Vorgang ist gescheitert, und die bedienende Person soll
 * es erfahren, bevor sie weitertippt" — etwa eine Überschneidung nach dem
 * Absenden eines langen Formulars. Der Text steht als `role="alert"`, damit
 * Vorlesesoftware ihn sofort bringt; die einzige Schaltfläche schließt.
 */
export function Hinweisfenster({
  titel,
  onSchliessen,
  schliessen = 'Zurück zum Formular',
  children,
}: {
  titel: string;
  onSchliessen: () => void;
  schliessen?: string;
  children: ReactNode;
}) {
  return (
    <Dialogfenster titel={titel} onSchliessen={onSchliessen}>
      <div role="alert" className="text-ink text-sm">
        {children}
      </div>
      <div className="mt-4">
        <Button type="button" variant="secondary" data-autofocus onClick={onSchliessen}>
          {schliessen}
        </Button>
      </div>
    </Dialogfenster>
  );
}
