import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { bauartLabels } from '@/features/treatment-bases/api';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import { telHref } from '@/lib/telefon';
import { formatDay } from './format';
import {
  ENDING_KEY,
  IDLE_KEY,
  fetchCareWithoutConclusion,
  fetchEndingPrescriptions,
} from './reminders-api';

/**
 * „Verordnung endet" (PRX-016): Verordnungen ohne Anschluss, deren Termine
 * genutzt oder ganz verplant sind und deren letzter Termin bald ist. Die
 * Liste sagt, ob eine Empfehlung zum Verordnungsende vorliegt - geschrieben
 * wird sie im Therapiebericht, nicht hier (DOK-005). Keine Bewertung: ob es
 * weitergeht, entscheiden Therapeut:in und Verordner:in (§17).
 */
export function EndingPrescriptions({ timeZone }: { timeZone: string }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ENDING_KEY,
    queryFn: fetchEndingPrescriptions,
    retry: false,
  });

  return (
    <Section
      titel={data && data.length > 0 ? `Verordnung endet (${data.length})` : 'Verordnung endet'}
      hinweis="Alle Termine genutzt oder verplant, der letzte in den nächsten zwei Wochen – und noch keine Folgeverordnung."
    >
      {isPending ? <LoadingState label="Verordnungen werden geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die endenden Verordnungen konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => refetch()}
        />
      ) : null}
      {data && data.length === 0 ? (
        <p className="text-ink-muted text-sm">
          Keine Verordnung endet in den nächsten zwei Wochen.
        </p>
      ) : null}
      {data && data.length > 0 ? (
        <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
          {data.map((eintrag) => (
            <li key={eintrag.treatment_basis_id} className="flex flex-col gap-1 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <Link
                  to={mitRueckweg(`/patienten/${eintrag.patient_id}/verordnungen`, '/offen')}
                  className="text-accent text-liste font-medium hover:underline"
                >
                  {eintrag.patient_family_name}, {eintrag.patient_given_name}
                </Link>
                {eintrag.has_recommendation ? (
                  <Badge ton="positiv">Empfehlung liegt vor</Badge>
                ) : (
                  <Badge ton="warnung">Keine Empfehlung</Badge>
                )}
              </div>
              <p className="text-ink-muted text-sm">
                {bauartLabels[eintrag.treatment_basis_kind]} vom {formatDate(eintrag.issued_on)} ·{' '}
                {Math.max(eintrag.used, eintrag.planned)} von {eintrag.prescribed} Terminen
                {eintrag.last_appointment_at
                  ? ` · letzter am ${formatDay(eintrag.last_appointment_at, timeZone)}`
                  : ''}
              </p>
              {eintrag.prescriber_name ? (
                <p className="text-ink-muted text-sm">
                  {eintrag.prescriber_name}
                  {eintrag.prescriber_phone ? (
                    <>
                      {' · '}
                      <a
                        href={telHref(eintrag.prescriber_phone)}
                        className="text-accent tabular-nums hover:underline"
                      >
                        {eintrag.prescriber_phone}
                      </a>
                    </>
                  ) : null}
                </p>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}

/**
 * „Versorgung abschließen?" (PRX-016, IDEA-LZK-009): Akten ohne Abschluss,
 * seit sechs Monaten ohne Termin und ohne kommenden. Ohne Abschluss läuft
 * keine Aufbewahrungsfrist (LOE-001b) - die Liste fragt, entscheiden und
 * abschließen tut die Therapeut:in in den Stammdaten.
 */
export function CareWithoutConclusionList({ timeZone }: { timeZone: string }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: IDLE_KEY,
    queryFn: fetchCareWithoutConclusion,
    retry: false,
  });

  return (
    <Section
      titel={
        data && data.length > 0
          ? `Versorgung abschließen? (${data.length})`
          : 'Versorgung abschließen?'
      }
      hinweis="Seit sechs Monaten kein Termin und keiner geplant. Ist die Behandlung beendet, gehört der Abschluss in die Stammdaten – erst mit ihm läuft die Aufbewahrungsfrist."
    >
      {isPending ? <LoadingState label="Akten werden geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die Akten ohne Abschluss konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => refetch()}
        />
      ) : null}
      {data && data.length === 0 ? (
        <p className="text-ink-muted text-sm">Keine Akte wartet auf die Frage.</p>
      ) : null}
      {data && data.length > 0 ? (
        <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
          {data.map((eintrag) => (
            <li
              key={eintrag.patient_id}
              className="flex flex-wrap items-baseline justify-between gap-2 py-3"
            >
              <Link
                to={mitRueckweg(`/patienten/${eintrag.patient_id}/stammdaten`, '/offen')}
                className="text-accent text-liste font-medium hover:underline"
              >
                {eintrag.patient_family_name}, {eintrag.patient_given_name}
              </Link>
              <span className="text-ink-muted text-sm">
                {eintrag.last_appointment_at
                  ? `Letzter Termin am ${formatDay(eintrag.last_appointment_at, timeZone)}`
                  : `Ohne Termin, angelegt am ${formatDay(eintrag.patient_created_at, timeZone)}`}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
