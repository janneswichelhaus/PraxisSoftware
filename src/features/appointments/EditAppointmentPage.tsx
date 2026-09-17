import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { mitRueckweg, RUECKWEG_PARAM } from '@/lib/rueckweg';
import { Button } from '@/components/ui/Button';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { fetchPatient } from '@/features/patients/api';
import { fetchStaffMembers } from '@/features/staff/api';
import type { CurrentUser } from '@/features/session/types';
import {
  AppointmentFormFields,
  ArbeitszeitRueckfrage,
  UebernommeneAdresse,
} from './AppointmentFormFields';
import {
  appointmentFormSchema,
  appointmentToFormValues,
  fensterEnde,
  fetchAppointment,
  fetchAssignableTherapists,
  fetchLocations,
  istAusserhalbArbeitszeit,
  leererTermin,
  patientName,
  TERMINFENSTER_MINUTEN,
  terminLaengeMinuten,
  todayInTimeZone,
  updateAppointment,
  type AppointmentFormField,
  type AppointmentFormValues,
  type AppointmentType,
  type AssignableTherapist,
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
  const [suche] = useSearchParams();
  // Der Termin hat einen Rückweg (Kalender, Akte, Tagesliste); die Bearbeitung
  // reicht ihn durch, damit er über diese Station nicht verloren geht (UX-012).
  const rueckweg = suche.get(RUECKWEG_PARAM);
  const queryClient = useQueryClient();

  const [werte, setWerte] = useState<Record<AppointmentFormField, string>>(leererTermin);
  const [fehler, setFehler] = useState<Partial<Record<AppointmentFormField, string>>>({});
  const [vorbefuellt, setVorbefuellt] = useState(false);
  /**
   * Länge, aus der sich das Ende ergibt (CAL-010a).
   *
   * Startwert ist die Länge des gespeicherten Termins, nicht das Terminfenster:
   * §8.1 verbietet, einen Bestandstermin selbsttätig zu verlängern oder zu
   * verkürzen. Wer die Länge ausdrücklich ändern will, tut das über den Knopf
   * unten — dann greift die Regel.
   */
  const [fensterMinuten, setFensterMinuten] = useState(TERMINFENSTER_MINUTEN);

  const termin = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => fetchAppointment(appointmentId!),
    enabled: Boolean(appointmentId),
    retry: false,
  });

  const istEreignis = termin.data?.kind === 'event';

  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    enabled: termin.isSuccess && !istEreignis,
    retry: false,
  });

  /**
   * Beteiligte eines Ereignisses sind Beschäftigte, nicht notwendig
   * Behandelnde (CAL-016).
   *
   * Das Büro nimmt an einer Teambesprechung teil; in
   * `list_assignable_therapists` steht es nicht. Mit dieser Liste stünde die
   * eingetragene Person nicht in der Auswahl, und das Formular träte mit einer
   * leeren Auswahl an - die erste Speicherung hätte die Beteiligung
   * stillschweigend verschoben.
   */
  const beteiligte = useQuery({
    queryKey: ['staff-members'],
    queryFn: fetchStaffMembers,
    enabled: termin.isSuccess && istEreignis,
    retry: false,
  });

  const personen: AssignableTherapist[] = istEreignis
    ? (beteiligte.data ?? [])
        .filter((person) => person.employment_status === 'active')
        .map((person) => ({
          staff_member_id: person.id,
          display_name: `${person.given_name} ${person.family_name}`,
        }))
    : (therapeuten.data ?? []);

  const standorte = useQuery({ queryKey: ['locations'], queryFn: fetchLocations, retry: false });

  // Die Patientenadresse wird nur gebraucht, wenn zu einem Hausbesuch
  // gewechselt wird; erst dann entsteht ein neuer Snapshot.
  const patient = useQuery({
    queryKey: ['patient', termin.data?.patient_id],
    queryFn: () => fetchPatient(termin.data!.patient_id!),
    enabled: Boolean(termin.data?.patient_id),
    retry: false,
  });

  useEffect(() => {
    if (termin.data && !vorbefuellt) {
      setWerte(appointmentToFormValues(termin.data));
      setFensterMinuten(terminLaengeMinuten(termin.data));
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
      void navigate(mitRueckweg(`/termine/${appointmentId}`, rueckweg), { replace: true });
    },
  });

  function setzen(feld: AppointmentFormField, wert: string) {
    setWerte((bisher) =>
      feld === 'start_time'
        ? // Verschieben lässt die Länge unangetastet - auch bei einem
          // Termin, der von den Regellängen abweicht (ANN-056).
          { ...bisher, start_time: wert, end_time: fensterEnde(wert, fensterMinuten) }
        : { ...bisher, [feld]: wert },
    );
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
    // Eine geänderte Eingabe macht die Rückfrage gegenstandslos.
    if (mutation.isError) mutation.reset();
  }

  /** Wechselt die Länge ausdrücklich - danach gilt die Regel aus §8.1. */
  function laengeWechseln(minuten: number) {
    setFensterMinuten(minuten);
    setWerte((bisher) => ({ ...bisher, end_time: fensterEnde(bisher.start_time, minuten) }));
    if (fehler.end_time) setFehler(({ end_time: _entfaellt, ...rest }) => rest);
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

  const zurueck = istEreignis ? '← Zurück zum Ereignis' : '← Zurück zum Termin';

  // Ein abgesagter Termin ist terminal. Die Serverfunktion weist ihn ohnehin
  // ab; hier wird gar nicht erst ein Formular angeboten.
  if (daten.status === 'cancelled') {
    return (
      <>
        <Link
          to={mitRueckweg(`/termine/${daten.id}`, rueckweg)}
          className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
        >
          {zurueck}
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
        to={mitRueckweg(`/termine/${daten.id}`, rueckweg)}
        className="text-ink-muted hover:text-ink mb-4 inline-flex min-h-11 items-center text-sm"
      >
        {zurueck}
      </Link>

      <PageHeader
        title={istEreignis ? 'Ereignis bearbeiten' : 'Termin bearbeiten'}
        description={
          istEreignis
            ? 'Zeit, Ort und beteiligte Person. Mit * markierte Felder sind erforderlich.'
            : `Für ${patientName(daten)}. Mit * markierte Felder sind erforderlich.`
        }
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

        {/* Ein Ereignis hat keine Patient:in - der Kasten nennt stattdessen,
            worum es geht. Die Bezeichnung selbst ist hier nicht änderbar: Die
            Serverfunktion `update_appointment` nimmt sie nicht entgegen
            (CAL-016). */}
        <div className="border-line bg-surface-sunken rounded-card mb-5 border p-4">
          <p className="text-ink-muted text-sm">{istEreignis ? 'Ereignis' : 'Patient:in'}</p>
          <p className="text-ink text-[0.9375rem] font-medium">
            {istEreignis ? (daten.title ?? '—') : patientName(daten)}
          </p>
          <p className="text-ink-subtle mt-2 text-xs leading-relaxed">
            {istEreignis
              ? 'Die Bezeichnung lässt sich hier nicht ändern. Änderbar sind Zeit, Ort und die beteiligte Person.'
              : 'Ein Termin kann nicht auf eine andere Person übertragen werden.'}
          </p>
        </div>

        <AppointmentFormFields
          werte={werte}
          fehler={fehler}
          onChange={setzen}
          therapeuten={personen}
          personBeschriftung={istEreignis ? 'Beteiligte Person *' : undefined}
          standorte={standorte.data ?? []}
          // Ein Ereignis ohne Patient:in hätte bei einem Hausbesuch keine
          // Anschrift; der Server weist ihn ab (CAL-015b).
          arten={
            istEreignis ? (['practice', 'video'] as const satisfies AppointmentType[]) : undefined
          }
          minDatum={
            user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : undefined
          }
          rasterMinuten={user.appointmentGridMinutes ?? undefined}
          fensterMinuten={fensterMinuten}
          onFensterMinuten={
            // Ein Ereignis hat keine Längenregel; seine Dauer wird hier nicht
            // über die Auswahl geändert, sondern bleibt, wie sie ist.
            daten.kind === 'treatment' ? laengeWechseln : undefined
          }
          laengeHinweis={
            istEreignis ? `Dauer: ${fensterMinuten} Minuten, wie eingetragen.` : undefined
          }
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
            onClick={() => void navigate(mitRueckweg(`/termine/${daten.id}`, rueckweg))}
          >
            Abbrechen
          </Button>
        </div>
      </form>
    </>
  );
}
