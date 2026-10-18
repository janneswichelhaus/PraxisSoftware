import { useRef } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import type { CurrentUser } from '@/features/session/types';
import { useChatflaeche, useSpalten } from './flaeche';
import { Gespraechsliste } from './Gespraechsliste';
import { TEAMCHAT } from './pfade';
import type { TeamchatKontext } from './rahmen';

/**
 * Der Rahmen des Teamchats (TEAM-002, ANN-648): eine Fläche mit fester Höhe
 * von der Kopfzeile bis über die Tableiste - bei offener Tastatur bis über
 * die Tastatur (`useChatflaeche`). Gerollt wird nur darin, die Eingabe bleibt
 * am Fuß erreichbar.
 *
 * Ab 900 px Breite stehen die Gespräche links und bleiben stehen, während
 * rechts Gespräch, Thread oder eine der Ansichten wechselt (wie die
 * Seitenleiste bei Slack). Darunter ist `/team` die Liste und alles andere
 * eine eigene Ansicht mit dem Weg zurück.
 */
export function TeamchatRahmen({ user }: { user: CurrentUser }) {
  const flaeche = useRef<HTMLDivElement>(null);
  useChatflaeche(flaeche);
  const spalten = useSpalten(flaeche);
  const { pathname } = useLocation();
  const aufListe = pathname === TEAMCHAT || pathname === `${TEAMCHAT}/`;
  const nebeneinander = spalten >= 2;

  return (
    <div ref={flaeche} className="flex min-h-0 overflow-hidden">
      {nebeneinander || aufListe ? (
        <nav
          aria-label="Gespräche"
          className={
            nebeneinander
              ? 'border-line w-72 shrink-0 overflow-y-auto overscroll-contain border-r'
              : 'min-w-0 flex-1 overflow-y-auto overscroll-contain'
          }
        >
          <Gespraechsliste user={user} spalten={spalten} />
        </nav>
      ) : null}
      {nebeneinander || !aufListe ? (
        <div className="flex min-w-0 flex-1 flex-col">
          <Outlet context={{ user, spalten } satisfies TeamchatKontext} />
        </div>
      ) : null}
    </div>
  );
}
