import { BefundKarte } from '@/features/assessments/BefundKarte';
import { DokuDateien } from '@/features/files/Aktendateien';
import { Patientenfotos } from '@/features/files/FotosImVerlauf';
import { usePatientRecord } from '@/features/patients/akte';
import { useSearchParams } from 'react-router-dom';
import { DieserTermin, PatientRecordDocumentation } from './PatientRecordDocumentation';

/**
 * Der Reiter „Doku" der Akte (AKTE-007; Anordnung seit Akte entschlacken,
 * 2026-10-03): oben der Befund als eine Karte mit Weg auf seine Seite, dann
 * die Behandlungsdokumentation, dann Fotos und Dateien in einer Karte. Am
 * Rechner steht die Dokumentation links, Befund und Fotos rechts daneben -
 * gemessen am Inhalt, nicht am Fenster (`--container-zweispaltig`).
 *
 * Gelesen wird wie bisher: jeder gelieferte Eintrag und Bogen wird auf dem
 * Server protokolliert (ADR-010).
 */
export function PatientDokuPage() {
  const { patient, user } = usePatientRecord();
  // Von der Tageskarte mit dem Termin vorausgewählt (AKTE-008): oben sein
  // Eintrag, darunter die übrigen, neueste zuerst.
  const [suche] = useSearchParams();
  const terminId = suche.get('termin');
  return (
    <>
      {terminId ? (
        <div className="mb-8">
          <DieserTermin patient={patient} user={user} terminId={terminId} />
        </div>
      ) : null}
      {/* Eine Fassung je Teil: am Telefon untereinander (Befund, Dokumentation,
          Fotos und Dateien), am Rechner die Dokumentation links über beide
          Zeilen, Befund und Fotos rechts. */}
      <div className="@container">
        <div className="@zweispaltig:grid-cols-[minmax(0,1fr)_minmax(300px,400px)] @zweispaltig:grid-rows-[auto_1fr] @zweispaltig:gap-x-8 grid items-start gap-6">
          <div className="@zweispaltig:col-start-2 @zweispaltig:row-start-1 min-w-0">
            <BefundKarte patient={patient} />
          </div>
          <div className="@zweispaltig:col-start-1 @zweispaltig:row-span-2 @zweispaltig:row-start-1 min-w-0">
            <PatientRecordDocumentation patient={patient} user={user} ohneTermin={terminId} />
          </div>
          <div className="@zweispaltig:col-start-2 @zweispaltig:row-start-2 min-w-0">
            {/* Je Person ein eigener Abschnitt: Ein ungespeichertes Foto oder
                eine offene Ansicht wandert beim Wechsel der Akte nicht mit. */}
            <Patientenfotos
              key={patient.id}
              patientId={patient.id}
              user={user}
              dateien={<DokuDateien patientId={patient.id} user={user} ohneAbschnitt />}
            />
          </div>
        </div>
      </div>
    </>
  );
}
