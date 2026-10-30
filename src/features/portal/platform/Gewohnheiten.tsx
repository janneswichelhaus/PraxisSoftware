import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useIstVerbunden } from '@/app/verbindung';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Skelett, SkelettBereich } from '@/components/ui/Skelett';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { Wochenleiste, type Wochentag } from '@/components/ui/Wochenleiste';
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
import { tagOhneJahr } from './zeit';

const WOCHENTAG = new Intl.DateTimeFormat('de-DE', { weekday: 'short' });

/**
 * Die mit der Praxis vereinbarten Gewohnheiten (ANN-370), je mit den letzten Tagen zum Antippen.
 * KEINE SERIE: keine Zahl in Folge, kein Lob, keine Erinnerung, kein Vergleich (ADR-006 Punkt 11);
 * der Satz über leere Tage steht immer gleich da, pausieren lässt nichts abbrechen.
 */
export function Gewohnheiten({ zugang }: { zugang: Plattformzugang }) {
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const mit = (pfad: string) => `${PLATTFORM_PFAD}${pfad}${bereich ? `?${bereich}` : ''}`;
  const verbunden = useIstVerbunden();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: gewohnheitenSchluessel(zugang.access_id),
    queryFn: () => ladeGewohnheiten(zugang.access_id),
  });
  const laufend = (data?.habits ?? []).filter((g) => g.ended_at === null);
  const begleitung = zugang.access_kind === 'companion';

  return (
    <>
      <Rueckweg standard={mit('')} beschriftung="Übersicht" />
      <PageHeader title="Gewohnheiten" stufe="seite" />
      {isPending ? (
        <SkelettBereich
          beschriftung="Ihre Gewohnheiten werden geladen"
          className="mt-6 flex flex-col gap-2"
        >
          <Skelett form="titel" className="w-[80%]" />
          <Skelett form="zeile" className="w-[45%]" />
          <Skelett form="tage" className="max-w-wochenleiste mt-3" />
        </SkelettBereich>
      ) : isError ? (
        <div className="mt-6">
          <ErrorState
            title="Ihre Gewohnheiten konnten nicht geladen werden."
            description={VERBINDUNG_PRUEFEN}
            onErneut={() => refetch()}
          />
        </div>
      ) : !data || laufend.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            markenform
            title="Zurzeit keine Gewohnheit"
            description="Vereinbaren Sie mit Ihrer Praxis eine kleine Gewohnheit, steht sie hier zum Abhaken."
          />
        </div>
      ) : (
        <>
          {data.consent_needed && !begleitung ? (
            <div className="mt-4 flex flex-col items-start gap-1">
              <Statusmeldung>
                Gewohnheiten gehören zu Ihren Angaben zur Gesundheit. Zum Vermerken braucht es Ihre
                Einwilligung unter „Ich → Einwilligungen“.
              </Statusmeldung>
              <Textlink to={mit('/einwilligungen')} alleinstehend>
                Einwilligungen ansehen
              </Textlink>
            </div>
          ) : !data.can_mark ? (
            <p className="text-ink-muted mt-4 max-w-prose">
              {begleitung
                ? 'Die Tage vermerkt die Person selbst oder ihre rechtliche Vertretung.'
                : 'Ihr Zugang erlaubt gerade kein Vermerken.'}
            </p>
          ) : null}
          <ul className="mt-10 [.plattform-schrift[data-rechner]_&]:mt-12">
            {laufend.map((g) => (
              <Eintrag
                key={g.id}
                zugang={zugang}
                gewohnheit={g}
                daten={data}
                verbunden={verbunden}
              />
            ))}
          </ul>
          {/* Darunter, damit die erste Leiste auch bei „Sehr groß“ über den Reitern steht (ANN-800). */}
          <p className="text-ink-muted mt-8 max-w-prose">
            Tippen Sie die Tage an, an denen Sie es gemacht haben. Ein Tag ohne Haken ist einfach
            ein Tag ohne Haken – es gibt keine Serie, die abreißt.
          </p>
        </>
      )}
    </>
  );
}

/** Kein Vermerk mehr vorläufig für diesen Tag - oder nur, solange er noch `wert` trägt. */
function ohne(tag: string, wert?: boolean) {
  return (alt: ReadonlyMap<string, boolean>): ReadonlyMap<string, boolean> => {
    if (!alt.has(tag) || (wert !== undefined && alt.get(tag) !== wert)) return alt;
    const neu = new Map(alt);
    neu.delete(tag);
    return neu;
  };
}

