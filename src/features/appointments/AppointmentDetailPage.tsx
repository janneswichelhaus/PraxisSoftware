import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Select } from '@/components/ui/Select';
import { Field } from '@/components/ui/Field';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { MitteilungVermerken } from './MitteilungVermerken';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  canManageAppointments,
  canWriteTreatmentNote,
  type CurrentUser,
} from '@/features/session/types';
import { TreatmentNoteSection } from '@/features/documentation/TreatmentNoteSection';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import { NavigationZumTermin } from './NavigationStarten';
import {
  appointmentStatusLabels,
  cancelAppointment,
  cancellationReasonLabels,
  cancellationReasonSchema,
  appointmentTypeLabels,
  completeAppointment,
  type CancellationReason,
  fetchAppointment,
  folgeterminVorbelegung,
  formatLocalDate,
  formatLocalTime,
  formatLocalTimeRange,
  feeBasisLabels,
  locationSummary,
  patientName,
  recordNoShow,
  reopenAppointment,
  schreibeTerminVorbelegung,
  staffName,
  todayInTimeZone,
  type Appointment,
} from './api';

/** Bezeichnung des Ortsfeldes - je nach Terminart eine andere Frage. */
function ortsBeschriftung(art: Appointment['appointment_type']): string {
  if (art === 'practice') return 'Standort';
  if (art === 'home_visit') return 'Anschrift';
  return 'Ort';
}

/**
 * Der Satz unter der Überschrift: der Zustand, wenn er einer ist, sonst die
 * Terminart.
 *
 * Er sagt bei jedem Zustand ohne Rückweg auch, wo korrigiert wird — im
 * Kalender gibt es dafür keinen Knopf, und das ist Absicht (ADR-018 Punkt 2).
 */
function zustandsHinweis(appointment: Appointment): string {
  switch (appointment.status) {
    case 'cancelled':
      return 'Dieser Termin ist abgesagt. Eine Absage wird nicht zurückgenommen – für einen neuen Termin bitte neu anlegen.';
    case 'no_show':
      return 'Hier wurde niemand angetroffen. Zum Ändern erst wieder öffnen.';
    case 'completed':
      return 'Dieser Termin ist abgeschlossen. Zum Ändern erst wieder öffnen.';
    case 'documented':
      return 'Dieser Termin ist dokumentiert. Korrigiert wird in der Dokumentation, nicht am Termin.';
    case 'invoiced':
      return 'Dieser Termin ist abgerechnet.';
    default:
      return appointmentTypeLabels[appointment.appointment_type];
  }
}

/**
 * Absage mit Rückfrage und Pflichtgrund.
 *
 * Bewusst zweistufig: eine Absage betrifft eine reale Verabredung, sie hat
 * keinen Rückweg (ADR-018 Punkt 2), und ein versehentlicher Einzelklick soll
 * sie nicht auslösen (PROJECT_PRINCIPLES.md 13). Die Rückfrage ist
 * Bedienkomfort - verbindlich prüft `cancel_appointment` Berechtigung, Zustand
 * und Grund erneut.
 *
 * Der Grund ist eine Auswahl ohne Freitext und ohne Vorbelegung: Wer absagt,
 * trifft die Entscheidung bewusst, und ein Freitextfeld am Termin wäre die
 * wahrscheinlichste Stelle für eine Gesundheitsangabe (ANN-034).
 *
 * Es ist ausdrücklich keine Löschung: der Termin bleibt erhalten. Die
 * Beschriftung vermeidet deshalb jede Löschsprache.
 */
