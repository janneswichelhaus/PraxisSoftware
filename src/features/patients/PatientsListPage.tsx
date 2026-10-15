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
  // Die Akte führt zurück in genau diese Ansicht - mit Sortierung und Auswahl
  // (PAT-08, UX-012); den Suchbegriff merkt sich die Liste im Arbeitsspeicher,
  // nie in der Adresse (ADR-011). Ohne Parameter braucht es keinen Rückweg.
  const ohneBegriff = new URLSearchParams(parameter);
  ohneBegriff.delete('q');
  const stand = ohneBegriff.toString();
  const rueckweg = stand ? `/patienten?${stand}` : null;

  return (
    <>
      <PageHeader
        title="Patient:innen"
        actions={<ButtonLink to="/patienten/neu">{ANLEGEN}</ButtonLink>}
      />
      <Patientenauswahl
        begriffMerken
        ziel={(id) => mitRueckweg(`/patienten/${id}`, rueckweg)}
        leer={{
          titel: 'Noch keine Patient:innen',
          beschreibung: `Die erste Akte entsteht über „${ANLEGEN}“.`,
        }}
      />
    </>
  );
}
