import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { BEREICHSNAME, einstiegBeenden, einstiegSchluessel, type Plattformzugang } from './api';
import { Einwilligungen } from './Einwilligungen';

/**
 * Der Einstieg nach der ersten Anmeldung (POR-019, DSN-001 4.3,
 * IDEA-LZK-005): Willkommen, Einwilligungen, fertig. Drei kurze Schritte,
 * jeder mit einem Hauptknopf; „Später" ist immer sichtbar und beendet den
 * Einstieg ebenso (DSN-001 Abschnitt 7 Punkt 7). Keine Einwilligung ist
 * nötig, um weiterzukommen - der Schritt zeigt sie nur.
 *
 * Die Praxis kann den Einstieg für die Person überspringen; dann erscheint
 * er nicht. Benachrichtigungen kommen mit ADR-024 hinzu.
 */
type Schritt = 'willkommen' | 'einwilligungen' | 'fertig';

export function Einstieg({ zugang, praxis }: { zugang: Plattformzugang; praxis: string }) {
  const queryClient = useQueryClient();
  // Eine Begleitung entscheidet keine Einwilligungen (ADR-023 Punkt 13).
  const schritte: Schritt[] =
    zugang.access_kind === 'companion'
      ? ['willkommen', 'fertig']
      : ['willkommen', 'einwilligungen', 'fertig'];
  const [nummer, setNummer] = useState(0);
  const schritt = schritte[nummer] ?? 'fertig';
  const letzter = nummer === schritte.length - 1;
  const beenden = useMutation({
    mutationFn: () => einstiegBeenden(zugang.access_id),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: einstiegSchluessel(zugang.access_id) }),
  });
  const fuer = zugang.access_kind === 'self' ? null : zugang.represented_name;
  const name = praxis || 'die Praxis';

  return (
    <>
      <p className="text-ink-muted text-sm">
        Schritt {nummer + 1} von {schritte.length}
      </p>
      {schritt === 'willkommen' ? (
        <>
          <h1 className="text-accent text-h3 mt-2 font-bold">Willkommen</h1>
          <p className="text-ink mt-3 max-w-prose text-base leading-relaxed">
            {fuer
              ? `Hier sehen Sie, was ${name} für ${fuer} bereithält.`
              : `Hier sehen Sie, was ${name} für Sie bereithält.`}{' '}
            Unten finden Sie Übersicht und Termine. Oben rechts unter „Ich“ liegen Rechnungen,
            Dokumente, Einwilligungen und Ihr Konto.
          </p>
          <p className="text-ink mt-3 max-w-prose text-base leading-relaxed">
            Dieser Zugang gilt für: {BEREICHSNAME[zugang.relationship_kind]}.
          </p>
        </>
      ) : null}
      {schritt === 'einwilligungen' ? (
        <>
          <h1 className="text-accent text-h3 mt-2 font-bold">Ihre Einwilligungen</h1>
          <p className="text-ink mt-3 max-w-prose text-base leading-relaxed">
            Sie müssen hier nichts entscheiden. Unter „Ich“ geht es auch später.
          </p>
          <Einwilligungen zugang={zugang} einstieg />
        </>
      ) : null}
      {schritt === 'fertig' ? (
        <>
          <h1 className="text-accent text-h3 mt-2 font-bold">Fertig</h1>
          <p className="text-ink mt-3 max-w-prose text-base leading-relaxed">
            Sie finden alles in der Übersicht. Wenn Sie Fragen haben, wenden Sie sich an die Praxis.
          </p>
        </>
      ) : null}

      {beenden.error ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {beenden.error.message}
        </Statusmeldung>
      ) : null}
      <div className="mt-8 flex flex-col gap-3 sm:flex-row">
        {letzter ? (
          <Button type="button" onClick={() => beenden.mutate()} disabled={beenden.isPending}>
            {beenden.isPending ? 'Einen Moment …' : 'Zur Übersicht'}
          </Button>
        ) : (
          <>
            <Button type="button" onClick={() => setNummer(nummer + 1)}>
              Weiter
            </Button>
            <Button
              type="button"
              variant="quiet"
              onClick={() => beenden.mutate()}
              disabled={beenden.isPending}
            >
              Später
            </Button>
          </>
        )}
      </div>
    </>
  );
}
