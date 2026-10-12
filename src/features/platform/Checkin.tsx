import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Angabefeld } from '@/components/ui/Angabefeld';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Textlink } from '@/components/ui/Textlink';
import { formatDate } from '@/lib/datum';
import {
  angabeGueltig,
  angabenZeile,
  erfassungsgroesse,
  nurFragen,
} from '@/lib/erfassungsgroessen';
import {
  checkinAbsenden,
  checkinsSchluessel,
  ladeCheckins,
  type EigeneCheckins,
  type Plattformzugang,
} from './api';
import { leserIn } from './checkintexte';
import { NICHT_AKUT, NOTFALL } from './nachrichtentexte';
import { PLATTFORM_PFAD, bereichParameter } from './pfade';

/**
 * Der Check-in (TRK-003, IDEA-TRK-004, DSN-001 4.1): die Fragen, die die
 * Praxis eingestellt hat, je Frage freiwillig, nichts vorausgewählt – die
 * letzte Angabe steht als Hinweis daneben (ANN-349). Keine Punktzahl, kein
 * Lob, keine Einordnung eines Werts (ADR-006 Punkt 11).
 */
export function Checkin({ zugang }: { zugang: Plattformzugang }) {
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const zurueck = `${PLATTFORM_PFAD}${bereich ? `?${bereich}` : ''}`;
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: checkinsSchluessel(zugang.access_id),
    queryFn: () => ladeCheckins(zugang.access_id),
  });

  return (
    <>
      <h1 className="text-accent text-h3 font-bold">Check-in</h1>
      {isPending ? (
        <LoadingState label="Ihr Check-in wird geladen …" />
      ) : isError ? (
        <div className="mt-6">
          <ErrorState
            title="Ihr Check-in konnte nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => void refetch()}
          />
        </div>
      ) : data?.can_answer && data.schedule ? (
        <Formular zugang={zugang} daten={data} zurueck={zurueck} />
      ) : (
        <>
          <p className="text-ink mt-4 max-w-prose text-base leading-relaxed">
            {warumNicht(zugang, data ?? null)}
          </p>
          <Textlink alleinstehend to={zurueck}>
            Zur Übersicht →
          </Textlink>
        </>
      )}
    </>
  );
}

function warumNicht(zugang: Plattformzugang, daten: EigeneCheckins | null): string {
  if (!daten?.schedule) return 'Ihre Praxis hat zurzeit keinen Check-in für Sie eingestellt.';
  if (zugang.access_kind === 'companion')
    return 'Den Check-in beantwortet die Person selbst oder ihre rechtliche Vertretung.';
  if (daten.due && daten.consent_needed)
    return 'Der Check-in fragt nach Ihrer Gesundheit. Dafür braucht es Ihre Einwilligung unter „Ich → Einwilligungen“.';
  if (!daten.due && daten.due_on)
    return `Ihr nächster Check-in ist ab ${formatDate(daten.due_on)} dran.`;
  return 'Ihr Zugang erlaubt das gerade nicht.';
}

