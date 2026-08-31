import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import type { CurrentUser } from '@/features/session/types';
import { arbeitsbereiche } from './navigation';

/**
 * Übersicht aller Arbeitsbereiche.
 *
 * Ziel des „Mehr"-Eintrags der mobilen Tableiste: Auf schmalen Geräten passen
 * nicht alle Bereiche in die Leiste, und eine versteckte Ebene ohne eigene
 * Seite wäre schlecht auffindbar. Die Seite nennt zu jedem Bereich seine
 * Leitfrage, damit die Zuordnung ohne Ausprobieren gelingt.
 */
export function BereichePage({ user }: { user: CurrentUser }) {
  const bereiche = arbeitsbereiche(user);

  return (
    <>
      <PageHeader title="Alle Bereiche" description="Wofür welcher Bereich zuständig ist." />

      <ul className="divide-line border-line divide-y border-y">
        {bereiche.map((bereich) => (
          <li key={bereich.id}>
            <Link
              to={bereich.to}
              className="hover:bg-surface-sunken flex min-h-16 items-center gap-3 py-3 transition-colors"
            >
              <span className="text-ink-muted">{bereich.icon}</span>
              <span className="min-w-0">
                <span className="text-ink block text-[0.9375rem] font-medium">{bereich.label}</span>
                <span className="text-ink-muted mt-0.5 block text-sm">{bereich.leitfrage}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      <p className="text-ink-subtle mt-8 max-w-prose text-sm">
        Bereiche ohne fertige Hintergrundfunktionen sind als Vorschau gekennzeichnet. Dort entstehen
        keine echten Vorgänge.{' '}
        <Link to="/vorschau/protokoll" className="text-accent hover:text-accent-hover underline">
          Vorschau-Protokoll dieser Sitzung
        </Link>
      </p>
    </>
  );
}
