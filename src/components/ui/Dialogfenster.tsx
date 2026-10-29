import {
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { bewegungErlaubt } from './bewegung';
import { Button } from './Button';
import { TitelKontext } from './fenstertitel';
import { FENSTERZIEL, usePortalZiel } from './portalZiel';
import { Symbolknopf } from './Symbolknopf';
import { titelklassen, type Titelstufe } from './titelstufe';

/**
 * Fenster über dem Inhalt für Rückfragen (ANN-058), eine Ebene über der Seite (ANN-663). Eigener
 * Fokuskreis statt `<dialog>`, weil jsdom `showModal` nicht kennt; der Rest der Seite wird `inert`,
 * weil `aria-modal` nur ansagt. Escape und ein Klick daneben brechen ab, nie bestätigen sie.
 */
export function Dialogfenster({
  titel,
  onSchliessen,
  breit = false,
  vollbild = false,
  beschreibung,
  schliessenBeschriftung = 'Schließen',
  titelImInhalt = false,
  ohneKopfzeile = false,
  plattform = false,
  schmal = false,
  children,
}: {
  /** Überschrift und zugängliche Bezeichnung des Fensters. */
  titel: string;
  /** Escape, Klick daneben: das Abbrechen. */
  onSchliessen: () => void;
  /** Ein Arbeitsfenster mit zwei Spalten am Rechner, etwa „Daten übertragen". */
  breit?: boolean;
  /**
   * Ein geführter Ablauf, Seite für Seite, etwa der Check-Up am Rad
   * (FLT-005): am Telefon über den ganzen Bildschirm, am Rechner groß in der
   * Mitte. Die Kopfzeile trägt den Titel und einen Knopf zum Schließen - ohne
   * Rand daneben und ohne Escape am Telefon gäbe es sonst keinen. Der Inhalt
   * füllt den Rest und ordnet sich selbst; das Fenster scrollt nicht.
   */
  vollbild?: boolean;
  /**
   * Eine Zeile unter dem Titel: worum es geht, etwa das Rad (DESIGN.md
   * Regel 6) - im Vollbild in der Kopfzeile, sonst unter der Überschrift.
   */
  beschreibung?: string | undefined;
  /** Name des Schließen-Knopfs im Vollbild, etwa „Check-Up abbrechen". */
  schliessenBeschriftung?: string;
  /**
   * Im Vollbild steht die Überschrift im Inhalt, nicht in der Kopfzeile -
   * beim Check-Up direkt über den Antworten, im Daumenbereich (FLT-007,
   * Jannes 2026-10-16). Die Kopfzeile trägt dann die Beschreibung und den
   * Knopf zum Schließen; der Inhalt setzt `Fenstertitel` an die Stelle, und
   * das Fenster heißt weiter nach ihm.
   */
  titelImInhalt?: boolean;
  /**
   * Im Vollbild ohne die Kopfzeile mit ✕: Der Inhalt trägt seinen eigenen
   * Kopf, etwa „← Zurück“ und „Später“ im Einstieg der Plattform (Handoff
   * 2026-10-22, Abschnitt 5.3). Nur mit `titelImInhalt` - sonst hieße das
   * Fenster nach nichts. Escape und ein Klick daneben schließen weiter.
   */
  ohneKopfzeile?: boolean;
  /**
   * Die Kopfzeile im Rand der Plattform (20, unter 23rem 12, am Rechner 24); die Beschreibung bricht
   * um, statt abgeschnitten zu werden - bei 200 % ginge sonst der Tag des Termins verloren.
   */
  plattform?: boolean;
  /** Am Rechner so breit wie ein Formular (36rem) und 40rem hoch: ein kurzer Ablauf (ANN-783). */
  schmal?: boolean;
  children: ReactNode;
}) {
  const titelId = useId();
  const ziel = usePortalZiel();
  const fensterRef = useRef<HTMLDivElement>(null);
  const schliessenRef = useRef(onSchliessen);
  schliessenRef.current = onSchliessen;
  useAbgang(fensterRef);

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
      // Verborgen oder unter einem Fenster, das darüber aufging: Der Fokus
      // gehört dann der Sperrseite oder dem oberen Fenster.
      if (!fenster.isConnected || istVerborgen(fenster)) return;
      const aktiv = document.activeElement;
      if (aktiv && aktiv !== document.body && aktiv.closest('[aria-modal="true"]')) return;
      // Ohne Rollen: Ein hohes Fokusziel schöbe die Frage darüber aus dem Bild.
      startpunkt().focus({ preventScroll: true });
    }

    const schleier = fenster.parentElement;
    let gesperrt: Element[] = [];
    let wartet: MutationObserver | null = null;

    /**
     * Fokus hinein, dann die Seite darunter sperren - in dieser Reihenfolge:
     * Ein `inert` um den noch fokussierten Auslöser nähme ihm den Fokus,
     * bevor er im Fenster ist.
     */
    function aufgehen() {
      startpunkt().focus({ preventScroll: true });
      if (schleier) gesperrt = sperreDarunter(schleier);
    }

    if (schleier && istVerborgen(schleier)) {
      // Geht das Fenster in einer verborgenen Seite auf - die Sitzungssperre
      // verbirgt sie samt ihren Fenstern, eine Meldung nach einem Speichern
      // kann dann noch aufgehen -, nimmt es weder den Fokus noch sperrt es
      // etwas: Sonst läge die Sperrseite unter seinem `inert`, und niemand
      // käme mehr hinein. Wird die Seite wieder sichtbar, holt es beides nach
      // (ANN-671).
      wartet = new MutationObserver(() => {
        if (!fenster.isConnected || istVerborgen(schleier)) return;
        wartet?.disconnect();
        wartet = null;
        aufgehen();
      });
      wartet.observe(document.body, {
        attributes: true,
        attributeFilter: ['inert', 'hidden'],
        subtree: true,
      });
    } else {
      aufgehen();
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
    // Verschwindet das fokussierte Element, setzt der Browser den Fokus ohne Ereignis auf `body`.
    const beobachter = new MutationObserver(zurueckholen);

    document.addEventListener('focusin', fokusDraussen);
    fenster.addEventListener('focusout', fokusVerloren);
    beobachter.observe(fenster, { childList: true, subtree: true });

    return () => {
      wartet?.disconnect();
      beobachter.disconnect();
      fenster.removeEventListener('focusout', fokusVerloren);
      document.removeEventListener('focusin', fokusDraussen);
      // Erst entsperren, dann den Fokus zurückgeben - auf ein Element unter
      // `inert` ginge er nicht.
      entsperre(gesperrt);
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

  if (vollbild) {
    return createPortal(
      <div
        className="fenster-schleier bg-ink/40 fixed inset-0 z-50 flex justify-center sm:items-center sm:p-8"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) schliessenRef.current();
        }}
      >
        <div
          ref={fensterRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titelId}
          tabIndex={-1}
          onKeyDown={tastatur}
          // Am Telefon randlos über Kopfzeile und Tableiste, mit Platz für
          // Kerbe und Wischleiste; ab 640 px ein Fenster mit Rand wie oben.
          className={`fenster-kommt bg-surface sm:border-line-strong sm:rounded-card flex h-dvh w-full flex-col overflow-hidden pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] sm:h-[min(52rem,calc(100dvh-4rem))] sm:max-w-5xl sm:border-2 sm:pt-0 sm:pb-0 ${schmal ? 'lg:max-w-formular lg:h-[min(40rem,calc(100dvh-4rem))]' : ''}`}
        >
          {ohneKopfzeile && titelImInhalt ? null : (
            <div
              className={`border-line flex min-h-14 shrink-0 items-center gap-2 border-b py-1 pr-2 ${plattform ? 'pl-5 max-[23rem]:pl-3 lg:pl-6' : 'pl-4'}`}
            >
              <div className="min-w-0 flex-1">
                {titelImInhalt ? (
                  <p
                    className={`text-ink font-semibold ${plattform ? 'leading-snug hyphens-manual' : 'truncate'}`}
                  >
                    {beschreibung}
                  </p>
                ) : (
                  <>
                    <h2 id={titelId} className="text-ink text-h4 truncate font-bold">
                      {titel}
                    </h2>
                    {beschreibung ? (
                      <p className="text-ink-muted truncate text-sm">{beschreibung}</p>
                    ) : null}
                  </>
                )}
              </div>
              <Symbolknopf
                beschriftung={schliessenBeschriftung}
                onClick={() => schliessenRef.current()}
              >
                <svg
                  viewBox="0 0 20 20"
                  width="20"
                  height="20"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                >
                  <path d="M5 5l10 10M15 5L5 15" />
                </svg>
              </Symbolknopf>
            </div>
          )}
          <TitelKontext.Provider value={{ id: titelId, titel }}>
            <div className="flex min-h-0 flex-1 flex-col">{children}</div>
          </TitelKontext.Provider>
        </div>
      </div>,
      ziel,
    );
  }

  return createPortal(
    // Der Schleier faengt den Klick daneben; das Fenster selbst stoppt ihn.
    <div
      className="fenster-schleier bg-ink/40 fixed inset-0 z-50 flex items-end justify-center p-4 sm:items-center"
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
        className={`fenster-kommt bg-surface border-line-strong rounded-card max-h-[calc(100dvh-2rem)] w-full ${breit ? 'max-w-4xl' : 'max-w-lg'} overflow-y-auto border-2 p-6`}
      >
        {/* Titel nach Handoff c_Dialog als H3 (24/700), am Telefon als H4
            (20/700, UIK-22): Bei 390 px brachen dort vier der sechs Titel
            der Anwendung mit 24 px zweizeilig um, mit 20 px drei - und der
            Titel überragte den Text des Fensters. */}
        <h2 id={titelId} className="text-ink text-h4 sm:text-h3 font-bold">
          {titel}
        </h2>
        {beschreibung ? <p className="text-ink-muted mt-1 text-sm">{beschreibung}</p> : null}
        <div className="mt-3">{children}</div>
      </div>
    </div>,
    ziel,
  );
}