function AbsageAktion({ appointment }: { appointment: Appointment }) {
  const queryClient = useQueryClient();
  const [grund, setGrund] = useState('');
  const [grundFehler, setGrundFehler] = useState<string | undefined>(undefined);
  // Der Eingang: „jetzt" ist der Regelfall am Telefon, „früher" die
  // nachträgliche Erfassung. Vorbelegt ist „jetzt" - das ist keine stille
  // Annahme, sondern der Augenblick, in dem gerade jemand absagt.
  const [eingang, setEingang] = useState<'jetzt' | 'frueher'>('jetzt');
  const [datum, setDatum] = useState('');
  const [uhrzeit, setUhrzeit] = useState('');
  const [eingangFehler, setEingangFehler] = useState<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: (eingabe: {
      grund: CancellationReason;
      datum: string | null;
      uhrzeit: string | null;
    }) =>
      cancelAppointment(
        appointment.id,
        appointment.updated_at,
        eingabe.grund,
        eingabe.datum,
        eingabe.uhrzeit,
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['appointment', appointment.id] });
      // Der Kalender zeigt sonst weiter einen bestätigten Termin.
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      // Die Tagesliste ebenso.
      await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
    },
  });

  async function absagen() {
    const gewaehlt = cancellationReasonSchema.safeParse(grund);
    if (!gewaehlt.success) {
      setGrundFehler('Bitte einen Absagegrund auswählen.');
      // Ohne den Wurf schlösse die Rückfrage sich trotz fehlender Angabe.
      throw new Error('Absagegrund fehlt');
    }
    setGrundFehler(undefined);

    if (eingang === 'frueher' && (!datum || !uhrzeit)) {
      setEingangFehler('Bitte Datum und Uhrzeit des Eingangs angeben.');
      throw new Error('Eingang unvollständig');
    }
    setEingangFehler(undefined);

    await mutation.mutateAsync({
      grund: gewaehlt.data,
      datum: eingang === 'frueher' ? datum : null,
      uhrzeit: eingang === 'frueher' ? uhrzeit : null,
    });
  }

  return (
    <Rueckfrage
      ausloeser="Termin absagen"
      bezeichnung="Termin absagen"
      bestaetigen="Ja, Termin absagen"
      bestaetigenLaeuft="Wird abgesagt …"
      fehler={mutation.isError ? mutation.error.message : undefined}
      laeuft={mutation.isPending}
      onAbbrechen={() => setGrundFehler(undefined)}
      onBestaetigen={absagen}
    >
      <p>
        Der Termin am {formatLocalDate(appointment.starts_at, appointment.organization_time_zone)}{' '}
        um {formatLocalTime(appointment.starts_at, appointment.organization_time_zone)} Uhr für{' '}
        {patientName(appointment)} wird als abgesagt geführt. Er bleibt vollständig erhalten und
        gibt seinen Zeitraum wieder frei. Eine Absage lässt sich nicht zurücknehmen – für einen
        neuen Termin bitte neu anlegen.
      </p>
      <div className="mt-3 max-w-xs">
        <Select
          label="Absagegrund"
          value={grund}
          error={grundFehler}
          onChange={(e) => {
            setGrund(e.target.value);
            setGrundFehler(undefined);
          }}
        >
          <option value="">Bitte wählen</option>
          {Object.entries(cancellationReasonLabels).map(([wert, beschriftung]) => (
            <option key={wert} value={wert}>
              {beschriftung}
            </option>
          ))}
        </Select>
      </div>

      {/* Der Eingang, getrennt vom Zeitpunkt der Eingabe (§8, ADR-018
          Fassung 2 Punkt 8). Der Anruf kommt abends aufs Band, eingetragen
          wird am nächsten Morgen - ohne diese Angabe entschiede die
          Schreibgeschwindigkeit des Büros über eine Forderung. */}
      <div className="mt-3 max-w-xs">
        <Select
          label="Wann ist die Absage eingegangen?"
          value={eingang}
          hint="Maßgeblich für die Ausfallgebühr ist der Eingang, nicht die Eingabe."
          onChange={(e) => {
            setEingang(e.target.value === 'frueher' ? 'frueher' : 'jetzt');
            setEingangFehler(undefined);
          }}
        >
          <option value="jetzt">Gerade eben</option>
          <option value="frueher">Früher – jetzt erst eingetragen</option>
        </Select>
      </div>

      {eingang === 'frueher' ? (
        <div className="mt-3 flex max-w-sm flex-wrap gap-3">
          <div className="min-w-[9rem] flex-1">
            <Field
              label="Datum des Eingangs"
              type="date"
              value={datum}
              max={todayInTimeZone(appointment.organization_time_zone)}
              error={eingangFehler}
              onChange={(e) => {
                setDatum(e.target.value);
                setEingangFehler(undefined);
              }}
            />
          </div>
          <div className="min-w-[7rem] flex-1">
            <Field
              label="Uhrzeit"
              type="time"
              value={uhrzeit}
              onChange={(e) => {
                setUhrzeit(e.target.value);
                setEingangFehler(undefined);
              }}
            />
          </div>
        </div>
      ) : null}

      <p className="text-ink-muted mt-3 text-sm leading-relaxed">
        Liegt der Eingang weniger als 24 Stunden vor dem Beginn und hat die Patient:in abgesagt,
        merkt die Anwendung eine Ausfallgebühr vor. Die Frist rechnet der Server; genau 24 Stunden
        liegen außerhalb der Regel.
      </p>
    </Rueckfrage>
  );
}

