import { BefundKarte } from '@/features/assessments/BefundKarte';
import { DokuDateien } from '@/features/files/Aktendateien';
import { Patientenfotos } from '@/features/files/FotosImVerlauf';
import { usePatientRecord } from '@/features/patients/akte';
import { useLocation, useSearchParams } from 'react-router-dom';
import { PlanAbschnitt } from '@/features/exercise-plans/PlanAbschnitt';
import { canReadExercisePlans } from '@/features/session/types';
import { DieserTermin, PatientRecordDocumentation } from './PatientRecordDocumentation';
import { NachrichtenInDerAkte } from '@/features/messages/InDieAkte';

/**
 * Der Reiter „Doku" der Akte (AKTE-007; Anordnung seit Akte entschlacken,
 * 2026-10-03): oben der Befund als eine Karte mit Weg auf seine Seite, dann
 * die Behandlungsdokumentation, die Übungspläne (UEB-EPIC-002), dann Fotos und
 * Dateien in einer Karte. Am Rechner steht die Dokumentation links, Befund,
 * Pläne und Fotos rechts daneben - gemessen am Inhalt, nicht am Fenster
 * (`--container-zweispaltig`).
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
  const ort = useLocation();
  return (
    <>
      {terminId ? (
        <div className="mb-8">
          <DieserTermin patient={patient} user={user} terminId={terminId} />
        </div>
      ) : null}
      {/* Eine Fassung je Teil: am Telefon untereinander (Befund, Dokumentation,
          Pläne, Fotos und Dateien), am Rechner die Dokumentation links über
          alle drei Zeilen, Befund, Pläne und Fotos rechts. */}
      <div className="@container">
        <div className="@zweispaltig:grid-cols-[minmax(0,1fr)_minmax(300px,400px)] @zweispaltig:grid-rows-[auto_auto_1fr] @zweispaltig:gap-x-8 grid items-start gap-6">
          <div className="@zweispaltig:col-start-2 @zweispaltig:row-start-1 min-w-0">
            <BefundKarte patient={patient} />
          </div>
          <div className="@zweispaltig:col-start-1 @zweispaltig:row-span-3 @zweispaltig:row-start-1 min-w-0">
            <PatientRecordDocumentation patient={patient} user={user} ohneTermin={terminId} />
            {/* KOM-004: der Akte zugeordnete Nachrichten von der Plattform (§10). */}
            <NachrichtenInDerAkte
              patientId={patient.id}
              zeitzone={user.organizationTimeZone ?? 'Europe/Berlin'}
            />
          </div>
          {/* UEB-EPIC-002: die Übungspläne der Akte (ANN-297). */}
          {canReadExercisePlans(user.roles, 'therapy') ? (
            <div className="@zweispaltig:col-start-2 @zweispaltig:row-start-2 min-w-0">
              <PlanAbschnitt
                bereich="therapy"
                verhaeltnisId={patient.id}
                rueckweg={`${ort.pathname}${ort.search}`}
              />
            </div>
          ) : null}
          <div className="@zweispaltig:col-start-2 @zweispaltig:row-start-3 min-w-0">
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
