// Die Schnittstelle der Domäne core: Andere Domänen importieren nur, was hier einzeln steht.
// Seiten stehen nicht darin; src/routes und src/app binden direkt ein (ANN-755).

export { meldeSelbstAb } from './auth/eigeneAbmeldung';
export { PasskeyAbschnitt, PinAbschnitt } from './auth/einrichtung/AnmeldungVerwalten';
export { useFokusNachWechsel } from './auth/fokus';
export { schluesselAblegen } from './auth/freigabeOhneNetz';
export { ZUGANG_PFAD } from './auth/linkEinloesen';
export { useSession } from './auth/sessionContext';
export { type OhneNetz } from './auth/sitzungssperre/Sitzungssperre';
export {
  canConcludePatientCare,
  canCorrectPatientFileType,
  canCounselNutrition,
  canDecideStaffRequests,
  canManageAppointments,
  canManageBillingProfile,
  canManageInvoicing,
  canManageServiceCatalog,
  canManageStaffAccounts,
  canManageStaffEmployment,
  canManageStaffMasterData,
  canManageStaffPrivateDetails,
  canManageTasks,
  canManageWorkingHours,
  canReadClinicalPatientFiles,
  canReadExerciseLibrary,
  canReadExercisePlans,
  canReadPatientDirectory,
  canReadPatientFiles,
  canReadTrainingClients,
  canReadTrainingContent,
  canReadTrainingProtocols,
  canReadTreatmentBases,
  canReadTreatmentBasisClinical,
  canReadTreatmentNote,
  canRecordAtAppointment,
  canRecordBillableServices,
  canReleaseTreatmentBasis,
  canWriteClinicalPatientFiles,
  canWriteExercisePlans,
  canWriteQuestionnaire,
  canWriteTrainingClients,
  canWriteTrainingProtocols,
  canWriteTreatmentBases,
  canWriteTreatmentNote,
  type CurrentUser,
  isOwner,
  isStaff,
  isTherapyStaff,
  type RoleKey,
  roleKeySchema,
} from './session/types';
export { useCurrentUser } from './session/useCurrentUser';
