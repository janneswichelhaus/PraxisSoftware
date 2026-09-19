import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { BereichePage } from '@/app/BereichePage';
import { canSeeBilling } from '@/app/navigation';
import { MyDayPage } from '@/features/today/MyDayPage';
import { PatientsListPage } from '@/features/patients/PatientsListPage';
import { NewPatientPage } from '@/features/patients/NewPatientPage';
import { EditPatientPage } from '@/features/patients/EditPatientPage';
import { AkteEinstieg, PatientRecordLayout } from '@/features/patients/PatientRecordLayout';
import { PatientMasterDataPage } from '@/features/patients/PatientMasterDataPage';
import { PatientAppointmentsPage } from '@/features/appointments/PatientAppointmentsPage';
import { PatientTreatmentBasesPage } from '@/features/treatment-bases/PatientTreatmentBasesPage';
import { PatientFilesPage } from '@/features/files/PatientFilesPage';
import { PatientCoursePage } from '@/features/documentation/PatientCoursePage';
import { PrescribersListPage } from '@/features/treatment-bases/PrescribersListPage';
import {
  EditPrescriberPage,
  NewPrescriberPage,
} from '@/features/treatment-bases/PrescriberFormPage';
import {
  EditTreatmentBasisPage,
  NewTreatmentBasisPage,
} from '@/features/treatment-bases/TreatmentBasisFormPage';
import { TermineUebertragenPage } from '@/features/treatment-bases/TermineUebertragenPage';
import { CalendarPage } from '@/features/appointments/CalendarPage';
import { TagUmplanenPage } from '@/features/appointments/TagUmplanenPage';
import { NewAppointmentPage } from '@/features/appointments/NewAppointmentPage';
import { NewEventPage } from '@/features/appointments/NewEventPage';
import { NewEventSeriesPage } from '@/features/appointments/NewEventSeriesPage';
import { NewAppointmentStartPage } from '@/features/appointments/NewAppointmentStartPage';
import { AppointmentSeriesPage } from '@/features/appointments/AppointmentSeriesPage';
import { AppointmentSlipPage } from '@/features/appointments/AppointmentSlipPage';
import { AppointmentDetailPage } from '@/features/appointments/AppointmentDetailPage';
import { EditAppointmentPage } from '@/features/appointments/EditAppointmentPage';
import { EditEventPage } from '@/features/appointments/EditEventPage';
import { AuditLogPage } from '@/features/audit/AuditLogPage';
import { AufbewahrungPage } from '@/features/retention/AufbewahrungPage';
import { MeinKontoPage } from '@/features/account/MeinKontoPage';
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
import { AbmeldeschutzProvider } from '@/app/AbmeldeschutzProvider';
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
import { PaymentsPage } from '@/features/billing/PaymentsPage';
import { CatalogPage } from '@/features/billing/CatalogPage';
import { InvoiceDetailPage } from '@/features/billing/InvoiceDetailPage';
import { InvoicesPage } from '@/features/billing/InvoicesPage';
import { PracticeProfilePage } from '@/features/billing/PracticeProfilePage';
import { ServicesPage } from '@/features/billing/ServicesPage';
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
  // Der Aenderungsverlauf ist ein Lesepfad: Praxisleitung und - seit E15 -
  // office sehen ihn, ohne selbst zu dokumentieren (ADR-016 Punkt 8,
  // PROJECT_PRINCIPLES.md 4.1/4.3).
  const showHistory = canReadTreatmentNote(user.roles);
  const showBilling = canSeeBilling(user.roles);

  return (
    <VorschauProvider>
      {/* Der Abmeldeschutz steht ueber der Anwendung, damit die Kopfzeile
          fragen kann und eine Dokumentationsseite darunter antworten. Die
          erzwungene Beendigung einer Sitzung laeuft ueber den
          `SessionProvider` und kommt hier nie vorbei (FIX-014). */}
      <AbmeldeschutzProvider onAbmelden={onSignOut}>
        <AppShell user={user} onSignOut={onSignOut}>
          <Routes>
            <Route path="/" element={<MyDayPage user={user} />} />
            <Route path="/bereiche" element={<BereichePage user={user} />} />
            <Route path="/vorschau/protokoll" element={<ProtokollPage />} />
            {/* Das eigene Konto steht jeder angemeldeten Rolle offen: Kennwort,
              zweiter Faktor und Sitzungen gehoeren der Person (STAFF-004). */}
            <Route path="/mein-konto" element={<MeinKontoPage user={user} />} />

            {showDirectory ? (
              <>
                <Route path="/patienten" element={<PatientsListPage />} />
                <Route path="/patienten/neu" element={<NewPatientPage />} />
                {/* Die Akte ist ein Rahmen mit fünf Bereichen (AKTE-000, seit
                  UI-002a ohne „Übersicht", seit DAT-001 mit „Dateien"). Der Rahmen lädt die Patient:in
                  einmal und protokolliert den Zugriff einmal; ein
                  Bereichswechsel wechselt nur den Inhalt. Die Formulare stehen
                  bewusst daneben und nicht darin: Wer tippt, soll die
                  Bereichsleiste nicht sehen (UX-009). */}
                <Route path="/patienten/:patientId" element={<PatientRecordLayout user={user} />}>
                  <Route index element={<AkteEinstieg />} />
                  {showAppointments ? (
                    <Route path="termine" element={<PatientAppointmentsPage />} />
                  ) : null}
                  <Route path="verordnungen" element={<PatientTreatmentBasesPage />} />
                  <Route path="verlauf" element={<PatientCoursePage />} />
                  <Route path="dateien" element={<PatientFilesPage />} />
                  <Route path="stammdaten" element={<PatientMasterDataPage />} />
                </Route>
                <Route path="/patienten/:patientId/bearbeiten" element={<EditPatientPage />} />
                {/* Die Verordnerkartei haengt am Arbeitsbereich Patient:innen: sie
                  wird ausschliesslich fuer Verordnungen gebraucht (VER-001). */}
                <Route path="/verordner" element={<PrescribersListPage />} />
                <Route path="/verordner/neu" element={<NewPrescriberPage />} />
                <Route
                  path="/verordner/:prescriberId/bearbeiten"
                  element={<EditPrescriberPage />}
                />
                {/* Verordnungen haengen an der Akte, nicht an der Verordnerkartei
                  (VER-003). Wer sie schreiben darf, prueft der Server. */}
                <Route
                  path="/patienten/:patientId/verordnungen/neu"
                  element={<NewTreatmentBasisPage />}
                />
                <Route
                  path="/patienten/:patientId/verordnungen/:grundlageId/bearbeiten"
                  element={<EditTreatmentBasisPage />}
                />
              </>
            ) : null}

            {showAppointments ? (
              <>
                <Route path="/kalender" element={<CalendarPage user={user} />} />
                {/* Tag umplanen bei einem Ausfall - aus dem Kalender heraus,
                  wenn Person und Tag dort feststehen (CAL-009). */}
                <Route path="/kalender/tag-umplanen" element={<TagUmplanenPage user={user} />} />
                {/* Termin anlegen, wenn die Zeit feststeht und die Person noch
                  nicht - aus dem Kalender heraus (UX-005). */}
                <Route path="/termine/neu" element={<NewAppointmentStartPage />} />
                {/* Ein Ereignis des Praxisbetriebs - Besprechung, Teamtermin.
                  Eigener Weg, weil er weder Patient:in noch Verordnung kennt
                  (CAL-015b). */}
                <Route path="/termine/ereignis" element={<NewEventPage user={user} />} />
                {/* Dieselbe Fehlzeit ueber mehrere Wochen (CAL-021). Eigener
                  Weg neben dem einzelnen Ereignis: Er fragt zusaetzlich nach
                  Rhythmus und Anzahl und legt eine Serie an. */}
                <Route path="/termine/dauerfehlzeit" element={<NewEventSeriesPage user={user} />} />
                <Route
                  path="/patienten/:patientId/termine/neu"
                  element={<NewAppointmentPage user={user} />}
                />
                <Route
                  path="/termine/:appointmentId"
                  element={<AppointmentDetailPage user={user} />}
                />
                {/* Das ganze Ereignis - Bezeichnung, Zeit und Ort fuer alle
                    Beteiligten zugleich (CAL-017). Der Weg daneben aendert
                    eine einzelne Teilnahme. */}
                <Route
                  path="/termine/:appointmentId/ereignis-bearbeiten"
                  element={<EditEventPage user={user} />}
                />
                <Route
                  path="/termine/:appointmentId/bearbeiten"
                  element={<EditAppointmentPage user={user} />}
                />
                {/* Terminserie aus einer Verordnung - der Einstieg steht in der
                  Akte an der Verordnung, weil dort das Kontingent steht
                  (CAL-007). */}
                <Route
                  path="/patienten/:patientId/verordnungen/:grundlageId/serie"
                  element={<AppointmentSeriesPage user={user} />}
                />
                {/* Ungedeckte Termine auf eine andere Grundlage uebertragen
                  (CAL-022). Eine Seite fuer beide Einstiege aus der Akte: Das
                  Ziel steht in `?ziel=` oder wird hier gewaehlt - deshalb
                  haengt die Adresse an der Akte und nicht an einer Grundlage. */}
                <Route
                  path="/patienten/:patientId/termine-uebertragen"
                  element={<TermineUebertragenPage user={user} />}
                />
                {/* Terminzettel zum Ausdrucken - ein Blatt fuer die Patient:in
                  (CAL-011, IDEA-PRX-006). */}
                <Route
                  path="/patienten/:patientId/terminzettel"
                  element={<AppointmentSlipPage />}
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
                <Route path="/abrechnung" element={<InvoicesPage user={user} />} />
                <Route
                  path="/abrechnung/rechnungen/:invoiceId"
                  element={<InvoiceDetailPage user={user} />}
                />
                <Route path="/abrechnung/leistungen" element={<ServicesPage />} />
                <Route path="/abrechnung/katalog" element={<CatalogPage user={user} />} />
                <Route
                  path="/abrechnung/stammdaten"
                  element={<PracticeProfilePage user={user} />}
                />
                <Route path="/abrechnung/zahlungen" element={<PaymentsPage user={user} />} />
              </>
            ) : null}

            {showSecurity ? (
              <>
                <Route path="/praxis/sicherheit/audit" element={<AuditLogPage />} />
                {/* Aufbewahrung und Loeschung stehen neben dem Auditlog: beide
                  sind Nachweise der Praxisleitung (LOE-002b, ADR-008). */}
                <Route
                  path="/praxis/sicherheit/aufbewahrung"
                  element={<AufbewahrungPage user={user} />}
                />
              </>
            ) : null}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </AppShell>
      </AbmeldeschutzProvider>
    </VorschauProvider>
  );
}
