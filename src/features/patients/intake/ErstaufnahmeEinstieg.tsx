import { useQuery } from '@tanstack/react-query';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Warnzeile } from '@/components/ui/Objektkopf';
import { openItemsText } from '@/features/patients/intake/api';
import { useOffeneErstaufnahme } from '@/features/patients/intake/useOffeneErstaufnahme';
import { fetchPatient } from '@/features/patients/api';
import { canReadPatientDirectory, type CurrentUser } from '@/features/core/session/types';
import { mitRueckweg } from '@/lib/rueckweg';
import { erstaufnahmeLohnt, erstaufnahmePfad } from './stand';

/**
 * Der Weg in die geführte Erstaufnahme am Termin (K10): eine Warnzeile,
 * solange ein Punkt der Checkliste fehlt (dieselbe Abfrage wie Tagesliste und
 * Kopf der Akte) oder die Liege nicht entschieden ist - am Termin wird sie
 * gebraucht, auch wenn sie kein offener Punkt der Büroliste ist (ANN-542).
 * Ist alles da, steht nichts.
 */
export function ErstaufnahmeEinstieg({
  patientId,
  terminId,
  zurueck,
  user,
}: {
  patientId: string;
  terminId: string;
  zurueck: string;
  user: CurrentUser;
}) {
  const offen = useOffeneErstaufnahme(patientId, true, user);
  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId),
    enabled: canReadPatientDirectory(user.roles),
    retry: false,
  });
  const liege = patient.data ? (patient.data.treatment_table_required ?? null) : undefined;
  if (!erstaufnahmeLohnt(offen, liege)) return null;
  const fehlt = [
    ...(offen.length > 0 ? [openItemsText(offen)] : []),
    ...(liege === null ? ['Liege'] : []),
  ];
  return (
    <Warnzeile
      aktion={
        // Ein Knopf, kein Textlink: Darunter steht der Hauptknopf „Doku“, und
        // ein kleines Ziel daneben wird mit Handschuh übersprungen.
        <ButtonLink
          variant="secondary"
          groesse="kompakt"
          to={mitRueckweg(erstaufnahmePfad(patientId, terminId), zurueck)}
        >
          Erstaufnahme
        </ButtonLink>
      }
    >
      Fehlt: {fehlt.join(' · ')}
    </Warnzeile>
  );
}
