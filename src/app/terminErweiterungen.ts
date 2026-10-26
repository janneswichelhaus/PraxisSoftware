import type { TerminErweiterungen } from '@/features/appointments';
import { TreatmentNoteSection } from '@/features/documentation/TreatmentNoteSection';

/** Was die Praxis an einem Termin aus anderen Bereichen zeigt; gesetzt in `App.tsx`. */
export const TERMIN_ERWEITERUNGEN: TerminErweiterungen = {
  Behandlungsnotiz: TreatmentNoteSection,
};
