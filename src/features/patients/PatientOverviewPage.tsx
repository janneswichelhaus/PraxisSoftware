import { Link } from 'react-router-dom';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Section } from '@/components/ui/Section';
import { PatientUpcomingAppointments } from '@/features/appointments/PatientUpcomingAppointments';
import { LetzterBehandlungsstand } from '@/features/documentation/LetzterBehandlungsstand';
import { AktuelleVerordnungen } from '@/features/prescriptions/AktuelleVerordnungen';
import { canManageAppointments, type CurrentUser } from '@/features/session/types';
import { usePatientRecord } from './akte';
import type { Patient } from './api';

/**
 * Die Übersicht der Akte (AKTE-001).
 *
 * Sie beantwortet eine einzige Frage: **Was ist mit dieser Person gerade zu
 * tun?** Deshalb stehen hier vier Ausschnitte und keine vollständigen Listen -
 * die nächsten Termine, die laufenden Verordnungen mit ihren Restzahlen, der
 * letzte Behandlungs- und Dokumentationsstand und die Hinweise, die vor einem
 * Hausbesuch zählen. Jeder Ausschnitt führt in seinen Bereich.
 *
 * Zwei Spalten auf dem Desktop, gestapelt auf dem Telefon: Termine und
 * Verordnungen stehen nebeneinander in der ersten Reihe, damit beides ohne
 * Scrollen sichtbar ist. Vorher lagen zwischen ihnen vier Abschnitte
 * Stammdaten.
 */

/**
 * Die Hinweise, die unterwegs zählen (PAT-005, `IDEA-PRX-001`).
 *
 * Der Zugangshinweis ist die Angabe, die vor der Tür gebraucht wird - „Klingel
 * defekt, bitte anrufen" nützt nichts, wenn sie drei Bereiche entfernt in den
 * Stammdaten steht. Er steht deshalb doppelt: hier als Arbeitsauskunft und in
 * den Stammdaten als Teil des Datensatzes, den man dort pflegt.
 *
 * Für ein Patientenkonto liefert die Sicht die Felder gar nicht erst; der
 * Abschnitt verschwindet dann (ANN-010, ADR-004).
 */
function hatHausbesuchHinweise(patient: Patient): boolean {
  return Boolean(patient.home_visit_access_note || patient.special_note);
}

function HausbesuchHinweise({ patient }: { patient: Patient }) {
  return (
    <Section titel="Vor dem Hausbesuch">
      <DetailList>
        {patient.home_visit_access_note ? (
          <DetailRow label="Zugang">{patient.home_visit_access_note}</DetailRow>
        ) : null}
        {patient.special_note ? (
          <DetailRow label="Besonderheit">{patient.special_note}</DetailRow>
        ) : null}
      </DetailList>
      <Link
        to={`/patienten/${patient.id}/stammdaten`}
        className="text-accent mt-2 inline-flex min-h-11 items-center text-sm hover:underline"
      >
        Alle Stammdaten
      </Link>
    </Section>
  );
}

export function PatientOverviewPage() {
  const { patient, user } = usePatientRecord();
  return <Uebersicht patient={patient} user={user} />;
}

export function Uebersicht({ patient, user }: { patient: Patient; user: CurrentUser }) {
  return (
    // Jeder Ausschnitt steht in einem eigenen Rasterfeld: So greift `first:mt-0`
    // in jedem Feld, und beide Spalten beginnen auf derselben Höhe.
    <div className="grid gap-x-8 gap-y-8 lg:grid-cols-2">
      {canManageAppointments(user.roles) ? (
        <div>
          <PatientUpcomingAppointments patientId={patient.id} user={user} />
        </div>
      ) : null}

      <div>
        <AktuelleVerordnungen patient={patient} user={user} />
      </div>

      <div>
        <LetzterBehandlungsstand patient={patient} user={user} />
      </div>

      {hatHausbesuchHinweise(patient) ? (
        <div>
          <HausbesuchHinweise patient={patient} />
        </div>
      ) : null}
    </div>
  );
}
