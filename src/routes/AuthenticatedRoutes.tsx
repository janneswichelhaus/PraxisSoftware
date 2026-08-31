import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { BereichePage } from '@/app/BereichePage';
import { canSeeBilling } from '@/app/navigation';
import { MyDayPage } from '@/features/today/MyDayPage';
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
import { VorschauProvider } from '@/features/preview/VorschauProvider';
import { ProtokollPage } from '@/features/preview/ProtokollPage';
import { FleetPage } from '@/features/fleet/FleetPage';
import { BikeEditPage } from '@/features/fleet/BikeEditPage';
import { KeyPage } from '@/features/fleet/KeyPage';
import { CheckupPage } from '@/features/fleet/CheckupPage';
import { BreakdownPage } from '@/features/fleet/BreakdownPage';
import { StaffDirectoryPage } from '@/features/staff/StaffDirectoryPage';
import { StaffRecordPage } from '@/features/staff/StaffRecordPage';
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
  canReadPatientDirectory,
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
  const showPersonalFiles = isOwner(user.roles) || user.roles.includes('team_lead');
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
            </>
          ) : null}

          {showAppointments ? (
            <>
              <Route path="/kalender" element={<CalendarPage user={user} />} />
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

          {showOperations ? (
            <>
              <Route path="/team" element={<TeamChatPage user={user} />} />
              <Route path="/team/verzeichnis" element={<StaffDirectoryPage user={user} />} />
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

          {showPersonalFiles ? (
            <>
              <Route path="/betrieb/personal" element={<StaffRecordPage />} />
              <Route path="/betrieb/personal/:personId" element={<StaffRecordPage />} />
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
