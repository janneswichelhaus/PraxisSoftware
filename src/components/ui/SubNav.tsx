import { NavLink } from 'react-router-dom';

export interface SubNavEintrag {
  to: string;
  label: string;
  /** Kennzeichnet Ansichten, die noch keine Hintergrundfunktionen haben. */
  vorschau?: boolean;
  end?: boolean;
}

/**
 * Navigation innerhalb eines Arbeitsbereichs.
 *
 * Sie steht beim Arbeitsgegenstand und nicht in der globalen Navigation: Wer
 * in der Flotte arbeitet, wechselt hier zwischen Rädern, Schlüsseln und
 * Check-Up, ohne den Bereich zu verlassen. Auf schmalen Geräten scrollt die
 * Leiste waagerecht, statt umzubrechen und die halbe Seite zu belegen.
 */
export function SubNav({ eintraege, label }: { eintraege: SubNavEintrag[]; label: string }) {
  if (eintraege.length < 2) return null;

  return (
    <nav aria-label={label} className="border-line -mx-5 mb-6 border-b px-5">
      <ul className="flex gap-1 overflow-x-auto pb-px">
        {eintraege.map((eintrag) => (
          <li key={eintrag.to} className="shrink-0">
            <NavLink
              to={eintrag.to}
              end={eintrag.end ?? true}
              className="text-ink-muted hover:text-ink aria-[current=page]:border-accent aria-[current=page]:text-accent -mb-px flex min-h-11 items-center gap-1.5 border-b-2 border-transparent px-3 text-[0.9375rem] whitespace-nowrap transition-colors aria-[current=page]:font-medium"
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
      </ul>
    </nav>
  );
}