/** So lange geht ein Fenster nach unten weg. */
const ABGANG_MS = 240;

/**
 * Das Fenster geht nach unten weg (ANN-663). Wer es öffnet, nimmt es beim
 * Schließen einfach aus der Seite - es gibt keinen Zustand „geht gerade“, und
 * fünfzig Stellen müssten ihn sonst kennen. Deshalb bleibt ein Abbild stehen:
 * eine Kopie des Fensters, die nach unten gleitet und sich dann entfernt. Das
 * Fenster selbst ist da schon weg - Fokus, Sperre der Seite und
 * Vorlesesoftware sind beim Schließen sofort zurück wie bisher.
 *
 * **Das Abbild liegt in einer geschlossenen Shadow-Root** (`abbildHuelle`):
 * Dort findet es keine Suche nach Text oder Rolle, weder Vorlesesoftware
 * noch ein Test - sonst stünde der Inhalt des Fensters kurz doppelt im
 * Dokument (CAL-017 fand einen Namen zweimal). Die Hülle trägt zusätzlich
 * `aria-hidden` und `inert`, die Kopie nimmt keinen Tipp an.
 *
 * Nur wo der Browser `Element.animate` kennt und Bewegung erlaubt ist; in
 * jsdom nie. Bleibt das Fenster im Dokument, war es kein Schließen, sondern
 * das doppelte Zeichnen des StrictMode. Ein Fenster, das zugleich aufgeht,
 * liegt über dem Abbild.
 */
