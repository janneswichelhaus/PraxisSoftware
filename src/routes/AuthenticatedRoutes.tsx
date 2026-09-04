import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { PatientsListPage } from '@/features/patients/PatientsListPage';
import { NewPatientPage } from '@/features/patients/NewPatientPage';
import { EditPatientPage } from '@/features/patients/EditPatientPage';
import { PatientDetailPage } from '@/features/patients/PatientDetailPage';
import { CalendarPage } from '@/features/appointments/CalendarPage';
import { NewAppointmentPage } from '@/features/appointments/NewAppointmentPage';
import { AppointmentDetailPage } from '@/features/appointments/AppointmentDetailPage';
import { EditAppointmentPage } from '@/features/appointments/EditAppointmentPage';
import { AuditLogPage } from '@/features/audit/AuditLogPage';
import { SchedulingPage } from '@/features/scheduling/SchedulingPage';
import { StaffListPage } from '@/features/staff/StaffListPage';
import { NewStaffMemberPage } from '@/features/staff/NewStaffMemberPage';
import { EditStaffMemberPage } from '@/features/staff/EditStaffMemberPage';
import { StaffMemberDetailPage } from '@/features/staff/StaffMemberDetailPage';
import { TreatmentNotePage } from '@/features/documentation/TreatmentNotePage';
import { TreatmentNoteRevisionPage } from '@/features/documentation/TreatmentNoteRevisionPage';
import { TreatmentNoteAddendumPage } from '@/features/documentation/TreatmentNoteAddendumPage';
import { TreatmentNoteHistoryPage } from '@/features/documentation/TreatmentNoteHistoryPage';
import {
  canManageAppointments,
  canManageStaff,
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
  // Die Mitarbeiterliste ist fuer alle Praxisrollen lesbar; Anlegen und
  // Aendern prueft die Seite selbst und - verbindlich - der Server (STAFF-001).
  const showTeam = isStaff(user.roles);
  const showStaffWrite = canManageStaff(user.roles);
  const showDocumentation = canWriteTreatmentNote(user.roles);
  // Der Aenderungsverlauf ist ein Lesepfad: die Praxisleitung sieht ihn, ohne
  // selbst zu dokumentieren (ADR-016 Punkt 8, PROJECT_PRINCIPLES.md 4.1/4.2).
  const showHistory = canReadTreatmentNote(user.roles);

  return (
    <AppShell user={user} onSignOut={onSignOut}>
      <Routes>
        <Route path="/" element={<DashboardPage user={user} />} />
        {showDirectory ? (
          <>
            <Route path="/patienten" element={<PatientsListPage />} />
            <Route path="/patienten/neu" element={<NewPatientPage />} />
            <Route path="/patienten/:patientId" element={<PatientDetailPage user={user} />} />
            <Route path="/patienten/:patientId/bearbeiten" element={<EditPatientPage />} />
          </>
        ) : null}
        {showAppointments ? (
          <>
            <Route path="/kalender" element={<CalendarPage user={user} />} />
            <Route
              path="/patienten/:patientId/termine/neu"
              element={<NewAppointmentPage user={user} />}
            />
            <Route path="/termine/:appointmentId" element={<AppointmentDetailPage user={user} />} />
            <Route
              path="/termine/:appointmentId/bearbeiten"
              element={<EditAppointmentPage user={user} />}
            />
            <Route path="/praxis/planung" element={<SchedulingPage user={user} />} />
          </>
        ) : null}
        {showTeam ? (
          <>
            <Route path="/praxis/team" element={<StaffListPage user={user} />} />
            <Route
              path="/praxis/team/:staffMemberId"
              element={<StaffMemberDetailPage user={user} />}
            />
          </>
        ) : null}
        {showStaffWrite ? (
          <>
            <Route path="/praxis/team/neu" element={<NewStaffMemberPage />} />
            <Route
              path="/praxis/team/:staffMemberId/bearbeiten"
              element={<EditStaffMemberPage />}
            />
          </>
        ) : null}
        {showDocumentation ? (
          <>
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
          </>
        ) : null}
        {showHistory ? (
          <Route
            path="/termine/:appointmentId/dokumentation/:noteId/verlauf"
            element={<TreatmentNoteHistoryPage user={user} />}
          />
        ) : null}
        {showSecurity ? <Route path="/praxis/sicherheit/audit" element={<AuditLogPage />} /> : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
