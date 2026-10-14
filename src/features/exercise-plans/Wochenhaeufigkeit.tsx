import { useId } from 'react';
import { useMutation, useMutationState, useQueryClient } from '@tanstack/react-query';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { PLAENE_SCHLUESSEL, type Plan } from './api';
import { haeufigkeit } from './dosierung';
import { haeufigkeitSchluessel, kopfdatenScope, speichereKopfdaten } from './kopfdaten';
import { MinusSymbol, PlusSymbol } from './Zahlschritt';

/** Höchstens so viele Einheiten je Woche - wie `exercise_plans.sessions_per_week`. */
const HOECHSTENS = 14;

/**
 * Die Häufigkeit pro Woche direkt im Entwurf (Befund B9): eine Zeile
 * „3-mal pro Woche“ mit Minus und Plus, ohne Fenster. Bis dahin lag sie hinter
 * „Bearbeiten“, und sichtbar war nur „am Tag“ an jeder Übung.
 *
 * Vorbelegt ist nichts („ohne Angabe“); die Zahl wählt die Fachperson, nie
 * etwas aus Angaben der Person (ADR-006 Punkt 10). Jeder Tipp wird sofort
 * gespeichert, der Reihe nach mit Titel und Vorlage (`kopfdatenScope`), damit
 * der letzte Tipp auch der letzte Stand am Server ist.
 *
 * Die Zeile zeigt den letzten Tipp, solange gespeichert wird, sonst den Stand
 * am Server. Scheitert ein Tipp, gilt wieder dieser - nie der vorige Tipp:
 * Sonst ginge der Plan mit einer anderen Häufigkeit zur Person, als die Zeile
 * zeigt (Prüfung O-002).
 */
export function Wochenhaeufigkeit({ plan }: { plan: Plan }) {
  const queryClient = useQueryClient();
  const beschriftung = useId();
  const schluessel = haeufigkeitSchluessel(plan.id);
  const speichern = useMutation({
    mutationKey: schluessel,
    scope: kopfdatenScope(plan.id),
    mutationFn: (neu: number) =>
      speichereKopfdaten(queryClient, plan, { einheitenJeWoche: neu > 0 ? neu : null }),
    // Fertig erst nach dem Nachladen: So springt die Zahl nicht kurz auf den
    // alten Stand, und der nächste Aufruf in der Reihe liest den neuen.
    onSettled: () => queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL }),
  });
  const laufend = useMutationState({
    filters: { mutationKey: schluessel, status: 'pending' },
    select: (mutation) => mutation.state.variables as number,
  });
  const wert = laufend.at(-1) ?? plan.sessions_per_week ?? 0;

  return (
    <div className="mt-6">
      <ListRows>
        <ListRow
          titel={<span id={beschriftung}>Häufigkeit</span>}
          meta={<output aria-live="polite">{wert > 0 ? haeufigkeit(wert) : 'ohne Angabe'}</output>}
          aktion={
            <div
              role="group"
              aria-labelledby={beschriftung}
              className="border-line-strong rounded-button flex items-center border"
            >
              <Symbolknopf
                beschriftung="Häufigkeit: weniger"
                disabled={wert <= 0}
                onClick={() => speichern.mutate(wert - 1)}
              >
                <MinusSymbol />
              </Symbolknopf>
              <Symbolknopf
                beschriftung="Häufigkeit: mehr"
                disabled={wert >= HOECHSTENS}
                onClick={() => speichern.mutate(wert + 1)}
              >
                <PlusSymbol />
              </Symbolknopf>
            </div>
          }
        />
      </ListRows>
      {speichern.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {speichern.error.message}
        </Statusmeldung>
      ) : null}
    </div>
  );
}