function useAbgang(fensterRef: RefObject<HTMLDivElement | null>): void {
  useLayoutEffect(() => {
    const fenster = fensterRef.current;
    const schleier = fenster?.parentElement;
    if (!fenster || !schleier) return undefined;
    return () => {
      const ort = schleier.parentElement;
      if (!ort || typeof fenster.animate !== 'function' || !bewegungErlaubt()) return;
      const abbild = schleier.cloneNode(true) as HTMLElement;
      const dunkel = getComputedStyle(schleier).backgroundColor;
      const gerollt = fenster.scrollTop;
      queueMicrotask(() => {
        if (schleier.isConnected) return;
        abbild.classList.replace('fenster-schleier', 'fenster-abbild');
        abbild.style.pointerEvents = 'none';
        const kopie = abbild.firstElementChild as HTMLElement | null;
        if (!kopie) return;
        kopie.classList.remove('fenster-kommt');
        const offen = Array.from(ort.children).find((kind) =>
          kind.querySelector(':scope > [aria-modal="true"]'),
        );
        const huelle = abbildHuelle(abbild);
        ort.insertBefore(huelle, offen ?? null);
        kopie.scrollTop = gerollt;
        const breit = window.matchMedia?.('(min-width: 640px)').matches ?? false;
        const optionen = {
          duration: ABGANG_MS,
          easing: 'cubic-bezier(0.4, 0, 1, 1)',
          fill: 'forwards' as const,
        };
        abbild.animate([{ backgroundColor: dunkel }, { backgroundColor: 'transparent' }], optionen);
        const weg = kopie.animate(
          breit
            ? [{ translate: '0 0' }, { translate: '0 1.5rem', opacity: 0 }]
            : [{ translate: '0 0' }, { translate: '0 calc(100% + 2rem)' }],
          optionen,
        );
        const entfernen = () => huelle.remove();
        void weg.finished.then(entfernen, entfernen);
        window.setTimeout(entfernen, ABGANG_MS * 3);
      });
    };
  }, [fensterRef]);
}

