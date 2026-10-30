import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams, useSearchParams } from 'react-router-dom';
import { Antwortbalken } from '@/components/ui/Antwortbalken';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Skelett, SkelettBereich } from '@/components/ui/Skelett';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { titelklassen } from '@/components/ui/titelstufe';
import { Verlaufstabelle } from '@/components/ui/Verlaufstabelle';
import {
  ERFASSUNGSGROESSEN,
  ankerSatz,
  erfassungsgroesse,
  type Erfassungsgroesse,
  type Erfassungstakt,
} from '@/lib/erfassungsgroessen';
import { alsBild } from '@/lib/verlaufsbild';
import { checkinsSchluessel, ladeCheckins, type EigeneCheckins, type Plattformzugang } from './api';
import { Angabezeile, Zielzeile } from './Angabezeile';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';
import { datum, fest, tagUndMonat } from './zeit';

/** Steht immer gleich da, unabhängig von den Werten (ADR-006 Punkt 11). */
const SCHWANKEN =
  'Werte schwanken von Tag zu Tag. Was sie für Sie bedeuten, besprechen Sie mit Ihrer Praxis.';

/** Zwischen den Blöcken einer Seite wie zwischen ihren Abschnitten: 40, am Rechner 48. */
const ABSTAND = 'mt-10 [.plattform-schrift[data-rechner]_&]:mt-12';

/** Die Antworten einer Frage, die jüngste zuerst. */
interface Reihe {
  groesse: Erfassungsgroesse;
  antworten: { datum: string; wert: number; vermerk: string | null }[];
}

interface Erfassung {
  datum: string;
  vermerk: string | null;
  werte: Record<string, number>;
}

/**
 * Je Frage mit Zahl eine Reihe, in der Folge des Katalogs (ANN-364, ANN-799): Eine Wortwahl wie die
 * Schmerzart und der Zusammenhang stehen nur in der Tabelle, ihre Zahl ist kein Maß.
 */
function reihen(erfassungen: readonly Erfassung[], takt: Erfassungstakt): Reihe[] {
  const juengsteZuerst = [...erfassungen].sort((a, b) => b.datum.localeCompare(a.datum));
  return ERFASSUNGSGROESSEN.filter((g) => g.takt === takt && alsBild(g))
    .map((groesse) => ({
      groesse,
      antworten: juengsteZuerst
        .filter((e) => e.werte[groesse.key] !== undefined)
        .map((e) => ({ datum: e.datum, wert: e.werte[groesse.key]!, vermerk: e.vermerk })),
    }))
    .filter((reihe) => reihe.antworten.length > 0);
}

function vermerk(art: string): string | null {
  return art === 'legal_representative' ? 'Vertretung' : null;
}

function angabenVon(daten: EigeneCheckins): { checkin: Reihe[]; uebungen: Reihe[] } {
  return {
    checkin: reihen(
      daten.history.map((c) => ({
        datum: c.answered_on,
        vermerk: vermerk(c.recorded_by_kind),
        werte: c.values,
      })),
      'checkin',
    ),
    uebungen: reihen(
      daten.session_history.map((e) => ({
        datum: e.performed_on,
        vermerk: [e.plan_title, vermerk(e.recorded_by_kind)].filter(Boolean).join(' · ') || null,
        werte: e.values,
      })),
      'session',
    ),
  };
}

/** „von 10“ bei einer Skala, sonst die Einheit der Frage. */
function einheitText(g: Erfassungsgroesse): string {
  return g.enden ? `von ${g.max}` : (g.einheit ?? '');
}

/** Pfade der Plattform mit dem gewählten Bereich (D6). */
function usePfad(): (pfad: string) => string {
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  return (pfad) => `${PLATTFORM_PFAD}${pfad}${bereich ? `?${bereich}` : ''}`;
}

/**
 * „Meine Angaben“ (ANN-356, ANN-367): je Frage eine Zeile mit dem letzten Wert und seinem
 * Tag, dahinter die Seite der Frage mit jeder Antwort. Nichts geglättet oder eingeordnet (ADR-006
 * Punkt 11); Ereignisse der Praxis stehen hier nicht. Der Rückweg folgt der Herkunft, sonst „Ich“.
 */