/**
 * „Nicht angetroffen" — ein Schritt, keine Entscheidung (CAL-014c).
 *
 * Die behandelnde Person steht vor der Tür, niemand öffnet, und sie hakt den
 * Termin ab. Bis ADR-018 Fassung 1 verlangte dieser Schritt eine
 * Pflichtentscheidung über das Ausfallhonorar; Jannes hat das am 2026-09-12
 * geändert. Aus dem Vermerk allein entsteht **keine** Gebühr, und die Frage
 * nach einer Regel dafür ist offen (`OPEN_DECISIONS.md` E14) — eine
 * Entscheidung zu verlangen, für die es keine Regel gibt, hielte den Ablauf
 * an der Tür auf.
 *
 * Die Rückfrage bleibt: Der Vermerk sperrt die Dokumentation und ist damit
 * mehr als ein Haken. Zurückgenommen wird er über „Termin wieder öffnen".
 */
function NichtAngetroffenAktion({ appointment }: { appointment: Appointment }) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => recordNoShow(appointment.id, appointment.updated_at),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['appointment', appointment.id] });
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
    },
  });

  return (
    <Rueckfrage
      ausloeser="Nicht angetroffen"
      bezeichnung="Nicht angetroffen"
      bestaetigen="Ja, niemand angetroffen"
      bestaetigenLaeuft="Wird vermerkt …"
      fehler={mutation.isError ? mutation.error.message : undefined}
      laeuft={mutation.isPending}
      onBestaetigen={() => mutation.mutateAsync()}
    >
      <p>
        Der Termin am {formatLocalDate(appointment.starts_at, appointment.organization_time_zone)}{' '}
        um {formatLocalTime(appointment.starts_at, appointment.organization_time_zone)} Uhr für{' '}
        {patientName(appointment)} wird als „nicht angetroffen" geführt. Der Zeitraum bleibt belegt.
        Ein Irrtum lässt sich über „Termin wieder öffnen" zurücknehmen.
      </p>
      <p className="text-ink-muted mt-2 text-sm leading-relaxed">
        Das ist ein organisatorischer Vermerk: keine durchgeführte Behandlung, keine Dokumentation,
        keine verbrauchte Verordnungsleistung. Eine Gebühr entsteht daraus nicht.
      </p>
    </Rueckfrage>
  );
}

/**
 * Abschließen und Wiederöffnen - beide ohne Rückfrage.
 *
 * Anders als die Absage ist keiner der beiden Schritte endgültig: ein
 * versehentlicher Abschluss wird direkt wieder geöffnet und umgekehrt. Eine
 * Rückfrage wäre hier reine Reibung an einem Schritt, der am Ende jeder
 * Behandlung ansteht.
 *
 * Ausdrücklich ohne Prüfung auf eine Behandlungsdokumentation: der Abschluss
 * ist eine organisatorische Feststellung, kein Nachweis über Inhalte.
 */
