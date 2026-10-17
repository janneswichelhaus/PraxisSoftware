import { useQuery } from '@tanstack/react-query';
import { Listenabschnitt } from '@/components/ui/Listenabschnitt';
import { ListRow } from '@/components/ui/ListRow';
import { abfragen } from './eingang';

/**
 * Räder, die gesperrt sind oder ein offenes Problem haben - für die, die sie
 * freigeben dürfen (owner, Teamleitung; `can_release`). Dieselbe Abfrage wie
 * die Radflotte; ohne solches Rad steht hier nichts. Steht im Eingang von
 * Organisation und in den Offenen Punkten (ORG-004).
 */
export function RaederMitProblem() {
  const { data } = useQuery(abfragen.raeder());
  if (!data || data.length === 0) return null;
  const raeder = data;
  return (
    <Listenabschnitt titel="Räder mit Problem" anzahl={raeder.length}>
      {raeder.map((rad) => (
        <ListRow
          key={rad.id}
          titel={rad.name}
          meta={
            rad.block
              ? `Gesperrt${rad.block.reason ? ` · ${rad.block.reason}` : ''}`
              : `${rad.open_problems} ${rad.open_problems === 1 ? 'offenes Problem' : 'offene Probleme'}`
          }
          to={`/betrieb/flotte/rad/${rad.id}`}
        />
      ))}
    </Listenabschnitt>
  );
}