function Formular({
  zugang,
  daten,
  zurueck,
}: {
  zugang: Plattformzugang;
  daten: EigeneCheckins;
  zurueck: string;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fragen = (daten.schedule?.parameter_keys ?? [])
    .map((k) => erfassungsgroesse(k))
    .filter((g) => g !== undefined);
  const [werte, setWerte] = useState<Record<string, number | null>>({});
  const hauptfragen = fragen.filter((g) => g.rolle === 'frage');
  const zusammenhang = fragen.filter((g) => g.rolle === 'kontext');
  const feld = (g: (typeof fragen)[number]) => (
    <Angabefeld
      key={g.key}
      groesse={g}
      wert={werte[g.key] ?? null}
      zuletzt={daten.last_values[g.key]}
      onChange={(w) => setWerte((bisher) => ({ ...bisher, [g.key]: w }))}
    />
  );
  const [hinweis, setHinweis] = useState<string | undefined>(undefined);
  const absenden = useMutation({
    mutationFn: (angaben: Record<string, number>) => checkinAbsenden(zugang.access_id, angaben),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: checkinsSchluessel(zugang.access_id) });
      void navigate(`${zurueck}${zurueck.includes('?') ? '&' : '?'}checkin=1`);
    },
  });

  return (
    <form
      noValidate
      className="mt-4 flex flex-col gap-6"
      onSubmit={(e) => {
        e.preventDefault();
        const angaben = Object.fromEntries(
          Object.entries(werte).filter((e): e is [string, number] => e[1] !== null),
        );
        const falsch = fragen.find(
          (g) => angaben[g.key] !== undefined && !angabeGueltig(g, angaben[g.key]!),
        );
        if (falsch) {
          setHinweis(
            `„${falsch.kurz}“: bitte eine ganze Zahl von ${falsch.min} bis ${falsch.max}.`,
          );
          return;
        }
        // Der Zusammenhang allein ist kein Check-in (ANN-355).
        if (nurFragen(Object.keys(angaben)).length === 0) {
          setHinweis('Bitte beantworten Sie mindestens eine Frage.');
          return;
        }
        setHinweis(undefined);
        absenden.mutate(angaben);
      }}
    >
      <p className="text-ink max-w-prose text-base leading-relaxed">
        {hauptfragen.length === 1 ? 'Eine kurze Frage' : `${hauptfragen.length} kurze Fragen`}. Jede
        ist freiwillig – lassen Sie offen, was Sie nicht sicher wissen.
      </p>
      {hauptfragen.map(feld)}
      {/* TRK-005: Angaben zum Zusammenhang (IDEA-TRK-006, ANN-355). */}
      {zusammenhang.length > 0 ? (
        <div className="flex flex-col gap-6">
          <h2 className="text-ink text-base font-semibold">Zum Zusammenhang</h2>
          {zusammenhang.map(feld)}
        </div>
      ) : null}
      <p className="text-ink-muted max-w-prose text-sm">
        {leserIn(zugang)} sieht Ihre Angaben beim nächsten Termin; sie werden nicht laufend gelesen.{' '}
        <strong>{NICHT_AKUT}</strong> {NOTFALL}
      </p>
      {hinweis ? <Statusmeldung ton="fehler">{hinweis}</Statusmeldung> : null}
      {absenden.isError ? (
        <Statusmeldung ton="fehler">{absenden.error.message}</Statusmeldung>
      ) : null}
      <div className="flex flex-col gap-3 sm:flex-row">
        <Button type="submit" disabled={absenden.isPending}>
          {absenden.isPending ? 'Wird gesendet …' : 'Absenden'}
        </Button>
        <Button type="button" variant="quiet" onClick={() => void navigate(zurueck)}>
          Abbrechen
        </Button>
      </div>
    </form>
  );
}

/**
 * „Meine Angaben" (DSN-001 4.1): die eigenen Check-ins als Liste mit Datum,
 * unverändert. Ohne Kurve und ohne Deutung – die Kurve kommt mit dem Verlauf
 * (TRK-EPIC-002, OUT-EPIC-001).
 */
export function MeineAngaben({ zugang }: { zugang: Plattformzugang }) {
  const [suche] = useSearchParams();
  const bereich = bereichParameter(suche);
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: checkinsSchluessel(zugang.access_id),
    queryFn: () => ladeCheckins(zugang.access_id),
  });
  return (
    <>
      <h1 className="text-accent text-h3 font-bold">Meine Angaben</h1>
      <p className="text-ink mt-2 max-w-prose text-base leading-relaxed">
        Ihre Antworten aus dem Check-in, die jüngste zuerst.
      </p>
      {isPending ? (
        <LoadingState label="Ihre Angaben werden geladen …" />
      ) : isError ? (
        <div className="mt-6">
          <ErrorState
            title="Ihre Angaben konnten nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => void refetch()}
          />
        </div>
      ) : !data || data.history.length === 0 ? (
        <p className="text-ink mt-6 text-base">Noch keine Angaben.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {data.history.map((c, i) => (
            <li
              key={`${c.answered_on}-${i}`}
              className="rounded-card border-line bg-surface border p-4 text-base"
            >
              <p className="font-semibold">
                {formatDate(c.answered_on)}
                {c.recorded_by_kind === 'legal_representative' ? ' · von der Vertretung' : ''}
              </p>
              <p className="mt-1">{angabenZeile(c.values)}</p>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6">
        <Textlink alleinstehend to={`${PLATTFORM_PFAD}/ich${bereich ? `?${bereich}` : ''}`}>
          Zurück zu „Ich“ →
        </Textlink>
      </div>
    </>
  );
}
