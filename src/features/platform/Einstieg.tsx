import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { PageHeader } from '@/components/ui/PageHeader';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { BEREICHSNAME, einstiegBeenden, einstiegSchluessel, type Plattformzugang } from './api';
import { Benachrichtigungen } from './Benachrichtigungen';
import { Einwilligungen } from './Einwilligungen';

/**
 * Der Einstieg nach der ersten Anmeldung (POR-019, DSN-001 4.3,
 * IDEA-LZK-005): Willkommen, Einwilligungen, Benachrichtigungen, fertig. Kurze Schritte,
 * jeder mit einem Hauptknopf; „Später" ist immer sichtbar und beendet den
 * Einstieg ebenso (DSN-001 Abschnitt 7 Punkt 7). Keine Einwilligung ist
 * nötig, um weiterzukommen - der Schritt zeigt sie nur.
 *
 * Die Praxis kann den Einstieg für die Person überspringen; dann erscheint
 * er nicht. Benachrichtigungen schaltet die Person hier oder später unter
 * „Ich" ein (KOM-011, ADR-024 Punkt 15) - auch eine Begleitung, für ihren
 * eigenen Zugang.
 */
type Schritt = 'willkommen' | 'einwilligungen' | 'benachrichtigungen' | 'fertig';

/** Der Titel je Schritt - über `PageHeader`, nicht von Hand (DESIGN.md, Plattform). */
const TITEL: Record<Schritt, string> = {
  willkommen: 'Willkommen',
  einwilligungen: 'Ihre Einwilligungen',
  benachrichtigungen: 'Benachrichtigungen',
  fertig: 'Fertig',
};

export function Einstieg({ zugang, praxis }: { zugang: Plattformzugang; praxis: string }) {
  const queryClient = useQueryClient();
  // Eine Begleitung entscheidet keine Einwilligungen (ADR-023 Punkt 13).
  const schritte: Schritt[] =
    zugang.access_kind === 'companion'
      ? ['willkommen', 'benachrichtigungen', 'fertig']
      : ['willkommen', 'einwilligungen', 'benachrichtigungen', 'fertig'];
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
      <PageHeader kicker={`Schritt ${nummer + 1} von ${schritte.length}`} title={TITEL[schritt]} />
      {schritt === 'willkommen' ? (
        <>
          <p className="text-ink max-w-prose text-base leading-relaxed">
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
          <p className="text-ink max-w-prose text-base leading-relaxed">
            Sie müssen hier nichts entscheiden. Unter „Ich“ geht es auch später.
          </p>
          <Einwilligungen zugang={zugang} einstieg />
        </>
      ) : null}
      {schritt === 'benachrichtigungen' ? (
        <>
          <p className="text-ink max-w-prose text-base leading-relaxed">
            Sie müssen hier nichts einschalten. Alles, was zu tun ist, steht auch in Ihrer
            Übersicht. Unter „Ich“ → „Einstellungen“ geht es auch später.
          </p>
          <Benachrichtigungen zugaenge={[zugang]} einstieg />
        </>
      ) : null}
      {schritt === 'fertig' ? (
        <p className="text-ink max-w-prose text-base leading-relaxed">
          Sie finden alles in der Übersicht. Wenn Sie Fragen haben, wenden Sie sich an die Praxis.
        </p>
      ) : null}

      {beenden.error ? (
        <Statusmeldung ton="fehler" className="mt-4">
          {beenden.error.message}
        </Statusmeldung>
      ) : null}
      <Formularfuss>
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
      </Formularfuss>
    </>
  );
}
