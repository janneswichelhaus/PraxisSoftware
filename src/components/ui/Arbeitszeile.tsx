import type { ComponentProps, ReactNode } from 'react';
import { ListRow } from '@/components/ui/ListRow';

/**
 * Eine `ListRow` mit Platz darunter für Arbeit, die nicht neben das Ziel passt: Terminwunsch mit
 * Antwort, Anruf mit Ausgängen, Anhang mit Ansehen und Löschen. Die Liste ohne eigene Rolle hält es
 * für Vorlesesoftware bei einem Eintrag (WAI-ARIA, „presentational children“).
 */
export function Arbeitszeile({
  unten,
  ...zeile
}: ComponentProps<typeof ListRow> & {
  /** Was unter der Zeile steht - Angaben, Knöpfe, ein Formular. */
  unten?: ReactNode;
}) {
  return (
    <li className="border-line border-t first:border-t-0">
      <ul role="none">
        <ListRow {...zeile} />
      </ul>
      {unten ? <div className="flex flex-col gap-3 pb-4">{unten}</div> : null}
    </li>
  );
}
