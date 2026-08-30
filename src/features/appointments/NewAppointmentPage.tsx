import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { fetchPatient, fullName } from '@/features/patients/api';
import type { CurrentUser } from '@/features/session/types';
import { AppointmentFormFields, UebernommeneAdresse } from './AppointmentFormFields';
import {
  appointmentFormSchema,
  createAppointment,
  fetchAssignableTherapists,
  fetchLocations,
  leererTermin,
  todayInTimeZone,
  type AppointmentFormField,
} from './api';

/**
 * Anlage eines Termins für einen bereits gewählten Patienten.
 *
 * Der Patient ist Kontext und nicht wechselbar: der Einstieg erfolgt aus seiner
 * Akte. Ein Wechsel wäre eine andere Aufgabe und würde die Verwechslungsgefahr
 * erhöhen.
 *
 * Die Prüfung im Formular dient der Bedienbarkeit. Verbindlich sind
 * Berechtigung, Organisationszuordnung, Zeitzone, Überschneidungsschutz und
 * Ortslogik in der Serverfunktion `create_appointment` (ADR-004).
 */
export function NewAppointmentPage({ user }: { user: CurrentUser }) {
  const { patientId } = useParams<{ patientId: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [werte, setWerte] = useState<Record<AppointmentFormField, string>>(leererTermin);
  const [fehler, setFehler] = useState<Partial<Record<AppointmentFormField, string>>>({});

  const patient = useQuery({
    queryKey: ['patient', patientId],
    queryFn: () => fetchPatient(patientId!),
    enabled: Boolean(patientId),
    retry: false,
  });

  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    retry: false,
  });

  const standorte = useQuery({
    queryKey: ['locations'],
    queryFn: fetchLocations,
    retry: false,
  });

  // Bei genau einem verfügbaren Standort darf vorausgewählt werden - eine
  // Auswahl ohne Alternative ist keine Entscheidung.
  useEffect(() => {
    const nurEiner = standorte.data?.length === 1 ? standorte.data[0] : undefined;
    if (nurEiner) {
      setWerte((bisher) =>
        bisher.location_id === '' ? { ...bisher, location_id: nurEiner.id } : bisher,
      );
    }
  }, [standorte.data]);

  const mutation = useMutation({
    mutationFn: (eingabe: Parameters<typeof createAppointment>[1]) =>
      createAppointment(patientId!, eingabe),
    onSuccess: async (appointmentId) => {
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      void navigate(`/termine/${appointmentId}`, { replace: true });
    },
  });

  function setzen(feld: AppointmentFormField, wert: string) {
    setWerte((bisher) => ({ ...bisher, [feld]: wert }));
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Schutz gegen mehrfaches Absenden: solange ein Vorgang läuft, wird kein
    // zweiter gestartet. Der Button ist zusätzlich deaktiviert.
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
    mutation.mutate(ergebnis.data);
  }

  if (patient.isPending) return <LoadingState label="Patientendaten werden geladen …" />;
  if (patient.isError || !patient.data) {
    return (
      <ErrorState
        title="Nicht gefunden"
        description="Dieser Datensatz existiert nicht oder ist für Ihren Zugang nicht freigegeben."
      />
    );
  }

  // Nach der Pruefung oben festhalten: in Closures ginge die Einengung des
  // Typs sonst verloren.
  const patientDaten = patient.data;
  // Begrenzt das Datumsfeld nach unten. Verbindlich prueft der Server den
  // vergangenen Kalendertag ohnehin in der Zeitzone der Organisation.
  const praxisZeitzone = user.organizationTimeZone;

  return (
    <>
      <Link
        to={`/patienten/${patientDaten.id}`}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        ← Zurück zur Akte
      </Link>

      <PageHeader
        title="Termin anlegen"
        description={`Für ${fullName(patientDaten)}. Mit * markierte Felder sind erforderlich.`}
      />

      <form onSubmit={absenden} noValidate className="max-w-xl">
        {mutation.isError ? (
          <div className="mb-6">
            <ErrorState
              title="Der Termin konnte nicht angelegt werden."
              description={mutation.error.message}
            />
          </div>
        ) : null}

        <div className="border-line bg-surface-sunken mb-5 rounded-lg border p-4">
          <p className="text-ink-muted text-sm">Patient:in</p>
          <p className="text-ink text-[0.9375rem] font-medium">{fullName(patientDaten)}</p>
        </div>

        <AppointmentFormFields
          werte={werte}
          fehler={fehler}
          onChange={setzen}
          therapeuten={therapeuten.data ?? []}
          standorte={standorte.data ?? []}
          minDatum={praxisZeitzone ? todayInTimeZone(praxisZeitzone) : undefined}
          hausbesuch={
            <UebernommeneAdresse
              street={patientDaten.street}
              houseNumber={patientDaten.house_number}
              postalCode={patientDaten.postal_code}
              city={patientDaten.city}
            />
          }
        />

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Wird angelegt …' : 'Termin anlegen'}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => void navigate(`/patienten/${patientDaten.id}`)}
          >
            Abbrechen
          </Button>
        </div>
      </form>

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Es werden ausschließlich organisatorische Angaben erfasst. Klinische Inhalte gehören nicht
        zum Termin.
      </p>
    </>
  );
}
