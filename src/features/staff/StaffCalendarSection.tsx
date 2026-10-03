import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/Button';
import { Checkbox } from '@/components/ui/Checkbox';
import { Section } from '@/components/ui/Section';
import { setzeKalender, type StaffMember } from './api';

/**
 * Im Kalender, ohne eigenen Zugang (AKTE-009, ANN-226).
 *
 * Bis AKTE-009 stand eine Person erst im Kalender, wenn sie ihre Einladung
 * selbst angenommen hatte. Hier nimmt die Praxisinhaber:in sie direkt auf -
 * für Behandlungen, für Personal Training oder für beides. Es entsteht weder
 * ein Zugang noch ein Kennwort noch eine Rolle; anmelden kann sich die Person
 * weiterhin nur über die Einladung.
 *
 * Nur für owner gerendert; verbindlich prüft der Server
 * (`set_staff_member_schedulable`).
 */
export function StaffCalendarSection({ staff }: { staff: StaffMember }) {
  const queryClient = useQueryClient();
  const [behandlung, setBehandlung] = useState(staff.schedulable_treatment);
  const [training, setTraining] = useState(staff.schedulable_training);
  const aktiv = staff.employment_status === 'active';
  const unveraendert =
    behandlung === staff.schedulable_treatment && training === staff.schedulable_training;

  const speichern = useMutation({
    mutationFn: () => setzeKalender(staff.id, { behandlung, training }),
    onSuccess: async () => {
      // Alles, was die Auswahl der Behandelnden und Trainierenden zeigt.
      for (const queryKey of [
        ['staff-member', staff.id],
        ['staff-members'],
        ['assignable-therapists'],
        ['assignable-trainers'],
        ['calendar-staff'],
      ]) {
        await queryClient.invalidateQueries({ queryKey });
      }
    },
  });

  function absenden(ereignis: FormEvent) {
    ereignis.preventDefault();
    speichern.mutate();
  }

  return (
    <Section
      titel="Kalender"
      rahmen
      hinweis="Auch ohne eigenen Zugang. Mit einem Zugang in der Rolle Therapeut:in, Teamleitung oder Trainingsbetreuung steht die Person ohnehin dort."
    >
      <form onSubmit={absenden} className="flex flex-col gap-2">
        <Checkbox
          label="Im Kalender für Behandlungen"
          checked={behandlung}
          disabled={!aktiv || speichern.isPending}
          onChange={(e) => setBehandlung(e.target.checked)}
        />
        <Checkbox
          label="Im Kalender für Personal Training"
          checked={training}
          disabled={!aktiv || speichern.isPending}
          onChange={(e) => setTraining(e.target.checked)}
        />
        {!aktiv ? (
          <p className="text-ink-muted text-sm">
            Inaktiv – wird unabhängig davon nicht für neue Termine angeboten.
          </p>
        ) : null}
        <div className="mt-1">
          <Button
            type="submit"
            variant="secondary"
            disabled={!aktiv || unveraendert || speichern.isPending}
          >
            {speichern.isPending ? 'Wird gespeichert …' : 'Kalender speichern'}
          </Button>
        </div>
      </form>
      {speichern.isError ? (
        <p role="alert" className="text-danger mt-2 text-sm">
          {speichern.error.message}
        </p>
      ) : null}
      {speichern.isSuccess && unveraendert ? (
        <p role="status" className="text-ink-muted mt-2 text-sm">
          Gespeichert.
        </p>
      ) : null}
    </Section>
  );
}