function StatusAktion({
  appointment,
  aktion,
  beschriftung,
  laufend,
  variant,
}: {
  appointment: Appointment;
  aktion: (id: string, expectedUpdatedAt: string) => Promise<void>;
  beschriftung: string;
  laufend: string;
  variant: 'primary' | 'secondary';
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => aktion(appointment.id, appointment.updated_at),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['appointment', appointment.id] });
      // Der Kalender führt den Termin sonst weiter im alten Status.
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
    },
  });

  return (
    <div>
      <Button
        type="button"
        variant={variant}
        disabled={mutation.isPending}
        onClick={() => {
          if (mutation.isPending) return;
          mutation.mutate();
        }}
      >
        {mutation.isPending ? laufend : beschriftung}
      </Button>
      {mutation.isError ? (
        <Statusmeldung ton="fehler" className="mt-2">
          {mutation.error.message}
        </Statusmeldung>
      ) : null}
    </div>
  );
}

function AppointmentDetail({
  appointment,
  user,
  eingehend,
  zumTermin,
}: {
  appointment: Appointment;
  user: CurrentUser;
  /** Der Rückweg dieser Seite - für die Unterseiten desselben Termins. */
  eingehend: string;
  /** Der Weg zurück zu diesem Termin - für die Wege zu anderen Gegenständen. */
  zumTermin: string;
}) {
  const zone = appointment.organization_time_zone;
  const darfVerwalten = canManageAppointments(user.roles);
  // Geaendert wird ausschliesslich aus „bestätigt". Abgesagte, dokumentierte
  // und abgerechnete Termine sind terminal; abgeschlossene und nicht
  // angetroffene werden erst wieder geoeffnet und dann bearbeitet - nicht
  // ueber den Abschluss hinweg. Verbindlich pruefen das die Serverfunktionen
  // (ADR-018, ADR-004).
  const darfAendern = darfVerwalten && appointment.status === 'confirmed';
  const darfWiederOeffnen =
    darfVerwalten && (appointment.status === 'completed' || appointment.status === 'no_show');
  const darfDokumentieren = canWriteTreatmentNote(user.roles);

  return (
    <>
      <PageHeader
        /* Der Name führt von hier direkt in die Akte (UX-012). Er ist die
           häufigste Anschlussfrage am Termin — „wer ist das noch mal, was
           steht sonst noch an?" — und stand vorher nur als Text da; der Weg
           ging über die Zeile darunter oder über die Suche. Der Rückweg reist
           mit, damit der Weg zurück am Termin endet und nicht in der Liste. */
        title={
          <>
            Termin –{' '}
            <Link
              to={mitRueckweg(`/patienten/${appointment.patient_id}`, zumTermin)}
              className="underline decoration-2 underline-offset-4 hover:no-underline"
            >
              {patientName(appointment)}
            </Link>
          </>
        }
        description={zustandsHinweis(appointment)}
        actions={
          darfAendern ? (
            <Link
              to={mitRueckweg(`/termine/${appointment.id}/bearbeiten`, eingehend)}
              className="border-line-strong bg-surface text-ink hover:bg-surface-sunken rounded-button inline-flex min-h-11 items-center justify-center border px-4 text-[0.9375rem] font-medium transition-colors"
            >
              Bearbeiten
            </Link>
          ) : null
        }
      />

      <Section titel="Termin" rahmen>
        <DetailList>
          {/* Bewusst Text und kein zweiter Link: Der Name im Kopf führt in die
              Akte (UX-012). Zwei gleichnamige Links auf dieselbe Seite wären
              für Vorlesesoftware zwei Angebote mit einer Wirkung. */}
          <DetailRow label="Patient:in">{patientName(appointment)}</DetailRow>
          <DetailRow label="Behandelnde Person">{staffName(appointment)}</DetailRow>
          <DetailRow label="Art">{appointmentTypeLabels[appointment.appointment_type]}</DetailRow>
          <DetailRow label="Status">{appointmentStatusLabels[appointment.status]}</DetailRow>
          <DetailRow label="Datum">{formatLocalDate(appointment.starts_at, zone)}</DetailRow>
          <DetailRow label="Zeit">
            {formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone)}
          </DetailRow>
          <DetailRow label={ortsBeschriftung(appointment.appointment_type)}>
            {locationSummary(appointment)}
          </DetailRow>
          {/* Der Handoff steht bei der Anschrift, nicht bei den
              Statusaktionen: Er gehört zur Anfahrt, nicht zum Vorgang
              (ADR-019 Punkt 20). */}
          {appointment.appointment_type === 'home_visit' ? (
            <DetailRow label="Anfahrt">
              <NavigationZumTermin termin={appointment} />
            </DetailRow>
          ) : null}
          {appointment.status === 'cancelled' ? (
            <DetailRow label="Absagegrund">
              {appointment.cancellation_reason
                ? cancellationReasonLabels[appointment.cancellation_reason]
                : 'Nicht erfasst'}
            </DetailRow>
          ) : null}
          {appointment.no_show_recorded_at ? (
            <DetailRow label="Vermerkt am">
              {`${formatLocalDate(appointment.no_show_recorded_at, zone)}, ${formatLocalTime(
                appointment.no_show_recorded_at,
                zone,
              )} Uhr`}
            </DetailRow>
          ) : null}
          {appointment.cancellation_received_at ? (
            <DetailRow label="Absage eingegangen">
              {`${formatLocalDate(appointment.cancellation_received_at, zone)}, ${formatLocalTime(
                appointment.cancellation_received_at,
                zone,
              )} Uhr`}
            </DetailRow>
          ) : null}
          {/* Der Gebührenanlass steht nur da, wenn es einen gibt. Ein
              „Keine Gebühr" an jedem abgesagten Termin wäre eine Zeile, die
              nichts sagt — und am Nichtantreffen die Antwort auf eine Frage,
              die noch offen ist (E14). */}
          {appointment.fee_basis ? (
            <DetailRow label="Gebühr vorgemerkt">
              <span>{feeBasisLabels[appointment.fee_basis]}</span>
              {/* Kein Betrag: Der Leistungskatalog (ABR-001) und die Rechnung
                  (ABR-003) sind noch nicht gebaut. Eine Zahl hier wäre
                  erfunden. */}
              <span className="text-ink-muted mt-1 block text-sm">
                Höhe und Abrechnung stehen noch aus – der Leistungskatalog ist noch nicht
                eingerichtet.
              </span>
            </DetailRow>
          ) : null}
          {appointment.completed_at ? (
            <DetailRow label="Abgeschlossen am">
              {`${formatLocalDate(appointment.completed_at, zone)}, ${formatLocalTime(
                appointment.completed_at,
                zone,
              )} Uhr`}
            </DetailRow>
          ) : null}
        </DetailList>
      </Section>

      {darfAendern ? (
        <div className="mt-5 flex flex-wrap items-start gap-3">
          {/* Der Regelfall am Ende eines Besuchs: Dokumentation und Abschluss
              in einem Schritt (UX-007). Der Abschluss ohne Dokumentation ist
              ausdrücklich weiter möglich (ANN-005) - er steht daneben.

              Die Beschriftungen sagen seit UX-012, worin sie sich
              unterscheiden. „Behandlung abschließen" neben „Termin
              abschließen" waren zwei Knöpfe, deren Unterschied man kennen
              musste; wer dokumentieren wollte und den falschen traf, schloss
              den Termin ohne Eintrag ab. Wer gar nicht dokumentieren darf,
              sieht weiterhin nur den einen und für den heißt er wie bisher. */}
          {darfDokumentieren ? (
            <ButtonLink to={mitRueckweg(`/termine/${appointment.id}/abschluss`, eingehend)}>
              Dokumentieren und abschließen
            </ButtonLink>
          ) : null}
          <StatusAktion
            appointment={appointment}
            aktion={completeAppointment}
            beschriftung={
              darfDokumentieren ? 'Ohne Dokumentation abschließen' : 'Termin abschließen'
            }
            laufend="Wird abgeschlossen …"
            variant={darfDokumentieren ? 'secondary' : 'primary'}
          />
          <NichtAngetroffenAktion appointment={appointment} />
          <AbsageAktion appointment={appointment} />
        </div>
      ) : null}

      {/* Der Folgetermin ist der häufigste Einzelvorgang am Ende eines
          Besuchs. Er steht auch am abgeschlossenen Termin: dort wird er
          tatsächlich gebraucht (UX-003, IDEA-PRX-007). */}
      {darfVerwalten && appointment.status !== 'cancelled' ? (
        <div className="mt-5 flex">
          <ButtonLink
            to={mitRueckweg(
              `/patienten/${appointment.patient_id}/termine/neu${schreibeTerminVorbelegung(
                folgeterminVorbelegung(appointment),
              )}`,
              zumTermin,
            )}
            variant="secondary"
          >
            Folgetermin anlegen
          </ButtonLink>
        </div>
      ) : null}

      {darfWiederOeffnen ? (
        <div className="mt-5 flex">
          <StatusAktion
            appointment={appointment}
            aktion={reopenAppointment}
            beschriftung="Termin wieder öffnen"
            laufend="Wird geöffnet …"
            variant="secondary"
          />
        </div>
      ) : null}

      {/* „Ist der Termin schon mitgeteilt?" ist eine organisatorische Frage am
          bevorstehenden Termin - an einem abgesagten oder abgeschlossenen gibt
          es nichts mehr mitzuteilen (CAL-012). */}
      {darfVerwalten && appointment.status === 'confirmed' ? (
        <div className="mt-8">
          <MitteilungVermerken appointment={appointment} />
        </div>
      ) : null}

      {appointment.appointment_type === 'video' ? (
        <p className="text-ink-subtle mt-6 max-w-prose text-sm leading-relaxed">
          Für Videotermine wird in diesem Stand noch kein Videolink erzeugt.
        </p>
      ) : null}

      {/* Klinische Inhalte stehen bewusst in einem eigenen Datensatz und werden
          über einen eigenen, protokollierten Lesepfad geholt (DOK-001). */}
      <TreatmentNoteSection appointment={appointment} user={user} />

      <p className="text-ink-subtle mt-10 max-w-prose text-xs leading-relaxed">
        Zeiten gelten in der Zeitzone der Praxis ({zone}). Der Termin selbst enthält ausschließlich
        organisatorische Angaben.
        {appointment.appointment_type === 'home_visit'
          ? ' „Navigation starten" öffnet Google Maps im Fahrradmodus und übergibt dabei nur die Anschrift ohne Namen – erst beim Tippen.'
          : ''}
      </p>
    </>
  );
}

