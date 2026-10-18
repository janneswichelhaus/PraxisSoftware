import type { ReactNode } from 'react';
import { KnopfGroesse } from './knopfGroesse';

/**
 * Die klebende Leiste am unteren Rand einer Arbeitsseite (Design-Handoff
 * 2026-10-01, Abschnitt 6a; herausgelöst aus der Schreibseite im
 * Design-Fundament, DESIGN.md Seitentyp „Arbeitsseite“).
 *
 * Für Seiten mit einem langen Eingabefeld - Schreibseite, Erhebung,
 * Trainingsprotokoll -, auf denen die Knöpfe sonst erst nach dem Feld kämen.
 * Am Telefon steht sie **über der Tableiste** (56 px und ihre Linie, plus der
 * sichere Rand unten), ab 640 px am Fensterrand. Sie bleibt beim Rollen
 * stehen; die Fläche ist Papier, oben trennt eine Linie - kein Schatten.
 *
 * Darin stehen die Handlungen in einer Reihe, kompakt (44 px; ohne Angabe
 * nehmen Knöpfe hier diese Größe an), der Hauptknopf rechts außen (Daumen).
 * `oben` sind Zeilen über der Leiste, die zu ihr gehören: der Stand der
 * Sicherung, die Rückfrage des Textverlustschutzes.
 *
 * `einbettung`: `flaeche` für eine Seite, die selbst schon von Rand zu Rand
 * reicht (die Schreibseite); `seite` (Vorgabe) für eine gewöhnliche Seite im
 * Inhaltsbereich - die Leiste greift dann über dessen Innenabstand hinaus,
 * damit sie die volle Breite deckt, und ihre Knöpfe fluchten mit dem Inhalt.
 * `rahmen` für eine Fläche mit fester Höhe, deren Inhalt selbst rollt - die
 * Chatfläche des Teamchats (TEAM-002): Die Leiste steht am Fuß der Fläche
 * und klebt nicht, weil nichts um sie herum rollt.
 */
export function Aktionsleiste({
  children,
  oben,
  einbettung = 'seite',
}: {
  children: ReactNode;
  oben?: ReactNode;
  einbettung?: 'seite' | 'flaeche' | 'rahmen';
}) {
  const seite = einbettung === 'seite';
  return (
    <div
      className={
        einbettung === 'rahmen'
          ? 'bg-surface shrink-0'
          : `bg-surface sticky bottom-[calc(3.5rem+1px+env(safe-area-inset-bottom))] z-10 shrink-0 sm:bottom-0 ${
              seite ? '-mx-4 sm:-mx-6 lg:-mx-8' : ''
            }`.trim()
      }
    >
      {oben}
      <div
        className={`border-line flex items-center gap-2 border-t py-2 ${
          seite || einbettung === 'rahmen' ? 'px-4 sm:px-6' : 'px-3'
        } ${seite ? 'lg:px-8' : ''}`.trim()}
      >
        <KnopfGroesse value="kompakt">{children}</KnopfGroesse>
      </div>
    </div>
  );
}
