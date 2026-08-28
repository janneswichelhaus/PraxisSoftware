import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { PatientsListPage } from '@/features/patients/PatientsListPage';
import { PatientDetailPage } from '@/features/patients/PatientDetailPage';
import { canReadPatientDirectory, type CurrentUser } from '@/features/session/types';

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

  return (
    <AppShell user={user} onSignOut={onSignOut}>
      <Routes>
        <Route path="/" element={<DashboardPage user={user} />} />
        {showDirectory ? (
          <>
            <Route path="/patienten" element={<PatientsListPage />} />
            <Route path="/patienten/:patientId" element={<PatientDetailPage />} />
          </>
        ) : null}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </AppShell>
  );
}
