import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Select';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { fetchPatient, fullName, type Patient } from '@/features/patients/api';
import type { CurrentUser } from '@/features/session/types';
import {
  appointmentFormSchema,
  appointmentTypeLabels,
  createAppointment,
  fetchAssignableTherapists,
  fetchLocations,
  leererTermin,
  todayInTimeZone,
  type AppointmentFormField,
  type AppointmentType,
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
  const art = werte.appointment_type;
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

        <div className="flex flex-col gap-5">
          <div className="border-line bg-surface-sunken rounded-lg border p-4">
            <p className="text-ink-muted text-sm">Patient:in</p>
            <p className="text-ink text-[0.9375rem] font-medium">{fullName(patientDaten)}</p>
          </div>

          <Select
            label="Behandelnde Person *"
            value={werte.staff_member_id}
            error={fehler.staff_member_id}
            onChange={(e) => setzen('staff_member_id', e.target.value)}
          >
            <option value="">Bitte wählen …</option>
            {(therapeuten.data ?? []).map((t) => (
              <option key={t.staff_member_id} value={t.staff_member_id}>
                {t.display_name}
              </option>
            ))}
          </Select>

          <Select
            label="Terminart *"
            value={werte.appointment_type}
            error={fehler.appointment_type}
            onChange={(e) => setzen('appointment_type', e.target.value)}
          >
            {(Object.keys(appointmentTypeLabels) as AppointmentType[]).map((typ) => (
              <option key={typ} value={typ}>
                {appointmentTypeLabels[typ]}
              </option>
            ))}
          </Select>

          <Field
            label="Datum *"
            type="date"
            value={werte.date}
            error={fehler.date}
            min={praxisZeitzone ? todayInTimeZone(praxisZeitzone) : undefined}
            onChange={(e) => setzen('date', e.target.value)}
          />

          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
            <Field
              label="Beginn *"
              type="time"
              value={werte.start_time}
              error={fehler.start_time}
              onChange={(e) => setzen('start_time', e.target.value)}
            />
            <Field
              label="Ende *"
              type="time"
              value={werte.end_time}
              error={fehler.end_time}
              onChange={(e) => setzen('end_time', e.target.value)}
            />
          </div>

          {art === 'practice' ? (
            <Select
              label="Standort *"
              value={werte.location_id}
              error={fehler.location_id}
              onChange={(e) => setzen('location_id', e.target.value)}
            >
              <option value="">Bitte wählen …</option>
              {(standorte.data ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          ) : null}

          {art === 'home_visit' ? <HausbesuchsAdresse patient={patientDaten} /> : null}

          {art === 'video' ? (
            <div className="border-line bg-surface-sunken rounded-lg border p-4">
              <p className="text-ink text-sm">
                Für Videotermine wird in diesem Stand noch kein Videolink erzeugt.
              </p>
            </div>
          ) : null}
        </div>

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

function HausbesuchsAdresse({ patient }: { patient: Patient }) {
  const street = [patient.street, patient.house_number].filter(Boolean).join(' ');
  const city = [patient.postal_code, patient.city].filter(Boolean).join(' ');
  const vollstaendig = Boolean(
    patient.street && patient.house_number && patient.postal_code && patient.city,
  );

  return (
    <div className="border-line bg-surface-sunken rounded-lg border p-4">
      <p className="text-ink-muted text-sm">Adresse des Hausbesuchs</p>
      {vollstaendig ? (
        <>
          <p className="text-ink text-[0.9375rem]">{[street, city].filter(Boolean).join(', ')}</p>
          <p className="text-ink-subtle mt-2 text-xs leading-relaxed">
            Wird aus den Stammdaten übernommen und am Termin festgehalten. Eine spätere Änderung der
            Stammdaten verändert diesen Termin nicht.
          </p>
        </>
      ) : (
        <p className="text-danger text-sm">
          Für einen Hausbesuch fehlt eine vollständige Adresse (Straße, Hausnummer, PLZ und Ort).
          Bitte zuerst die Stammdaten ergänzen.
        </p>
      )}
    </div>
  );
}
