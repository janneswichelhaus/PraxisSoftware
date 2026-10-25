import type { TerminErweiterungen } from '@/features/appointments/erweiterungen';
import { TreatmentNoteSection } from '@/features/documentation/TreatmentNoteSection';

/** Was die Praxis an einem Termin aus anderen Bereichen zeigt (ANN-732); gesetzt in `App.tsx`. */
export const TERMIN_ERWEITERUNGEN: TerminErweiterungen = {
  Behandlungsnotiz: TreatmentNoteSection,
};
