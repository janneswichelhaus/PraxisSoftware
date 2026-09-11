import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { SubNav } from '@/components/ui/SubNav';
import { canReadPatientDirectory, type CurrentUser } from '@/features/session/types';
import { Patientensuche } from '@/features/patients/Patientensuche';
import { aktiverBereich, arbeitsbereiche, mehrSymbol, tableiste } from './navigation';
import { Verbindungsanzeige } from './Verbindungsanzeige';

/**
 * Rahmen der angemeldeten Anwendung.
 *
 * Die globale Navigation zeigt ausschließlich die sechs Arbeitsbereiche und
 * ist auf allen Seiten identisch. Alles Bereichsinterne steht als lokales
 * Untermenü direkt über dem Inhalt, damit ein Wechsel innerhalb einer Aufgabe
 * nicht durch die globale Ebene führt.
 *
 * Mobil: Kopfzeile plus Tableiste am unteren Rand, damit die Hauptbereiche mit
 * dem Daumen erreichbar sind. Ab sm: seitliche Navigation.
 */

const seitenLink =
  'flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-[0.9375rem] transition-colors ' +
  'hover:bg-surface-sunken aria-[current=page]:bg-accent-soft aria-[current=page]:font-medium ' +
  'aria-[current=page]:text-accent';

const tabLink =
  'text-ink-muted aria-[current=page]:text-accent flex min-h-14 flex-col items-center justify-center ' +
  'gap-0.5 px-1 text-[0.6875rem] transition-colors aria-[current=page]:font-medium';

export function AppShell({
  user,
  onSignOut,
  children,
}: {
  user: CurrentUser;
  onSignOut: () => void;
  children: ReactNode;
}) {
  const { pathname } = useLocation();
  const bereiche = arbeitsbereiche(user);
  const aktuell = aktiverBereich(bereiche, pathname);
  const { sichtbar, weitere } = tableiste(bereiche);

  // Der Kalender stellt sieben Tagesspalten nebeneinander. In der Breite der
  // uebrigen Seiten waeren sie bei mehreren zeitgleich arbeitenden Personen
  // nicht mehr lesbar; alle anderen Ansichten bleiben bewusst schmal.
  const breite = pathname.startsWith('/kalender') ? 'max-w-7xl' : 'max-w-5xl';

  // Die ausgeblendete Suche ist keine Zugriffskontrolle: `search_patients`
  // prueft die Rolle selbst und liefert einem Patientenkonto nichts (ADR-004).
  const darfSuchen = canReadPatientDirectory(user.roles);

  return (
    <div className="min-h-dvh">
      <a
        href="#inhalt"
        className="focus:bg-surface sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-lg focus:px-4 focus:py-2 focus:shadow"
      >
        Zum Inhalt springen
      </a>

      {/* Ueber der Kopfleiste, damit der Hinweis nicht in der Seite untergeht
          und beim Scrollen sichtbar bleibt (UI-000, ANN-015). */}
      <div className="sticky top-0 z-40">
        <Verbindungsanzeige />
      </div>

      <header className="border-line bg-canvas/90 sticky top-0 z-30 border-b backdrop-blur">
        <div
          className={`mx-auto flex min-h-14 w-full ${breite} items-center justify-between gap-3 px-5`}
        >
          <div className="min-w-0">
            <p className="text-ink truncate text-[0.9375rem] font-semibold tracking-[-0.01em]">
              {user.organizationName ?? 'Praxisplattform'}
            </p>
            {aktuell ? (
              <p className="text-ink-subtle truncate text-xs sm:hidden">{aktuell.label}</p>
            ) : null}
          </div>
          {/* Ab sm hat die Kopfleiste Platz für das Suchfeld in derselben
              Zeile; darunter bekommt es eine eigene (siehe unten). */}
          {darfSuchen ? (
            <div className="hidden min-w-0 flex-1 justify-center sm:flex">
              <div className="w-full max-w-sm">
                <Patientensuche />
              </div>
            </div>
          ) : null}
          <div className="flex items-center gap-2">
            <span className="text-ink-muted hidden text-sm sm:inline">
              {user.profile.display_name}
            </span>
            <Button variant="quiet" onClick={onSignOut}>
              Abmelden
            </Button>
          </div>
        </div>

        {/* Auf dem Telefon eine eigene Zeile: das Suchfeld ist der einzige Weg
            von Kalender und „Mein Tag" in eine Akte, und dafür muss es ohne
            Aufklappen erreichbar sein (UX-004). */}
        {darfSuchen ? (
          <div className={`mx-auto w-full ${breite} px-5 pb-2 sm:hidden`}>
            <Patientensuche />
          </div>
        ) : null}
      </header>

      <div className={`mx-auto flex w-full ${breite} gap-8 px-5`}>
        <nav aria-label="Arbeitsbereiche" className="hidden w-52 shrink-0 py-8 sm:block">
          <ul className="sticky top-20 flex flex-col gap-1">
            {bereiche.map((bereich) => (
              <li key={bereich.id}>
                {/* Bewusst Link statt NavLink: aktiv ist der ganze Bereich,
                    nicht nur seine Einstiegsroute. */}
                <Link
                  to={bereich.to}
                  aria-current={aktuell?.id === bereich.id ? 'page' : undefined}
                  className={seitenLink}
                >
                  {bereich.icon}
                  {bereich.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <main id="inhalt" className="min-w-0 flex-1 py-8 pb-28 sm:pb-8">
          {aktuell && aktuell.unterpunkte.length > 0 ? (
            <SubNav eintraege={aktuell.unterpunkte} label={`Bereich ${aktuell.label}`} />
          ) : null}
          {children}
        </main>
      </div>

      <nav
        aria-label="Arbeitsbereiche"
        className="border-line bg-surface/95 fixed inset-x-0 bottom-0 z-30 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur sm:hidden"
      >
        <ul className="mx-auto flex max-w-5xl">
          {sichtbar.map((bereich) => (
            <li key={bereich.id} className="flex-1">
              <Link
                to={bereich.to}
                aria-current={aktuell?.id === bereich.id ? 'page' : undefined}
                className={tabLink}
              >
                {bereich.icon}
                {bereich.kurz}
              </Link>
            </li>
          ))}
          {weitere.length > 0 ? (
            <li className="flex-1">
              <Link
                to="/bereiche"
                aria-current={
                  pathname === '/bereiche' || weitere.some((bereich) => bereich.id === aktuell?.id)
                    ? 'page'
                    : undefined
                }
                className={tabLink}
              >
                {mehrSymbol}
                Mehr
              </Link>
            </li>
          ) : null}
        </ul>
      </nav>
    </div>
  );
}
