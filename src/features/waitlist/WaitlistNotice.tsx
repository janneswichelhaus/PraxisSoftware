import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { mitRueckweg } from '@/lib/rueckweg';
import { fetchWaitlist, reasonLabels, windowsText } from './api';

/**
 * Die Warteliste in der Akte (PRX-001): steht die Person darauf, sagt es der
 * Hinweis; sonst ein Weg, sie einzutragen. Eine zweite Eintragung mit
 * derselben Grundlage weist der Server ohnehin ab — der Hinweis erspart den
 * Umweg über die Fehlermeldung.
 */
export function WaitlistNotice({ patientId }: { patientId: string }) {
  const here = `/patienten/${patientId}/termine`;
  const { data } = useQuery({
    queryKey: ['waitlist', 'open', patientId],
    queryFn: () => fetchWaitlist('open', patientId),
    retry: false,
  });

  const add = (
    <Link
      to={mitRueckweg(`/warteliste/neu?patient=${patientId}`, here)}
      className={kartenAktionKlassen('secondary')}
    >
      Auf die Warteliste
    </Link>
  );

  if (!data || data.length === 0) return add;

  return (
    <div className="flex flex-col gap-2">
      {data.map((entry) => (
        <p key={entry.id} role="status" className="text-ink text-sm">
          Steht auf der{' '}
          <Link to="/warteliste" className="text-accent underline underline-offset-2">
            Warteliste
          </Link>
          : {reasonLabels[entry.priority_reason]}, {windowsText(entry.time_windows)}.
        </p>
      ))}
      <div>{add}</div>
    </div>
  );
}
