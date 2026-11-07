import { useLocation } from 'react-router-dom';
import { Textlink } from '@/components/ui/Textlink';
import { mitRueckweg } from '@/lib/rueckweg';

/** Oben im Reiter „Termine“: die Wege zur Person auf einen Blick, kein neuer Reiter (ANN-847). */
export function AufEinenBlick({ patientId }: { patientId: string }) {
  const ort = useLocation();
  const hier = `${ort.pathname}${ort.search}`;
  return (
    <nav aria-label="Auf einen Blick" className="mb-6 flex flex-wrap gap-x-6 gap-y-2">
      <Textlink to={mitRueckweg(`/patienten/${patientId}/zeitstrahl`, hier)} alleinstehend>
        Zeitstrahl
      </Textlink>
    </nav>
  );
}
