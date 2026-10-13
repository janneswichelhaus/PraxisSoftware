import { useLayoutEffect, useRef } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
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
 * Steht im `nav` der Reihe, das dafür `relative` ist; `links` und `rechts`
 * misst `useRandVerlauf`. Rein dekorativ und nicht klickbar: Was dahinter
 * liegt, erreicht man durch Wischen, Vorlesesoftware liest die ganze Liste.
 * Von Weiß (`surface`), weil die Reihe in der Karte des `Objektkopf`s steht;
 * nur unter 640 px, darüber bricht die Reihe um. `immer` zeigt ihn auf jeder
 * Breite - für eine Leiste, die auch am Rechner rollt, etwa die Kacheln der
 * Behandlungsgrundlagen (Nachprüfung A9).
 */
export function Randverlauf({
  links,
  rechts,
  immer = false,
}: {
  links: boolean;
  rechts: boolean;
  immer?: boolean;
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
          ›
        </span>
      ) : null}
    </>
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
  const liste = useRef<HTMLUListElement>(null);

  // Vor dem Zeichnen, damit die Leiste nicht erst am Anfang steht und dann
  // springt: Auf dem letzten Reiter war der markierte Eintrag am Telefon
  // sonst nicht zu sehen.
  useLayoutEffect(() => {
    const aktiv = liste.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (liste.current && aktiv) rolleInsBild(liste.current, aktiv, VERLAUF_FREI_PX);
  }, [pathname]);
  // Nach dem Rollen gemessen: Erst dann steht fest, was links und rechts fehlt.
  const rand = useRandVerlauf(liste, pathname);

  return (
    <nav aria-label={label} className="border-line relative border-t">
      <ul
        ref={liste}
        className="flex gap-1 overflow-x-auto px-2 py-1.5 sm:flex-wrap sm:overflow-visible sm:px-3"
      >
        {reiter.map((eintrag) => (
          <li key={eintrag.to} className="shrink-0">
            <NavLink
              to={eintrag.to}
              end={eintrag.end ?? false}
              className="text-ink-muted hover:bg-surface-sunken hover:text-ink rounded-pill aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent text-liste flex min-h-11 items-center px-3 whitespace-nowrap transition-colors aria-[current=page]:font-semibold"
            >
              {eintrag.label}
            </NavLink>
          </li>
        ))}
      </ul>
      <Randverlauf {...rand} />
    </nav>
  );
}
