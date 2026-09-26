import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { setTreatmentTableRequired, type Patient } from './api';

/**
 * Behandlungsliege: ja oder nein, mit einem Tap umzustellen (UX-003a).
 *
 * Ein Merkmal der Person, keine Angabe je Termin (PROJECT_PRINCIPLES.md §9,
 * ANN-116): Die Übersicht leitet daraus morgens ab, ob die Liege heute aufs
 * Rad muss. Ab FRB-EPIC-003 setzt es zusätzlich der Befund.
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
  const benoetigt = patient.treatment_table_required === true;

  const mutation = useMutation({
    mutationFn: () => setTreatmentTableRequired(patient.id, !benoetigt),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['patient', patient.id] });
      // Die Übersicht liest das Merkmal über die Tagesliste.
      await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
    },
  });

  return (
    <div className="flex flex-col gap-2">
      <p className="text-ink">{benoetigt ? 'Mitnehmen' : 'Nicht nötig'}</p>
      {darfAendern ? (
        <div>
          <Button
            variant="secondary"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending
              ? 'Wird gespeichert …'
              : benoetigt
                ? 'Liege nicht mehr nötig'
                : 'Liege wird gebraucht'}
          </Button>
        </div>
      ) : null}
      {mutation.isError ? (
        <Statusmeldung ton="fehler">
          Die Angabe zur Behandlungsliege konnte nicht gespeichert werden.
        </Statusmeldung>
      ) : null}
    </div>
  );
}
