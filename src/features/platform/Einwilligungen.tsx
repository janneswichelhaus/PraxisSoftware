import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Section } from '@/components/ui/Section';
import {
  einwilligungSchreiben,
  einwilligungenSchluessel,
  ladeEinwilligungen,
  type Einwilligung,
  type Plattformzugang,
} from './api';
import {
  EINWILLIGUNGSFASSUNG,
  EINWILLIGUNGSTEXTE,
  FREIWILLIG,
  OHNE_NACHTEIL,
} from './einwilligungstexte';
import { PLATTFORM_PFAD } from './pfade';
import { datum } from './zeit';

/**
 * „Ich → Einwilligungen" (POR-016, POR-017; DSN-001 4.1; ADR-023 Punkt 13).
 *
 * Je Zweck der Text, der Stand in Worten (nie nur als Farbe, DSN-001
 * Abschnitt 7) und genau eine Handlung: einwilligen oder widerrufen. Beides
 * geht über eine Rückfrage - eine Einwilligung zu Gesundheitsdaten muss
 * ausdrücklich sein (Art. 9 Abs. 2 lit. a DSGVO), und ein Widerruf der Fotos
 * löscht sofort.
 *
 * Wer hier entscheiden darf, sagt der Server: die Person selbst und ihre
 * rechtliche Vertretung, nie eine Begleitung. Nach der Lesefrist bleibt der
 * Person nur das Widerrufen (D2, ANN-261).
 */
export function Einwilligungen({
  zugang,
  einstieg = false,
}: {
  zugang: Plattformzugang;
  /** Im Einstieg (POR-019) ohne Rückweg zu „Ich" und ohne eigene Überschrift. */
  einstieg?: boolean;
}) {
  const einwilligungen = useQuery({
    queryKey: einwilligungenSchluessel(zugang.access_id),
    queryFn: () => ladeEinwilligungen(zugang.access_id),
  });
  const fuer = zugang.access_kind === 'legal_representative' ? zugang.represented_name : null;

  return (
    <>
      {einstieg ? null : (
        <>
          <Link
            to={`${PLATTFORM_PFAD}/ich`}
            className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
          >
            ← Zu „Ich“
          </Link>
          <h1 className="text-accent text-h3 font-bold">Einwilligungen</h1>
        </>
      )}
      <p className="text-ink mt-2 max-w-prose text-base leading-relaxed">
        {fuer ? `Sie entscheiden hier für ${fuer}. ` : ''}
        Für manches braucht die Praxis Ihr ausdrückliches Ja.{' '}
        {OHNE_NACHTEIL[zugang.relationship_kind]}
      </p>
      {einwilligungen.isPending ? (
        <LoadingState label="Ihre Einwilligungen werden geladen …" />
      ) : einwilligungen.data === undefined ? (
        <ErrorState
          title="Ihre Einwilligungen konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => einwilligungen.refetch()}
        />
      ) : einwilligungen.data.length === 0 ? (
        <p className="text-ink mt-4 max-w-prose text-base leading-relaxed">
          Über Einwilligungen entscheiden die Person selbst oder ihre rechtliche Vertretung.
        </p>
      ) : (
        <div className="mt-6">
          {einwilligungen.data.map((e) => (
            <Zweck key={e.purpose} zugang={zugang} einwilligung={e} />
          ))}
          <p className="text-ink-muted mt-6 max-w-prose text-sm leading-relaxed">{FREIWILLIG}</p>
        </div>
      )}
    </>
  );
}

/** Der Stand in Worten, mit Datum und Herkunft (DSN-001 Abschnitt 7 Punkt 3). */
function standText(e: Einwilligung): string {
  const am = e.occurred_on ? ` am ${datum(e.occurred_on)}` : '';
  const praxis = e.source === 'practice' ? ' (in der Praxis vermerkt)' : '';
  switch (e.state) {
    case 'granted':
      return `✓ Erteilt${am}${praxis}`;
    case 'withdrawn':
      return `Widerrufen${am}${praxis}`;
    case 'refused':
      return `Abgelehnt${am}${praxis}`;
    default:
      return 'Noch nicht entschieden';
  }
}

function Zweck({
  zugang,
  einwilligung: e,
}: {
  zugang: Plattformzugang;
  einwilligung: Einwilligung;
}) {
  const queryClient = useQueryClient();
  const text = EINWILLIGUNGSTEXTE[e.purpose];
  const erteilt = e.state === 'granted';
  const schreiben = useMutation({
    mutationFn: () =>
      einwilligungSchreiben({
        zugangId: zugang.access_id,
        zweck: e.purpose,
        erteilen: !erteilt,
        fassung: EINWILLIGUNGSFASSUNG,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: einwilligungenSchluessel(zugang.access_id) }),
  });

  return (
    <Section titel={text.titel} rahmen>
      <p className="text-ink max-w-prose text-base leading-relaxed">{text.text}</p>
      <p className="text-ink mt-3 text-base font-medium">{standText(e)}</p>
      <div className="mt-3">
        {erteilt ? (
          <Rueckfrage
            ausloeser="Widerrufen"
            bezeichnung={`${text.titel}: widerrufen`}
            bestaetigen="Ja, widerrufen"
            bestaetigenLaeuft="Wird widerrufen …"
            fehler={schreiben.error?.message}
            onBestaetigen={() => schreiben.mutateAsync()}
          >
            <p>
              Ab jetzt gilt Ihre Einwilligung nicht mehr.
              {text.widerruf ? ` ${text.widerruf}` : ''}
            </p>
          </Rueckfrage>
        ) : e.can_grant ? (
          <Rueckfrage
            ausloeser="Einwilligen"
            bezeichnung={`${text.titel}: einwilligen`}
            bestaetigen="Ja, ich willige ein"
            bestaetigenLaeuft="Wird gespeichert …"
            fehler={schreiben.error?.message}
            onBestaetigen={() => schreiben.mutateAsync()}
          >
            <p>Sie willigen in das ein, was oben steht. Widerrufen können Sie jederzeit hier.</p>
          </Rueckfrage>
        ) : (
          <p className="text-ink-muted text-sm">
            Ihr Zugang ist beendet. Widerrufen können Sie hier weiter, einwilligen nicht mehr.
          </p>
        )}
      </div>
    </Section>
  );
}
