import { useLayoutEffect, useRef } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { rolleInsBild } from '@/components/ui/waagerechtRollen';
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
    if (liste.current && aktiv) rolleInsBild(liste.current, aktiv);
  }, [offen]);

  // Jeder Reiter nennt sich in der Adresse, auch der erste (R2-O6): So bleibt
  // `?bereich=einsatz` gültig, wenn sich die Reihenfolge ändert, und ein
  // Lesezeichen öffnet denselben Reiter. Ohne Parameter gilt weiter der erste.
  function ziel(wert: W): string {
    const neu = new URLSearchParams(suche);
    neu.set(param, wert);
    return `${pathname}?${neu.toString()}`;
  }

  return (
    <nav aria-label={label} className="border-line border-t">
      <ul
        ref={liste}
        className="flex gap-1 overflow-x-auto px-2 py-1.5 sm:flex-wrap sm:overflow-visible sm:px-3"
      >
        {reiter.map((eintrag) => (
          <li key={eintrag.wert} className="shrink-0">
            <Link
              to={ziel(eintrag.wert)}
              aria-current={eintrag.wert === offen ? 'page' : undefined}
              className="text-ink-muted hover:bg-surface-sunken hover:text-ink rounded-pill aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent text-liste flex min-h-11 items-center px-3 whitespace-nowrap transition-colors aria-[current=page]:font-semibold"
            >
              {eintrag.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
