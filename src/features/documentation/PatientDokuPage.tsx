import { Befund } from '@/features/assessments/PatientBefundPage';
import { DokuDateien } from '@/features/files/Aktendateien';
import { Patientenfotos } from '@/features/files/FotosImVerlauf';
import { usePatientRecord } from '@/features/patients/akte';
import { PatientRecordDocumentation } from './PatientRecordDocumentation';

/**
 * Der Reiter „Doku" der Akte (AKTE-007): Behandlungsverlauf, Befund samt
 * Anamnesebogen und die Dateien zu Befund und Behandlung.
 *
 * Bis AKTE-007 waren das drei Bereiche - „Behandlungsverlauf" (AKTE-004),
 * „Befund" (FRB-EPIC-002) und der klinische Teil von „Dateien". Sie
 * beantworten dieselbe Frage: Was wissen wir klinisch über diese Person?
 *
 * Der Verlauf steht oben, weil er täglich gebraucht wird; darüber seit
 * DOK-006 die Fotos der Person (ADR-017 Abschnitt G). Weil der Verlauf die
 * längste Liste der Akte ist, führt eine Zeile ganz oben zu Befund und
 * Dateien, statt sie hinter jeder Seite des Verlaufs zu verstecken.
 *
 * Gelesen wird wie bisher: jeder gelieferte Eintrag und Bogen wird auf dem
 * Server protokolliert (ADR-010).
 */
export function PatientDokuPage() {
  const { patient, user } = usePatientRecord();
  return (
    <>
      <nav aria-label="Teile der Doku" className="mb-4 flex flex-wrap gap-x-5 gap-y-1 text-sm">
        <a href="#doku-befund" className="text-accent flex min-h-11 items-center underline">
          Zum Befund
        </a>
        <a href="#doku-dateien" className="text-accent flex min-h-11 items-center underline">
          Zu den Dateien
        </a>
      </nav>
      {/* Je Person ein eigener Abschnitt: Ein ungespeichertes Foto oder eine
          offene Ansicht wandert beim Wechsel der Akte nicht mit. */}
      <Patientenfotos key={patient.id} patientId={patient.id} user={user} />
      <PatientRecordDocumentation patient={patient} user={user} />
      <div id="doku-befund" className="mt-10 scroll-mt-4">
        <Befund patient={patient} user={user} />
      </div>
      <div id="doku-dateien" className="mt-10 scroll-mt-4">
        <DokuDateien patientId={patient.id} user={user} />
      </div>
    </>
  );
}
