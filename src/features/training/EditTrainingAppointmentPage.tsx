import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { leseRueckweg } from '@/lib/rueckweg';
import { canWriteTrainingClients, type CurrentUser } from '@/features/session/types';
import {
  appointmentToFormValues,
  todayInTimeZone,
  updateAppointment,
} from '@/features/appointments/api';
import { getTrainingAppointment } from './api';
import { TrainingTerminFormular } from './TrainingTerminFormular';

/**
 * Einen Trainingstermin verschieben (TRN-004).
 *
 * Über `update_appointment`, den vorhandenen Weg (ADR-022 Punkt 1). Kund:in
 * und Kontext stehen mit dem Anlegen fest (Punkt 10); wer den falschen Termin
 * angelegt hat, sagt ihn ab und legt neu an. Die Länge beginnt bei der des
 * gespeicherten Termins - Öffnen allein ändert ihn nicht (ANN-056).
 */
export function EditTrainingAppointmentPage({ user }: { user: CurrentUser }) {
  const { appointmentId = '' } = useParams();
  const [suche] = useSearchParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const detail = `/training/termine/${appointmentId}`;
  const zurueck = leseRueckweg(suche, detail);

  const termin = useQuery({
    queryKey: ['training-appointment', appointmentId],
    queryFn: () => getTrainingAppointment(appointmentId),
    retry: false,
  });

  if (!canWriteTrainingClients(user.roles)) {
    return (
      <ErrorState
        title="Nicht freigegeben"
        description="Trainingstermine verschieben owner, Trainingsbetreuung und Büro."
      />
    );
  }
  if (termin.isPending) return <LoadingState label="Formular wird vorbereitet …" />;
  if (termin.isError) {
    return (
      <>
        <Rueckweg standard={zurueck} />
        <ErrorState
          title="Der Trainingstermin konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => termin.refetch()}
        />
      </>
    );
  }
  const t = termin.data;
  if (!t || t.status !== 'confirmed') {
    return (
      <>
        <Rueckweg standard={zurueck} />
        <EmptyState
          title={
            t
              ? 'Nur ein bestätigter Termin lässt sich verschieben'
              : 'Trainingstermin nicht gefunden'
          }
        />
      </>
    );
  }

  const startwerte = appointmentToFormValues(t);
  const minuten = (new Date(t.ends_at).getTime() - new Date(t.starts_at).getTime()) / 60_000;

  return (
    <>
      <Rueckweg standard={zurueck} />
      <PageHeader
        title="Trainingstermin verschieben"
        description={`Mit ${t.client_given_name} ${t.client_family_name}.`}
      />
      <TrainingTerminFormular
        startwerte={startwerte}
        startMinuten={minuten}
        heute={todayInTimeZone(t.organization_time_zone)}
        rasterMinuten={user.appointmentGridMinutes}
        absendeText="Speichern"
        laeuftText="Wird gespeichert …"
        fehlerTitel="Der Termin konnte nicht geändert werden."
        abbrechenZiel={zurueck}
        onSpeichern={async (werte, b) => {
          await updateAppointment(t.id, t.updated_at, werte, b.bestaetigt, b.vergangenheit);
          return t.id;
        }}
        onGespeichert={() => {
          void queryClient.invalidateQueries({ queryKey: ['training-appointment', t.id] });
          void queryClient.invalidateQueries({ queryKey: ['appointments'] });
          void queryClient.invalidateQueries({ queryKey: ['day-plan'] });
          void queryClient.invalidateQueries({ queryKey: ['training-client-appointments'] });
          void navigate(zurueck, { replace: true });
        }}
      />
    </>
  );
}
