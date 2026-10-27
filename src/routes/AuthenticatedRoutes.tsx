import { EingangPage } from '@/features/workplace/organisation/EingangPage';
import { NeuerAntragPage } from '@/features/workplace/organisation/NeuerAntragPage';
import { BarometerPage } from '@/features/workplace/feedback/BarometerPage';
import { RueckmeldungPage } from '@/features/workplace/feedback/RueckmeldungPage';
import { PraxisEinstellungenPage } from '@/features/workplace/practice-settings/PraxisEinstellungenPage';
import { Navigate, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { AppShell } from '@/app/AppShell';
import { KeinZugang } from '@/app/KeinZugang';
import { BereichePage } from '@/app/BereichePage';
import { MdrSperre } from '@/app/MdrSperre';
import { mdrSperre } from '@/app/mdr';
import { canSeeBilling } from '@/app/navigation';
import { MyDayPage } from '@/features/calendar/today/MyDayPage';
import { OpenPointsPage } from '@/features/workplace/open-points/OpenPointsPage';
import { CallListPage } from '@/features/workplace/open-points/CallListPage';
import { PatientsListPage } from '@/features/patients/PatientsListPage';
import { NewPatientPage } from '@/features/patients/NewPatientPage';
import { EditPatientPage } from '@/features/patients/EditPatientPage';
import {
  AkteEinstieg,
  AlterAktenbereich,
  PatientRecordLayout,
} from '@/features/patients/PatientRecordLayout';
import { ALTE_AKTENBEREICHE } from '@/features/patients/akte';
import { PatientMasterDataPage } from '@/features/patients/PatientMasterDataPage';
import { BetroffenenrechtePage } from '@/features/privacy/datenschutz/BetroffenenrechtePage';
import { TrainingAuskunftPage } from '@/features/privacy/datenschutz/TrainingAuskunftPage';
import { ZusammenfuehrenPage } from '@/features/patients/ZusammenfuehrenPage';
import { AufnahmeblaetterPage } from '@/features/privacy/datenschutz/AufnahmeblaetterPage';
import { PatientAppointmentsPage } from '@/features/calendar/appointments/PatientAppointmentsPage';
import { PatientTreatmentBasesPage } from '@/features/patients/treatment-bases/PatientTreatmentBasesPage';
import { PatientBefundSeite } from '@/features/clinical/assessments/PatientBefundPage';
import { PatientDokuPage } from '@/features/clinical/documentation/PatientDokuPage';
import { ErhebungPage } from '@/features/clinical/assessments/ErhebungPage';
import { ErstaufnahmePage } from '@/features/patients/intake/ErstaufnahmePage';
import { TherapieberichtPage } from '@/features/clinical/therapy-reports/TherapieberichtPage';
import { TherapieberichtDruckPage } from '@/features/clinical/therapy-reports/TherapieberichtDruckPage';
import { PrescribersListPage } from '@/features/patients/treatment-bases/PrescribersListPage';
import {
  EditPrescriberPage,
  NewPrescriberPage,
} from '@/features/patients/treatment-bases/PrescriberFormPage';
import {
  EditTreatmentBasisPage,
  NewTreatmentBasisPage,
} from '@/features/patients/treatment-bases/TreatmentBasisFormPage';
import { TermineUebertragenPage } from '@/features/calendar/appointments/TermineUebertragenPage';
import { CalendarPage } from '@/features/calendar/appointments/CalendarPage';
import { TagUmplanenPage } from '@/features/calendar/appointments/TagUmplanenPage';
import { NewAppointmentPage } from '@/features/calendar/appointments/NewAppointmentPage';
import { NewEventPage } from '@/features/calendar/appointments/NewEventPage';
import { NewEventSeriesPage } from '@/features/calendar/appointments/NewEventSeriesPage';
import { NewAppointmentStartPage } from '@/features/calendar/appointments/NewAppointmentStartPage';
import { DauerterminStartPage } from '@/features/calendar/appointments/DauerterminStartPage';
import { AppointmentSeriesPage } from '@/features/calendar/appointments/AppointmentSeriesPage';
import { AppointmentSlipPage } from '@/features/calendar/appointments/AppointmentSlipPage';
import { EditAppointmentPage } from '@/features/calendar/appointments/EditAppointmentPage';
import { EditEventPage } from '@/features/calendar/appointments/EditEventPage';
import { AuditLogPage } from '@/features/privacy/audit/AuditLogPage';
import { WaitlistPage } from '@/features/calendar/waitlist/WaitlistPage';
import { TerritoriesPage } from '@/features/calendar/territories/TerritoriesPage';
import { SlotSearchPage } from '@/features/calendar/slot-search/SlotSearchPage';
import {
  EditWaitlistEntryPage,
  NewWaitlistEntryPage,
} from '@/features/calendar/waitlist/WaitlistFormPage';
import { AufbewahrungPage } from '@/features/privacy/retention/AufbewahrungPage';
import { MeinKontoPage } from '@/features/workplace/account/MeinKontoPage';
import { StaffListPage } from '@/features/workforce/staff/StaffListPage';
import { NewStaffMemberPage } from '@/features/workforce/staff/NewStaffMemberPage';
import { EditStaffMemberPage } from '@/features/workforce/staff/EditStaffMemberPage';
import { StaffMemberDetailPage } from '@/features/workforce/staff/StaffMemberDetailPage';
import { CompleteTreatmentPage } from '@/features/clinical/documentation/CompleteTreatmentPage';
import { TextbausteinePage } from '@/features/clinical/documentation/TextbausteinePage';
import { InstrumentePage } from '@/features/clinical/assessments/InstrumentePage';
import { TreatmentNotePage } from '@/features/clinical/documentation/TreatmentNotePage';
import { TreatmentNoteRevisionPage } from '@/features/clinical/documentation/TreatmentNoteRevisionPage';
import { TreatmentNoteAddendumPage } from '@/features/clinical/documentation/TreatmentNoteAddendumPage';
import { TreatmentNoteHistoryPage } from '@/features/clinical/documentation/TreatmentNoteHistoryPage';
import { VorschauProvider } from '@/features/core/preview/VorschauProvider';
import { AbstecherAbmeldewache } from '@/app/AbstecherAbmeldewache';
import { AbmeldeschutzProvider } from '@/app/AbmeldeschutzProvider';
import { PraxisAblage } from '@/features/clinical/offline-documentation/PraxisAblage';
import { AufDemGeraetPage } from '@/features/clinical/offline-documentation/AufDemGeraetPage';
import { EntwurfAbmeldewache } from '@/features/clinical/offline-documentation/EntwurfAbmeldewache';
import { TagesplanRaeumen } from '@/features/clinical/offline-documentation/TagesplanRaeumen';
import { AusgangAbmeldewache } from '@/features/teamchat/AusgangAbmeldewache';
import { ABLAGE_FUER_PRAXISKONTEN } from '@/features/clinical/offline-documentation/servicePhone';
import { ProtokollPage } from '@/features/core/preview/ProtokollPage';
import { FleetPage } from '@/features/fleet/FleetPage';
import { AkteErnaehrung } from '@/features/nutrition/ErnaehrungReiter';
import { BeratungsterminSeite } from '@/features/nutrition/BeratungsterminSeite';
import {
  LebensmittelPage,
  PraxisLebensmittelBearbeiten,
  PraxisLebensmittelNeu,
} from '@/features/nutrition/LebensmittelPage';
import {
  ProfilAendernSeite,
  ProfilAnlegenSeite,
  ZielwerteSeite,
} from '@/features/nutrition/ProfilFormular';
import { BikePage } from '@/features/fleet/BikePage';
import { BikeNewPage } from '@/features/fleet/BikeNewPage';
import { DepotsPage } from '@/features/fleet/DepotsPage';
import { KeyPage } from '@/features/fleet/KeyPage';
import { CheckupPage } from '@/features/fleet/CheckupPage';
import { BreakdownPage } from '@/features/fleet/BreakdownPage';
import { WerkstattblattPage } from '@/features/fleet/WerkstattblattPage';
import { MeldungenPage, MeldungPage } from '@/features/fleet/MeldungenPage';
import { AnspruchPage } from '@/features/workforce/vacation/AnspruchPage';
import { UrlaubBeantragenPage } from '@/features/workforce/vacation/UrlaubBeantragenPage';
import { UrlaubEntscheidenPage } from '@/features/workforce/vacation/UrlaubEntscheidenPage';
import { UrlaubTerminePage } from '@/features/workforce/vacation/UrlaubTerminePage';
import { VacationPage } from '@/features/workforce/vacation/VacationPage';
import { DecideWorkingTimePage } from '@/features/workforce/working-time/DecideWorkingTimePage';
import { RequestWorkingTimePage } from '@/features/workforce/working-time/RequestWorkingTimePage';
import { WorkingTimePage } from '@/features/workforce/working-time/WorkingTimePage';
import { RecordTimeAccountPage } from '@/features/workforce/timeaccount/RecordTimeAccountPage';
import { RejectTimeAccountEntryPage } from '@/features/workforce/timeaccount/RejectTimeAccountEntryPage';
import { TimeAccountPage } from '@/features/workforce/timeaccount/TimeAccountPage';
import { PlanPage } from '@/features/exercise/exercise-plans/PlanPage';
import { PlanblattSeite } from '@/features/exercise/exercise-plans/PlanblattSeite';
import { DecideReimbursementPage } from '@/features/workforce/reimbursements/DecideReimbursementPage';
import { PayReimbursementPage } from '@/features/workforce/reimbursements/PayReimbursementPage';
import { PayoutAccountPage } from '@/features/workforce/reimbursements/PayoutAccountPage';
import { ReimbursementsPage } from '@/features/workforce/reimbursements/ReimbursementsPage';
import { RequestReimbursementPage } from '@/features/workforce/reimbursements/RequestReimbursementPage';
import { TeamchatRahmen } from '@/features/teamchat/TeamchatRahmen';
import { FlottenNachrichtenPage } from '@/features/teamchat/FlottenNachrichtenPage';
import { FuerDichPage } from '@/features/teamchat/FuerDichPage';
import { EntwuerfePage } from '@/features/teamchat/EntwuerfePage';
import { GemerktPage } from '@/features/teamchat/GemerktPage';
import { GespraechPage } from '@/features/teamchat/GespraechPage';
import { NeuPage } from '@/features/teamchat/NeuPage';
import { SuchePage } from '@/features/teamchat/SuchePage';
import { ThreadsPage } from '@/features/teamchat/ThreadsPage';
import { RueckfragePage, RueckfragenPage } from '@/features/portal/messages/RueckfragenPage';
import { TourenPage } from '@/features/calendar/tours/TourenPage';
import { PaymentsPage } from '@/features/billing/PaymentsPage';
import { CatalogPage } from '@/features/billing/CatalogPage';
import { CancellationPrintPage } from '@/features/billing/CancellationPrintPage';
import { InvoiceDetailPage } from '@/features/billing/InvoiceDetailPage';
import { InvoicePrintPage } from '@/features/billing/InvoicePrintPage';
import { SammeldruckPage } from '@/features/billing/SammeldruckPage';
import { ReminderPrintPage } from '@/features/billing/ReminderPrintPage';
import { InvoicesPage } from '@/features/billing/InvoicesPage';
import { PracticeProfilePage } from '@/features/billing/PracticeProfilePage';
import { RevenuePage } from '@/features/billing/RevenuePage';
import { StatisticsPage } from '@/features/billing/statistics/StatisticsPage';
import { NewTrainingClientPage } from '@/features/training/NewTrainingClientPage';
import { TrainingClientPage } from '@/features/training/TrainingClientPage';
import { NewTrainingAppointmentPage } from '@/features/training/NewTrainingAppointmentPage';
import { EditTrainingAppointmentPage } from '@/features/training/EditTrainingAppointmentPage';
import { TrainingAppointmentPage } from '@/features/training/TrainingAppointmentPage';
import { TrainingClientsPage } from '@/features/training/TrainingClientsPage';
import { UebungenPage } from '@/features/exercise/exercises/UebungenPage';
import { UebungPage } from '@/features/exercise/exercises/UebungPage';
import { DurchsichtPage } from '@/features/exercise/exercises/DurchsichtPage';
import { VorlagenPage } from '@/features/exercise/exercise-plans/VorlagenPage';
import { ServicesPage } from '@/features/billing/ServicesPage';
import {
  canManageAppointments,
  canManageStaffMasterData,
  canReadExerciseLibrary,
  canReadExercisePlans,
  canReadPatientDirectory,
  canReadTrainingClients,
  canSeeCalendar,
  canReadTreatmentNote,
  canWriteTrainingClients,
  canWriteTreatmentNote,
  isOwner,
  canCounselNutrition,
  isStaff,
  isTherapyStaff,
  type CurrentUser,
} from '@/features/core/session/types';
import { kalenderZumTermin } from '@/lib/termin';

/**
 * Routen des angemeldeten Bereichs.
 *
 * Die Rollenprüfung hier steuert die Navigation. Sie ist KEINE
 * Zugriffskontrolle - diese liegt vollständig in den RLS-Policies (ADR-004).
 * Ein Patientenkonto, das die Route direkt aufruft, bekommt vom Server schlicht
 * keine Daten.
 *
 * Die Routen sind nach den Arbeitsbereichen geordnet. Die Pfade der
 * bereits angebundenen Seiten bleiben unverändert: Sie stehen in Lesezeichen,
 * in geteilten Links und in den bestehenden Tests. Geändert haben sich
 * Einordnung und Beschriftung, nicht die Adresse.
 *
 * `VorschauProvider` hält den Zustand der noch nicht angebundenen Bereiche.
 * Er lebt nur im Arbeitsspeicher und spricht mit keinem Server.
 *
 * **Über der Routentabelle steht der MDR-Riegel** (`@/app/mdr`, ANN-089). Er
 * greift vor jeder Route, nicht als eine unter ihnen: Eine später eingetragene
 * Route für eine klassifizierte Funktion wäre sonst die speziellere und
 * gewönne. Ein Feature-Flag ersetzt die regulatorische Prüfung nicht
 * (ADR-006 Punkt 13) — deshalb ist dies kein Schalter, sondern eine Sperre
 * ohne Gegenstück.
 */
export function AuthenticatedRoutes({
  user,
  onSignOut,
}: {
  user: CurrentUser;
  onSignOut: () => void;
}) {
  const { pathname } = useLocation();
  const gesperrt = mdrSperre(pathname);
  const showDirectory = canReadPatientDirectory(user.roles);
  const showSecurity = isOwner(user.roles);
  // ERN-001: die Fähigkeit „Ernährungsberatung“ (ADR-027 Punkt 4).
  const showNutrition = canCounselNutrition(user.roles);
  const showAppointments = canManageAppointments(user.roles);
  // Wie die Navigation: die Bereiche mit Daten der Behandlungsseite, nicht
  // für ein reines Trainingskonto (TRN-003).
  const showOperations = isTherapyStaff(user.roles);
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
  const showStatistics = showSecurity || (isStaff(user.roles) && user.revenueShare);
  // Training (TRN-EPIC-001): owner, Trainingsbetreuung, Büro - ohne therapist
  // und team_lead (ADR-021 Punkt 6). Verbindlich prüft der Server.
  const showTraining = canReadTrainingClients(user.roles);
  const showCalendar = canSeeCalendar(user.roles);
  // Übungsbibliothek (UEB-EPIC-001): wer Übungen anleitet, in Behandlung und
  // Training, und seit ABN-030 das Büro (BEF-137). Verbindlich prüft der Server.
  const showExercises = canReadExerciseLibrary(user.roles);

  return (
    <VorschauProvider>
      {/* Der Abmeldeschutz steht ueber der Anwendung, damit die Kopfzeile
          fragen kann und eine Dokumentationsseite darunter antworten. Die
          erzwungene Beendigung einer Sitzung laeuft ueber den
          `SessionProvider` und kommt hier nie vorbei (FIX-014). */}
      <AbmeldeschutzProvider onAbmelden={onSignOut}>
        {/* Ein Abstecher-Entwurf geht beim Abmelden nur nach Rückfrage
            verloren (ABN-019, BEF-110). */}
        <AbstecherAbmeldewache userId={user.profile.id} />
        {/* TEAM-002: ungesendete Nachrichten des Teamchats nur nach Rückfrage verwerfen. */}
        <AusgangAbmeldewache kontoId={user.profile.id} />
        {/* OFF-EPIC-001: Tagesplan und Entwürfe auf dem Diensttelefon (ADR-024 Punkt 6). */}
        {ABLAGE_FUER_PRAXISKONTEN && canWriteTreatmentNote(user.roles) ? (
          <>
            <PraxisAblage
              besitzer={user.profile.id}
              staffMemberId={user.staffMemberId}
              zeitzone={user.organizationTimeZone ?? 'Europe/Berlin'}
            />
            {/* Abmelden mit Entwürfen auf dem Gerät: Zahl und Wahl (ADR-024 Punkt 6). */}
            <EntwurfAbmeldewache besitzer={user.profile.id} />
          </>
        ) : ABLAGE_FUER_PRAXISKONTEN ? (
          // Ohne Dokumentationsrecht kein Tagesplan auf dem Gerät (BEF-150).
          <TagesplanRaeumen besitzer={user.profile.id} />
        ) : null}
        <AppShell user={user} onSignOut={onSignOut}>
          {gesperrt ? (
            <MdrSperre eintrag={gesperrt} />
          ) : (
            <Routes>
              <Route path="/" element={<MyDayPage user={user} />} />
              <Route path="/bereiche" element={<BereichePage user={user} />} />
              <Route path="/vorschau/protokoll" element={<ProtokollPage />} />
              {/* Das eigene Konto steht jeder angemeldeten Rolle offen: Kennwort,
              zweiter Faktor und Sitzungen gehoeren der Person (STAFF-004). */}
              <Route path="/mein-konto" element={<MeinKontoPage user={user} />} />

              {showDirectory ? (
                <>
                  {/* Offene Punkte - die Büroliste: alle vier Praxisrollen; jede
                  Liste prüft der Server selbst. */}
                  <Route path="/offen" element={<OpenPointsPage user={user} />} />
                  <Route path="/patienten" element={<PatientsListPage />} />
                  <Route path="/patienten/neu" element={<NewPatientPage />} />
                  {/* Die Akte ist ein Rahmen: Er lädt die Patient:in einmal und protokolliert
                  den Zugriff einmal. Die Formulare stehen bewusst daneben und nicht darin:
                  Wer tippt, soll die Bereichsleiste nicht sehen. */}
                  <Route path="/patienten/:patientId" element={<PatientRecordLayout user={user} />}>
                    <Route index element={<AkteEinstieg />} />
                    {showAppointments ? (
                      <Route path="termine" element={<PatientAppointmentsPage />} />
                    ) : null}
                    <Route path="verordnungen" element={<PatientTreatmentBasesPage />} />
                    <Route path="doku" element={<PatientDokuPage />} />
                    <Route path="doku/befund" element={<PatientBefundSeite />} />
                    <Route path="stammdaten" element={<PatientMasterDataPage />} />
                    {/* Ernährung nur für die Fähigkeit „Ernährungsberatung“;
                    verbindlich prüft der Server (ADR-027 Punkt 4). */}
                    {showNutrition ? (
                      <Route path="ernaehrung" element={<AkteErnaehrung />} />
                    ) : null}
                    {Object.keys(ALTE_AKTENBEREICHE).map((alt) => (
                      <Route
                        key={alt}
                        path={alt}
                        element={<AlterAktenbereich alt={alt as keyof typeof ALTE_AKTENBEREICHE} />}
                      />
                    ))}
                  </Route>
                  <Route path="/patienten/:patientId/bearbeiten" element={<EditPatientPage />} />
                  {/* Die Formulare der Ernährungsberatung neben dem Rahmen. */}
                  {showNutrition ? (
                    <>
                      <Route
                        path="/patienten/:patientId/ernaehrung/neu"
                        element={<ProfilAnlegenSeite art="treatment" user={user} />}
                      />
                      <Route
                        path="/patienten/:patientId/ernaehrung/bearbeiten"
                        element={<ProfilAendernSeite art="treatment" user={user} />}
                      />
                      <Route
                        path="/patienten/:patientId/ernaehrung/zielwerte"
                        element={<ZielwerteSeite art="treatment" />}
                      />
                      <Route
                        path="/patienten/:patientId/ernaehrung/termin"
                        element={<BeratungsterminSeite art="treatment" user={user} />}
                      />
                    </>
                  ) : null}
                  {/* Lebensmittel in der Bibliothek - nachschlagen und die der Praxis
                  pflegen; allein die Fähigkeit (ADR-027 Punkt 4). */}
                  {showNutrition ? (
                    <>
                      <Route path="/praxis/lebensmittel" element={<LebensmittelPage />} />
                      <Route path="/praxis/lebensmittel/neu" element={<PraxisLebensmittelNeu />} />
                      <Route
                        path="/praxis/lebensmittel/:foodId"
                        element={<PraxisLebensmittelBearbeiten />}
                      />
                    </>
                  ) : null}
                  {/* Ein Übungsplan der Akte - neben dem Rahmen, wie die Formulare. Lesen
                  alle vier Praxisrollen, schreiben therapist und team_lead (ANN-298);
                  verbindlich prüft der Server. */}
                  <Route path="/patienten/:patientId/plaene/:planId" element={<PlanPage />} />
                  <Route
                    path="/patienten/:patientId/plaene/:planId/blatt"
                    element={<PlanblattSeite user={user} />}
                  />
                  {/* K10: Erstaufnahme gefuehrt - ausserhalb des Rahmens wie die
                  Erhebung; jeder Schritt prueft sein Recht auf dem Server. */}
                  <Route
                    path="/patienten/:patientId/erstaufnahme"
                    element={<ErstaufnahmePage user={user} />}
                  />
                  {/* Fragebogen erheben - ausserhalb des Rahmens. */}
                  <Route
                    path="/patienten/:patientId/befund/erheben"
                    element={<ErhebungPage user={user} />}
                  />
                  {/* Datenschutzinformation und Ausfallhonorar-Regel zum
                  Ausdrucken - ohne Patientenbezug, aber aus der Akte heraus
                  gedruckt (PAT-006). */}
                  <Route
                    path="/patienten/:patientId/aufnahmeblaetter"
                    element={<AufnahmeblaetterPage user={user} />}
                  />
                  {/* Auskunft und Loeschverlangen stehen neben der Akte: Sie sind Vorgaenge
                  der Praxisleitung, keine Bereiche der taeglichen Arbeit. Nur `owner` -
                  verbindlich pruefen das die beiden Serverfunktionen (ADR-004). */}
                  {showSecurity ? (
                    <Route
                      path="/patienten/:patientId/auskunft"
                      element={<BetroffenenrechtePage />}
                    />
                  ) : null}
                  {/* Eine Dublette uebernehmen: ebenfalls ein Vorgang der
                  Praxisleitung neben der Akte (PRX-018). Nur `owner`;
                  verbindlich prueft `merge_patients` (ADR-004). */}
                  {showSecurity ? (
                    <Route
                      path="/patienten/:patientId/dublette"
                      element={<ZusammenfuehrenPage />}
                    />
                  ) : null}
                  {/* Die Verordnerkartei haengt am Arbeitsbereich Patient:innen: sie
                  wird ausschliesslich fuer Verordnungen gebraucht. */}
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

              {showCalendar ? (
                // Der Kalender auch für die Trainingsbetreuung: Sie sieht darin nur
                // Trainingstermine, der Server filtert je Termin.
                <Route path="/kalender" element={<CalendarPage user={user} />} />
              ) : null}
              {showAppointments ? (
                <>
                  {/* Tag umplanen bei einem Ausfall - aus dem Kalender heraus,
                  wenn Person und Tag dort feststehen (CAL-009). */}
                  <Route path="/kalender/tag-umplanen" element={<TagUmplanenPage user={user} />} />
                  {/* Anrufliste mit gespeichertem Stand: Rollen wie der
                  Mitteilungsvermerk; der Server prüft app.can_update_appointment. */}
                  <Route path="/offen/anrufe" element={<CallListPage user={user} />} />
                  {/* Warteliste mit Wunschzeiten: dieselben Rollen wie der Kalender; der
                  Server prüft ebenso (app.can_create_appointment). */}
                  <Route path="/warteliste" element={<WaitlistPage user={user} />} />
                  <Route path="/warteliste/neu" element={<NewWaitlistEntryPage />} />
                  <Route
                    path="/warteliste/:entryId/bearbeiten"
                    element={<EditWaitlistEntryPage />}
                  />
                  {/* Terminsuche als Vorschlagsliste. */}
                  <Route
                    path="/patienten/:patientId/plaetze"
                    element={<SlotSearchPage user={user} />}
                  />
                  {/* Termin anlegen, wenn die Zeit feststeht und die Person noch
                  nicht - aus dem Kalender heraus (UX-005). */}
                  <Route path="/termine/neu" element={<NewAppointmentStartPage />} />
                  {/* Dauertermin aus dem Kalender ohne Vorauswahl: erst die
                  Person, dann die Grundlage, dann die Serie (BEF-042). */}
                  <Route
                    path="/termine/dauertermin"
                    element={<DauerterminStartPage user={user} />}
                  />
                  {/* Ein Ereignis des Praxisbetriebs - Besprechung, Teamtermin.
                  Eigener Weg, weil er weder Patient:in noch Verordnung kennt
                  (CAL-015b). */}
                  <Route path="/termine/ereignis" element={<NewEventPage user={user} />} />
                  {/* Dieselbe Fehlzeit ueber mehrere Wochen. Eigener Weg neben dem
                  einzelnen Ereignis: Er fragt zusaetzlich nach Rhythmus und Anzahl und
                  legt eine Serie an. */}
                  <Route
                    path="/termine/dauerfehlzeit"
                    element={<NewEventSeriesPage user={user} />}
                  />
                  <Route
                    path="/patienten/:patientId/termine/neu"
                    element={<NewAppointmentPage user={user} />}
                  />
                  {/* Der Termin hat keine eigene Seite mehr (Akte entschlacken,
                    2026-10-03): Lesezeichen und alte Verweise führen in den
                    Kalender, der den Termin wählt. */}
                  <Route path="/termine/:appointmentId" element={<ZumKalender />} />
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
                  {/* Ungedeckte Termine auf eine andere Grundlage uebertragen: Das Ziel steht
                  in `?ziel=` oder wird hier gewaehlt - deshalb haengt die Adresse an der
                  Akte und nicht an einer Grundlage. */}
                  <Route
                    path="/patienten/:patientId/termine-uebertragen"
                    element={<TermineUebertragenPage user={user} />}
                  />
                  {/* Terminzettel zum Ausdrucken - ein Blatt fuer die Patient:in
                  (CAL-011, IDEA-PRX-006). */}
                  <Route
                    path="/patienten/:patientId/terminzettel"
                    element={<AppointmentSlipPage user={user} />}
                  />
                  {/* Tagesroute auf der Karte. */}
                  <Route path="/touren" element={<TourenPage user={user} />} />
                  {/* Die Planung je Person steht auf „Arbeitszeit"; die alte Adresse
                      führt mit Person und Rückweg dorthin. */}
                  <Route path="/praxis/planung" element={<ZurArbeitszeit />} />
                  {/* Gebietstage: lesen die Rollen der Terminverwaltung, pflegen owner,
                  team_lead und office (Server). */}
                  <Route path="/praxis/gebiete" element={<TerritoriesPage user={user} />} />
                </>
              ) : null}

              {showDocumentation ? (
                <>
                  {/* Behandlung abschliessen in einem Schritt. */}
                  {/* Tagesplan und Entwürfe des Diensttelefons. */}
                  {ABLAGE_FUER_PRAXISKONTEN ? (
                    <Route path="/auf-dem-geraet" element={<AufDemGeraetPage user={user} />} />
                  ) : null}
                  <Route
                    path="/termine/:appointmentId/abschluss"
                    element={<CompleteTreatmentPage user={user} />}
                  />
                  {/* Eine Schreibseite (Design-Handoff 2026-10-01, Abschnitt
                  6a): Der Haupteintrag wird nur noch dort geschrieben.
                  Nachtrag-Entwürfe behalten ihre eigene Adresse. */}
                  <Route
                    path="/termine/:appointmentId/dokumentation"
                    element={<ZurSchreibseite />}
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
                  {/* Ohne Pflege bliebe die Bausteinleiste dauerhaft leer. */}
                  <Route path="/praxis/textbausteine" element={<TextbausteinePage user={user} />} />
                  {/* Therapiebericht schreiben - ausserhalb des Rahmens wie jedes
                  Formular. */}
                  <Route
                    path="/patienten/:patientId/berichte/:berichtId"
                    element={<TherapieberichtPage user={user} />}
                  />
                </>
              ) : null}

              {/* Das Blatt zum Drucken ist ein Lesepfad - office liest und druckt,
              schreibt aber nicht (ADR-004 Punkt 3). */}
              {showHistory ? (
                <Route
                  path="/patienten/:patientId/berichte/:berichtId/druck"
                  element={<TherapieberichtDruckPage user={user} />}
                />
              ) : null}

              {showHistory ? (
                <Route
                  path="/termine/:appointmentId/dokumentation/:noteId/verlauf"
                  element={<TreatmentNoteHistoryPage user={user} />}
                />
              ) : null}

              {/* Der Teamchat für jede Praxisrolle, auch die Trainingsbetreuung
              (ANN-611); wer liest, entscheidet der Server. Ein Rahmen mit den
              Gesprächen links (ab 900 px, ANN-648). */}
              {isStaff(user.roles) ? (
                <>
                  <Route path="/team" element={<TeamchatRahmen user={user} />}>
                    {/* `/team` und ein Gespräch: dieselbe Seite an derselben
                        Stelle, wie Gespräch und Thread unten - der Tipp auf
                        das schon offene Gespräch baut nichts neu auf. */}
                    <Route index element={<GespraechPage />} />
                    <Route path="neu" element={<NeuPage />} />
                    <Route path="threads" element={<ThreadsPage />} />
                    <Route path="gemerkt" element={<GemerktPage />} />
                    <Route path="entwuerfe" element={<EntwuerfePage />} />
                    <Route path="suche" element={<SuchePage />} />
                    {/* Gespräch und Thread: dieselbe Komponente an derselben
                        Stelle - React baut sie beim Öffnen eines Threads nicht
                        neu auf, das Gespräch bleibt mit Scrollstand stehen. */}
                    <Route path=":kanalId" element={<GespraechPage />} />
                    <Route path=":kanalId/:threadId" element={<GespraechPage />} />
                  </Route>
                  <Route path="/fuer-dich" element={<FuerDichPage user={user} />} />
                </>
              ) : null}

              {showOperations ? (
                <>
                  <Route path="/praxis/team" element={<StaffListPage user={user} />} />
                  {/* ANN-322: Die Instrumentenbibliothek hat keinen Personenbezug und
                  steht allen Rollen der Behandlungsseite offen, wie ihr Menüpunkt. */}
                  <Route path="/praxis/instrumente" element={<InstrumentePage />} />
                  <Route
                    path="/praxis/team/:staffMemberId"
                    element={<StaffMemberDetailPage user={user} />}
                  />
                  {/* Rückfragen aus der Behandlung. */}
                  <Route path="/rueckfragen" element={<RueckfragenPage user={user} />} />
                  {/* Die Radflotte: Lesen dürfen alle Praxisrollen der Behandlung, Räder
                  und Depots pflegt die Inhaber:in, freigeben und sperren auch die
                  Teamleitung - das entscheidet der Server (ANN-550). */}
                  <Route path="/betrieb/flotte" element={<FleetPage user={user} />} />
                  <Route path="/betrieb/flotte/rad/neu" element={<BikeNewPage user={user} />} />
                  <Route path="/betrieb/flotte/rad/:radId" element={<BikePage user={user} />} />
                  {/* Die Unterlage für die Werkstatt - ein Druckblatt wie die
                  Rechnung (Handoff Lastenrad 3D, Vorschlag 6). */}
                  <Route
                    path="/betrieb/flotte/rad/:radId/werkstatt"
                    element={<WerkstattblattPage user={user} />}
                  />
                  <Route path="/betrieb/flotte/depots" element={<DepotsPage user={user} />} />
                  <Route path="/betrieb/flotte/schluessel" element={<KeyPage user={user} />} />
                  <Route path="/betrieb/flotte/checkup" element={<CheckupPage user={user} />} />
                  <Route path="/betrieb/flotte/panne" element={<BreakdownPage user={user} />} />
                  {/* ANN-613: das Gespräch der Radflotte. */}
                  <Route
                    path="/betrieb/flotte/nachrichten"
                    element={<FlottenNachrichtenPage user={user} />}
                  />
                  <Route
                    path="/betrieb/flotte/nachrichten/:threadId"
                    element={<FlottenNachrichtenPage user={user} />}
                  />
                  {/* ANN-569: Check-Ups und Pannen aller Räder für Inhaber:in und
                  Teamleitung - der Server weist alle anderen ab. */}
                  <Route path="/betrieb/flotte/meldungen" element={<MeldungenPage user={user} />} />
                  <Route
                    path="/betrieb/flotte/meldungen/:art/:meldungId"
                    element={<MeldungPage user={user} />}
                  />
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
                  {/* Das Rechnungsblatt zum Verschicken - eine eigene Seite,
                  weil ein Brief kein Bedienbildschirm ist (ABR-003b, B14
                  Weg 1). */}
                  <Route
                    path="/abrechnung/rechnungen/:invoiceId/druck"
                    element={<InvoicePrintPage />}
                  />
                  {/* Die Rechnungen eines Abrechnungslaufs in einem
                  Druckauftrag (K13); die Adresse traegt nur Kennungen. */}
                  <Route path="/abrechnung/druck" element={<SammeldruckPage />} />
                  {/* Das Stornodokument zu einer Rechnung - ein eigenes Blatt
                  mit eigener Nummer, das an denselben Empfaenger geht
                  (ABR-003c, ADR-009 Punkt 9). */}
                  <Route
                    path="/abrechnung/rechnungen/:invoiceId/storno"
                    element={<CancellationPrintPage />}
                  />
                  {/* Die Zahlungserinnerung haengt an ihrer eigenen Kennung und
                  nicht an der Rechnung: Es kann mehrere geben, und jede haelt
                  den Betrag ihres Tages fest (ABR-003d, ANN-080). */}
                  <Route
                    path="/abrechnung/erinnerungen/:reminderId"
                    element={<ReminderPrintPage />}
                  />
                  <Route path="/abrechnung/leistungen" element={<ServicesPage />} />
                  <Route path="/abrechnung/katalog" element={<CatalogPage user={user} />} />
                  <Route
                    path="/abrechnung/stammdaten"
                    element={<PracticeProfilePage user={user} />}
                  />
                  <Route path="/abrechnung/zahlungen" element={<PaymentsPage user={user} />} />
                  {/* Einnahmen je Leistungsart - eine lesende Seite ueber
                  ausgestellte Dokumente und gebuchte Zahlungen, ohne
                  Personenbezug (ABR-011, ADR-009 Punkt 19). */}
                  <Route path="/abrechnung/auswertung" element={<RevenuePage />} />
                </>
              ) : null}

              {showSecurity ? (
                <>
                  {/* Die Einstellungen der Praxis, eigene Ansicht unter Praxis. */}
                  <Route
                    path="/praxis/einstellungen"
                    element={<PraxisEinstellungenPage user={user} />}
                  />
                  <Route path="/praxis/sicherheit/audit" element={<AuditLogPage />} />
                  {/* Aufbewahrung und Loeschung stehen neben dem Auditlog: beide
                  sind Nachweise der Praxisleitung (LOE-002b, ADR-008). */}
                  <Route
                    path="/praxis/sicherheit/aufbewahrung"
                    element={<AufbewahrungPage user={user} />}
                  />
                </>
              ) : null}
              {showStatistics ? (
                // Kennzahlen der Praxisfuehrung; fuer eine Person mit
                // Umsatzbeteiligung nur der eigene Umsatz.
                <Route path="/statistiken" element={<StatisticsPage user={user} />} />
              ) : null}
              {showExercises ? (
                <>
                  <Route path="/uebungen" element={<UebungenPage user={user} />} />
                  {/* Vorlagen und Durchsicht des Katalogs. */}
                  <Route path="/uebungen/vorlagen" element={<VorlagenPage user={user} />} />
                  <Route path="/uebungen/durchsicht" element={<DurchsichtPage user={user} />} />
                  <Route path="/uebungen/:uebungId" element={<UebungPage user={user} />} />
                </>
              ) : null}
              {/* Eine Rückfrage aus Behandlung oder Training. Wer welche liest,
                  entscheidet der Server (ANN-310, ANN-311). */}
              {showOperations || showTraining ? (
                <Route path="/rueckfragen/:messageId" element={<RueckfragePage user={user} />} />
              ) : null}
              {/* Urlaub für jede Praxisrolle mit Mitarbeiterdatensatz, auch die
                  Trainingsbetreuung. Was jemand sieht und darf - beantragen, entscheiden,
                  Ansprüche -, entscheidet der Server (ANN-576, ANN-580). */}
              {showOperations || showTraining ? (
                <>
                  {/* Eingang von Organisation und der eine Einstieg in jeden neuen
                      Antrag (ANN-604). */}
                  <Route path="/betrieb" element={<EingangPage user={user} />} />
                  <Route path="/betrieb/neu" element={<NeuerAntragPage user={user} />} />
                  {/* Barometer und Rückmeldung an die Praxisleitung (§20.2) - abgeben
                      jede Praxisrolle außer owner, lesen nur owner; der Server prüft
                      beides. */}
                  <Route path="/betrieb/barometer" element={<BarometerPage user={user} />} />
                  <Route path="/betrieb/rueckmeldung" element={<RueckmeldungPage user={user} />} />
                  <Route path="/betrieb/urlaub" element={<VacationPage user={user} />} />
                  <Route
                    path="/betrieb/urlaub/beantragen"
                    element={<UrlaubBeantragenPage user={user} />}
                  />
                  <Route
                    path="/betrieb/urlaub/entscheiden/:antragId"
                    element={<UrlaubEntscheidenPage user={user} />}
                  />
                  <Route
                    path="/betrieb/urlaub/anspruch/:staffMemberId"
                    element={<AnspruchPage user={user} />}
                  />
                  {/* Die Termine eines geltenden Urlaubs, bis alle umgeplant
                      sind - sehen darf sie, wer Termine sieht (Server). */}
                  <Route
                    path="/betrieb/urlaub/termine"
                    element={<UrlaubTerminePage user={user} />}
                  />
                  {/* Arbeitszeitänderung wie der Urlaub - beantragen jede Praxisrolle
                      mit Wochenplan, entscheiden owner (ANN-590); der Server prüft
                      beides. */}
                  <Route path="/betrieb/arbeitszeit" element={<WorkingTimePage user={user} />} />
                  <Route
                    path="/betrieb/arbeitszeit/beantragen"
                    element={<RequestWorkingTimePage user={user} />}
                  />
                  <Route
                    path="/betrieb/arbeitszeit/entscheiden/:requestId"
                    element={<DecideWorkingTimePage user={user} />}
                  />
                  {/* Zeitkonto - eintragen jede Praxisrolle mit Mitarbeiterdatensatz,
                      für andere owner und Büro, zurückweisen owner (ANN-594); der
                      Server prüft alles. */}
                  <Route path="/betrieb/zeitkonto" element={<TimeAccountPage user={user} />} />
                  <Route
                    path="/betrieb/zeitkonto/eintragen"
                    element={<RecordTimeAccountPage user={user} />}
                  />
                  <Route
                    path="/betrieb/zeitkonto/zurueckweisen/:entryId"
                    element={<RejectTimeAccountEntryPage />}
                  />
                  {/* Erstattungen - beantragen jede Praxisrolle mit Mitarbeiterdatensatz
                      für sich, entscheiden und auszahlen owner, alle sehen owner und Büro
                      (ANN-598); der Server prüft alles. */}
                  <Route
                    path="/betrieb/erstattungen"
                    element={<ReimbursementsPage user={user} />}
                  />
                  <Route
                    path="/betrieb/erstattungen/beantragen"
                    element={<RequestReimbursementPage user={user} />}
                  />
                  <Route
                    path="/betrieb/erstattungen/entscheiden/:reimbursementId"
                    element={<DecideReimbursementPage user={user} />}
                  />
                  <Route
                    path="/betrieb/erstattungen/auszahlen/:reimbursementId"
                    element={<PayReimbursementPage user={user} />}
                  />
                  <Route path="/betrieb/erstattungen/konto" element={<PayoutAccountPage />} />
                </>
              ) : null}
              {showTraining ? (
                <>
                  <Route path="/training" element={<TrainingClientsPage user={user} />} />
                  {/* Eine Rückfrage aus dem Training. */}
                  <Route
                    path="/training/rueckfragen/:messageId"
                    element={<RueckfragePage user={user} />}
                  />
                  {canWriteTrainingClients(user.roles) ? (
                    <Route path="/training/neu" element={<NewTrainingClientPage />} />
                  ) : null}
                  {/* Trainingstermine im gemeinsamen Kalender. */}
                  {canWriteTrainingClients(user.roles) ? (
                    <>
                      <Route
                        path="/training/termine/neu"
                        element={<NewTrainingAppointmentPage user={user} />}
                      />
                      <Route
                        path="/training/termine/:appointmentId/bearbeiten"
                        element={<EditTrainingAppointmentPage user={user} />}
                      />
                    </>
                  ) : null}
                  <Route
                    path="/training/termine/:appointmentId"
                    element={<TrainingAppointmentPage user={user} />}
                  />
                  <Route
                    path="/training/:relationshipId"
                    element={<TrainingClientPage user={user} />}
                  />
                  {/* Die Auskunft zum Training neben dem Verhältnis, wie an der Akte -
                  nur `owner`, verbindlich prüft der Server (ADR-004). */}
                  {showSecurity ? (
                    <Route
                      path="/training/:relationshipId/auskunft"
                      element={<TrainingAuskunftPage />}
                    />
                  ) : null}
                  {/* Die Formulare der Ernährungsberatung im Training. */}
                  {showNutrition ? (
                    <>
                      <Route
                        path="/training/:relationshipId/ernaehrung/neu"
                        element={<ProfilAnlegenSeite art="training" user={user} />}
                      />
                      <Route
                        path="/training/:relationshipId/ernaehrung/bearbeiten"
                        element={<ProfilAendernSeite art="training" user={user} />}
                      />
                      <Route
                        path="/training/:relationshipId/ernaehrung/zielwerte"
                        element={<ZielwerteSeite art="training" />}
                      />
                      <Route
                        path="/training/:relationshipId/ernaehrung/termin"
                        element={<BeratungsterminSeite art="training" user={user} />}
                      />
                    </>
                  ) : null}
                  {/* Ein Trainingsplan - owner und Trainingsbetreuung, lesend auch das Büro
                  (ANN-298). Verbindlich prüft der Server. */}
                  {canReadExercisePlans(user.roles, 'training') ? (
                    <>
                      <Route
                        path="/training/:relationshipId/plaene/:planId"
                        element={<PlanPage />}
                      />
                      <Route
                        path="/training/:relationshipId/plaene/:planId/blatt"
                        element={<PlanblattSeite user={user} />}
                      />
                    </>
                  ) : null}
                </>
              ) : null}
              <Route path="*" element={<KeinZugang user={user} />} />
            </Routes>
          )}
        </AppShell>
      </AbmeldeschutzProvider>
    </VorschauProvider>
  );
}

/**
 * `/termine/:id/dokumentation` führt auf die eine Schreibseite (Design-Handoff
 * 2026-10-01, Abschnitt 6a). Lesezeichen und alte Verweise bleiben gültig;
 * der Rückweg reist in der Adresszeile mit.
 */
function ZurSchreibseite() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const { search } = useLocation();
  return <Navigate replace to={`/termine/${appointmentId ?? ''}/abschluss${search}`} />;
}

/** `/termine/:id` führt in den Kalender, der Termin im Panel (`kalenderZumTermin`). */
function ZumKalender() {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  return <Navigate replace to={kalenderZumTermin(appointmentId ?? '')} />;
}

/** Die alte Planung (`/praxis/planung`) mit ihrem Suchteil auf „Arbeitszeit" (ORG-003). */
function ZurArbeitszeit() {
  const { search } = useLocation();
  return <Navigate replace to={`/betrieb/arbeitszeit${search}`} />;
}
