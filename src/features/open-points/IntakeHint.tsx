import { useQuery } from '@tanstack/react-query';
import { Link, useLocation } from 'react-router-dom';
import { canReadPatientDirectory, type CurrentUser } from '@/features/session/types';
import { mitRueckweg } from '@/lib/rueckweg';
import { fetchIntakeChecklist, intakeItemLabels, intakeItemTarget } from './intake-api';

/**
 * Erstaufnahme im Aktenkopf (PRX-013): eine Zeile, nur solange etwas offen ist
 * und nur für Personen in Versorgung. Jeder Punkt führt dorthin, wo er
 * erledigt wird.
 */
export function IntakeHint({
  patientId,
  aktiv,
  user,
}: {
  patientId: string;
  aktiv: boolean;
  user: CurrentUser;
}) {
  const ort = useLocation();
  const darf = canReadPatientDirectory(user.roles) && aktiv;
  const { data } = useQuery({
    queryKey: ['open-points', 'intake', patientId],
    queryFn: () => fetchIntakeChecklist(patientId),
    enabled: darf,
    retry: false,
  });

  const offen = (data ?? []).filter((punkt) => punkt.state === 'open');
  if (!darf || offen.length === 0) return null;
  const hier = `${ort.pathname}${ort.search}`;

  return (
    <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
      <span className="text-ink-muted font-medium">Erstaufnahme offen:</span>
      {offen.map((punkt) => (
        <Link
          key={punkt.item}
          to={mitRueckweg(intakeItemTarget(patientId, punkt.item), hier)}
          className="text-accent hover:underline"
        >
          {intakeItemLabels[punkt.item]}
        </Link>
      ))}
    </p>
  );
}
