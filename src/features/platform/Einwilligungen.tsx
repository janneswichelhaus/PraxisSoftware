import { einwilligungAngeboten } from '@/lib/einwilligung';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { ListRows } from '@/components/ui/ListRow';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { einwilligungenSchluessel, type Einwilligung, type Plattformzugang } from './api';
import { useNurLesen, usePlattformApi } from './einsicht';
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
  const api = usePlattformApi();
  const einwilligungen = useQuery({
    queryKey: einwilligungenSchluessel(zugang.access_id),
    queryFn: () => api.ladeEinwilligungen(zugang.access_id),
  });
  const fuer = zugang.access_kind === 'legal_representative' ? zugang.represented_name : null;

  return (
    <>
      {einstieg ? null : (
        <>
          <Rueckweg standard={`${PLATTFORM_PFAD}/ich`} beschriftung="Zu „Ich“" />
          <PageHeader title="Einwilligungen" />
        </>
      )}
      {/* Freiwillig und ohne Nachteil - vor jeder Entscheidung (Art. 7 DSGVO). */}
      <p className="text-ink max-w-prose text-base leading-relaxed">
        {fuer ? `Sie entscheiden hier für ${fuer}. ` : ''}
        Für manches braucht die Praxis Ihr ausdrückliches Ja.{' '}
        {OHNE_NACHTEIL[zugang.relationship_kind]}
      </p>
      <div className="mt-6">
        <Abfragezustand
          abfrage={einwilligungen}
          laden="Ihre Einwilligungen werden geladen …"
          fehler="Ihre Einwilligungen konnten nicht geladen werden."
          inKarte
          leer={{
            wenn: (liste) => liste.length === 0,
            titel:
              'Über Einwilligungen entscheiden die Person selbst oder ihre rechtliche Vertretung.',
          }}
        >
          {(liste) => (
            <>
              {/* Je Zweck eine Zeile der Liste mit Text, Stand und genau einer
                  Handlung (DESIGN.md, Regel 3) - keine Karte je Zweck. */}
              <ListRows>
                {liste
                  .filter((e) => einwilligungAngeboten(e.purpose, e.state === 'granted'))
                  .map((e) => (
                    <Zweck key={e.purpose} zugang={zugang} einwilligung={e} />
                  ))}
              </ListRows>
              <Kleingedrucktes className="mt-6">{FREIWILLIG}</Kleingedrucktes>
            </>
          )}
        </Abfragezustand>
      </div>
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
  const api = usePlattformApi();
  const nurLesen = useNurLesen();
  const queryClient = useQueryClient();
  const text = EINWILLIGUNGSTEXTE[e.purpose];
  const erteilt = e.state === 'granted';
  const schreiben = useMutation({
    mutationFn: () =>
      api.einwilligungSchreiben({
        zugangId: zugang.access_id,
        zweck: e.purpose,
        erteilen: !erteilt,
        fassung: EINWILLIGUNGSFASSUNG,
      }),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: einwilligungenSchluessel(zugang.access_id) }),
  });

  return (
    <li className="border-line border-t py-4 first:border-t-0">
      <Zwischentitel>{text.titel}</Zwischentitel>
      <p className="text-ink max-w-prose text-base leading-relaxed">{text.text}</p>
      <p className="text-ink mt-3 text-base font-semibold">{standText(e)}</p>
      {/* E-001: In der Einsicht wird weder eingewilligt noch widerrufen. */}
      {nurLesen ? null : (
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
      )}
    </li>
  );
}
