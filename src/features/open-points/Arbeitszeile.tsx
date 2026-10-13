import type { ComponentProps, ReactNode } from 'react';
import { ListRow } from '@/components/ui/ListRow';

/**
 * Eine `ListRow` mit Platz darunter (Design-Rollout B5).
 *
 * Manche Zeilen des Eingangs tragen mehr Arbeit, als neben das Ziel passt:
 * ein Terminwunsch mit Antwort an die Person, ein Anruf mit drei möglichen
 * Ausgängen, ein Anhang mit Ansehen und Löschen. Die Zeile selbst bleibt die
 * `ListRow` (Ziel ≥ 56 px, Name, Nebenzeile, Status, `aktion`); was darunter
 * steht, gehört zum selben Listeneintrag.
 *
 * Die `ListRow` bringt ihr eigenes `<li>` mit. Damit der Eintrag einer bleibt,
 * steht sie in einer Liste ohne eigene Rolle (`role="none"`): Ihr `<li>` erbt
 * die Rolle und ist für Vorlesesoftware kein zweiter Eintrag (WAI-ARIA,
 * „presentational children"). Gehört als Platz `unten` an die `ListRow` in
 * `src/components/ui`, sobald ein zweiter Bereich ihn braucht.
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