export function AppointmentDetailPage({ user }: { user: CurrentUser }) {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [suche] = useSearchParams();

  // Zwei verschiedene Wege, und die Unterscheidung ist der Punkt (UX-012):
  //
  //   * `eingehend` ist der Rückweg DIESER Seite - Kalender, Akte, Tagesliste.
  //     Er wird an die Unterseiten desselben Termins weitergereicht
  //     (Bearbeiten, Abschluss), damit er über diese Stationen nicht verloren
  //     geht.
  //   * `zumTermin` ist der Rückweg zu DIESEM Termin, samt seinem eigenen
  //     Rückweg. Ihn bekommen die Wege zu anderen Gegenständen - die Akte, das
  //     Formular für den Folgetermin -, damit man von dort hierher zurückkommt
  //     und von hier weiter dorthin, wo man hergekommen ist.
  const eingehend = leseRueckweg(suche, '');
  const zumTermin = mitRueckweg(`/termine/${appointmentId}`, eingehend);

  const { data, isPending, isError } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => fetchAppointment(appointmentId!),
    enabled: Boolean(appointmentId),
    retry: false,
  });

  return (
    <>
      <Rueckweg standard="/patienten" beschriftung="Zurück zur Patientenliste" />

      {isPending ? <LoadingState label="Termin wird geladen …" /> : null}
      {isError ? <ErrorState title="Der Termin konnte nicht geladen werden." /> : null}
      {data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Dieser Termin existiert nicht oder ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}
      {data ? (
        <AppointmentDetail
          appointment={data}
          user={user}
          eingehend={eingehend}
          zumTermin={zumTermin}
        />
      ) : null}
    </>
  );
}
