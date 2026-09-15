import { usePatientRecord } from '@/features/patients/akte';
import { PatientRecordDocumentation } from './PatientRecordDocumentation';

/**
 * Der Behandlungsverlauf als eigener Bereich der Akte (AKTE-004).
 *
 * Inhaltlich die Behandlungsdokumentation aus DOK-003, seit ROL-001 für alle
 * vier Praxisrollen dieselbe. Ein eigener Bereich, weil der Verlauf die längste
 * Liste der Akte ist und bisher alles andere nach oben aus dem Bild schob.
 */
export function PatientCoursePage() {
  const { patient, user } = usePatientRecord();
  return <PatientRecordDocumentation patient={patient} user={user} />;
}
