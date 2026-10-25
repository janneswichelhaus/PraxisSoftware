import type { ReactNode } from 'react';
import { titelklassen } from './titelstufe';

/**
 * Eine ruhige Seite nach einem Abschluss (Handoff 2026-10-24, Abschnitt 3;
 * Muster „Alles bereit“ aus dem Einstieg der Plattform): ein Kreis mit
 * Zeichen, der Titel als `h1` in der Stufe des Grußes, wenige Sätze, auf
 * Wunsch eine Zeile nach einer Linie und der Fuß der Seite. Ohne Kopf; der
 * Inhalt steht senkrecht mittig. Kein Lob und keine Zahl - was dort steht,
 * sagt die Seite. Der Titel folgt der Stufe des Grußes (`titelklassen`):
 * unter 23rem 28, mit einem Wort über elf Zeichen 22 (ANN-696).
 *
 * `ton`: `marke` ist Tiefgrün mit dem Zeichen in Papier (etwas ist
 * angekommen), `vertieft` die vertiefte Fläche mit dem Zeichen in Tinte
 * (etwas wartet noch). Der Kreis ist für Vorlesesoftware stumm; der Titel
 * sagt es.
 */
export function Abschlussseite({
  zeichen,
  ton,
  titel,
  children,
  zeile,
  fuss,
}: {
  /** Das Zeichen im Kreis, 44 px. */
  zeichen: ReactNode;
  ton: 'marke' | 'vertieft';
  titel: string;
  /** Die Sätze unter dem Titel. */
  children: ReactNode;
  /** Eine Zeile nach einer Linie, etwa der nächste Übungstag. */
  zeile?: ReactNode;
  /** Der Fuß mit dem Hauptknopf, fest unten. */
  fuss: ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      {/* Der Rand außen, die Spalte innen - wie im Fuß der Durchführung, damit
          Text und Hauptknopf am Rechner an denselben Kanten stehen. */}
      <div className="flex flex-1 flex-col justify-center px-6 py-12 max-[23rem]:px-3 max-[23rem]:py-8">
        <div className="max-w-spalte mx-auto flex w-full flex-col gap-6">
          <span
            aria-hidden="true"
            className={`rounded-pill inline-flex size-24 shrink-0 items-center justify-center ${
              ton === 'marke' ? 'bg-surface-inverse text-surface' : 'bg-surface-sunken text-ink'
            }`}
          >
            {zeichen}
          </span>
          <div className="flex flex-col gap-3">
            <h1 className={titelklassen('gruss', titel)}>{titel}</h1>
            {children}
          </div>
          {zeile ? <div className="border-line border-t pt-4">{zeile}</div> : null}
        </div>
      </div>
      {fuss}
    </div>
  );
}
