import { useLayoutEffect, useRef, useState } from 'react';
import { Link, matchPath, useLocation } from 'react-router-dom';

export interface SubNavEintrag {
  to: string;
  label: string;
  /** Kennzeichnet Ansichten, die noch keine Hintergrundfunktionen haben. */
  vorschau?: boolean;
  /**
   * Aktiv nur auf genau diesem Pfad (Vorgabe) oder mit `false` auch auf
   * jedem darunter - wie bei `NavLink`.
   */
  end?: boolean;
  /**
   * Weitere Pfadanfänge, unter denen der Eintrag aktiv ist (NAV-15, ABR-29).
   *
   * Für Einträge, deren Unterseiten nicht unter ihrem eigenen Pfad liegen:
   * „Rechnungen" zeigt auf `/abrechnung`, die Rechnung selbst liegt unter
   * `/abrechnung/rechnungen/…`. Mit `end: false` leuchtete „Rechnungen" im
   * ganzen Bereich; mit `pfade: ['/abrechnung/rechnungen']` nur dort, wo es
   * hingehört. Jeder Pfad gilt samt allem darunter.
   */
  pfade?: string[];
}

const eintragKlassen =
  'text-ink-muted hover:text-ink -mb-px flex min-h-11 items-center gap-1.5 border-b-2 border-transparent px-3 text-liste whitespace-nowrap transition-colors';

/**
 * Wie weit der Nachbar des aktiven Eintrags noch ins Bild ragt, wenn die
 * Leiste ihn heranrollt: ein angeschnittenes Wort sagt „hier geht es weiter".
 */
const NACHBAR_PX = 24;

/** Liegt `pathname` auf `pfad` oder darunter? */
function liegtUnter(pfad: string, pathname: string): boolean {
  return matchPath({ path: pfad, end: false }, pathname) !== null;
}

function istAktiv(eintrag: SubNavEintrag, pathname: string): boolean {
  if (matchPath({ path: eintrag.to, end: eintrag.end ?? true }, pathname)) return true;
  return (eintrag.pfade ?? []).some((pfad) => liegtUnter(pfad, pathname));
}

/**
 * Rollt die Leiste waagerecht, bis `eintrag` ganz zu sehen ist - über
 * `scrollLeft` der Liste und nicht über `scrollIntoView`: Das rollte auch die
 * Seite senkrecht, und wer mitten auf einer langen Seite den Bereich wechselt,
 * stünde plötzlich woanders (UIK-10).
 *
 * Nur, wo die Leiste überhaupt scrollt: ab 640 px bricht sie um, dann ist
 * ohnehin alles zu sehen.
 */
function rolleInsBild(liste: HTMLElement, eintrag: HTMLElement): void {
  if (liste.scrollWidth <= liste.clientWidth) return;
  const rahmen = liste.getBoundingClientRect();
  const ziel = eintrag.getBoundingClientRect();
  const links = ziel.left - rahmen.left + liste.scrollLeft;
  const rechts = links + ziel.width;
  if (links - NACHBAR_PX < liste.scrollLeft) {
    liste.scrollLeft = Math.max(0, links - NACHBAR_PX);
  } else if (rechts + NACHBAR_PX > liste.scrollLeft + liste.clientWidth) {
    liste.scrollLeft = rechts + NACHBAR_PX - liste.clientWidth;
  }
}

/**
 * Navigation innerhalb eines Arbeitsbereichs.
 *
 * Sie steht beim Arbeitsgegenstand und nicht in der globalen Navigation: Wer
 * in der Flotte arbeitet, wechselt hier zwischen Rädern, Schlüsseln und
 * Check-Up, ohne den Bereich zu verlassen. Auf schmalen Geräten scrollt die
 * Leiste waagerecht, statt umzubrechen und die halbe Seite zu belegen.
 *
 * **Der aktive Eintrag steht im Bild.** Beim Einhängen und bei jedem
 * Pfadwechsel rollt die Leiste waagerecht zu ihm (UIK-10, RSP-04, VOR-05).
 * Bis UXR-001 stand sie immer am Anfang: Auf „Zahlungen" zeigte sie am
 * Telefon „Rechnungen · Leistungen · Katalog · Praxisst…", der markierte
 * Punkt lag rechts außer Sicht.
 *
 * Vorschauen stehen eingeklappt hinter einem Knopf „Vorschau" (UX-002h,
 * Bedienprinzip „was nicht gebraucht wird, ist eingeklappt"): Wer den Bereich
 * öffnet, trifft auf das, was wirkt. Steht man auf einer Vorschau, ist die
 * Gruppe offen — sonst wäre der markierte Punkt unsichtbar.
 */
