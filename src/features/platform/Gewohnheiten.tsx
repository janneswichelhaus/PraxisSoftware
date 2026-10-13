import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Zwischentitel } from '@/components/ui/Zwischentitel';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { tagesreihe } from '@/lib/gewohnheiten';
import {
  gewohnheitenSchluessel,
  gewohnheitPausieren,
  gewohnheitVermerken,
  ladeGewohnheiten,
  type EigeneGewohnheit,
  type EigeneGewohnheiten,
  type Plattformzugang,
} from './api';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { tagKurz } from './zeit';

/**
 * Gewohnheiten auf der Plattform (ALT-003, IDEA-ALT-002): die mit der Praxis
 * vereinbarten kleinen Gewohnheiten, je mit den letzten sieben Tagen zum
 * Antippen. Pausieren, wenn man krank ist – nichts bricht ab.
 *
 * KEINE SERIE. Keine Zahl in Folge, kein Lob, keine Erinnerung, kein
 * Vergleich (IDEA-ALT-002 „Vorsicht“, IDEA-ALT-007, ADR-006 Punkt 11). Der
 * Satz über leere Tage steht immer gleich da.
 */
export function Gewohnheiten({ zugang }: { zugang: Plattformzugang }) {
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: gewohnheitenSchluessel(zugang.access_id),
    queryFn: () => ladeGewohnheiten(zugang.access_id),
  });
  const laufend = (data?.habits ?? []).filter((g) => g.ended_at === null);

  return (
    <>
      <Rueckweg
        standard={`${PLATTFORM_PFAD}${bereich ? `?${bereich}` : ''}`}
        beschriftung="Zur Übersicht"
      />
      <PageHeader title="Gewohnheiten" />
      {isPending ? (
        <LoadingState label="Ihre Gewohnheiten werden geladen …" inKarte />
      ) : isError ? (
        <ErrorState
          title="Ihre Gewohnheiten konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => void refetch()}
        />
      ) : laufend.length === 0 ? (
        <EmptyState inKarte title="Mit Ihrer Praxis ist zurzeit keine Gewohnheit vereinbart." />
      ) : (
        <>
          {/* Steht immer gleich da (IDEA-ALT-002 „Vorsicht“, ADR-006 Punkt 11). */}
          <p className="text-ink max-w-prose text-base leading-relaxed">
            Tippen Sie die Tage an, an denen Sie es gemacht haben. Ein Tag ohne Haken ist einfach
            ein Tag ohne Haken – es gibt keine Serie, die abreißt.
          </p>
          {data!.consent_needed && zugang.access_kind !== 'companion' ? (
            <Statusmeldung className="mt-4" ton="neutral">
              Gewohnheiten gehören zu Ihren Angaben zur Gesundheit. Zum Vermerken braucht es Ihre
              Einwilligung unter „Ich → Einwilligungen“.
            </Statusmeldung>
          ) : !data!.can_mark ? (
            <p className="text-ink-muted mt-4 max-w-prose text-base">
              {zugang.access_kind === 'companion'
                ? 'Die Tage vermerkt die Person selbst oder ihre rechtliche Vertretung.'
                : 'Ihr Zugang erlaubt gerade kein Vermerken.'}
            </p>
          ) : null}
          <Section titel="Mit Ihrer Praxis vereinbart">
            <ul className="flex flex-col gap-8">
              {laufend.map((g) => (
                <Eintrag key={g.id} zugang={zugang} gewohnheit={g} daten={data!} />
              ))}
            </ul>
          </Section>
        </>
      )}
    </>
  );
}

function Eintrag({
  zugang,
  gewohnheit,
  daten,
}: {
  zugang: Plattformzugang;
  gewohnheit: EigeneGewohnheit;
  daten: EigeneGewohnheiten;
}) {
  const queryClient = useQueryClient();
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  const neu = async () =>
    queryClient.invalidateQueries({ queryKey: gewohnheitenSchluessel(zugang.access_id) });
  const vermerken = useMutation({
    mutationFn: ({ tag, gemacht }: { tag: string; gemacht: boolean }) =>
      gewohnheitVermerken(zugang.access_id, gewohnheit.id, tag, gemacht),
    onMutate: () => setFehler(undefined),
    onError: (grund: Error) => setFehler(grund.message),
    onSettled: neu,
  });
  const pausieren = useMutation({
    mutationFn: (pausiert: boolean) =>
      gewohnheitPausieren(zugang.access_id, gewohnheit.id, pausiert),
    onMutate: () => setFehler(undefined),
    onError: (grund: Error) => setFehler(grund.message),
    onSettled: neu,
  });
  // ANN-370: die letzten sieben Tage, ältester zuerst; vor dem Beginn nichts.
  const tage = tagesreihe(daten.today, daten.mark_days, gewohnheit.marks, gewohnheit.starts_on);
  const beschaeftigt = vermerken.isPending || pausieren.isPending;
  const titelId = `gewohnheit-${gewohnheit.id}`;

  return (
    <li className="flex flex-col gap-3" aria-labelledby={titelId}>
      <div>
        <Zwischentitel id={titelId}>
          {gewohnheit.cue}: {gewohnheit.action}
        </Zwischentitel>
        {gewohnheit.place ? <p className="text-ink-muted -mt-2">{gewohnheit.place}</p> : null}
      </div>
      {gewohnheit.paused ? (
        <p className="text-ink">Pausiert. Setzen Sie fort, wenn es wieder geht.</p>
      ) : (
        <div
          role="group"
          aria-label={`Tage für „${gewohnheit.action}“`}
          className="flex flex-wrap gap-2"
        >
          {tage.map((t) =>
            t.vorBeginn ? null : (
              // Ein Schalter je Tag (`Chip` mit `gewaehlt`): vermerkt mit Haken auf
              // der Akzentfläche - Zeichen und Wort, nie Farbe allein.
              <Chip
                key={t.datum}
                gewaehlt={t.vermerkt}
                disabled={!daten.can_mark || beschaeftigt}
                onClick={() => vermerken.mutate({ tag: t.datum, gemacht: !t.vermerkt })}
                className="tabular-nums"
              >
                {t.datum === daten.today ? 'heute' : tagKurz(`${t.datum}T12:00:00`)}
              </Chip>
            ),
          )}
        </div>
      )}
      {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}
      {daten.can_mark ? (
        <div>
          <Button
            variant="quiet"
            groesse="kompakt"
            disabled={beschaeftigt}
            onClick={() => pausieren.mutate(!gewohnheit.paused)}
          >
            {gewohnheit.paused ? 'Fortsetzen' : 'Pausieren, etwa bei Krankheit'}
          </Button>
        </div>
      ) : null}
    </li>
  );
}
