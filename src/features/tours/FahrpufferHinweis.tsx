import { Link } from 'react-router-dom';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { formatLocalTime } from '@/features/appointments/api';
import { useFahrten, useTagesstopps } from './fahrpuffer';

/**
 * Fahrpuffer im Kalender (MAP-006c, §8.1, ANN-097).
 *
 * Steht in der Tagesansicht mit Personenfilter — dort, wo Person und Tag
 * feststehen. `stand` ändert sich mit jeder Verschiebung im Kalender, und mit
 * ihm werden Stopps, Route und Prüfung neu abgerufen: Die Auswirkung einer
 * Terminänderung ist sofort sichtbar (§9). **Eine Warnung, keine Sperre.**
 * Ohne Route (Kartendienst nicht eingerichtet oder gestört) sagt der Hinweis
 * nichts Falsches: Er schweigt nicht still „alles passt", sondern nennt den
 * Übergang als ungeprüft.
 */
export function FahrpufferHinweis({
  datum,
  staffMemberId,
  zeitzone,
  stand,
}: {
  readonly datum: string;
  readonly staffMemberId: string;
  readonly zeitzone: string;
  readonly stand: string;
}) {
  const { stopps } = useTagesstopps(datum, staffMemberId, stand);
  const { route, zwischen } = useFahrten(null, stopps);

  if (stopps.length < 2) return null;
  if (route.isFetching && route.data === undefined) return null;

  const knapp = zwischen.flatMap((z, i) =>
    z.pruefung && z.pruefung.shortfall_minutes > 0 ? [{ i, pruefung: z.pruefung }] : [],
  );
  const ungeprueft = zwischen.filter((z) => z.sekunden === null).length;
  const zurTour = (
    <Link
      to={`/touren?person=${staffMemberId}&tag=${datum}`}
      className="text-accent hover:text-accent-hover font-medium underline"
    >
      Zur Tour
    </Link>
  );

  if (knapp.length > 0) {
    return (
      <div className="border-warnung bg-warnung-soft rounded-card mt-3 border px-4 py-3">
        <Statusmeldung ton="warnung" className="font-medium">
          Fahrpuffer: {knapp.length === 1 ? 'ein Übergang ist' : `${knapp.length} Übergänge sind`}{' '}
          zu knapp.
        </Statusmeldung>
        <ul className="text-warnung mt-1 text-sm">
          {knapp.map(({ i, pruefung }) => (
            <li key={pruefung.from_appointment_id}>
              {formatLocalTime(stopps[i]!.termin.ends_at, zeitzone)} →{' '}
              {formatLocalTime(stopps[i + 1]!.termin.starts_at, zeitzone)}:{' '}
              {pruefung.shortfall_minutes} Min. zu wenig, frühester Beginn{' '}
              {formatLocalTime(pruefung.earliest_start, zeitzone)} Uhr
            </li>
          ))}
        </ul>
        <p className="mt-1 text-sm">Ein Hinweis, keine Sperre. {zurTour}</p>
      </div>
    );
  }

  if (ungeprueft > 0) {
    return (
      <Statusmeldung className="mt-3">
        Fahrpuffer: {ungeprueft === 1 ? 'ein Übergang' : `${ungeprueft} Übergänge`} ohne Fahrzeit
        und deshalb nicht geprüft. {zurTour}
      </Statusmeldung>
    );
  }

  return (
    <Statusmeldung className="mt-3">
      Fahrpuffer geprüft: Jeder Besuch ist rechtzeitig erreichbar. {zurTour}
    </Statusmeldung>
  );
}
