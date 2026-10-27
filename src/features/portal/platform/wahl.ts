import { useSearchParams } from 'react-router-dom';
import { BEREICHSNAME, type Plattformzugang } from './api';
import { PLATTFORM_PFAD } from './pfade';

/**
 * Welcher Zugang gewählt ist. Steht in der Adresse, damit Zurück und
 * Neuladen ihn behalten: ein eigener Bereich als `?bereich=training`, eine
 * Vertretung als `?zugang=<Kennung>`; ohne Angabe der erste lesbare. Gewählt
 * wird nur unter den eigenen Zugängen - der Server zeigt ohnehin nur diese
 * (Punkt 19).
 */
export function useWahl(bereiche: Plattformzugang[]): Plattformzugang | null {
  const [suche] = useSearchParams();
  const zugang = suche.get('zugang');
  const bereich = suche.get('bereich');
  return (
    bereiche.find((z) => z.access_id === zugang) ??
    bereiche.find((z) => z.access_kind === 'self' && z.relationship_kind === bereich) ??
    bereiche[0] ??
    null
  );
}

/** Die Adresse eines Zugangs im Schalter. */
export function wahlAdresse(z: Plattformzugang): string {
  return z.access_kind === 'self'
    ? `${PLATTFORM_PFAD}?bereich=${z.relationship_kind}`
    : `${PLATTFORM_PFAD}?zugang=${z.access_id}`;
}

/** Die Beschriftung im Schalter: der eigene Bereich oder „Für …". */
export function wahlName(z: Plattformzugang): string {
  if (z.access_kind === 'self') return BEREICHSNAME[z.relationship_kind];
  return `Für ${z.represented_name ?? 'eine andere Person'}`;
}
