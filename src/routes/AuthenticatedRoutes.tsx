import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { BereichePage } from '@/app/BereichePage';
import { canSeeBilling } from '@/app/navigation';
import { MyDayPage } from '@/features/today/MyDayPage';
import { PatientsListPage } from '@/features/patients/PatientsListPage';
import { NewPatientPage } from '@/features/patients/NewPatientPage';
import { EditPatientPage } from '@/features/patients/EditPatientPage';
import { PatientDetailPage } from '@/features/patients/PatientDetailPage';
import { PrescribersListPage } from '@/features/prescriptions/PrescribersListPage';
import { EditPrescriberPage, NewPrescriberPage } from '@/features/prescriptions/PrescriberFormPage';
import {
  EditPrescriptionPage,
  NewPrescriptionPage,
} from '@/features/prescriptions/PrescriptionFormPage';
import { CalendarPage } from '@/features/appointments/CalendarPage';
import { NewAppointmentPage } from '@/features/appointments/NewAppointmentPage';
import { NewAppointmentStartPage } from '@/features/appointments/NewAppointmentStartPage';
import { AppointmentDetailPage } from '@/features/appointments/AppointmentDetailPage';
import { EditAppointmentPage } from '@/features/appointments/EditAppointmentPage';
import { AuditLogPage } from '@/features/audit/AuditLogPage';
import { SchedulingPage } from '@/features/scheduling/SchedulingPage';
import { StaffListPage } from '@/features/staff/StaffListPage';
import { NewStaffMemberPage } from '@/features/staff/NewStaffMemberPage';
import { EditStaffMemberPage } from '@/features/staff/EditStaffMemberPage';
import { StaffMemberDetailPage } from '@/features/staff/StaffMemberDetailPage';
import { CompleteTreatmentPage } from '@/features/documentation/CompleteTreatmentPage';
import { TextbausteinePage } from '@/features/documentation/TextbausteinePage';
import { TreatmentNotePage } from '@/features/documentation/TreatmentNotePage';
import { TreatmentNoteRevisionPage } from '@/features/documentation/TreatmentNoteRevisionPage';
import { TreatmentNoteAddendumPage } from '@/features/documentation/TreatmentNoteAddendumPage';
import { TreatmentNoteHistoryPage } from '@/features/documentation/TreatmentNoteHistoryPage';
import { VorschauProvider } from '@/features/preview/VorschauProvider';
import { ProtokollPage } from '@/features/preview/ProtokollPage';
import { FleetPage } from '@/features/fleet/FleetPage';
import { BikeEditPage } from '@/features/fleet/BikeEditPage';
import { KeyPage } from '@/features/fleet/KeyPage';
import { CheckupPage } from '@/features/fleet/CheckupPage';
import { BreakdownPage } from '@/features/fleet/BreakdownPage';
import { VacationPage } from '@/features/vacation/VacationPage';
import { TimeAccountPage } from '@/features/timeaccount/TimeAccountPage';
import { ReimbursementsPage } from '@/features/reimbursements/ReimbursementsPage';
import { TeamChatPage } from '@/features/teamchat/TeamChatPage';
import { ToursPage } from '@/features/tours/ToursPage';
import {
  CatalogPage,
  InvoicesPage,
  PaymentsPage,
  ServicesPage,
} from '@/features/billing/BillingPage';
import {
  canManageAppointments,
  canManageStaffMasterData,
  canReadPatientDirectory,
  canReadTreatmentNote,
  canWriteTreatmentNote,
  isOwner,
  isStaff,
  type CurrentUser,
} from '@/features/session/types';

/**
 * Routen des angemeldeten Bereichs.
 *
 * Die Rollenprüfung hier steuert die Navigation. Sie ist KEINE
 * Zugriffskontrolle - diese liegt vollständig in den RLS-Policies (ADR-004).
 * Ein Patientenkonto, das die Route direkt aufruft, bekommt vom Server schlicht
 * keine Daten.
 *
 * Die Routen sind nach den sechs Arbeitsbereichen geordnet. Die Pfade der
 * bereits angebundenen Seiten bleiben unverändert: Sie stehen in Lesezeichen,
 * in geteilten Links und in den bestehenden Tests. Geändert haben sich
 * Einordnung und Beschriftung, nicht die Adresse.
 *
 * `VorschauProvider` hält den Zustand der noch nicht angebundenen Bereiche.
 * Er lebt nur im Arbeitsspeicher und spricht mit keinem Server.
 */
