import { usePatientRecord } from '@/features/patients/akte';
import { PatientRecordDocumentation } from './PatientRecordDocumentation';

/**
 * Der Behandlungsverlauf als eigener Bereich der Akte (AKTE-004).
 *
 * Inhaltlich unverändert (DOK-003): Welche Sicht erscheint, entscheidet die
 * Rolle - die klinische mit Inhalt, der Behandlungsnachweis ohne. Geändert hat
 * sich allein, wo sie steht: Der Verlauf ist die längste Liste der Akte und
 * schob bisher alles andere nach oben aus dem Bild.
 */
export function PatientCoursePage() {
  const { patient, user } = usePatientRecord();
  return <PatientRecordDocumentation patient={patient} user={user} />;
}
