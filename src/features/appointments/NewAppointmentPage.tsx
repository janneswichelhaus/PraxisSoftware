import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { fetchPatient, fullName } from '@/features/patients/api';
import type { CurrentUser } from '@/features/session/types';
import { mitRueckweg } from '@/lib/rueckweg';
import {
  AppointmentFormFields,
  ArbeitszeitRueckfrage,
  UebernommeneAdresse,
} from './AppointmentFormFields';
import {
  appointmentFormSchema,
  createAppointment,
  fensterEnde,
  fetchAssignableTherapists,
  fetchLocations,
  istAusserhalbArbeitszeit,
  leererTermin,
  leseTerminVorbelegung,
  schreibeTerminVorbelegung,
  TERMINFENSTER_MINUTEN,
  todayInTimeZone,
  type AppointmentFormField,
  type AppointmentFormValues,
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

  const [suche] = useSearchParams();
  // Einmalig beim ersten Rendern: die Vorbelegung stammt aus der Adresszeile
  // und soll spätere Eingaben nicht überschreiben.
  const [vorbelegung] = useState(() => leseTerminVorbelegung(suche));

  const [werte, setWerte] = useState<Record<AppointmentFormField, string>>(() => ({
    ...leererTermin,
    // „Hausbesuch, ich, heute" ist der Regelfall dieser Praxis: sie fährt zu
    // den Menschen. Die Vorbelegung aus der Adresszeile geht vor - sie kommt
    // vom Folgetermin oder aus dem Kalender und weiß es genauer.
    appointment_type: vorbelegung.art ?? 'home_visit',
    date:
      vorbelegung.datum ??
      (user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : ''),
    start_time: vorbelegung.beginn ?? '',
    // Das Ende wird abgeleitet, nicht übernommen (CAL-010a): ein neu
    // angelegter Termin ist ein angebotener Termin und damit 60 Minuten lang.
    // Eine abweichende Länge aus der Adresszeile wäre eine Falle - der Server
    // wiese sie ab.
    end_time: vorbelegung.beginn ? fensterEnde(vorbelegung.beginn) : '',
    staff_member_id: vorbelegung.person ?? '',
  }));
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

  /**
   * „Ich" als behandelnde Person - sobald feststeht, wer zuordenbar ist.
   *
   * Zwei Fälle, und beide brauchen die geladene Liste: Ist noch niemand
   * gewählt und ist die angemeldete Person selbst zuordenbar, wird sie
   * vorbelegt (UX-003). Steht in der Adresszeile eine Person, die gar nicht
   * zuordenbar ist, wird die Auswahl geleert - ein Wert ohne passende Option
   * sähe wie eine getroffene Wahl aus, wäre aber keine.
   */
  useEffect(() => {
    const zuordenbar = therapeuten.data;
    if (!zuordenbar) return;

    setWerte((bisher) => {
      if (bisher.staff_member_id !== '') {
        const bekannt = zuordenbar.some((t) => t.staff_member_id === bisher.staff_member_id);
        return bekannt ? bisher : { ...bisher, staff_member_id: '' };
      }
      const ich = zuordenbar.find((t) => t.staff_member_id === user.staffMemberId);
      return ich ? { ...bisher, staff_member_id: ich.staff_member_id } : bisher;
    });
  }, [therapeuten.data, user.staffMemberId]);

  const mutation = useMutation({
    mutationFn: (eingabe: { werte: AppointmentFormValues; bestaetigt: boolean }) =>
      createAppointment(patientId!, eingabe.werte, eingabe.bestaetigt),
    onSuccess: async (appointmentId) => {
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      void navigate(`/termine/${appointmentId}`, { replace: true });
    },
  });

  function setzen(feld: AppointmentFormField, wert: string) {
    setWerte((bisher) =>
      feld === 'start_time'
        ? { ...bisher, start_time: wert, end_time: fensterEnde(wert) }
        : { ...bisher, [feld]: wert },
    );
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
    // Eine geänderte Eingabe macht die Rückfrage gegenstandslos: sie bezieht
    // sich auf genau den Zeitraum, der abgewiesen wurde.
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
    mutation.mutate({ werte: ergebnis.data, bestaetigt: false });
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
        {istAusserhalbArbeitszeit(mutation.error) ? (
          <ArbeitszeitRueckfrage
            onBestaetigen={bestaetigen}
            laeuft={mutation.isPending}
            beschriftung="Termin trotzdem anlegen"
          />
        ) : mutation.isError ? (
          <div className="mb-6">
            <ErrorState
              title="Der Termin konnte nicht angelegt werden."
              description={mutation.error.message}
            />
          </div>
        ) : null}

        <div className="border-line bg-surface-sunken rounded-card mb-5 border p-4">
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
          rasterMinuten={user.appointmentGridMinutes ?? undefined}
          fensterMinuten={TERMINFENSTER_MINUTEN}
          hausbesuch={
            <UebernommeneAdresse
              street={patientDaten.street}
              houseNumber={patientDaten.house_number}
              postalCode={patientDaten.postal_code}
              city={patientDaten.city}
              // Der Abstecher in die Stammdaten und zurück in genau dieses
              // Formular - mit derselben Vorbelegung, die es mitgebracht hat
              // (UX-012).
              ergaenzenZiel={mitRueckweg(
                `/patienten/${patientDaten.id}/bearbeiten`,
                `/patienten/${patientDaten.id}/termine/neu${schreibeTerminVorbelegung(werte.date || werte.start_time ? { datum: werte.date, beginn: werte.start_time, art: werte.appointment_type as AppointmentType, person: werte.staff_member_id } : vorbelegung)}`,
              )}
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