/** Eine Gewohnheit: Titel, Ort, die Tage oder pausiert als ruhige Zeile (ANN-800). */
function Eintrag({
  zugang,
  gewohnheit,
  daten,
  verbunden,
}: {
  zugang: Plattformzugang;
  gewohnheit: EigeneGewohnheit;
  daten: EigeneGewohnheiten;
  verbunden: boolean;
}) {
  const queryClient = useQueryClient();
  const satzId = useId();
  const titelId = `gewohnheit-${gewohnheit.id}`;
  const [fehler, setFehler] = useState<string | undefined>(undefined);
  // Ein Tipp gilt sofort und fällt bei einem Fehler zurück, wie bei den Übungstagen (ANN-305); bis
  // die Gewohnheiten neu geladen sind, liegt er hier.
  const [vorlaeufig, setVorlaeufig] = useState<ReadonlyMap<string, boolean>>(new Map());
  const neu = () =>
    queryClient.invalidateQueries({ queryKey: gewohnheitenSchluessel(zugang.access_id) });
  const vermerken = useMutation({
    // Der Reihe nach, damit der letzte Tipp auch der letzte Stand am Server ist.
    scope: { id: titelId },
    mutationFn: ({ tag, gemacht }: { tag: string; gemacht: boolean }) =>
      gewohnheitVermerken(zugang.access_id, gewohnheit.id, tag, gemacht),
    onMutate: ({ tag, gemacht }) => {
      setFehler(undefined);
      setVorlaeufig((alt) => new Map(alt).set(tag, gemacht));
    },
    onError: (grund: Error, { tag }) => {
      setFehler(grund.message);
      setVorlaeufig(ohne(tag));
      void neu();
    },
    onSuccess: async (_ergebnis, { tag, gemacht }) => {
      await neu();
      setVorlaeufig(ohne(tag, gemacht));
    },
  });
  const pausieren = useMutation({
    mutationFn: (pausiert: boolean) =>
      gewohnheitPausieren(zugang.access_id, gewohnheit.id, pausiert),
    onMutate: () => setFehler(undefined),
    onError: (grund: Error) => setFehler(grund.message),
    onSettled: neu,
  });

  const vermerkt = new Set(gewohnheit.marks);
  for (const [tag, an] of vorlaeufig) {
    if (an) vermerkt.add(tag);
    else vermerkt.delete(tag);
  }
  // ANN-370: die letzten Tage, ältester zuerst; vor dem Beginn keiner.
  const tage = tagesreihe(daten.today, daten.mark_days, [...vermerkt], gewohnheit.starts_on).filter(
    (t) => !t.vorBeginn,
  );
  const wochentage: Wochentag[] = tage.map((t, nummer) => {
    const mittag = `${t.datum}T12:00:00`;
    return {
      nummer,
      kurz: WOCHENTAG.format(new Date(mittag)).replace(/\.$/, ''),
      lang: `${t.datum === daten.today ? 'heute, ' : ''}${tagOhneJahr(mittag)}`,
      zahl: String(Number(t.datum.slice(8))),
    };
  });
  const heute = tage.findIndex((t) => t.datum === daten.today);
  const vermerkbar = daten.can_mark;
  const ohneNetz = vermerkbar && !verbunden;
  const gesperrt = {
    disabled: pausieren.isPending || !verbunden,
    ...(verbunden ? {} : { 'aria-describedby': satzId }),
  };

  return (
    <li
      aria-labelledby={titelId}
      className={`border-line flex flex-col not-first:pt-10 not-last:border-b not-last:pb-8 [.plattform-schrift[data-rechner]_&]:not-first:pt-12 ${
        gewohnheit.paused ? 'gap-3' : 'gap-4'
      }`}
    >
      <div>
        <Zwischentitel ebene={2} stufe="abschnitt" id={titelId}>
          {/* Die Praxis schreibt den Text frei: unter 23rem an der Silbe wie ein Planname (ANN-707). */}
          <span className="trennen-schmal">
            {gewohnheit.cue}: {gewohnheit.action}
          </span>
        </Zwischentitel>
        <p className="text-ink-muted -mt-1.5">
          {gewohnheit.place ? `${gewohnheit.place} · ` : ''}mit Ihrer Praxis vereinbart
        </p>
      </div>
      {gewohnheit.paused ? (
        <>
          <p className="bg-surface-sunken rounded-card text-ink flex items-start gap-2.5 px-4 py-3">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2.5}
              strokeLinecap="round"
              aria-hidden="true"
              focusable="false"
              className="mt-0.5 size-5.5 shrink-0"
            >
              <path d="M9 6v12M15 6v12" />
            </svg>
            <span>Pausiert. Setzen Sie fort, wenn es wieder geht.</span>
          </p>
          {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}
          {vermerkbar ? (
            <Button
              variant="secondary"
              className="self-start"
              onClick={() => pausieren.mutate(false)}
              {...gesperrt}
            >
              Fortsetzen
            </Button>
          ) : null}
          {ohneNetz ? (
            <p id={satzId} className="text-ink-muted">
              Fortsetzen geht wieder mit Verbindung.
            </p>
          ) : null}
        </>
      ) : (
        <>
          {wochentage.length > 0 ? (
            <Wochenleiste
              beschriftetVon={titelId}
              wochentage={wochentage}
              tage={tage.flatMap((t, nummer) => (t.vermerkt ? [nummer] : []))}
              gesperrt={!vermerkbar || !verbunden}
              onUmschalten={(nummer) => {
                const tag = tage[nummer];
                if (tag) vermerken.mutate({ tag: tag.datum, gemacht: !tag.vermerkt });
              }}
              {...(heute >= 0 ? { heute } : {})}
            />
          ) : null}
          {ohneNetz ? (
            <p id={satzId} className="text-ink-muted">
              Vermerken geht wieder mit Verbindung.
            </p>
          ) : null}
          {fehler ? <Statusmeldung ton="fehler">{fehler}</Statusmeldung> : null}
          {vermerkbar ? (
            // Leise und bündig mit dem Titel, auch umbrochen; unter 23rem bleibt der Rand der Seite 12.
            <Button
              variant="quiet"
              groesse="kompakt"
              className="-ml-4 self-start text-left max-[23rem]:-ml-3"
              onClick={() => pausieren.mutate(true)}
              {...gesperrt}
            >
              Pausieren, etwa bei Krankheit
            </Button>
          ) : null}
        </>
      )}
    </li>
  );
}
