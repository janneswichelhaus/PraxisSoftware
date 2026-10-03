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
 * **Der Fokus bleibt auch, wenn sich der Inhalt ändert (UIK-09, DAT-11).**
 * Im Kameradialog verschwindet „Auslösen" mit dem Tipp darauf; der Browser
 * setzt den Fokus dann ohne jedes Ereignis auf den `body`, und Escape, Tab
 * und der Fokuskreis liefen bis UXR-001 ins Leere. Verschwindet das
 * fokussierte Element oder verlässt der Fokus das Fenster, holt es ihn
 * deshalb zurück - auf `data-autofocus`, sonst auf das erste bedienbare
 * Element. Das Verschwinden meldet ein `MutationObserver`, das Verlassen
 * `focusin` außerhalb und `focusout` ins Nichts.
 *
 * **Der Rest der Seite ist gesperrt**, solange das Fenster offen ist: Was vor
 * dem Schleier am `body` hängt - die Anwendung selbst, ein schon offenes
 * Fenster - trägt `inert`. Tab, ein Tipp und die Vorlesesoftware erreichen
 * darunter nichts mehr; `aria-modal` allein sagt das nur an.
 *
 * Gezeichnet wird über ein Portal am `body`, damit das Fenster über der
 * Kopfleiste und der Navigation liegt. Kein Paket: `<dialog>` hätte in
 * jsdom keinen `showModal`, und ein eigener Fokuskreis ist zwanzig Zeilen.
 */
export function Dialogfenster({
  titel,
  onSchliessen,
  breit = false,
  children,
}: {
  /** Überschrift und zugängliche Bezeichnung des Fensters. */
  titel: string;
  /** Escape, Klick daneben: das Abbrechen. */
  onSchliessen: () => void;
  /** Ein Arbeitsfenster mit zwei Spalten am Rechner, etwa „Daten übertragen". */
  breit?: boolean;
  children: ReactNode;
}) {
  const titelId = useId();
  const fensterRef = useRef<HTMLDivElement>(null);
  const schliessenRef = useRef(onSchliessen);
  schliessenRef.current = onSchliessen;

  useEffect(() => {
    const vorher = document.activeElement as HTMLElement | null;
    if (!fensterRef.current) return;
    const fenster: HTMLDivElement = fensterRef.current;

    function startpunkt(): HTMLElement {
      return (
        fenster.querySelector<HTMLElement>('[data-autofocus]') ??
        bedienbare(fenster).at(0) ??
        fenster
      );
    }

    /**
     * Holt den Fokus ins Fenster, wenn er nicht mehr darin liegt. Liegt er in
     * einem anderen Fenster, das darüber aufging, bleibt er dort: Das führt
     * dann seinen eigenen Fokus - zwei Fenster, die ihn einander abnehmen,
     * liefen im Kreis.
     */
    function zurueckholen() {
      if (!fenster.isConnected) return;
      const aktiv = document.activeElement;
      if (aktiv && aktiv !== document.body && aktiv.closest('[aria-modal="true"]')) return;
      startpunkt().focus();
    }

    startpunkt().focus();

    // Die Seite darunter sperren: alles, was vor dem Schleier am body hängt -
    // die Anwendung und ein Fenster, das schon offen war. Ein Fenster, das
    // danach aufgeht, liegt darüber und bleibt bedienbar. Erst nach dem
    // Fokus: Ein `inert` um den noch fokussierten Auslöser nähme ihm den
    // Fokus, bevor er im Fenster ist.
    const schleier = fenster.parentElement;
    const gesperrt: Element[] = [];
    if (schleier?.parentElement === document.body) {
      for (let kind = schleier.previousElementSibling; kind; kind = kind.previousElementSibling) {
        if (kind.hasAttribute('inert')) continue;
        kind.setAttribute('inert', '');
        gesperrt.push(kind);
      }
    }

    function fokusDraussen(event: FocusEvent) {
      const ziel = event.target;
      if (ziel instanceof Element && ziel.closest('[aria-modal="true"]')) return;
      zurueckholen();
    }
    function fokusVerloren(event: FocusEvent) {
      // Ins Nichts - ein Tipp neben jedes Bedienelement, ein Element, das
      // gerade entfernt wird. Erst nach dem Wechsel steht fest, wo er landet.
      if (event.relatedTarget === null) window.setTimeout(zurueckholen, 0);
    }
    const beobachter = new MutationObserver(zurueckholen);

    document.addEventListener('focusin', fokusDraussen);
    fenster.addEventListener('focusout', fokusVerloren);
    beobachter.observe(fenster, { childList: true, subtree: true });

    return () => {
      beobachter.disconnect();
      fenster.removeEventListener('focusout', fokusVerloren);
      document.removeEventListener('focusin', fokusDraussen);
      // Erst entsperren, dann den Fokus zurückgeben - auf ein Element unter
      // `inert` ginge er nicht.
      for (const kind of gesperrt) kind.removeAttribute('inert');
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
    // Vom Fenster selbst aus (nach einem Klick auf Text) geht es nach vorn
    // zum ersten, rueckwaerts zum letzten Element - nie auf die Seite darunter.
    if (document.activeElement === fensterRef.current) {
      event.preventDefault();
      (event.shiftKey ? letztes : erstes).focus();
      return;
    }
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
        // Fokussierbar, damit ein Klick auf Text im Fenster den Fokus nicht
        // auf die Seite darunter fallen laesst - Escape und der Fokuskreis
        // haengen an diesem Element.
        tabIndex={-1}
        onKeyDown={tastatur}
        // Radius 14, 24 innen wie die Rueckfrage-Karte (DS-001); unten auf dem
        // Telefon, mittig auf dem Bildschirm - mit dem Daumen erreichbar.
        className={`bg-surface border-line-strong rounded-card max-h-[calc(100dvh-2rem)] w-full ${breit ? 'max-w-4xl' : 'max-w-lg'} overflow-y-auto border-2 p-6`}
      >
        {/* Titel nach Handoff c_Dialog als H3 (24/700), am Telefon als H4
            (20/700, UIK-22): Bei 390 px brachen dort vier der sechs Titel
            der Anwendung mit 24 px zweizeilig um, mit 20 px drei - und der
            Titel überragte den Text des Fensters. */}
        <h2 id={titelId} className="text-ink text-h4 sm:text-h3 font-bold">
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
