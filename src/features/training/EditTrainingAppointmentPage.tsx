import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Abfragezustand } from '@/components/ui/Abfragezustand';
import { EmptyState, ErrorState } from '@/components/ui/Feedback';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { leseRueckweg } from '@/lib/rueckweg';
import { canWriteTrainingClients, type CurrentUser } from '@/features/core';
import {
  AppointmentForm,
  appointmentToFormValues,
  HomeVisitAddressHint,
  tageslageNeuLaden,
  updateAppointment,
  useAppointmentFormLists,
} from '@/features/calendar';
import { getTrainingAppointment } from './api';
import { todayInTimeZone } from '@/lib/datum';

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
  const listen = useAppointmentFormLists('training', canWriteTrainingClients(user.roles));

  if (!canWriteTrainingClients(user.roles)) {
    return (
      <ErrorState
        title="Nicht freigegeben"
        description="Trainingstermine verschieben owner, Trainingsbetreuung und Büro."
      />
    );
  }
  const t = termin.data;
  if (!t || t.status !== 'confirmed') {
    return (
      <>
        <Rueckweg standard={zurueck} />
        <PageHeader title="Trainingstermin verschieben" />
        <Abfragezustand
          abfrage={termin}
          laden="Formular wird vorbereitet …"
          fehler="Der Trainingstermin konnte nicht geladen werden."
          inKarte
        >
          {(geladen) => (
            <EmptyState
              inKarte
              title={
                geladen
                  ? 'Nur ein bestätigter Termin lässt sich verschieben'
                  : 'Trainingstermin nicht gefunden'
              }
            />
          )}
        </Abfragezustand>
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
      <AppointmentForm
        key={t.id}
        listen={listen}
        startwerte={startwerte}
        startMinuten={minuten}
        heute={todayInTimeZone(t.organization_time_zone)}
        rasterMinuten={user.appointmentGridMinutes}
        texte={{
          absenden: 'Speichern',
          laeuft: 'Wird gespeichert …',
          fehlerTitel: 'Der Termin konnte nicht geändert werden.',
          ungespeichert: 'Ungespeicherter Trainingstermin',
        }}
        abbrechenZiel={zurueck}
        hausbesuch={<HomeVisitAddressHint source="contact" />}
        onSpeichern={async (werte, b) => {
          await updateAppointment(t.id, t.updated_at, werte, b.bestaetigt, b.vergangenheit);
          return t.id;
        }}
        onGespeichert={() => {
          void queryClient.invalidateQueries({ queryKey: ['training-appointment', t.id] });
          // UBK-011: Trainingstermine stehen in derselben Tagesroute (ADR-022).
          void tageslageNeuLaden(queryClient);
          void queryClient.invalidateQueries({ queryKey: ['training-client-appointments'] });
          void navigate(zurueck, { replace: true });
        }}
      />
    </>
  );
}
