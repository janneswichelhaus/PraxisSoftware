import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Angabefeld } from '@/components/ui/Angabefeld';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Formularfuss } from '@/components/ui/Formularfuss';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { VERBINDUNG_PRUEFEN } from '@/components/ui/abfrageTexte';
import { formatDate } from '@/lib/datum';
import { angabeGueltig, erfassungsgroesse, nurFragen } from '@/lib/erfassungsgroessen';
import {
  checkinsSchluessel,
  checkinAbsenden,
  ladeCheckins,
  type EigeneCheckins,
  type Plattformzugang,
} from './api';
import { leserIn } from './checkintexte';
import { NICHT_AKUT } from './nachrichtentexte';
import { Notfallsatz } from './Notfallsatz';
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
      <Rueckweg standard={zurueck} beschriftung="Zur Übersicht" />
      <PageHeader title="Check-in" />
      {isPending ? (
        <LoadingState label="Ihr Check-in wird geladen …" inKarte />
      ) : isError ? (
        <ErrorState
          title="Ihr Check-in konnte nicht geladen werden."
          description={VERBINDUNG_PRUEFEN}
          onErneut={() => void refetch()}
        />
      ) : data?.can_answer && data.schedule ? (
        <Formular zugang={zugang} daten={data} zurueck={zurueck} />
      ) : (
        <EmptyState inKarte title={warumNicht(zugang, data ?? null)} />
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
  const zusammenhang = fragen.filter((g) => g.rolle === 'kontext' && g.gruppe !== 'Aktivität');
  // ALT-002: die Belastung außerhalb der Übungen unter eigener Überschrift (ANN-369).
  const aktivitaet = fragen.filter((g) => g.rolle === 'kontext' && g.gruppe === 'Aktivität');
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
        <Section titel="Zum Zusammenhang">
          <div className="flex flex-col gap-6">{zusammenhang.map(feld)}</div>
        </Section>
      ) : null}
      {aktivitaet.length > 0 ? (
        <Section
          titel="Außerhalb der Übungen"
          hinweis="Grob genügt. Es geht nicht um mehr oder weniger, sondern darum, Ihre anderen Angaben richtig zu lesen."
        >
          <div className="flex flex-col gap-6">{aktivitaet.map(feld)}</div>
        </Section>
      ) : null}
      {hinweis ? <Statusmeldung ton="fehler">{hinweis}</Statusmeldung> : null}
      {absenden.isError ? (
        <Statusmeldung ton="fehler">{absenden.error.message}</Statusmeldung>
      ) : null}
      {/* Wer liest und wann, und der Notfallhinweis: vor dem Knopf, nicht
          dahinter (IDEA-TRK-004, ADR-006 Punkt 4). */}
      <Formularfuss
        zusatz={
          <>
            {leserIn(zugang)} sieht Ihre Angaben beim nächsten Termin; sie werden nicht laufend
            gelesen. <strong>{NICHT_AKUT}</strong> <Notfallsatz />
          </>
        }
      >
        <Button type="submit" disabled={absenden.isPending}>
          {absenden.isPending ? 'Wird gesendet …' : 'Absenden'}
        </Button>
        <Button type="button" variant="quiet" onClick={() => void navigate(zurueck)}>
          Abbrechen
        </Button>
      </Formularfuss>
    </form>
  );
}
