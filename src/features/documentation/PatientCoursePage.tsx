import { usePatientRecord } from '@/features/patients/akte';
import { Patientenfotos } from '@/features/files/FotosImVerlauf';
import { PatientRecordDocumentation } from './PatientRecordDocumentation';

/**
 * Der Behandlungsverlauf als eigener Bereich der Akte (AKTE-004).
 *
 * Inhaltlich die Behandlungsdokumentation aus DOK-003, seit ROL-001 für alle
 * vier Praxisrollen dieselbe. Ein eigener Bereich, weil der Verlauf die längste
 * Liste der Akte ist und bisher alles andere nach oben aus dem Bild schob.
 * Darüber seit DOK-006 die Fotos der Person (ADR-017 Abschnitt G).
 */
export function PatientCoursePage() {
  const { patient, user } = usePatientRecord();
  return (
    <>
      {/* DOK-006: Fotos zum Vergleich im Verlauf, über der langen Liste der
          Einträge - sonst stünden sie am Ende, hinter jeder Seite. */}
      {/* Je Person ein eigener Abschnitt: Ein ungespeichertes Foto oder eine
          offene Ansicht wandert beim Wechsel der Akte nicht mit. */}
      <Patientenfotos key={patient.id} patientId={patient.id} user={user} />
      <PatientRecordDocumentation patient={patient} user={user} />
    </>
  );
}
