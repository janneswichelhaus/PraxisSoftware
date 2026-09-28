import { useQueryClient } from '@tanstack/react-query';
import { useSession } from '@/features/auth/sessionContext';
import { canWriteTreatmentBases, type CurrentUser } from '@/features/session/types';

/**
 * Darf die angemeldete Person Behandlungsgrundlagen schreiben? (VER-04)
 *
 * Das Büro plant Termine und wird dabei zur Grundlagen-Erfassung geführt -
 * schreiben darf es sie aber nicht (ANN-011). Bis UXR-007 füllte es das ganze
 * Formular samt Diagnose aus und erfuhr erst beim Speichern, dass die
 * Datenbank ablehnt. Die Formularseiten sagen es jetzt vorher.
 *
 * Die Seiten bekommen die angemeldete Person nicht als Eigenschaft; die
 * Anwendung hat sie aber schon geladen (`useCurrentUser` in `App.tsx`, Schlüssel
 * `['current-user', userId]`). Gelesen wird deshalb nur der Zwischenspeicher -
 * ohne eigenen Beobachter, der beim Öffnen des Formulars eine neue Abfrage
 * anstoßen könnte. Deren Fehlschlag nähme der Anwendung sonst ihren Rahmen.
 *
 * `null`: nicht bekannt. Dann bleibt das Formular stehen - verbindlich prüft
 * ohnehin der Server (`app.can_write_treatment_bases()`, ADR-004); diese
 * Abfrage steuert nur, was gezeigt wird.
 */
export function useDarfGrundlagenSchreiben(): boolean | null {
  const { session } = useSession();
  const queryClient = useQueryClient();
  const person = queryClient.getQueryData<CurrentUser>(['current-user', session?.user.id]);
  return person ? canWriteTreatmentBases(person.roles) : null;
}