export function MeineAngaben({ zugang }: { zugang: Plattformzugang }) {
  const pfad = usePfad();
  return (
    <>
      <Rueckweg standard={pfad('/ich')} beschriftung="Ich" />
      <PageHeader title="Meine Angaben" stufe="seite" />
      <MitAngaben zugang={zugang}>
        {(daten) => {
          const { checkin, uebungen } = angabenVon(daten);
          const heute = new Date(`${daten.today}T12:00:00`);
          const zeilen = (reihe: readonly Reihe[]) => (
            <ul className="border-line border-t">
              {reihe.map(({ groesse: g, antworten }) => (
                <Angabezeile
                  key={g.key}
                  to={pfad(`/angaben/${g.key}`)}
                  kurz={g.kurz}
                  wert={String(antworten[0]!.wert)}
                  einheit={einheitText(g)}
                  tag={fest(tagUndMonat(antworten[0]!.datum, heute))}
                />
              ))}
            </ul>
          );
          return (
            <>
              <p className="text-ink-muted mt-3 max-w-prose">{SCHWANKEN}</p>
              {checkin.length > 0 ? (
                <Section titel="Aus dem Check-in">{zeilen(checkin)}</Section>
              ) : null}
              {uebungen.length > 0 ? (
                <Section titel="Nach den Übungen">{zeilen(uebungen)}</Section>
              ) : null}
              <div className={ABSTAND}>
                <Zielzeile to={pfad('/angaben/tabelle')}>Alle Antworten als Tabelle</Zielzeile>
              </div>
            </>
          );
        }}
      </MitAngaben>
    </>
  );
}

/**
 * Die Seite einer Frage (`/p/angaben/{schlüssel}`): Frage und Enden der Skala in den Worten des
 * Check-ins, darunter jede Antwort als Zeile mit Balken und Zahl, die jüngste oben. Einen
 * Schlüssel ohne Antwort (ein alter Link) gibt es hier nicht.
 */
export function AngabeSeite({ zugang }: { zugang: Plattformzugang }) {
  const pfad = usePfad();
  const { schluessel = '' } = useParams();
  const katalog = erfassungsgroesse(schluessel);
  const groesse = katalog && alsBild(katalog) ? katalog : undefined;
  return (
    <>
      <Rueckweg standard={pfad('/angaben')} beschriftung="Meine Angaben" />
      {groesse ? (
        <MitAngaben
          zugang={zugang}
          kopf={<Fragekopf groesse={groesse} />}
          leer={<Unbekannt pfad={pfad} />}
        >
          {(daten) => {
            const { checkin, uebungen } = angabenVon(daten);
            const reihe = [...checkin, ...uebungen].find((r) => r.groesse.key === groesse.key);
            if (!reihe) return <Unbekannt pfad={pfad} />;
            return (
              <>
                <Fragekopf groesse={groesse} />
                <Section titel="Ihre Angaben">
                  <Antwortbalken
                    beschriftung={`Ihre Angaben zu ${groesse.kurz}`}
                    min={groesse.min}
                    max={groesse.max}
                    antworten={reihe.antworten.map((a) => ({
                      datum: datum(a.datum),
                      wert: a.wert,
                      text: String(a.wert),
                      einheit: groesse.enden ? undefined : groesse.einheit,
                      vermerk: a.vermerk ?? undefined,
                    }))}
                  />
                </Section>
                <p className="text-ink-muted mt-8 max-w-prose">{SCHWANKEN}</p>
              </>
            );
          }}
        </MitAngaben>
      ) : (
        <Unbekannt pfad={pfad} />
      )}
    </>
  );
}

/**
 * Titel, Frage und bei einer Skala der Satz ihrer Enden. Ein langer Kurzname („Bewegungssicherheit“)
 * trennt unter 23rem an der Silbe wie ein Planname (ANN-707), sonst bräche er mitten im Wort.
 */
function Fragekopf({ groesse }: { groesse: Erfassungsgroesse }) {
  const anker = ankerSatz(groesse);
  return (
    <PageHeader
      title={
        <span className={`${titelklassen('seite', groesse.kurz)} trennen-schmal`}>
          {groesse.kurz}
        </span>
      }
      description={
        <>
          <p className="text-ink mt-2">{groesse.frage}</p>
          {anker ? <p className="mt-3">{anker}</p> : null}
        </>
      }
    />
  );
}

