import { useQuery } from '@tanstack/react-query';
import { Kleingedrucktes } from '@/components/ui/Kleingedrucktes';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { formatDate } from '@/lib/datum';
import { mitRueckweg } from '@/lib/rueckweg';
import { purposeLabel, type ConsentWithdrawal } from './consent-withdrawals-api';
import { abfragen } from './eingang';

/**
 * „Widerrufen über die Plattform" in Offene Punkte (POR-016, ANN-263): ein
 * Hinweis für 14 Tage, damit kein Bericht und keine Mail mehr auf einer
 * widerrufenen Einwilligung beruht. Ohne Widerruf steht hier nichts - die
 * Liste ist keine Aufgabe, die man abhaken müsste.
 */
export function ConsentWithdrawals() {
  const { data } = useQuery(abfragen.widerrufe());
  if (!data || data.length === 0) return null;
  return (
    <Listenabschnitt
      titel="Widerrufen über die Plattform"
      anzahl={data.length}
      mehr={
        <Kleingedrucktes>
          Ab dem Widerruf gilt die Einwilligung nicht mehr. Die Liste zeigt die letzten 14 Tage.
        </Kleingedrucktes>
      }
    >
      {data.map((w) => (
        <Zeile key={w.id} widerruf={w} />
      ))}
    </Listenabschnitt>
  );
}

function personPfad(w: ConsentWithdrawal): string | null {
  // ERN-002: ein Widerruf der Ernährungsberatung führt in ihren Reiter.
  const ernaehrung = w.purpose === 'nutrition_counselling';
  if (w.relationship_kind === 'treatment' && w.patient_id)
    return `/patienten/${w.patient_id}${ernaehrung ? '/ernaehrung' : ''}`;
  if (w.relationship_kind === 'training' && w.training_relationship_id)
    return `/training/${w.training_relationship_id}${ernaehrung ? '?bereich=ernaehrung' : ''}`;
  return null;
}

function Zeile({ widerruf: w }: { widerruf: ConsentWithdrawal }) {
  const name = [w.family_name, w.given_name].filter(Boolean).join(', ') || 'Unbekannte Person';
  const pfad = personPfad(w);
  const von =
    w.platform_access_kind === 'legal_representative' && w.representative_name
      ? `von ${w.representative_name} (rechtliche Vertretung)`
      : 'von der Person selbst';
  return (
    <ListRow
      titel={name}
      meta={`${purposeLabel(w.purpose)} widerrufen am ${formatDate(w.occurred_on)}, ${von}`}
      {...(pfad ? { to: mitRueckweg(pfad, '/offen') } : {})}
    />
  );
}
