import { useLayoutEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Weiterknopf, type SubNavEintrag } from './SubNav';
import { istAktiv } from './subnavAktiv';
import { rolleInsBild, useRandVerlauf } from './waagerechtRollen';

/**
 * Die Ansichten unter einem Reiter der `SubNav` (ORG-001, ANN-604): Team →
 * Mitarbeitende · Arbeitszeit · Urlaub …, Praxis → Einstellungen · Protokoll …
 *
 * Pillen wie die Bereiche der Akte (bis ORG-001 der `SicherheitReiter`):
 * Auswahl ist „Akzentfläche, Hauptfarbe, 600", kein zweiter Unterstrich unter
 * dem der Leiste darüber - zwei gleich aussehende Reihen übereinander wären
 * ein Rätsel. Schmal rollt die Reihe waagerecht, die offene Ansicht rollt ins
 * Bild, und am Rand zeigt ein Pfeil, dass es weitergeht - ein Tipp darauf
 * rollt weiter (`Weiterknopf`). Kein `<ul>`: Die Seiten darunter nennen ihre
 * Zeilen als `listitem`, und eine Liste im Kopf zählte dort mit.
 */
const pille =
  'text-ink-muted hover:bg-surface-sunken hover:text-ink rounded-pill aria-[current=page]:bg-accent-soft ' +
  'aria-[current=page]:text-accent text-liste flex min-h-11 shrink-0 items-center px-3 whitespace-nowrap ' +
  'transition-colors aria-[current=page]:font-semibold';

const verlauf =
  'from-canvas text-line-strong pointer-events-none absolute inset-y-0 flex w-11 items-center from-30% to-transparent text-xl sm:hidden';

export function Ansichtsleiste({ eintraege }: { eintraege: readonly SubNavEintrag[] }) {
  const { pathname } = useLocation();
  const reihe = useRef<HTMLDivElement>(null);
  const rand = useRandVerlauf(reihe, pathname);

  useLayoutEffect(() => {
    const aktiv = reihe.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (reihe.current && aktiv) rolleInsBild(reihe.current, aktiv, 48);
  }, [pathname]);

  return (
    <nav aria-label="Ansichten" className="relative mb-4">
      <div ref={reihe} className="flex gap-1 overflow-x-auto">
        {eintraege.map((eintrag) => (
          <Link
            key={eintrag.to}
            to={eintrag.to}
            aria-current={istAktiv(eintrag, pathname) ? 'page' : undefined}
            className={pille}
          >
            {eintrag.label}
          </Link>
        ))}
      </div>
      {rand.links ? (
        <span aria-hidden="true" className={`${verlauf} left-0 bg-linear-to-r`}>
          <Weiterknopf richtung="links" liste={reihe} />
        </span>
      ) : null}
      {rand.rechts ? (
        <span aria-hidden="true" className={`${verlauf} right-0 bg-linear-to-l`}>
          <Weiterknopf richtung="rechts" liste={reihe} />
        </span>
      ) : null}
    </nav>
  );
}
