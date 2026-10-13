import { useLayoutEffect, useRef } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { Randverlauf } from '@/components/ui/Reiterleiste';
import { rolleInsBild, useRandVerlauf, VERLAUF_FREI_PX } from '@/components/ui/waagerechtRollen';
import { useOffenerReiter, type Suchreiter } from './offenerReiter';

/**
 * Reiter eines Objekts, deren Wahl im Suchteil steht (Design-Fundament,
 * DESIGN.md „Objekt“).
 *
 * Sieht aus und verhält sich wie die `Reiterleiste` des Systems - Pillen 44 px,
 * der offene auf der Akzentfläche, schmal waagerecht rollend, der offene ins
 * Bild gerollt. Der Unterschied: Die `Reiterleiste` erkennt den offenen Reiter
 * am Pfad (`NavLink`), diese am Suchparameter. Die Mitarbeiter:in hat keine
 * Unterrouten, und neue Routen gehören nicht zu einem Design-Umbau.
 *
 * Lokal gebaut (Welle B, B7); gehört als Variante der `Reiterleiste` nach
 * `src/components/ui`. Die übrigen Suchparameter (etwa der Rückweg
 * `?zurueck=`) reisen mit.
 */
export function Suchreiterleiste<W extends string>({
  reiter,
  param,
  label,
}: {
  reiter: readonly Suchreiter<W>[];
  param: string;
  label: string;
}) {
  const { pathname } = useLocation();
  const [suche] = useSearchParams();
  const offen = useOffenerReiter(
    param,
    reiter.map((eintrag) => eintrag.wert),
  );
  const liste = useRef<HTMLUListElement>(null);

  useLayoutEffect(() => {
    const aktiv = liste.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (liste.current && aktiv) rolleInsBild(liste.current, aktiv, VERLAUF_FREI_PX);
  }, [offen]);
  // Wie die `Reiterleiste`: ein Verlauf am Rand zeigt weitere Reiter an (A1).
  const rand = useRandVerlauf(liste, offen);

  function ziel(wert: W, erster: boolean): string {
    const neu = new URLSearchParams(suche);
    if (erster) neu.delete(param);
    else neu.set(param, wert);
    const text = neu.toString();
    return text ? `${pathname}?${text}` : pathname;
  }

  return (
    <nav aria-label={label} className="border-line relative border-t">
      <ul
        ref={liste}
        className="flex gap-1 overflow-x-auto px-2 py-1.5 sm:flex-wrap sm:overflow-visible sm:px-3"
      >
        {reiter.map((eintrag, index) => (
          <li key={eintrag.wert} className="shrink-0">
            <Link
              to={ziel(eintrag.wert, index === 0)}
              aria-current={eintrag.wert === offen ? 'page' : undefined}
              className="text-ink-muted hover:bg-surface-sunken hover:text-ink rounded-pill aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent text-liste flex min-h-11 items-center px-3 whitespace-nowrap transition-colors aria-[current=page]:font-semibold"
            >
              {eintrag.label}
            </Link>
          </li>
        ))}
      </ul>
      <Randverlauf {...rand} />
    </nav>
  );
}
