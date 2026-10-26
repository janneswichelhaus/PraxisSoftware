import { useLocation } from 'react-router-dom';
import { leseMeldung } from '@/lib/meldung';

/** Das Ziel eines Vorgangs im Test: Pfad, Suchteil und mitgegebene Meldung. */
export function Zielanzeige() {
  const ort = useLocation();
  return (
    <div>
      <p data-testid="ziel">{`${ort.pathname}${ort.search}`}</p>
      <p data-testid="ziel-meldung">{leseMeldung(ort.state) ?? ''}</p>
    </div>
  );
}
