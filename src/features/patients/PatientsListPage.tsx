import { useSearchParams } from 'react-router-dom';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { PageHeader } from '@/components/ui/PageHeader';
import { BEGRIFFE } from '@/lib/begriffe';
import { mitRueckweg } from '@/lib/rueckweg';
import { Patientenauswahl } from './Patientenauswahl';

/** Der Vorgang heißt hier wie in der Kopfsuche (PAT-21, ANN-111). */
const ANLEGEN = `${BEGRIFFE.patientIn} anlegen`;

/**
 * Patientenliste (Seitentyp „Liste“, DESIGN.md): Kopf mit „Anlegen“, Suche,
 * Sortierung und die Karteileichen (B1, B10) über den Akten als Zeilen.
 * „Nicht in Versorgung“ gibt es nicht mehr (BEF-151).
 */
export function PatientsListPage() {
  const [parameter] = useSearchParams();
  // Die Akte führt zurück in genau diese Ansicht - mit Suche, Sortierung und
  // Auswahl (PAT-08, UX-012). Ohne Parameter braucht es keinen Rückweg.
  const stand = parameter.toString();
  const rueckweg = stand ? `/patienten?${stand}` : null;

  return (
    <>
      <PageHeader
        title="Patient:innen"
        actions={<ButtonLink to="/patienten/neu">{ANLEGEN}</ButtonLink>}
      />
      <Patientenauswahl
        sucheInAdresse
        ziel={(id) => mitRueckweg(`/patienten/${id}`, rueckweg)}
        leer={{
          titel: 'Noch keine Patient:innen',
          beschreibung: `Die erste Akte entsteht über „${ANLEGEN}“.`,
        }}
      />
    </>
  );
}