/**
 * Die Hülle des Abbilds: ein Element ohne eigene Box (`display: contents`)
 * mit geschlossener Shadow-Root. Die Regeln der Seite gelten dort nicht von
 * selbst; die Hülle übernimmt sie als ein Blatt (`seitenregeln`). Farben und
 * Schrift erbt sie vom Dokument.
 */
function abbildHuelle(abbild: HTMLElement): HTMLElement {
  const huelle = document.createElement('div');
  huelle.setAttribute('data-fenster-abbild', '');
  huelle.setAttribute('aria-hidden', 'true');
  huelle.setAttribute('inert', '');
  huelle.style.display = 'contents';
  const schatten = huelle.attachShadow({ mode: 'closed' });
  schatten.adoptedStyleSheets = seitenregeln();
  schatten.append(abbild);
  return huelle;
}

let regelblatt: { blatt: CSSStyleSheet; anzahl: number } | null = null;

/**
 * Alle Regeln der Seite als ein Blatt für die Shadow-Root, einmal gebaut und
 * wiederverwendet, solange sich die Zahl der Blätter nicht ändert. Ohne
 * `replaceSync` (jsdom) bleibt es leer.
 */
function seitenregeln(): CSSStyleSheet[] {
  if (typeof CSSStyleSheet === 'undefined' || !('replaceSync' in CSSStyleSheet.prototype)) {
    return [];
  }
  const blaetter = Array.from(document.styleSheets);
  if (regelblatt?.anzahl !== blaetter.length) {
    const text = blaetter
      .map((blatt) => {
        try {
          return Array.from(blatt.cssRules, (regel) => regel.cssText).join('\n');
        } catch {
          // Ein fremdes Blatt ohne CORS gibt seine Regeln nicht heraus.
          return '';
        }
      })
      .join('\n');
    const blatt = new CSSStyleSheet();
    blatt.replaceSync(text);
    regelblatt = { blatt, anzahl: blaetter.length };
  }
  return [regelblatt.blatt];
}

