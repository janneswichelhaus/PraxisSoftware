import { useLayoutEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { rolleInsBild } from '@/components/ui/waagerechtRollen';
import { TEIL_PARAM, offenerTeil, type Teil } from './teil';

/**
 * Die Reiter eines Objekts, dessen Teile **keine eigenen Routen** haben - die
 * Rechnung (Design-Rollout B6, DESIGN.md „Objekt“).
 *
 * Sieht aus wie die `Reiterleiste` (Pillen 44 px, 15 px, der offene Reiter auf
 * der Akzentfläche in der Hauptfarbe, eine Linie darüber) und steht wie sie im
 * `Objektkopf`. Der offene Teil steht aber im Suchteil der Adresse
 * (`?teil=positionen`) statt im Pfad: Die Routen der Abrechnung bleiben, wie
 * sie sind, und ein Link, der Rückweg und Neuladen behalten den Reiter. Der
 * erste Teil steht ohne Parameter, damit die Adresse aus Listen und Meldungen
 * gleich bleibt; alle übrigen Suchparameter (etwa der Rückweg) reisen mit.
 *
 * Lokal, bis `Reiterleiste` einen Suchparameter kennt: Ihr `NavLink` vergleicht
 * nur den Pfad und hielte jeden Reiter für offen. Gehört nach `ui/`.
 */
export function Teilreiter<W extends string>({
  label,
  teile,
}: {
  label: string;
  teile: readonly Teil<W>[];
}) {
  const ort = useLocation();
  const liste = useRef<HTMLUListElement>(null);
  const suche = new URLSearchParams(ort.search);
  const offen = offenerTeil(suche, teile);

  // Wie die `Reiterleiste`: Der offene Reiter rollt am Telefon ins Bild.
  useLayoutEffect(() => {
    const aktiv = liste.current?.querySelector<HTMLElement>('[aria-current="page"]');
    if (liste.current && aktiv) rolleInsBild(liste.current, aktiv);
  }, [ort.search]);

  function ziel(wert: W): string {
    const neu = new URLSearchParams(ort.search);
    if (wert === teile[0]?.wert) neu.delete(TEIL_PARAM);
    else neu.set(TEIL_PARAM, wert);
    const text = neu.toString();
    return `${ort.pathname}${text ? `?${text}` : ''}`;
  }

  return (
    <nav aria-label={label} className="border-line border-t">
      <ul
        ref={liste}
        className="flex gap-1 overflow-x-auto px-2 py-1.5 sm:flex-wrap sm:overflow-visible sm:px-3"
      >
        {teile.map((teil) => (
          <li key={teil.wert} className="shrink-0">
            <Link
              to={ziel(teil.wert)}
              aria-current={teil.wert === offen ? 'page' : undefined}
              className="text-ink-muted hover:bg-surface-sunken hover:text-ink rounded-pill aria-[current=page]:bg-accent-soft aria-[current=page]:text-accent text-liste flex min-h-11 items-center px-3 whitespace-nowrap transition-colors aria-[current=page]:font-semibold"
            >
              {teil.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
