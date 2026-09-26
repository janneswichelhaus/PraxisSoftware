import { useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

export interface SubNavEintrag {
  to: string;
  label: string;
  /** Kennzeichnet Ansichten, die noch keine Hintergrundfunktionen haben. */
  vorschau?: boolean;
  end?: boolean;
}

const eintragKlassen =
  'text-ink-muted hover:text-ink -mb-px flex min-h-11 items-center gap-1.5 border-b-2 border-transparent px-3 text-[0.9375rem] whitespace-nowrap transition-colors';

/**
 * Navigation innerhalb eines Arbeitsbereichs.
 *
 * Sie steht beim Arbeitsgegenstand und nicht in der globalen Navigation: Wer
 * in der Flotte arbeitet, wechselt hier zwischen Rädern, Schlüsseln und
 * Check-Up, ohne den Bereich zu verlassen. Auf schmalen Geräten scrollt die
 * Leiste waagerecht, statt umzubrechen und die halbe Seite zu belegen.
 *
 * Vorschauen stehen eingeklappt hinter einem Knopf „Vorschau" (UX-002h,
 * Bedienprinzip „was nicht gebraucht wird, ist eingeklappt"): Wer den Bereich
 * öffnet, trifft auf das, was wirkt. Steht man auf einer Vorschau, ist die
 * Gruppe offen — sonst wäre der markierte Punkt unsichtbar.
 */
export function SubNav({ eintraege, label }: { eintraege: SubNavEintrag[]; label: string }) {
  const { pathname } = useLocation();
  const [offen, setOffen] = useState(false);

  if (eintraege.length < 2) return null;

  const echte = eintraege.filter((eintrag) => !eintrag.vorschau);
  const vorschauen = eintraege.filter((eintrag) => eintrag.vorschau);
  const vorschauAktiv = vorschauen.some(
    (eintrag) => pathname === eintrag.to || pathname.startsWith(`${eintrag.to}/`),
  );
  // Ohne echten Punkt gäbe es nichts, wofür eingeklappt würde.
  const einklappbar = echte.length > 0 && vorschauen.length > 0 && !vorschauAktiv;
  const sichtbar = einklappbar && !offen ? echte : eintraege;

  return (
    <nav aria-label={label} className="border-line -mx-5 mb-6 border-b px-5">
      {/* Schmal: eine scrollbare Zeile, damit sie nicht die halbe Seite belegt.
          Breit: umbrechen - ein waagerecht verstecktes Menue findet auf dem
          Desktop niemand, weil es dort keine Wischgeste gibt. */}
      <ul className="flex gap-1 overflow-x-auto pb-px sm:flex-wrap sm:overflow-visible">
        {sichtbar.map((eintrag) => (
          <li key={eintrag.to} className="shrink-0">
            <NavLink
              to={eintrag.to}
              end={eintrag.end ?? true}
              className={`${eintragKlassen} aria-[current=page]:border-accent aria-[current=page]:text-accent aria-[current=page]:font-medium`}
            >
              {eintrag.label}
              {eintrag.vorschau ? (
                <span className="bg-surface-sunken text-ink-subtle rounded px-1.5 py-0.5 text-[0.6875rem] font-medium">
                  Vorschau
                </span>
              ) : null}
            </NavLink>
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
    </nav>
  );
}