export function AuthenticatedRoutes({
  user,
  onSignOut,
}: {
  user: CurrentUser;
  onSignOut: () => void;
}) {
  const showDirectory = canReadPatientDirectory(user.roles);
  const showSecurity = isOwner(user.roles);
  const showAppointments = canManageAppointments(user.roles);
  const showOperations = isStaff(user.roles);
  // Die Mitarbeiterliste ist fuer alle Praxisrollen lesbar; Anlegen und
  // Aendern prueft die Seite selbst und - verbindlich - der Server (STAFF-001,
  // seit E10 owner und office).
  const showStaffWrite = canManageStaffMasterData(user.roles);
  const showDocumentation = canWriteTreatmentNote(user.roles);
  // Der Aenderungsverlauf ist ein Lesepfad: die Praxisleitung sieht ihn, ohne
  // selbst zu dokumentieren (ADR-016 Punkt 8, PROJECT_PRINCIPLES.md 4.1/4.2).
  const showHistory = canReadTreatmentNote(user.roles);
  const showBilling = canSeeBilling(user.roles);

  return (
    <VorschauProvider>
      <AppShell user={user} onSignOut={onSignOut}>
        <Routes>
          <Route path="/" element={<MyDayPage user={user} />} />
          <Route path="/bereiche" element={<BereichePage user={user} />} />
          <Route path="/vorschau/protokoll" element={<ProtokollPage />} />

          {showDirectory ? (
            <>
              <Route path="/patienten" element={<PatientsListPage />} />
              <Route path="/patienten/neu" element={<NewPatientPage />} />
              <Route path="/patienten/:patientId" element={<PatientDetailPage user={user} />} />
              <Route path="/patienten/:patientId/bearbeiten" element={<EditPatientPage />} />
              {/* Die Verordnerkartei haengt am Arbeitsbereich Patient:innen: sie
                  wird ausschliesslich fuer Verordnungen gebraucht (VER-001). */}
              <Route path="/verordner" element={<PrescribersListPage />} />
              <Route path="/verordner/neu" element={<NewPrescriberPage />} />
              <Route path="/verordner/:prescriberId/bearbeiten" element={<EditPrescriberPage />} />
              {/* Verordnungen haengen an der Akte, nicht an der Verordnerkartei
                  (VER-003). Wer sie schreiben darf, prueft der Server. */}
              <Route
                path="/patienten/:patientId/verordnungen/neu"
                element={<NewPrescriptionPage />}
              />
              <Route
                path="/patienten/:patientId/verordnungen/:prescriptionId/bearbeiten"
                element={<EditPrescriptionPage />}
              />
            </>
          ) : null}

          {showAppointments ? (
            <>
              <Route path="/kalender" element={<CalendarPage user={user} />} />
              {/* Termin anlegen, wenn die Zeit feststeht und die Person noch
                  nicht - aus dem Kalender heraus (UX-005). */}
              <Route path="/termine/neu" element={<NewAppointmentStartPage />} />
              <Route
                path="/patienten/:patientId/termine/neu"
                element={<NewAppointmentPage user={user} />}
              />
              <Route
                path="/termine/:appointmentId"
                element={<AppointmentDetailPage user={user} />}
              />
              <Route
                path="/termine/:appointmentId/bearbeiten"
                element={<EditAppointmentPage user={user} />}
              />
              <Route path="/touren" element={<ToursPage user={user} />} />
              <Route path="/praxis/planung" element={<SchedulingPage user={user} />} />
            </>
          ) : null}

          {showDocumentation ? (
            <>
              {/* Behandlung abschliessen in einem Schritt (UX-007). */}
              <Route
                path="/termine/:appointmentId/abschluss"
                element={<CompleteTreatmentPage user={user} />}
              />
              <Route
                path="/termine/:appointmentId/dokumentation"
                element={<TreatmentNotePage user={user} />}
              />
              <Route
                path="/termine/:appointmentId/dokumentation/:noteId/bearbeiten"
                element={<TreatmentNotePage user={user} />}
              />
              <Route
                path="/termine/:appointmentId/dokumentation/:noteId/korrektur"
                element={<TreatmentNoteRevisionPage user={user} />}
              />
              <Route
                path="/termine/:appointmentId/dokumentation/:noteId/nachtrag"
                element={<TreatmentNoteAddendumPage user={user} />}
              />
              {/* Ohne Pflege bliebe die Bausteinleiste dauerhaft leer -
                  die Seite gehoert zur Story (UX-008). */}
              <Route path="/praxis/textbausteine" element={<TextbausteinePage user={user} />} />
            </>
          ) : null}

          {showHistory ? (
            <Route
              path="/termine/:appointmentId/dokumentation/:noteId/verlauf"
              element={<TreatmentNoteHistoryPage user={user} />}
            />
          ) : null}

          {showOperations ? (
            <>
              <Route path="/praxis/team" element={<StaffListPage user={user} />} />
              <Route
                path="/praxis/team/:staffMemberId"
                element={<StaffMemberDetailPage user={user} />}
              />
              <Route path="/team" element={<TeamChatPage user={user} />} />
              <Route path="/betrieb/flotte" element={<FleetPage user={user} />} />
              <Route path="/betrieb/flotte/rad/:radId" element={<BikeEditPage user={user} />} />
              <Route path="/betrieb/flotte/schluessel" element={<KeyPage user={user} />} />
              <Route path="/betrieb/flotte/checkup" element={<CheckupPage user={user} />} />
              <Route path="/betrieb/flotte/panne" element={<BreakdownPage />} />
              <Route path="/betrieb/urlaub" element={<VacationPage user={user} />} />
              <Route path="/betrieb/zeitkonto" element={<TimeAccountPage user={user} />} />
              <Route path="/betrieb/erstattungen" element={<ReimbursementsPage user={user} />} />
            </>
          ) : null}

          {showStaffWrite ? (
            <>
              <Route path="/praxis/team/neu" element={<NewStaffMemberPage user={user} />} />
              <Route
                path="/praxis/team/:staffMemberId/bearbeiten"
                element={<EditStaffMemberPage user={user} />}
              />
            </>
          ) : null}

          {showBilling ? (
            <>
              <Route path="/abrechnung" element={<InvoicesPage />} />
              <Route path="/abrechnung/leistungen" element={<ServicesPage />} />
              <Route path="/abrechnung/katalog" element={<CatalogPage />} />
              <Route path="/abrechnung/zahlungen" element={<PaymentsPage />} />
            </>
          ) : null}

          {showSecurity ? (
            <Route path="/praxis/sicherheit/audit" element={<AuditLogPage />} />
          ) : null}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </VorschauProvider>
  );
}
