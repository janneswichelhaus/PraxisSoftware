import { useQuery } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { Section } from '@/components/ui/Section';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import { FAELLIG_SCHLUESSEL, fetchFaellige, planPfad, type Bereich } from './api';

/**
 * „Pläne laufen aus" (UEB-007, IDEA-ORG-006): zugewiesene Pläne, deren Ende
 * in höchstens sieben Tagen liegt oder schon vorbei ist - bis jemand
 * verlängert, eine neue Fassung zuweist oder beendet (ANN-302).
 *
 * Nur das Datum zählt; die Liste sagt „läuft aus", nie „anpassen" (ADR-006
 * Punkt 11). Sie erscheint unter „Offene Punkte" und - für die
 * Trainingsbetreuung, die „Offene Punkte" nicht öffnet - über der Liste der
 * Trainingskund:innen.
 */
export function PlanWiedervorlage({
  bereiche,
  rueckweg,
  nurWennVorhanden = false,
}: {
  /** Die Bereiche, deren Pläne die Person schreibt. */
  bereiche: readonly Bereich[];
  rueckweg: string;
  /** Ohne Eintrag nichts anzeigen - für Seiten, auf denen die Liste Gast ist. */
  nurWennVorhanden?: boolean;
}) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: FAELLIG_SCHLUESSEL,
    queryFn: fetchFaellige,
    retry: false,
  });
  const plaene = (data?.plans ?? []).filter((p) => bereiche.includes(p.service_area));

  if (nurWennVorhanden && plaene.length === 0 && !isError) return null;

  return (
    <Section
      titel={plaene.length > 0 ? `Pläne laufen aus (${plaene.length})` : 'Pläne laufen aus'}
      hinweis="Verlängern, als neue Fassung ändern oder beenden – der Plan bleibt hier, bis entschieden ist."
    >
      {isPending ? <LoadingState label="Pläne werden geladen …" /> : null}
      {isError ? (
        <ErrorState
          title="Die auslaufenden Pläne konnten nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => refetch()}
        />
      ) : null}
      {data && plaene.length === 0 ? (
        <p className="text-ink-muted text-sm">Kein Plan läuft in Kürze aus.</p>
      ) : null}
      {plaene.length > 0 ? (
        <ListRows>
          {plaene.map((plan) => (
            <ListRow
              key={plan.id}
              titel={`${plan.family_name}, ${plan.given_name}`}
              meta={`${plan.title} · ${plan.service_area === 'therapy' ? 'Behandlung' : 'Training'} · bis ${formatDate(plan.runs_until)}${plan.follow_up_draft ? ' · neue Fassung im Entwurf' : ''}`}
              status={
                data && plan.runs_until < data.today ? (
                  <Badge ton="warnung">abgelaufen</Badge>
                ) : (
                  <Badge ton="warnung">läuft aus</Badge>
                )
              }
              to={mitRueckweg(planPfad(plan.service_area, plan.relationship_id, plan.id), rueckweg)}
            />
          ))}
        </ListRows>
      ) : null}
    </Section>
  );
}
