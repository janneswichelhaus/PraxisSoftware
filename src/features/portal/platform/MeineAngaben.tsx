import { useQuery } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Disclosure } from '@/components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Punktbild } from '@/components/ui/Punktbild';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { Verlaufstabelle } from '@/components/ui/Verlaufstabelle';
import { wertText } from '@/lib/erfassungsgroessen';
import { bildreihen } from '@/lib/verlaufsbild';
import { checkinsSchluessel, ladeCheckins, type Plattformzugang } from './api';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';

/**
 * Die eigenen Angaben je Frage über die Zeit (ANN-356, ANN-367): Jede Antwort steht da, nichts
 * geglättet oder eingeordnet (ADR-006 Punkt 11); Ereignisse der Praxis stehen hier nicht.
 */
export function MeineAngaben({ zugang }: { zugang: Plattformzugang }) {
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: checkinsSchluessel(zugang.access_id),
    queryFn: () => ladeCheckins(zugang.access_id),
  });
  const vermerk = (art: string) => (art === 'legal_representative' ? 'Vertretung' : null);
  const leer = !data || (data.history.length === 0 && data.session_history.length === 0);
  return (
    <>
      <Rueckweg
        standard={`${PLATTFORM_PFAD}/ich${bereich ? `?${bereich}` : ''}`}
        beschriftung="Ich"
      />
      <PageHeader
        title="Meine Angaben"
        description="Ihre Antworten über die Zeit. Jeder Punkt ist eine Antwort von Ihnen."
      />
      {isPending ? (
        <LoadingState label="Ihre Angaben werden geladen …" inKarte />
      ) : isError ? (
        <ErrorState
          title="Ihre Angaben konnten nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => void refetch()}
        />
      ) : leer ? (
        <EmptyState inKarte title="Noch keine Angaben." />
      ) : (
        <>
          {/* Steht immer gleich da, unabhängig von den Werten (ADR-006 Punkt 11). */}
          <p className="text-ink-muted max-w-prose text-base">
            Werte schwanken von Tag zu Tag. Was sie für Sie bedeuten, besprechen Sie mit Ihrer
            Praxis.
          </p>
          {data.history.length > 0 ? (
            <Section titel="Aus dem Check-in">
              <EigeneBilder
                erfassungen={data.history.map((c) => ({ datum: c.answered_on, werte: c.values }))}
              />
              <Disclosure summary="Alle Antworten als Tabelle">
                <Verlaufstabelle
                  titel="Meine Angaben aus dem Check-in"
                  spalten={data.history.map((c, i) => ({
                    id: `${c.answered_on}-${i}`,
                    datum: c.answered_on,
                    vermerk: vermerk(c.recorded_by_kind),
                    werte: c.values,
                  }))}
                />
                <p className="text-ink-muted mt-2 text-sm">Ein Strich heißt: nicht angegeben.</p>
              </Disclosure>
            </Section>
          ) : null}
          {data.session_history.length > 0 ? (
            <Section titel="Nach den Übungen">
              <EigeneBilder
                erfassungen={data.session_history.map((e) => ({
                  datum: e.performed_on,
                  werte: e.values,
                }))}
              />
              <Disclosure summary="Alle Antworten als Tabelle">
                <Verlaufstabelle
                  titel="Meine Angaben nach den Übungen"
                  spalten={data.session_history.map((e, i) => ({
                    id: `${e.performed_on}-${i}`,
                    datum: e.performed_on,
                    vermerk: [e.plan_title, vermerk(e.recorded_by_kind)]
                      .filter(Boolean)
                      .join(' · '),
                    werte: e.values,
                  }))}
                />
              </Disclosure>
            </Section>
          ) : null}
        </>
      )}
    </>
  );
}

/** Je Frage ein Punktbild in den Worten der Frage und mit den Enden der Skala (ANN-367). */
function EigeneBilder({
  erfassungen,
}: {
  erfassungen: readonly { datum: string; werte: Record<string, number> }[];
}) {
  const reihen = bildreihen(erfassungen);
  const achse = erfassungen.map((e) => e.datum);
  return (
    <div className="grid gap-6 md:grid-cols-2">
      {reihen.map((reihe) => (
        <Punktbild
          key={reihe.groesse.key}
          beschriftung={
            <>
              {reihe.groesse.frage}
              {reihe.groesse.enden ? (
                <span className="text-ink-muted block font-normal">
                  {reihe.groesse.min} heißt „{reihe.groesse.enden[0]}“, {reihe.groesse.max} heißt „
                  {reihe.groesse.enden[1]}“
                </span>
              ) : null}
            </>
          }
          skala={{ min: reihe.groesse.min, max: reihe.groesse.max }}
          punkte={reihe.punkte}
          wertText={(w) => wertText(reihe.groesse, w)}
          zeitraumDaten={achse}
        />
      ))}
    </div>
  );
}
