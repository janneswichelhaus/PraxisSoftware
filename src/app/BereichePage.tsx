import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { textlinkKlassen } from '@/components/ui/buttonStile';
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
                <span className="text-ink text-liste block font-medium">{bereich.label}</span>
                <span className="text-ink-muted mt-0.5 block text-sm">{bereich.leitfrage}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* Der Satz sagt, was der Stand ist (BEF-049, RAH-004): Die Liste
          darüber kennzeichnet keinen Bereich; die Vorschauen stehen in den
          Untermenüs, und die Kommunikation ist als Ganzes eine. Der Weg zum
          Protokoll steht jeder Rolle offen - die Tableiste nennt „Mehr" auch
          dort, wo der eigene Bereich darin liegt. */}
      <p className="text-ink-muted mt-8 max-w-prose text-sm">
        Vorschauen — im Untermenü so bezeichnet — und die Kommunikation speichern nichts; was dort
        simuliert wurde, steht im{' '}
        <Link to="/vorschau/protokoll" className={textlinkKlassen()}>
          Vorschau-Protokoll
        </Link>
        .
      </p>
    </>
  );
}
