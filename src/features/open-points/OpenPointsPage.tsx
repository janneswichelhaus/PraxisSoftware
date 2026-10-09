import { useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { todayInTimeZone } from '@/features/appointments/api';
import {
  canConcludePatientCare,
  canManageAppointments,
  canManageInvoicing,
  canManageTasks,
  canReadPatientDirectory,
  canReadTrainingClients,
  canReadTreatmentBases,
  canWriteExercisePlans,
  canWriteTreatmentBases,
  isTherapyStaff,
  type CurrentUser,
} from '@/features/session/types';
import { AftercareCancellations } from './AftercareCancellations';
import { TrainingWithdrawals } from './TrainingWithdrawals';
import { CallsSummary } from './CallsSummary';
import { ConsentWithdrawals } from './ConsentWithdrawals';
import { CareWithoutConclusionList, EndingPrescriptions } from './Reminders';
import { OpenIntakes } from './OpenIntakes';
import { PrescriptionsToCapture } from './PrescriptionsToCapture';
import { Tasks } from './Tasks';
import { PlatformRequests } from './PlatformRequests';
import { WaitlistReview } from './WaitlistReview';
import { PlanWiedervorlage } from '@/features/exercise-plans/Wiedervorlage';
import { OffeneRueckfragen } from '@/features/messages/RueckfragenAbschnitt';

/** Eine Kennung aus der Adresszeile, wie die Datenbank sie vergibt. */
const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Offene Punkte - die Büroliste (PRX-EPIC-003, „Nichts fällt durch").
 *
 * Hier läuft zusammen, was sonst liegen bliebe: Verordnungen, die nur als Foto
 * da sind, Aufgaben und Wiedervorlagen, offene Erstaufnahmen, die Anrufe für
 * morgen, Wartelisteneinträge, die lange keiner angefasst hat (ABN-018), und
 * Verordnungen, die bald enden, seit POR-011 die Terminwünsche von der
 * Plattform, seit POR-016 die Widerrufe, seit ANG-003 die Kündigungen des
 * Nachsorge-Abos über die Plattform, seit UEB-007 die auslaufenden Pläne und
 * seit KOM-002 die Rückfragen mit ihrer Antwortfrist. Jede Liste hat ihren eigenen
 * Lesepfad; was eine Rolle nicht sehen darf, fragt die Seite gar nicht erst ab
 * - verbindlich prüft der Server (ADR-004).
 *
 * Nichts hier bewertet eine Person oder einen Verlauf (§17): Die Listen
 * zählen organisatorische Zustände, sie empfehlen nichts.
 */
export function OpenPointsPage({ user }: { user: CurrentUser }) {
  const timeZone = user.organizationTimeZone ?? 'Europe/Berlin';
  const today = todayInTimeZone(timeZone);
  // `?aufgabe=neu&patient=…` öffnet das Formular mit der Person (PRX-012).
  const [suche] = useSearchParams();
  const neueAufgabe = suche.get('aufgabe') === 'neu';
  const patientParam = suche.get('patient');
  const aufgabePatient = patientParam && KENNUNG.test(patientParam) ? patientParam : null;
  // UEB-007: die Pläne der Bereiche, die die Person schreibt (ANN-302).
  const planBereiche = (['therapy', 'training'] as const).filter((bereich) =>
    canWriteExercisePlans(user.roles, bereich),
  );
  // KOM-002 (ANN-309): die Rückfragen der Bereiche, die die Person liest.
  const rueckfrageBereiche = [
    ...(isTherapyStaff(user.roles) ? (['treatment'] as const) : []),
    ...(canReadTrainingClients(user.roles) ? (['training'] as const) : []),
  ];

  return (
    <>
      <PageHeader
        title="Offene Punkte"
        description="Was noch zu erledigen ist, bis es erledigt ist."
      />
      <div className="lg:max-w-3xl">
        {rueckfrageBereiche.length > 0 ? <OffeneRueckfragen bereiche={rueckfrageBereiche} /> : null}
        {canManageTasks(user.roles) ? (
          <Tasks today={today} openForm={neueAufgabe} patientId={aufgabePatient} />
        ) : null}
        {canWriteTreatmentBases(user.roles) ? <PrescriptionsToCapture timeZone={timeZone} /> : null}
        {canReadPatientDirectory(user.roles) ? <OpenIntakes /> : null}
        {canManageAppointments(user.roles) || canReadTrainingClients(user.roles) ? (
          <PlatformRequests timeZone={timeZone} />
        ) : null}
        {canReadPatientDirectory(user.roles) || canReadTrainingClients(user.roles) ? (
          <ConsentWithdrawals />
        ) : null}
        {/* ANG-003: Kündigungen des Nachsorge-Abos über die Plattform
            (owner, office - wer das Abo führt). */}
        {canManageInvoicing(user.roles) ? <AftercareCancellations /> : null}
        {/* KND-004: Widerrufe von Trainingsverträgen (owner, office). */}
        {canManageInvoicing(user.roles) ? <TrainingWithdrawals /> : null}
        {canManageAppointments(user.roles) ? <CallsSummary today={today} /> : null}
        {canManageAppointments(user.roles) ? <WaitlistReview timeZone={timeZone} /> : null}
        {canReadTreatmentBases(user.roles) ? <EndingPrescriptions timeZone={timeZone} /> : null}
        {planBereiche.length > 0 ? (
          <PlanWiedervorlage bereiche={planBereiche} rueckweg="/offen" />
        ) : null}
        {canConcludePatientCare(user.roles) ? (
          <CareWithoutConclusionList timeZone={timeZone} />
        ) : null}
      </div>
    </>
  );
}