/** Ein alter Link: der Seitentitel der Angaben, darunter der Leerzustand mit Weg. */
function Unbekannt({ pfad }: { pfad: (pfad: string) => string }) {
  return (
    <div className="mt-2">
      <PageHeader title="Meine Angaben" />
      <EmptyState
        markenform
        title="Diese Angabe gibt es hier nicht."
        aktion={
          <ButtonLink to={pfad('/angaben')} variant="secondary">
            Meine Angaben
          </ButtonLink>
        }
      />
    </div>
  );
}

/**
 * Alle Antworten als Tabelle (`/p/angaben/tabelle`): je Frage eine Zeile, je Antwort eine
 * Spalte, die jüngste links; die Tabelle rollt in sich, nicht die Seite.
 */
export function AlleAntworten({ zugang }: { zugang: Plattformzugang }) {
  const pfad = usePfad();
  return (
    <>
      <Rueckweg standard={pfad('/angaben')} beschriftung="Meine Angaben" />
      <PageHeader title="Alle Antworten" stufe="seite" />
      <MitAngaben zugang={zugang}>
        {(daten) => (
          <>
            {daten.history.length > 0 ? (
              <Section titel="Aus dem Check-in">
                <Verlaufstabelle
                  titel="Meine Angaben aus dem Check-in"
                  spalten={daten.history.map((c, i) => ({
                    id: `${c.answered_on}-${i}`,
                    datum: c.answered_on,
                    vermerk: vermerk(c.recorded_by_kind),
                    werte: c.values,
                  }))}
                />
                <Strich />
              </Section>
            ) : null}
            {daten.session_history.length > 0 ? (
              <Section titel="Nach den Übungen">
                <Verlaufstabelle
                  titel="Meine Angaben nach den Übungen"
                  spalten={daten.session_history.map((e, i) => ({
                    id: `${e.performed_on}-${i}`,
                    datum: e.performed_on,
                    vermerk: [e.plan_title, vermerk(e.recorded_by_kind)]
                      .filter(Boolean)
                      .join(' · '),
                    werte: e.values,
                  }))}
                />
                <Strich />
              </Section>
            ) : null}
          </>
        )}
      </MitAngaben>
    </>
  );
}

function Strich() {
  return <p className="text-ink-muted mt-3">Ein Strich heißt: nicht angegeben.</p>;
}

/**
 * Die eigenen Angaben laden: solange als Skelett aus vier Zeilen, bei einem Fehler mit „Erneut
 * versuchen“, ohne Antwort der Leerzustand; sonst die Seite. `kopf` steht schon beim Laden.
 */
function MitAngaben({
  zugang,
  kopf,
  leer,
  children,
}: {
  zugang: Plattformzugang;
  kopf?: ReactNode;
  leer?: ReactNode;
  children: (daten: EigeneCheckins) => ReactNode;
}) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: checkinsSchluessel(zugang.access_id),
    queryFn: () => ladeCheckins(zugang.access_id),
  });
  if (isPending) {
    return (
      <>
        {kopf}
        <SkelettBereich beschriftung="Ihre Angaben werden geladen" className="mt-6">
          <span className="border-line block border-t">
            {[0, 1, 2, 3].map((zeile) => (
              <span
                key={zeile}
                className="border-line flex min-h-18 items-center justify-between gap-4 border-b"
              >
                <span className="flex grow flex-col gap-2">
                  <Skelett form="zeile" className="w-[55%]" />
                  <Skelett form="zeile" className="w-[40%]" />
                </span>
                <Skelett form="titel" className="w-16" />
              </span>
            ))}
          </span>
        </SkelettBereich>
      </>
    );
  }
  if (isError) {
    return (
      <>
        {kopf}
        <div className="mt-6">
          <ErrorState
            title="Ihre Angaben konnten nicht geladen werden."
            description={VERBINDUNG_PRUEFEN}
            onErneut={() => refetch()}
          />
        </div>
      </>
    );
  }
  if (!data || (data.history.length === 0 && data.session_history.length === 0)) {
    return (
      leer ?? (
        <div className="mt-8">
          <EmptyState
            markenform
            title="Noch keine Angaben"
            description="Ihre Antworten aus dem Check-in und nach den Übungen stehen hier, sobald Sie welche gesendet haben."
          />
        </div>
      )
    );
  }
  return <>{children(data)}</>;
}
