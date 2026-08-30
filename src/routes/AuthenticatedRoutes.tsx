import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { PatientsListPage } from '@/features/patients/PatientsListPage';
import { NewPatientPage } from '@/features/patients/NewPatientPage';
import { EditPatientPage } from '@/features/patients/EditPatientPage';
import { PatientDetailPage } from '@/features/patients/PatientDetailPage';
import { NewAppointmentPage } from '@/features/appointments/NewAppointmentPage';
import { AppointmentDetailPage } from '@/features/appointments/AppointmentDetailPage';
import { AuditLogPage } from '@/features/audit/AuditLogPage';
import {
  canManageAppointments,
  canReadPatientDirectory,
  isOwner,
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
            <Route
              path="/patienten/:patientId/termine/neu"
              element={<NewAppointmentPage user={user} />}
            />
            <Route path="/termine/:appointmentId" element={<AppointmentDetailPage />} />
          </>
        ) : null}
        {showSecurity ? <Route path="/praxis/sicherheit/audit" element={<AuditLogPage />} /> : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
