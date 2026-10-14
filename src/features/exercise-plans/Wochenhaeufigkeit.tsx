import { useId, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Symbolknopf } from '@/components/ui/Symbolknopf';
import { PLAENE_SCHLUESSEL, savePlan, type Plan } from './api';
import { haeufigkeit } from './dosierung';
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
 * gespeichert, der Reihe nach (`scope`), damit der letzte Tipp auch der
 * letzte Stand am Server ist; scheitert einer, springt die Zahl zurück.
 */
export function Wochenhaeufigkeit({ plan }: { plan: Plan }) {
  const queryClient = useQueryClient();
  const beschriftung = useId();
  const [wert, setWert] = useState(plan.sessions_per_week ?? 0);
  const speichern = useMutation({
    scope: { id: `haeufigkeit-${plan.id}` },
    mutationFn: (neu: number) => savePlan(plan.id, plan.title, neu > 0 ? neu : null),
    onMutate: (neu) => {
      const vorher = wert;
      setWert(neu);
      return { vorher };
    },
    onError: (_fehler, _neu, kontext) => {
      if (kontext) setWert(kontext.vorher);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: PLAENE_SCHLUESSEL }),
  });

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
