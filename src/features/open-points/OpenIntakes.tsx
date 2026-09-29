import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Section } from '@/components/ui/Section';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  OPEN_INTAKES_KEY,
  fetchOpenIntakes,
  intakeItemLabels,
  intakeItemTarget,
} from './intake-api';

/**
 * „Erstaufnahme offen" (PRX-013): Personen in Versorgung, bei denen einer der
 * fünf Punkte fehlt. Jeder Punkt führt in den Bereich der Akte, in dem er
 * erledigt wird - und verschwindet von allein, sobald er dort steht.
 */
export function OpenIntakes() {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: OPEN_INTAKES_KEY,
    queryFn: fetchOpenIntakes,
    retry: false,
  });

  return (
    <Section
      titel={data && data.length > 0 ? `Erstaufnahme offen (${data.length})` : 'Erstaufnahme offen'}
      hinweis="Verordnungsfoto, Anamnesebogen, Datenschutz und Vertrag, Befund und Liege – bis alles in der Akte steht."
    >
      {isPending ? <LoadingState label="Erstaufnahmen werden geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die offenen Erstaufnahmen konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => refetch()}
        />
      ) : null}
      {data && data.length === 0 ? (
        <p className="text-ink-muted text-sm">
          Bei allen in Versorgung ist die Erstaufnahme vollständig.
        </p>
      ) : null}
      {data && data.length > 0 ? (
        <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
          {data.map((eintrag) => (
            <li key={eintrag.patient_id} className="py-3">
              <p className="text-ink text-liste font-medium wrap-anywhere">
                <Link
                  to={mitRueckweg(`/patienten/${eintrag.patient_id}`, '/offen')}
                  className="hover:underline"
                >
                  {eintrag.patient_family_name}, {eintrag.patient_given_name}
                </Link>
              </p>
              <p className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-sm">
                <span className="text-ink-muted">Offen:</span>
                {eintrag.open_items.map((item) => (
                  <Link
                    key={item}
                    to={mitRueckweg(intakeItemTarget(eintrag.patient_id, item), '/offen')}
                    className="text-accent inline-flex min-h-11 items-center hover:underline sm:min-h-0"
                  >
                    {intakeItemLabels[item]}
                  </Link>
                ))}
              </p>
            </li>
          ))}
        </ul>
      ) : null}
    </Section>
  );
}
