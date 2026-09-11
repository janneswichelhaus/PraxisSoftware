import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { fetchPatient } from '@/features/patients/api';
import type { CurrentUser } from '@/features/session/types';
import {
  AppointmentFormFields,
  ArbeitszeitRueckfrage,
  UebernommeneAdresse,
} from './AppointmentFormFields';
import {
  appointmentFormSchema,
  appointmentToFormValues,
  fetchAppointment,
  fetchAssignableTherapists,
  fetchLocations,
  istAusserhalbArbeitszeit,
  leererTermin,
  patientName,
  todayInTimeZone,
  updateAppointment,
  type AppointmentFormField,
  type AppointmentFormValues,
} from './api';

/**
 * Organisatorische Bearbeitung eines geplanten Termins (CAL-003).
 *
 * Patient und Organisation sind nicht änderbar - die Serverfunktion nimmt sie
 * gar nicht erst entgegen. Gespeichert wird gegen den Stand, auf dem die
 * Bearbeitung beruht; hat zwischenzeitlich jemand anderes gespeichert, wird
 * der Vorgang abgewiesen statt die fremde Änderung zu überschreiben.
 */
export function EditAppointmentPage({ user }: { user: CurrentUser }) {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [werte, setWerte] = useState<Record<AppointmentFormField, string>>(leererTermin);
  const [fehler, setFehler] = useState<Partial<Record<AppointmentFormField, string>>>({});
  const [vorbefuellt, setVorbefuellt] = useState(false);

  const termin = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => fetchAppointment(appointmentId!),
    enabled: Boolean(appointmentId),
    retry: false,
  });

  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });

  const standorte = useQuery({ queryKey: ['locations'], queryFn: fetchLocations, retry: false });

  // Die Patientenadresse wird nur gebraucht, wenn zu einem Hausbesuch
  // gewechselt wird; erst dann entsteht ein neuer Snapshot.
  const patient = useQuery({
    queryKey: ['patient', termin.data?.patient_id],
    queryFn: () => fetchPatient(termin.data!.patient_id),
    enabled: Boolean(termin.data?.patient_id),
    retry: false,
  });

  useEffect(() => {
    if (termin.data && !vorbefuellt) {
      setWerte(appointmentToFormValues(termin.data));
      setVorbefuellt(true);
    }
  }, [termin.data, vorbefuellt]);

  const mutation = useMutation({
    mutationFn: (eingabe: { werte: AppointmentFormValues; bestaetigt: boolean }) =>
      updateAppointment(appointmentId!, termin.data!.updated_at, eingabe.werte, eingabe.bestaetigt),
    onSuccess: async () => {
      // Detailansicht und Kalender zeigen sonst weiter den alten Stand.
      await queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] });
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      void navigate(`/termine/${appointmentId}`, { replace: true });
    },
  });

  function setzen(feld: AppointmentFormField, wert: string) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
    // Eine geänderte Eingabe macht die Rückfrage gegenstandslos.
    if (mutation.isError) mutation.reset();
  }

  /** Wiederholt den Vorgang mit ausdrücklicher Bestätigung (CAL-005). */
  function bestaetigen() {
    if (mutation.isPending) return;
    const ergebnis = appointmentFormSchema.safeParse(werte);
    if (!ergebnis.success) return;
    mutation.mutate({ werte: ergebnis.data, bestaetigt: true });
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;

    const ergebnis = appointmentFormSchema.safeParse(werte);
    if (!ergebnis.success) {
      const gefunden: Partial<Record<AppointmentFormField, string>> = {};
      for (const problem of ergebnis.error.issues) {
        const feld = problem.path[0] as AppointmentFormField | undefined;
        if (feld && !gefunden[feld]) gefunden[feld] = problem.message;
      }
      setFehler(gefunden);
      return;
    }

    setFehler({});
    mutation.mutate({ werte: ergebnis.data, bestaetigt: false });
  }

  if (termin.isPending) return <LoadingState label="Termin wird geladen …" />;
  if (termin.isError || !termin.data) {
    return (
      <ErrorState
        title="Nicht gefunden"
        description="Dieser Termin existiert nicht oder ist für Ihren Zugang nicht freigegeben."
      />
    );
  }

  const daten = termin.data;

  // Ein abgesagter Termin ist terminal. Die Serverfunktion weist ihn ohnehin
  // ab; hier wird gar nicht erst ein Formular angeboten.
  if (daten.status === 'cancelled') {
    return (
      <>
        <Link
          to={`/termine/${daten.id}`}
          className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
        >
          ← Zurück zum Termin
        </Link>
        <ErrorState
          title="Abgesagte Termine werden nicht bearbeitet"
          description="Der Termin bleibt zur Nachvollziehbarkeit erhalten. Für einen neuen Zeitraum bitte einen neuen Termin anlegen."
        />
      </>
    );
  }

  const bleibtHausbesuch =
    daten.appointment_type === 'home_visit' && werte.appointment_type === 'home_visit';

  return (
    <>
      <Link
        to={`/termine/${daten.id}`}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zurück zum Termin
      </Link>

      <PageHeader
        title="Termin bearbeiten"
        description={`Für ${patientName(daten)}. Mit * markierte Felder sind erforderlich.`}
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        {istAusserhalbArbeitszeit(mutation.error) ? (
          <ArbeitszeitRueckfrage
            onBestaetigen={bestaetigen}
            laeuft={mutation.isPending}
            beschriftung="Änderung trotzdem speichern"
          />
        ) : mutation.isError ? (
          <div className="mb-6">
            <ErrorState
              title="Der Termin konnte nicht geändert werden."
              description={mutation.error.message}
            />
          </div>
        ) : null}

        <div className="border-line bg-surface-sunken rounded-card mb-5 border p-4">
          <p className="text-ink-muted text-sm">Patient:in</p>
          <p className="text-ink text-[0.9375rem] font-medium">{patientName(daten)}</p>
          <p className="text-ink-subtle mt-2 text-xs leading-relaxed">
            Ein Termin kann nicht auf eine andere Person übertragen werden.
          </p>
        </div>

        <AppointmentFormFields
          werte={werte}
          fehler={fehler}
          onChange={setzen}
          therapeuten={therapeuten.data ?? []}
          standorte={standorte.data ?? []}
          minDatum={
            user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : undefined
          }
          rasterMinuten={user.appointmentGridMinutes ?? undefined}
          hausbesuch={
            bleibtHausbesuch ? (
              <UebernommeneAdresse
                ueberschrift="Festgehaltene Anschrift"
                street={daten.visit_street}
                houseNumber={daten.visit_house_number}
                postalCode={daten.visit_postal_code}
                city={daten.visit_city}
              />
            ) : (
              <UebernommeneAdresse
                ueberschrift="Adresse des Hausbesuchs"
                street={patient.data?.street ?? null}
                houseNumber={patient.data?.house_number ?? null}
                postalCode={patient.data?.postal_code ?? null}
                city={patient.data?.city ?? null}
              />
            )
          }
        />

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Wird gespeichert …' : 'Änderungen speichern'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void navigate(`/termine/${daten.id}`)}
          >
            Abbrechen
          </Button>
        </div>
      </form>
    </>
  );
}
