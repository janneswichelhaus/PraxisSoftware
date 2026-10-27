import { useQuery } from '@tanstack/react-query';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { Badge } from '@/components/ui/Badge';
import { ListRow } from '@/components/ui/ListRow';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
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
 * Trainingskund:innen. Welle B: ein `Listenabschnitt`.
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
  const abfrage = useQuery({
    queryKey: FAELLIG_SCHLUESSEL,
    queryFn: fetchFaellige,
    retry: false,
  });
  const { data, isError } = abfrage;
  const plaene = (data?.plans ?? []).filter((p) => bereiche.includes(p.service_area));

  if (nurWennVorhanden && plaene.length === 0 && !isError) return null;

  if (!data) {
    return (
      <Section titel="Pläne laufen aus">
        {isError && nurWennVorhanden ? (
          // Als Gast eine Zeile, kein zweiter „Erneut versuchen“: Den Weg
          // hinaus bietet die Seite, auf der die Liste steht.
          <Statusmeldung ton="fehler">
            Die auslaufenden Pläne konnten nicht geladen werden.
          </Statusmeldung>
        ) : (
          <Abfragezustand
            abfrage={abfrage}
            laden="Pläne werden geladen …"
            fehler="Die auslaufenden Pläne konnten nicht geladen werden."
            inKarte
          >
            {() => null}
          </Abfragezustand>
        )}
      </Section>
    );
  }

  return (
    <Listenabschnitt
      titel="Pläne laufen aus"
      {...(plaene.length > 0 ? { anzahl: plaene.length } : {})}
      leer={{ titel: 'Kein Plan läuft in Kürze aus' }}
    >
      {plaene.map((plan) => (
        <ListRow
          key={plan.id}
          titel={`${plan.family_name}, ${plan.given_name}`}
          meta={`${plan.title} · ${plan.service_area === 'therapy' ? 'Behandlung' : 'Training'} · bis ${formatDate(plan.runs_until)}${plan.follow_up_draft ? ' · neue Fassung im Entwurf' : ''}`}
          status={
            plan.runs_until < data.today ? (
              <Badge ton="warnung">abgelaufen</Badge>
            ) : (
              <Badge ton="warnung">läuft aus</Badge>
            )
          }
          to={mitRueckweg(planPfad(plan.service_area, plan.relationship_id, plan.id), rueckweg)}
        />
      ))}
    </Listenabschnitt>
  );
}
