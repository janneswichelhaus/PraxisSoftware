import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { setTreatmentTableRequired, type Patient } from './api';

/**
 * Behandlungsliege: ja oder nein, mit einem Tap umzustellen (UX-003a).
 *
 * Ein Merkmal der Person, keine Angabe je Termin (PROJECT_PRINCIPLES.md §9,
 * ANN-116): Die Übersicht leitet daraus morgens ab, ob die Liege heute aufs
 * Rad muss. Seit FRB-EPIC-003 steht es zusätzlich im Befund der Akte.
 *
 * Ohne Rückfrage, weil der Wechsel sofort sichtbar und mit demselben Tap
 * rücknehmbar ist; protokolliert wird er trotzdem (ADR-010). Die Anzeige des
 * Knopfs ist Darstellung - verbindlich prüft `set_treatment_table_required`.
 */
export function Behandlungsliege({
  patient,
  darfAendern,
}: {
  patient: Patient;
  darfAendern: boolean;
}) {
  const queryClient = useQueryClient();
  // Drei Zustände seit PRX-013 (ANN-143): ja, nein, oder noch nicht
  // entschieden - dann steht die Liege in der Erstaufnahme als offen.
  const stand = patient.treatment_table_required ?? null;

  const mutation = useMutation({
    mutationFn: (benoetigt: boolean) => setTreatmentTableRequired(patient.id, benoetigt),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });
      // Die Übersicht liest das Merkmal über die Tagesliste.
      await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
      // Die Erstaufnahme zählt die Entscheidung (PRX-013).
      await queryClient.invalidateQueries({ queryKey: ['open-points'] });
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink">
        {stand === true ? 'Mitnehmen' : stand === false ? 'Nicht nötig' : 'Noch nicht entschieden'}
      </p>
      {darfAendern ? (
        <div className="flex flex-wrap gap-2">
          {/* Eine Handlung, kein Zustand (PAT-07): Der Zustand steht in der
              Zeile darüber, der Knopf sagt, was ein Tipp tut. */}
          {stand !== true ? (
            <Button
              variant="secondary"
              onClick={() => mutation.mutate(true)}
              disabled={mutation.isPending}
            >
              {mutation.isPending && mutation.variables === true
                ? 'Wird gespeichert …'
                : 'Liege mitnehmen'}
            </Button>
          ) : null}
          {stand !== false ? (
            <Button
              variant={stand === null ? 'secondary' : 'quiet'}
              onClick={() => mutation.mutate(false)}
              disabled={mutation.isPending}
            >
              {mutation.isPending && mutation.variables === false
                ? 'Wird gespeichert …'
                : stand === true
                  ? 'Liege nicht mehr mitnehmen'
                  : 'Liege nicht nötig'}
            </Button>
          ) : null}
        </div>
      ) : null}
      {mutation.isError ? (
        <Statusmeldung ton="fehler">
          Die Angabe zur Behandlungsliege konnte nicht gespeichert werden. Bitte die Verbindung
          prüfen und erneut versuchen.
        </Statusmeldung>
      ) : null}
    </div>
  );
}
