import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { mitRueckweg, RUECKWEG_PARAM } from '@/lib/rueckweg';
import type { Formularfehler } from '@/lib/formularfehler';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import { Fehlerzusammenfassung } from '@/components/ui/Fehlerzusammenfassung';
import { Hinweisfenster } from '@/components/ui/Dialogfenster';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Section } from '@/components/ui/Section';
import { Textlink } from '@/components/ui/Textlink';
import { EINGABETEXTE, useTextverlustschutz } from '@/features/documentation/Textverlustschutz';
import { fetchPatient } from '@/features/patients/api';
import { fetchStaffMembers } from '@/features/staff/api';
import type { CurrentUser } from '@/features/session/types';
import {
  AppointmentFormFields,
  ArbeitszeitRueckfrage,
  UebernommeneAdresse,
} from './AppointmentFormFields';
import { TerritoryHint } from '@/features/territories/TerritoryHint';
import { NachladeHinweis } from './Rueckmeldungen';
import {
  appointmentFormSchema,
  appointmentToFormValues,
  fensterEnde,
  fetchAppointment,
  fetchAssignableTherapists,
  fetchLocations,
  formatLocalDate,
  formatLocalTimeRange,
  istAusserhalbArbeitszeit,
  istVergangenheit,
  liegtInVergangenheit,
  leererTermin,
  locationSummary,
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
import { speicherfehlerText, terminFehlerliste, terminFeldfehler } from './terminformular';

/** Die Felder, an denen sich eine Eingabe vom gespeicherten Termin unterscheiden kann. */
const FELDER: readonly AppointmentFormField[] = [
  'staff_member_id',
  'appointment_type',
  'date',
  'start_time',
  'end_time',
  'location_id',
];

/** Der Satz, den die Schnittstelle liefert, wenn sie keinen Grund nennen kann. */
const STANDARDFEHLER = 'Der Termin konnte nicht geändert werden.';

/**
 * Organisatorische Bearbeitung eines geplanten Termins (CAL-003).
 *
 * Patient und Organisation sind nicht änderbar - die Serverfunktion nimmt sie
 * gar nicht erst entgegen. Gespeichert wird gegen den Stand, auf dem die
 * Bearbeitung beruht; hat zwischenzeitlich jemand anderes gespeichert, wird
 * der Vorgang abgewiesen statt die fremde Änderung zu überschreiben.
 *
 * **An einer Fehlzeit heißt die Seite „Teilnahme ändern" (TER-01).** Sie
 * tauscht dort nur die beteiligte Person. Zeit, Art und Ort gelten für alle
 * Beteiligten (ANN-051), und der Server weist eine Änderung an dieser Stelle
 * ab; sie stehen deshalb als Auskunft da, mit dem Weg zu „Fehlzeit
 * bearbeiten", wo sie sich für alle ändern lassen.
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
  /** Die Zusammenfassung der letzten Prüfung - wie in der Terminanlage (UIK-02). */
  const [pruefung, setPruefung] = useState<{ nummer: number; fehler: Formularfehler[] }>({
    nummer: 0,
    fehler: [],
  });
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
  /** Enthält das Minutenfeld eine Zahl? Sonst gibt es kein Ende (CAL-020). */
  const [dauerGueltig, setDauerGueltig] = useState(true);

  const termin = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => fetchAppointment(appointmentId!),
    enabled: Boolean(appointmentId),
    retry: false,
  });

  const istEreignis = termin.data?.kind === 'internal';

  const therapeuten = useQuery({
    queryKey: ['assignable-therapists'],
    queryFn: fetchAssignableTherapists,
    enabled: Boolean(termin.data) && !istEreignis,
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
    enabled: Boolean(termin.data) && istEreignis,
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
  /** Die Liste der Personen, aus der gewählt wird - je nach Art des Eintrags. */
  const personenAbfrage = istEreignis ? beteiligte : therapeuten;

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

  /** Ein Tag vor dem heutigen, noch nicht abgeschickt (FIX-019). */
  const [vorfrage, setVorfrage] = useState<AppointmentFormValues | null>(null);
  const heute = user.organizationTimeZone ? todayInTimeZone(user.organizationTimeZone) : '';
  /** Der gespeicherte Stand des Termins - Maßstab für „geändert" und für die Vergangenheit. */
  const gespeichert = termin.data ? appointmentToFormValues(termin.data) : null;
  /** Der gespeicherte Tag des Termins - nur ein anderer Tag davor ist ein Zurücklegen. */
  const vorbefuelltesDatum = gespeichert?.date ?? '';

  /**
   * Weicht etwas vom gespeicherten Termin ab (TER-05)?
   *
   * Erst nach dem Befüllen: Bis dahin steht das leere Formular da, und das ist
   * keine Eingabe.
   */
  const geaendert =
    vorbefuellt &&
    gespeichert !== null &&
    termin.data !== undefined &&
    termin.data !== null &&
    (FELDER.some((feld) => werte[feld] !== gespeichert[feld]) ||
      fensterMinuten !== terminLaengeMinuten(termin.data) ||
      !dauerGueltig);

  // Die Bearbeitung kennt keinen Entwurf: Die Rückfrage bietet nur Verwerfen
  // und Bleiben an (ANN-046, TER-05).
  const { freigeben, schutz } = useTextverlustschutz({
    ungespeichert: geaendert,
    texte: {
      ...EINGABETEXTE,
      bezeichnung: istEreignis ? 'Ungespeicherte Teilnahme' : 'Ungespeicherter Termin',
    },
  });

  const mutation = useMutation({
    mutationFn: (eingabe: {
      werte: AppointmentFormValues;
      bestaetigt: boolean;
      vergangenheit: boolean;
    }) =>
      updateAppointment(
        appointmentId!,
        termin.data!.updated_at,
        eingabe.werte,
        eingabe.bestaetigt,
        eingabe.vergangenheit,
      ),
    onSuccess: async () => {
      // Detailansicht und Kalender zeigen sonst weiter den alten Stand.
      await queryClient.invalidateQueries({ queryKey: ['appointment', appointmentId] });
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      // Gespeichert ist gespeichert: Der eigene Weg danach ist kein Verlust.
      freigeben();
      void navigate(mitRueckweg(`/termine/${appointmentId}`, rueckweg), { replace: true });
    },
  });

  function setzen(feld: AppointmentFormField, wert: string) {
    setWerte((bisher) =>
      feld === 'start_time'
        ? // Verschieben lässt die Länge unangetastet - auch bei einem
          // Termin, der von den Regellängen abweicht (ANN-056). Ein leeres
          // Minutenfeld ergibt kein Ende, auch nicht über einen neuen Beginn.
          {
            ...bisher,
            start_time: wert,
            end_time: dauerGueltig ? fensterEnde(wert, fensterMinuten) : '',
          }
        : { ...bisher, [feld]: wert },
    );
    if (fehler[feld]) setFehler((bisher) => ({ ...bisher, [feld]: undefined }));
    // Eine geänderte Eingabe macht die Rückfrage gegenstandslos.
    if (mutation.isError) mutation.reset();
  }

  /** Wechselt die Länge ausdrücklich - danach gilt die Regel aus §8.1. */
  function laengeWechseln(minuten: number | null) {
    if (minuten !== null) setFensterMinuten(minuten);
    setDauerGueltig(minuten !== null);
    setWerte((bisher) => ({ ...bisher, end_time: fensterEnde(bisher.start_time, minuten) }));
    if (fehler.end_time) setFehler(({ end_time: _entfaellt, ...rest }) => rest);
    if (mutation.isError) mutation.reset();
  }

  /** Wiederholt den Vorgang mit einer weiteren Bestätigung (CAL-005, FIX-019). */
  function bestaetigen(zusatz: { bestaetigt?: boolean; vergangenheit?: boolean }) {
    if (mutation.isPending) return;
    const ergebnis = appointmentFormSchema.safeParse(werte);
    if (!ergebnis.success) return;
    mutation.mutate({
      werte: ergebnis.data,
      bestaetigt: zusatz.bestaetigt ?? mutation.variables?.bestaetigt ?? false,
      vergangenheit: zusatz.vergangenheit ?? mutation.variables?.vergangenheit ?? false,
    });
  }

  function absenden(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (mutation.isPending) return;

    const ergebnis = appointmentFormSchema.safeParse(werte);
    const gefunden: Partial<Record<AppointmentFormField, string>> = ergebnis.success
      ? {}
      : terminFeldfehler(ergebnis.error.issues, werte, dauerGueltig);
    // Eine gescheiterte Pflichtliste sperrt das Absenden (ZST-07): Die
    // gespeicherte Person stünde sonst als leere Auswahl da - und ginge mit.
    if (personenAbfrage.isError && !gefunden.staff_member_id) {
      gefunden.staff_member_id = 'Bitte zuerst die Liste der Personen erneut laden.';
    }
    if (
      !istEreignis &&
      werte.appointment_type === 'practice' &&
      standorte.isError &&
      !gefunden.location_id
    ) {
      gefunden.location_id = 'Bitte zuerst die Liste der Standorte erneut laden.';
    }

    if (!ergebnis.success || Object.keys(gefunden).length > 0) {
      setFehler(gefunden);
      setPruefung((bisher) => ({
        nummer: bisher.nummer + 1,
        fehler: terminFehlerliste(
          gefunden,
          istEreignis ? 'Beteiligte Person' : 'Behandelnde Person',
        ),
      }));
      return;
    }

    setFehler({});
    setPruefung((bisher) => ({ ...bisher, fehler: [] }));
    // Ein Tag vor dem heutigen: erst fragen, dann schreiben (FIX-019). Der
    // Tag des Bestandstermins selbst zählt nicht - wer nur die Person eines
    // vergangenen Termins ändert, hat nichts zurückgelegt.
    if (
      heute &&
      liegtInVergangenheit(ergebnis.data.date, heute) &&
      ergebnis.data.date !== vorbefuelltesDatum
    ) {
      setVorfrage(ergebnis.data);
      return;
    }
    mutation.mutate({
      werte: ergebnis.data,
      bestaetigt: false,
      // Bestandstermin in der Vergangenheit, Tag unverändert: Der Server
      // verlangt die Bestätigung trotzdem; sie gilt dem Tag, der schon war.
      vergangenheit:
        ergebnis.data.date === vorbefuelltesDatum &&
        liegtInVergangenheit(ergebnis.data.date, heute),
    });
  }

  const zumTermin = mitRueckweg(`/termine/${appointmentId ?? ''}`, rueckweg);

  // Der Rückweg steht in jedem Zustand der Seite - beim Laden, im Fehlerfall
  // und am abgesagten Termin (TER-03, ZST-08). Er folgt dem mitgereisten Weg;
  // ohne ihn führt er zum Termin.
  const kopf = (
    <Rueckweg
      standard={`/termine/${appointmentId ?? ''}`}
      beschriftung={istEreignis ? 'Zurück zur Fehlzeit' : 'Zurück zum Termin'}
    />
  );

  // Ersetzt wird das Formular nur, solange es keinen Termin gibt: Ein
  // gescheitertes Nachladen nimmt eine angefangene Änderung nicht mehr mit
  // (ZST-03). Ein Ladefehler ist kein „Nicht gefunden" (TER-11).
  if (!termin.data) {
    if (termin.isPending) {
      return (
        <>
          {kopf}
          <LoadingState label="Termin wird geladen …" />
        </>
      );
    }
    return (
      <>
        {kopf}
        {termin.isError ? (
          <ErrorState
            title="Der Termin konnte nicht geladen werden."
            description="Bitte die Verbindung prüfen und erneut versuchen."
            onErneut={() => void termin.refetch()}
          />
        ) : (
          <ErrorState
            title="Nicht gefunden"
            description="Dieser Termin existiert nicht oder ist für Ihren Zugang nicht freigegeben."
          />
        )}
      </>
    );
  }

  const daten = termin.data;
  const zone = daten.organization_time_zone;

  // Ein Trainingstermin wird im Trainingsbereich verschoben (TRN-004): Dieses
  // Formular kennt nur behandelnde Personen und die Anschrift der Akte.
  if (daten.kind === 'training') {
    return <Navigate to={`/training/termine/${daten.id}/bearbeiten`} replace />;
  }

  // Ein abgesagter Termin ist terminal. Die Serverfunktion weist ihn ohnehin
  // ab; hier wird gar nicht erst ein Formular angeboten.
  if (daten.status === 'cancelled') {
    return (
      <>
        {kopf}
        <ErrorState
          title="Abgesagte Termine werden nicht bearbeitet"
          description="Der Termin bleibt zur Nachvollziehbarkeit erhalten. Für einen neuen Zeitraum bitte einen neuen Termin anlegen."
        />
      </>
    );
  }

  const bleibtHausbesuch =
    daten.appointment_type === 'home_visit' && werte.appointment_type === 'home_visit';
  /** Titel des Fehlerfensters - an einer Fehlzeit geht es um die Teilnahme (TER-22). */
  const fehlertitel = istEreignis
    ? 'Die Teilnahme konnte nicht geändert werden.'
    : 'Der Termin konnte nicht geändert werden.';

  return (
    <>
      {kopf}

      <PageHeader
        title={istEreignis ? 'Teilnahme ändern' : 'Termin bearbeiten'}
        // Nur der Name; der Satz zu den Sternchen erklärte das Formular, nicht
        // den Termin (UX-005g).
        description={
          istEreignis
            ? 'Hier wird nur die beteiligte Person getauscht.'
            : `Für ${patientName(daten)}.`
        }
      />

      {termin.isError ? (
        <NachladeHinweis
          className="mb-6"
          laeuft={termin.isFetching}
          onErneut={() => void termin.refetch()}
        />
      ) : null}

      {/* Was an einer Fehlzeit für alle gilt, steht hier als Auskunft - samt
          dem Weg, wo es sich ändern lässt (TER-01, TER-15). */}
      {istEreignis ? (
        <div className="mb-8 max-w-xl">
          <Section titel="Fehlzeit" rahmen>
            {/* Ohne Bezeichnung keine Zeile, und keine eigene Zeile „Art":
                „Videotermin" steht im Ort, wo es zutrifft; der Satz, dass das
                alles für alle gilt, erklärte das System (UX-005g). */}
            <DetailList>
              {daten.title ? <DetailRow label="Bezeichnung">{daten.title}</DetailRow> : null}
              <DetailRow label="Datum">{formatLocalDate(daten.starts_at, zone)}</DetailRow>
              <DetailRow label="Zeit">
                {formatLocalTimeRange(daten.starts_at, daten.ends_at, zone)}
              </DetailRow>
              <DetailRow label={daten.appointment_type === 'practice' ? 'Standort' : 'Ort'}>
                {locationSummary(daten)}
              </DetailRow>
            </DetailList>
            <Textlink
              alleinstehend
              className="text-sm"
              to={mitRueckweg(`/termine/${daten.id}/ereignis-bearbeiten`, rueckweg)}
            >
              Zeit oder Ort für alle ändern
            </Textlink>
          </Section>
        </div>
      ) : null}

      <form onSubmit={absenden} noValidate className="max-w-xl">
        {/* Sind alle Angaben berichtigt, verschwindet der Kasten (UIK-02). */}
        <Fehlerzusammenfassung
          key={pruefung.nummer}
          fehler={Object.values(fehler).some(Boolean) ? pruefung.fehler : []}
        />

        {/* Rückfrage und Fehler als Fenster über dem Formular (FIX-016). */}
        {vorfrage ? (
          <ArbeitszeitRueckfrage
            arbeitszeit={false}
            vergangenheit
            onBestaetigen={() => {
              const w = vorfrage;
              setVorfrage(null);
              mutation.mutate({ werte: w, bestaetigt: false, vergangenheit: true });
            }}
            onAbbrechen={() => setVorfrage(null)}
            laeuft={false}
            beschriftung="Änderung trotzdem speichern"
          />
        ) : istAusserhalbArbeitszeit(mutation.error) ? (
          <ArbeitszeitRueckfrage
            vergangenheit={mutation.variables?.vergangenheit ?? false}
            onBestaetigen={() => bestaetigen({ bestaetigt: true })}
            onAbbrechen={() => mutation.reset()}
            laeuft={mutation.isPending}
            beschriftung="Änderung trotzdem speichern"
          />
        ) : istVergangenheit(mutation.error) ? (
          <ArbeitszeitRueckfrage
            arbeitszeit={false}
            vergangenheit
            onBestaetigen={() => bestaetigen({ vergangenheit: true })}
            onAbbrechen={() => mutation.reset()}
            laeuft={mutation.isPending}
            beschriftung="Änderung trotzdem speichern"
          />
        ) : mutation.isError ? (
          <Hinweisfenster titel={fehlertitel} onSchliessen={() => mutation.reset()}>
            {speicherfehlerText(mutation.error.message, STANDARDFEHLER)}
          </Hinweisfenster>
        ) : null}

        {/* Kein Kasten „Patient:in" mehr: Der Name steht in der Seiten-
            beschreibung, und dass ein Termin nicht übertragbar ist, zeigt das
            fehlende Feld (TER-21, UX-005g). */}
        <AppointmentFormFields
          werte={werte}
          fehler={fehler}
          onChange={setzen}
          therapeuten={personen}
          personenListe={{
            laedt: personenAbfrage.isPending,
            fehlgeschlagen: personenAbfrage.isError,
            erneut: () => void personenAbfrage.refetch(),
          }}
          personBeschriftung={istEreignis ? 'Beteiligte Person *' : undefined}
          nurPerson={istEreignis}
          standorte={standorte.data ?? []}
          standortListe={{
            laedt: standorte.isPending,
            fehlgeschlagen: standorte.isError,
            erneut: () => void standorte.refetch(),
          }}
          // Ein Ereignis ohne Patient:in hätte bei einem Hausbesuch keine
          // Anschrift; der Server weist ihn ab (CAL-015b).
          arten={
            istEreignis ? (['practice', 'video'] as const satisfies AppointmentType[]) : undefined
          }
          rasterMinuten={user.appointmentGridMinutes ?? undefined}
          fensterMinuten={fensterMinuten}
          onFensterMinuten={
            // Ein Ereignis hat keine Längenregel; seine Dauer wird hier nicht
            // über die Auswahl geändert, sondern bleibt, wie sie ist.
            daten.kind === 'therapy' ? laengeWechseln : undefined
          }
          laengeHinweis={
            istEreignis ? `Dauer: ${fensterMinuten} Minuten, wie eingetragen.` : undefined
          }
          hausbesuch={
            <>
              {bleibtHausbesuch ? (
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
                  // Der Abstecher in die Stammdaten und zurück in diese
                  // Bearbeitung (TER-15). Die Änderung selbst reist nicht mit;
                  // der Schutz fragt deshalb vorher nach.
                  ergaenzenZiel={
                    daten.patient_id
                      ? mitRueckweg(
                          `/patienten/${daten.patient_id}/bearbeiten`,
                          mitRueckweg(`/termine/${daten.id}/bearbeiten`, rueckweg),
                        )
                      : undefined
                  }
                />
              )}
              {/* Gebietstag der Adresse (PRX-002): warnt, sperrt nichts. */}
              <TerritoryHint
                postalCode={
                  bleibtHausbesuch ? daten.visit_postal_code : (patient.data?.postal_code ?? null)
                }
                slots={[{ datum: werte.date, beginn: werte.start_time }]}
              />
            </>
          }
        />

        {/* Die Rückfrage vor dem Weggehen steht dort, wo gearbeitet wird -
            über den Knöpfen (TER-05). */}
        {schutz}

        <div className="mt-8 flex flex-wrap gap-3">
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Wird gespeichert …' : 'Änderungen speichern'}
          </Button>
          {/* Ein Seitenwechsel und damit ein Link (UIK-13). */}
          <ButtonLink to={zumTermin} variant="secondary">
            Abbrechen
          </ButtonLink>
        </div>
      </form>
    </>
  );
}
