import { useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';
import { Link, NavLink, useLocation, useSearchParams } from 'react-router-dom';
import { anzeigerStil, useGleitanzeiger } from './gleitanzeiger';
import { useOffenerReiter, type Suchreiter } from './offenerReiter';
import { rolleInsBild, useRandVerlauf, VERLAUF_FREI_PX } from './waagerechtRollen';

export interface Reiter {
  /** Ziel des Reiters, samt Suchteil (etwa dem Rückweg des Objekts). */
  to: string;
  label: string;
  /** Aktiv nur auf genau diesem Pfad; ohne Angabe auch auf allem darunter. */
  end?: boolean;
}

const verlaufKlassen =
  'from-surface text-line-strong pointer-events-none absolute inset-y-0 flex w-10 items-center to-transparent text-xl';

/**
 * Der Hinweis, dass in einer waagerecht rollenden Reiterreihe links oder
 * rechts noch Reiter liegen: ein Verlauf von Weiß nach durchsichtig mit „‹"
 * oder „›" am Rand - dasselbe Prinzip wie in der `SubNav` (Sichtung vom
 * 13.10.2026, A1: bei 375 px standen Reste wie „Stammd" oder „oku" ohne
 * Hinweis auf weitere Reiter).
 *
 * Steht im `relative` Behälter der Reihe; `links` und `rechts` misst
 * `useRandVerlauf`. Rein dekorativ und nicht klickbar: Ein Tipp auf das
 * angeschnittene Ende eines Reiters öffnet ihn. Von Weiß (`surface`), weil die
 * Reihe in der Karte des `Objektkopf`s steht; nur unter 640 px, darüber
 * bricht die Reihe um. `immer` zeigt ihn auf jeder Breite - für eine Leiste,
 * die auch am Rechner rollt, etwa die Kacheln der Behandlungsgrundlagen
 * (Nachprüfung A9). `rechtsOhneZeichen`, wo rechts daneben der Blätterknopf
 * steht (BEF-183).
 */
export function Randverlauf({
  links,
  rechts,
  immer = false,
  rechtsOhneZeichen = false,
}: {
  links: boolean;
  rechts: boolean;
  immer?: boolean;
  rechtsOhneZeichen?: boolean;
}) {
  const klassen = immer ? verlaufKlassen : `${verlaufKlassen} sm:hidden`;
  return (
    <>
      {links ? (
        <span
          aria-hidden="true"
          data-verlauf="links"
          className={`${klassen} left-0 justify-start bg-linear-to-r pl-1`}
        >
          ‹
        </span>
      ) : null}
      {rechts ? (
        <span
          aria-hidden="true"
          data-verlauf="rechts"
          className={`${klassen} right-0 justify-end bg-linear-to-l pr-1`}
        >
          {rechtsOhneZeichen ? null : '›'}
        </span>
      ) : null}
    </>
  );
}

/**
 * Der Blätterknopf rechts neben der rollenden Reihe (BEF-183): „›" holt den
 * nächsten verdeckten Reiter nach vorn. Mit fünf Reitern lag bei 375 px der
 * letzte hinter einem Wisch, und mit Handschuh traf der Wisch oft den Reiter
 * daneben.
 *
 *   * **Neben der Liste, nicht über ihr** (Design-Review): Läge er auf dem
 *     Verlauf, finge er den Tipp auf das angeschnittene Ende eines Reiters ab.
 *     Sein Platz steht, sobald die Reihe rollt; am Ende ist er blass und ohne
 *     Wirkung - so springt die Reihe nicht.
 *   * **Nur rechts:** Ein zweiter Platz links nähme der Reihe bei 375 px so
 *     viel Breite, dass ein langer Reiter wie „Behandlungsgrundlagen" nicht
 *     mehr ganz hineinpasst. Zurück geht es wie bisher mit dem Wisch; der
 *     offene Reiter rollt ohnehin ins Bild.
 *   * 44 px breit, so hoch wie die Reihe.
 *   * Für Vorlesesoftware und Tastatur unsichtbar (`aria-hidden`,
 *     `tabIndex={-1}`): Sie erreichen jeden Reiter ohnehin, ein zweiter Weg
 *     wäre dort nur Lärm. Ein Tipp nimmt ihm deshalb auch den Fokus nicht ab.
 */
function Blaetterknopf({ aktiv, liste }: { aktiv: boolean; liste: RefObject<HTMLElement | null> }) {
  return (
    <button
      type="button"
      tabIndex={-1}
      aria-hidden="true"
      data-verlauf-knopf="rechts"
      disabled={!aktiv}
      onPointerDown={(ereignis) => ereignis.preventDefault()}
      onClick={() => holeVerdecktenNachVorn(liste.current)}
      className="text-ink disabled:text-line-strong flex w-11 shrink-0 items-center justify-center text-2xl leading-none sm:hidden"
    >
      ›
    </button>
  );
}

/**
 * Holt den ersten Reiter, der rechts ganz verdeckt ist (er beginnt erst unter
 * dem Verlauf oder dahinter), an den linken Rand - dahinter kommt, was
 * passt. Gibt es keinen ganz verdeckten mehr, den ersten angeschnittenen. Die
 * gleitende Pille (`data-gleitanzeiger`) ist kein Eintrag.
 */
function holeVerdecktenNachVorn(element: HTMLElement | null) {
  if (!element) return;
  const rahmen = element.getBoundingClientRect();
  const frei = rahmen.right - VERLAUF_FREI_PX;
  const eintraege = [...element.children].filter(
    (kind): kind is HTMLElement =>
      kind instanceof HTMLElement && !kind.hasAttribute('data-gleitanzeiger'),
  );
  const ziel =
    eintraege.find((e) => e.getBoundingClientRect().left >= frei) ??
    eintraege.find((e) => e.getBoundingClientRect().right > frei);
  if (!ziel) return;
  const links = ziel.getBoundingClientRect().left - rahmen.left + element.scrollLeft;
  element.scrollLeft = Math.max(
    0,
    Math.min(links - VERLAUF_FREI_PX, element.scrollWidth - element.clientWidth),
  );
}

/**
 * Die Reiter eines Objekts: Termine, Doku, Grundlagen, Stammdaten einer Akte
 * (Design-Handoff 2026-10-01, Abschnitt 7; herausgelöst aus dem Rahmen der
 * Akte im Design-Fundament, `docs/design/DESIGN.md`).
 *
 * Steht im `Objektkopf`, unter Name und Aktionen, mit einer Linie darüber -
 * in derselben Karte, nicht als eigene Leiste. Pillen 44 px hoch, 15 px; der
 * offene Reiter liegt auf der Akzentfläche in der Hauptfarbe, 600.
 *
 * Eigene Form statt der `SubNav`: Die Leiste des Gerüsts sagt, wo in der
 * Anwendung man ist (Unterstrich); diese sagt, welcher Teil des Objekts offen
 * ist (Pille). Zwei gleich aussehende Reihen übereinander wären ein Rätsel.
 *
 * Schmal scrollt die Reihe waagerecht, statt in zwei Zeilen umzubrechen, und
 * der offene Reiter rollt ins Bild (PAT-01, RSP-04) - so weit, dass er vor
 * dem `Randverlauf` steht, der zeigt, dass es weitergeht. Ab 640 px bricht
 * sie um: Mit der Maus gibt es keine Wischgeste.
 */
export function Reiterleiste({ reiter, label }: { reiter: readonly Reiter[]; label: string }) {
  const { pathname } = useLocation();
  return (
    <Reiterreihe label={label} offen={pathname}>
      {reiter.map((eintrag) => (
        <li key={eintrag.to} className="shrink-0">
          <NavLink to={eintrag.to} end={eintrag.end ?? false} className={reiterKlassen}>
            {eintrag.label}
          </NavLink>
        </li>
      ))}
    </Reiterreihe>
  );
}

/**
 * Die `Reiterleiste` für ein Objekt ohne Unterrouten: Der offene Reiter steht
 * im Suchteil der Adresse (`?bereich=einsatz`, ANN-460), nicht im Pfad - die
 * Mitarbeiter:in und die Trainingskund:in. Aussehen und Verhalten wie oben;
 * ohne oder mit unbekanntem Wert gilt der erste Reiter.
 *
 * Jeder Reiter nennt sich in der Adresse, auch der erste (R2-O6): So bleibt
 * `?bereich=einsatz` gültig, wenn sich die Reihenfolge ändert, und ein
 * Lesezeichen öffnet denselben Reiter. Die übrigen Suchparameter (etwa der
 * Rückweg `?zurueck=`) reisen mit.
 *
 * Bis R2-neu6 lokal in `features/staff`; seit sie zwei Objekte tragen, ist
 * sie Baustein.
 */
export function Suchreiterleiste<W extends string>({
  reiter,
  param,
  label,
}: {
  reiter: readonly Suchreiter<W>[];
  /** Name des Suchparameters, etwa `bereich`. */
  param: string;
  label: string;
}) {
  const { pathname } = useLocation();
  const [suche] = useSearchParams();
  const offen = useOffenerReiter(
    param,
    reiter.map((eintrag) => eintrag.wert),
  );

  function ziel(wert: W): string {
    const neu = new URLSearchParams(suche);
    neu.set(param, wert);
    return `${pathname}?${neu.toString()}`;
  }

  return (
    <Reiterreihe label={label} offen={offen}>
      {reiter.map((eintrag) => (
        <li key={eintrag.wert} className="shrink-0">
          <Link
            to={ziel(eintrag.wert)}
            aria-current={eintrag.wert === offen ? 'page' : undefined}
            className={reiterKlassen}
          >
            {eintrag.label}
          </Link>
        </li>
      ))}
    </Reiterreihe>
  );
}

/**
 * Pille 44 px, 15 px; der offene Reiter auf der Akzentfläche in der Hauptfarbe, 600.
 * `relative`, damit der Reiter über der gleitenden Pille liegt (ANN-567).
 */
const reiterKlassen =
  'text-ink-muted hover:bg-surface-sunken hover:text-ink rounded-pill aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent text-liste relative flex min-h-11 items-center px-3 whitespace-nowrap transition-colors aria-[current=page]:font-semibold';

/**
 * Die Reihe beider Leisten: Linie darüber, schmal waagerecht rollend mit
 * `Randverlauf`, ab 640 px umbrechend. `offen` ist das, woran der offene
 * Reiter hängt (Pfad oder Wert) - ändert es sich, rollt er ins Bild.
 */
function Reiterreihe({
  label,
  offen,
  children,
}: {
  label: string;
  offen: string;
  children: ReactNode;
}) {
  const liste = useRef<HTMLUListElement>(null);

  // Vor dem Zeichnen, damit die Leiste nicht erst am Anfang steht und dann
  // springt: Auf dem letzten Reiter war der markierte Eintrag am Telefon
  // sonst nicht zu sehen.
  useLayoutEffect(() => {
    rolleOffenenReiterInsBild(liste);
  }, [offen]);
  // Nach dem Rollen gemessen: Erst dann steht fest, was links und rechts fehlt.
  const rand = useRandVerlauf(liste, offen);
  // Rollt die Reihe überhaupt, steht rechts der Blätterknopf (BEF-183).
  const rollt = rand.links || rand.rechts;
  // Die Pille gleitet zum neuen Reiter (ANN-567); in Ruhe liegt sie genau
  // dort, wo bisher die Fläche des offenen Reiters lag.
  const { kasten, phase } = useGleitanzeiger(liste, offen);

  return (
    <nav aria-label={label} className="border-line flex items-stretch border-t">
      <div className="relative min-w-0 flex-1">
        <ul
          ref={liste}
          className={`relative flex gap-1 overflow-x-auto px-2 py-1.5 sm:flex-wrap sm:overflow-visible sm:px-3 ${kasten ? 'gleitet-pille' : ''}`}
        >
          {/* Vor den Reitern, damit sie darüber liegen. */}
          {kasten ? (
            <li
              aria-hidden="true"
              data-gleitanzeiger=""
              data-phase={phase}
              className="gleitanzeiger bg-accent-soft rounded-pill"
              style={anzeigerStil(kasten, 'flaeche')}
            />
          ) : null}
          {children}
        </ul>
        <Randverlauf {...rand} rechtsOhneZeichen={rollt} />
      </div>
      {rollt ? <Blaetterknopf aktiv={rand.rechts} liste={liste} /> : null}
    </nav>
  );
}

function rolleOffenenReiterInsBild(liste: RefObject<HTMLUListElement | null>) {
  const aktiv = liste.current?.querySelector<HTMLElement>('[aria-current="page"]');
  if (liste.current && aktiv) rolleInsBild(liste.current, aktiv, VERLAUF_FREI_PX);
}
