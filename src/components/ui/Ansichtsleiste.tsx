import { useLayoutEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import type { SubNavEintrag } from './SubNav';
import { istAktiv } from './subnavAktiv';
import { rolleInsBild } from './waagerechtRollen';

/**
 * Die Ansichten unter einem Reiter der `SubNav` (ORG-001, ANN-604): Team →
 * Mitarbeitende · Arbeitszeit · Urlaub …, Praxis → Einstellungen · Protokoll …
 *
 * Pillen wie die Bereiche der Akte (bis ORG-001 der `SicherheitReiter`): Auswahl
 * ist „Akzentfläche, Hauptfarbe, 600", kein zweiter Unterstrich unter dem der
 * Leiste darüber - zwei gleich aussehende Reihen übereinander wären ein
 * Rätsel. Schmal rollt die Reihe waagerecht, und die offene Ansicht rollt ins
 * Bild. Kein `<ul>`: Die Seiten darunter nennen ihre Zeilen als `listitem`,
 * und eine Liste im Kopf zählte dort mit.
 */
const pille =
  'text-ink-muted hover:bg-surface-sunken hover:text-ink rounded-pill aria-[current=page]:bg-accent-soft ' +
  'aria-[current=page]:text-accent text-liste flex min-h-11 shrink-0 items-center px-3 whitespace-nowrap ' +
  'transition-colors aria-[current=page]:font-semibold';

export function Ansichtsleiste({ eintraege }: { eintraege: readonly SubNavEintrag[] }) {
  const { pathname } = useLocation();
  const reihe = useRef<HTMLElement>(null);

  useLayoutEffect(() => {
    const aktiv = reihe.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (reihe.current && aktiv) rolleInsBild(reihe.current, aktiv, 16);
  }, [pathname]);

  return (
    <nav ref={reihe} aria-label="Ansichten" className="mb-4 flex gap-1 overflow-x-auto">
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
    </nav>
  );
}