/** Liegt das Element in einer gesperrten oder verborgenen Fläche? */
function istVerborgen(element: Element): boolean {
  return element.closest('[inert], [hidden]') !== null;
}

/**
 * Wie viele offene Fenster ein Element gesperrt haben. Erst wenn das letzte
 * davon schließt, fällt `inert` - auch wenn ein unteres Fenster vor einem
 * oberen schließt. Ein `inert`, das nicht von hier kommt (etwa das der
 * Sitzungssperre), zählt nicht und bleibt unberührt.
 */
const sperrzahl = new WeakMap<Element, number>();

/**
 * Sperrt mit `inert`, was beim Öffnen schon da ist, und gibt zurück, was es
 * gesperrt hat. Im eigenen Ziel ist das, was vor dem Schleier hängt - ein
 * Fenster, das danach aufgeht, liegt darüber und bleibt bedienbar. Auf dem Weg
 * vom Ziel zum `body` ist es alles daneben: die Anwendung, die Plattform. Ein
 * anderes Fensterziel darin (`FENSTERZIEL`) bleibt selbst offen, damit ein
 * Fenster, das später dort aufgeht, nicht unter dieser Sperre liegt; gesperrt
 * wird nur, was schon darin steht (ANN-671).
 */
function sperreDarunter(schleier: Element): Element[] {
  const gesperrt: Element[] = [];
  function sperre(element: Element) {
    if (element.hasAttribute(FENSTERZIEL) || element.querySelector(`[${FENSTERZIEL}]`)) {
      for (const kind of Array.from(element.children)) sperre(kind);
      return;
    }
    const zahl = sperrzahl.get(element) ?? 0;
    if (zahl === 0 && element.hasAttribute('inert')) return;
    if (zahl === 0) element.setAttribute('inert', '');
    sperrzahl.set(element, zahl + 1);
    gesperrt.push(element);
  }
  for (let kind = schleier.previousElementSibling; kind; kind = kind.previousElementSibling) {
    sperre(kind);
  }
  for (
    let ebene = schleier.parentElement;
    ebene && ebene !== document.body;
    ebene = ebene.parentElement
  ) {
    for (const kind of Array.from(ebene.parentElement?.children ?? [])) {
      if (kind !== ebene) sperre(kind);
    }
  }
  return gesperrt;
}

/** Gibt frei, was `sperreDarunter` gesperrt hat - was noch ein Fenster sperrt, bleibt. */
function entsperre(gesperrt: readonly Element[]) {
  for (const element of gesperrt) {
    const zahl = (sperrzahl.get(element) ?? 1) - 1;
    if (zahl > 0) {
      sperrzahl.set(element, zahl);
    } else {
      sperrzahl.delete(element);
      element.removeAttribute('inert');
    }
  }
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

/**
 * Die Überschrift eines Vollbild-Fensters an einer Stelle im Inhalt
 * (`titelImInhalt`): dieselbe Kennung, nach der das Fenster heißt, in der
 * Größe einer Seitenüberschrift am Telefon - oder in einer `stufe` der
 * Plattform. Außerhalb eines solchen Fensters zeichnet sie nichts.
 */
export function Fenstertitel({ stufe }: { stufe?: Titelstufe | undefined } = {}) {
  const kontext = useContext(TitelKontext);
  if (!kontext) return null;
  return (
    // Auf der Plattform ohne eigene Stufe 22/700 in rem wie ein Abschnitt: Mit „Sehr groß“ wächst die
    // Frage mit, und „Ausfallhonorar“ passt bei 200 % noch in eine Zeile.
    <h2
      id={kontext.id}
      className={
        stufe
          ? titelklassen(stufe, kontext.titel)
          : 'text-ink text-h3 [.plattform-schrift_&]:text-abschnitt font-bold'
      }
    >
      {kontext.titel}
    </h2>
  );
}