export function SubNav({ eintraege, label }: { eintraege: SubNavEintrag[]; label: string }) {
  const { pathname } = useLocation();
  const [offen, setOffen] = useState(false);
  const liste = useRef<HTMLUListElement>(null);

  // Vor dem Zeichnen, damit die Leiste nicht erst am Anfang steht und dann
  // springt. Bewusst nicht beim Aufklappen der Vorschauen: Wer „Vorschau (4)"
  // antippt, will die neuen Punkte sehen und nicht zurückgerollt werden.
  useLayoutEffect(() => {
    const aktiv = liste.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (liste.current && aktiv) rolleInsBild(liste.current, aktiv);
  }, [pathname]);

  /**
   * Liegen rechts noch Einträge außer Sicht? Dann zeigt ein Verlauf am rechten
   * Rand, dass es weitergeht (Handoff Rahmen vom 2026-10-05, RAH-005): Eine
   * Leiste, die genau mit einem Wort endet, sah bis dahin vollständig aus.
   * Gemessen nach dem Rollen zum aktiven Eintrag, bei jedem Rollen und wenn
   * sich die Breite ändert; mit aufgeklappter Vorschau neu, weil dann mehr
   * Einträge in der Zeile stehen.
   */
  const [weiterRechts, setWeiterRechts] = useState(false);
  useLayoutEffect(() => {
    const element = liste.current;
    if (!element) return;
    const messen = () => {
      setWeiterRechts(element.scrollWidth - element.clientWidth - element.scrollLeft > 1);
    };
    messen();
    element.addEventListener('scroll', messen, { passive: true });
    const beobachter =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(messen);
    beobachter?.observe(element);
    return () => {
      element.removeEventListener('scroll', messen);
      beobachter?.disconnect();
    };
  }, [pathname, offen]);

  if (eintraege.length < 2) return null;

  const echte = eintraege.filter((eintrag) => !eintrag.vorschau);
  const vorschauen = eintraege.filter((eintrag) => eintrag.vorschau);
  const vorschauAktiv = vorschauen.some(
    (eintrag) =>
      liegtUnter(eintrag.to, pathname) ||
      (eintrag.pfade ?? []).some((pfad) => liegtUnter(pfad, pathname)),
  );
  // Ohne echten Punkt gäbe es nichts, wofür eingeklappt würde.
  const einklappbar = echte.length > 0 && vorschauen.length > 0 && !vorschauAktiv;
  const sichtbar = einklappbar && !offen ? echte : eintraege;

  return (
    // -mx-4/px-4: Die Linie reicht am Telefon bis zum Rand; der Wert folgt dem
    // Innenabstand des Inhalts dort (`AppShell`, 16 px).
    <nav aria-label={label} className="border-line relative -mx-4 mb-6 border-b px-4">
      {/* Schmal: eine scrollbare Zeile, damit sie nicht die halbe Seite belegt.
          Breit: umbrechen - ein waagerecht verstecktes Menue findet auf dem
          Desktop niemand, weil es dort keine Wischgeste gibt. */}
      <ul ref={liste} className="flex gap-1 overflow-x-auto pb-px sm:flex-wrap sm:overflow-visible">
        {sichtbar.map((eintrag) => (
          <li key={eintrag.to} className="shrink-0">
            {/* Link mit eigenem `aria-current` statt NavLink: Nur so kann ein
                Eintrag auch unter seinen `pfade` aktiv sein. */}
            <Link
              to={eintrag.to}
              aria-current={istAktiv(eintrag, pathname) ? 'page' : undefined}
              className={`${eintragKlassen} aria-[current=page]:border-accent aria-[current=page]:text-accent aria-[current=page]:font-medium`}
            >
              {eintrag.label}
              {eintrag.vorschau ? (
                <span className="bg-surface-sunken text-ink-muted rounded-pill px-1.5 py-0.5 text-[0.6875rem] font-medium">
                  Vorschau
                </span>
              ) : null}
            </Link>
          </li>
        ))}
        {einklappbar ? (
          <li className="shrink-0">
            <button
              type="button"
              aria-expanded={offen}
              onClick={() => setOffen((wert) => !wert)}
              className={eintragKlassen}
            >
              {offen ? 'Vorschau einklappen' : `Vorschau (${vorschauen.length})`}
            </button>
          </li>
        ) : null}
      </ul>
      {/* Der Verlauf: 72 px von der Fläche der Seite nach durchsichtig, mit
          „›" in `line-strong`, nur solange rechts noch etwas liegt und nur,
          wo die Leiste rollt (unter 640 px). Rein dekorativ - was dahinter
          liegt, erreicht man durch Rollen, und Vorlesesoftware liest die
          ganze Liste. Am rechten Rand der Leiste, also im Innenabstand des
          `nav`, und nicht klickbar, damit der letzte sichtbare Eintrag
          darunter weiter zu treffen ist. Von der Fläche (`canvas`), nicht
          von Weiß: Darauf steht die Leiste. */}
      {weiterRechts ? (
        <span
          aria-hidden="true"
          data-verlauf
          className="from-canvas text-line-strong pointer-events-none absolute inset-y-0 right-4 flex w-18 items-center justify-end bg-linear-to-l to-transparent pr-1 text-xl sm:hidden"
        >
          ›
        </span>
      ) : null}
    </nav>
  );
}
