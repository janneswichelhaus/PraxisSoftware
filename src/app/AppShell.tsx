import type { ReactNode } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import {
  canManageAppointments,
  canReadPatientDirectory,
  isOwner,
  type CurrentUser,
} from '@/features/session/types';

interface NavItem {
  to: string;
  label: string;
}

function navItems(user: CurrentUser): NavItem[] {
  const items: NavItem[] = [{ to: '/', label: 'Übersicht' }];
  if (canManageAppointments(user.roles)) {
    items.push({ to: '/kalender', label: 'Kalender' });
  }
  if (canReadPatientDirectory(user.roles)) {
    items.push({ to: '/patienten', label: 'Patient:innen' });
  }
  // Arbeitszeiten sind fuer alle Praxisrollen lesbar; das Aendern prueft die
  // Seite selbst und - verbindlich - der Server (CAL-005).
  if (canManageAppointments(user.roles)) {
    items.push({ to: '/praxis/planung', label: 'Planung' });
  }
  // Nur die administrative Praxisrolle sieht den Sicherheitsbereich
  // (ADR-010). Die Route ist zusaetzlich serverseitig abgesichert.
  if (isOwner(user.roles)) {
    items.push({ to: '/praxis/sicherheit/audit', label: 'Sicherheit' });
  }
  return items;
}

const linkBase =
  'flex min-h-11 items-center rounded-lg px-3 text-[0.9375rem] transition-colors ' +
  'aria-[current=page]:bg-accent-soft aria-[current=page]:font-medium aria-[current=page]:text-accent';

/**
 * Rahmen der angemeldeten Anwendung.
 *
 * Mobil: Kopfzeile plus Tableiste am unteren Rand, damit die Hauptbereiche mit
 * dem Daumen erreichbar sind. Ab sm: seitliche Navigation.
 */
export function AppShell({
  user,
  onSignOut,
  children,
}: {
  user: CurrentUser;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const items = navItems(user);
  const { pathname } = useLocation();
  // Der Kalender stellt sieben Tagesspalten nebeneinander. In der Breite der
  // uebrigen Seiten waeren sie bei mehreren zeitgleich arbeitenden Personen
  // nicht mehr lesbar; alle anderen Ansichten bleiben bewusst schmal.
  const breite = pathname.startsWith('/kalender') ? 'max-w-7xl' : 'max-w-5xl';

  return (
    <div className="min-h-dvh">
      <a
        href="#inhalt"
        className="focus:bg-surface sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:shadow"
      >
        Zum Inhalt springen
      </a>

      <header className="border-line bg-canvas/90 sticky top-0 z-30 border-b backdrop-blur">
        <div
          className={`mx-auto flex min-h-14 w-full ${breite} items-center justify-between gap-3 px-5`}
        >
          <div className="min-w-0">
            <p className="text-ink truncate text-[0.9375rem] font-semibold tracking-[-0.01em]">
              {user.organizationName ?? 'Praxisplattform'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-ink-muted hidden text-sm sm:inline">
              {user.profile.display_name}
            </span>
            <Button variant="quiet" onClick={onSignOut}>
              Abmelden
            </Button>
          </div>
        </div>
      </header>

      <div className={`mx-auto flex w-full ${breite} gap-8 px-5`}>
        <nav aria-label="Hauptnavigation" className="hidden w-48 shrink-0 py-8 sm:block">
          <ul className="flex flex-col gap-1">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink to={item.to} end={item.to === '/'} className={linkBase}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main id="inhalt" className="min-w-0 flex-1 py-8 pb-28 sm:pb-8">
          {children}
        </main>
      </div>

      <nav
        aria-label="Hauptnavigation"
        className="border-line bg-surface/95 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        <ul className="mx-auto flex max-w-5xl">
          {items.map((item) => (
            <li key={item.to} className="flex-1">
              <NavLink
                to={item.to}
                end={item.to === '/'}
                className="text-ink-muted aria-[current=page]:text-accent flex min-h-14 items-center justify-center px-2 text-sm transition-colors aria-[current=page]:font-medium"
              >
                {item.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
