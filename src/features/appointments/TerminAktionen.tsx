import { useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Dialogfenster } from '@/components/ui/Dialogfenster';
import { Select } from '@/components/ui/Select';
import { Field } from '@/components/ui/Field';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { TerminAbschliessenKnopf } from './TerminAbschliessen';
import { Aufklappzeichen } from '@/components/ui/Card';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import { TerminMetazeile, TerminZeilen, Zeile } from './TerminKompakt';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { MitteilungVermerken } from './MitteilungVermerken';
import { AbrechnungAbschnitt } from './Abrechnungslage';
import { useAbrechnungslage } from './useAbrechnungslage';
import { AppointmentHeadline } from './AppointmentHeadline';
import { HomeVisitFlow } from './HomeVisitFlow';
import { HeilmittelBestaetigen } from './HeilmittelBestaetigen';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  canManageAppointments,
  canReadTreatmentNote,
  canRecordAtAppointment,
  canRecordBillableServices,
  canWriteTreatmentBases,
  canWriteTreatmentNote,
  type CurrentUser,
} from '@/features/session/types';
import { PrescriptionPhoto } from '@/features/files/PrescriptionPhoto';
import { TreatmentNoteSection } from '@/features/documentation/TreatmentNoteSection';
import { WaitlistMatches } from '@/features/waitlist/WaitlistMatches';
import { mitRueckweg } from '@/lib/rueckweg';
import { Rueckmeldung } from './Rueckmeldungen';
import {
  appointmentStatusLabels,
  appointmentToFormValues,
  cancelAppointment,
  cancelAppointmentEvent,
  cancelEventSeries,
  fetchEventSeries,
  cancellationReasonLabels,
  cancellationReasonSchema,
  waehlbareAbsagegruende,
  type CancellationReason,
  fetchAppointment,
  folgeterminVorbelegung,
  formatLocalDate,
  formatLocalTime,
  feeBasisLabels,
  locationSummary,
  patientName,
  recordNoShow,
  reopenAppointment,
  waiveAppointmentFee,
  schreibeTerminVorbelegung,
  staffName,
  todayInTimeZone,
  fetchEventParticipants,
  type Appointment,
  type EventParticipant,
} from './api';
import { TAGESLAGE } from './tageslage';

/**
 * Meldet der Seite einen bestätigten Vorgang (ZST-16, TER-17).
 *
 * Die Aktionen sitzen weit unten und verschwinden mit dem neuen Zustand -
 * der Termin ist abgesagt, abgeschlossen, vermerkt. Die Bestätigung steht
 * deshalb oben und nimmt den Fokus (`Rueckmeldung`).
 */
type Melden = (text: string) => void;

/**
 * Stößt das Nachladen an, ohne darauf zu warten (ZST-B01).
 *
 * Die Aktionen warteten bisher in `onSuccess`, bis alle Listen neu geladen
 * waren; im Funkloch hieß ein bestätigter Vorgang dann sekundenlang „Wird
 * abgesagt …". Die Bestätigung folgt jetzt dem Server, nicht dem Nachladen.
 */
function nachladen(
  queryClient: ReturnType<typeof useQueryClient>,
  ...schluessel: readonly (readonly unknown[])[]
) {
  for (const queryKey of schluessel) void queryClient.invalidateQueries({ queryKey });
}

/** Bezeichnung des Ortsfeldes - je nach Terminart eine andere Frage. */
function ortsBeschriftung(art: Appointment['appointment_type']): string {
  if (art === 'practice') return 'Standort';
  if (art === 'home_visit') return 'Anschrift';
  return 'Ort';
}

/**
 * Was ein Zustand ohne Rückweg bedeutet: wo korrigiert wird — im Kalender
 * gibt es dafür keinen Knopf, und das ist Absicht (ADR-018 Punkt 2).
 *
 * Der Zustand selbst steht seit UX-005a als Zeichen in der Kopfzeile; der
 * Satz wiederholt ihn nicht mehr („Dieser Termin ist abgesagt.") und sagt nur
 * noch, was daraus folgt. Am bestätigten Termin steht nichts: Das ist der
 * Regelfall, und ein Satz dazu wäre Rauschen.
 */
function zustandsHinweis(appointment: Appointment): string | null {
  switch (appointment.status) {
    case 'cancelled':
      return 'Eine Absage wird nicht zurückgenommen – für einen neuen Termin bitte neu anlegen.';
    case 'no_show':
    case 'completed':
      return 'Zum Ändern erst wieder öffnen.';
    case 'documented':
      return 'Korrigiert wird in der Dokumentation, nicht am Termin.';
    default:
      return null;
  }
}

/**
 * Die Karte eines Zustands mit Einzelheiten (UX-005a, seit dem Design-Handoff
 * vom 2026-10-01 eine Karte statt einer Kachel): die Absage mit Grund,
 * Eingang und Gebührenanlass; das Nichtantreffen mit Zeitpunkt, Protokoll und
 * Gebührenanlass. Darunter steht „Termin wieder öffnen", wo es das gibt -
 * der Zustand und der Weg zurück an einer Stelle. Am bestätigten oder
 * dokumentierten Termin gibt es keine Einzelheiten; am abgeschlossenen steht
 * nur der Knopf.
 *
 * Der Honoraranlass steht nur da, wenn es einen gibt. Ein „Kein
 * Ausfallhonorar" an jedem abgesagten Termin wäre eine Zeile, die nichts
 * sagt. Dasselbe Wort wie auf Rechnung, Katalog und dem Blatt für
 * Patient:innen (TER-10). Kein Betrag: Die Höhe steht im Katalog, abgerechnet
 * wird über die Leistungen — eine Zahl hier wäre eine zweite Quelle.
 */
function ZustandKarte({
  appointment,
  darfWiederOeffnen,
  melden,
}: {
  appointment: Appointment;
  darfWiederOeffnen: boolean;
  melden: Melden;
}) {
  const zone = appointment.organization_time_zone;
  const zeitpunkt = (iso: string) =>
    `${formatLocalDate(iso, zone)}, ${formatLocalTime(iso, zone)} Uhr`;
  const honorar = appointment.fee_basis ? (
    // Ohne den Satz „Wird unter Abrechnung → Leistungen erfasst.": gestrichen
    // im Design-Handoff vom 2026-10-01 (Abschnitt 1).
    <DetailRow label={honorarBeschriftung(appointment)}>{honorarText(appointment)}</DetailRow>
  ) : null;

  const wiederOeffnen = darfWiederOeffnen ? (
    <StatusAktion
      appointment={appointment}
      aktion={reopenAppointment}
      beschriftung="Termin wieder öffnen"
      laufend="Wird geöffnet …"
      erfolg="Termin wieder geöffnet."
      variant="secondary"
      melden={melden}
    />
  ) : null;

  let titel: string | null = null;
  let zeilen: ReactNode = null;
  if (appointment.status === 'cancelled') {
    titel = 'Absage';
    zeilen = (
      <>
        <DetailRow label="Absagegrund">
          {appointment.cancellation_reason
            ? cancellationReasonLabels[appointment.cancellation_reason]
            : 'Nicht erfasst'}
        </DetailRow>
        {appointment.cancellation_received_at ? (
          <DetailRow label="Absage eingegangen">
            {zeitpunkt(appointment.cancellation_received_at)}
          </DetailRow>
        ) : null}
        {honorar}
      </>
    );
  } else if (appointment.status === 'no_show') {
    titel = 'Vermerk';
    zeilen = (
      <>
        {appointment.no_show_recorded_at ? (
          <DetailRow label="Vermerkt am">{zeitpunkt(appointment.no_show_recorded_at)}</DetailRow>
        ) : null}
        {/* Das bestätigte Protokoll steht neben dem Vermerk, denn es ist
            die Grundlage der Forderung (CAL-018). An einem Vermerk ohne
            Honorar steht es nicht: Dort gibt es nichts zu belegen. */}
        {appointment.no_show_protocol_confirmed ? (
          <DetailRow label="Protokoll">
            Bestätigt: 15 Minuten vor Ort gewartet, an der Tür geklingelt, telefonisch angerufen.
          </DetailRow>
        ) : null}
        {honorar}
      </>
    );
  } else if (appointment.fee_basis) {
    // Ein Kennzeichen aus der Zeit vor ADR-018 Fassung 2 an einem anderen
    // Zustand bleibt sichtbar - historische Vorgänge werden nicht umgedeutet,
    // aber auch nicht versteckt.
    titel = 'Vermerk';
    zeilen = honorar;
  }

  if (!titel) {
    return wiederOeffnen ? <div className="mt-6 flex">{wiederOeffnen}</div> : null;
  }
  return (
    // Im Fenster ohne eigene Karte, mit einer Linie darüber (Leitfaden L2).
    <section className="border-line mt-6 border-t pt-4">
      <h2 className="text-ink text-h4 font-bold">{titel}</h2>
      <DetailList>{zeilen}</DetailList>
      {wiederOeffnen ? <div className="mt-3 flex">{wiederOeffnen}</div> : null}
    </section>
  );
}

/**
 * Die Zeile zum Ausfallhonorar (ABN-006): Nach einem Verzicht bleibt der
 * Anlass sichtbar — er ist eine Tatsache —, daneben steht, dass und wann
 * verzichtet wurde. Wer verzichtet hat, steht im Protokoll (ADR-010).
 */
function honorarBeschriftung(appointment: Appointment): string {
  return appointment.fee_waived_at ? 'Ausfallhonorar' : 'Ausfallhonorar vorgemerkt';
}

function honorarText(appointment: Appointment): string {
  const anlass = appointment.fee_basis ? feeBasisLabels[appointment.fee_basis] : '';
  if (!appointment.fee_waived_at) return anlass;
  return `${anlass} · verzichtet am ${formatLocalDate(
    appointment.fee_waived_at,
    appointment.organization_time_zone,
  )}`;
}

/**
 * Bewusster Verzicht auf die Gebühr (ABN-006, BEF-094) — nur owner und office,
 * nur solange aus dem Anlass nichts erfasst oder abgerechnet ist. Die
 * Rückfrage nennt die Folge; verbindlich prüft `waive_appointment_fee`.
 */
function GebuehrVerzicht({ appointment, melden }: { appointment: Appointment; melden: Melden }) {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => waiveAppointmentFee(appointment.id, appointment.updated_at),
    onSuccess: () => {
      nachladen(queryClient, ['appointment', appointment.id], ['appointments']);
      melden('Auf die Gebühr verzichtet.');
    },
  });
  return (
    <div className="mt-3 flex">
      <Rueckfrage
        ausloeser="Auf die Gebühr verzichten"
        ausloeserVariante="quiet"
        bezeichnung="Auf die Gebühr verzichten"
        bestaetigen="Ja, verzichten"
        bestaetigenLaeuft="Wird vermerkt …"
        fehler={mutation.isError ? mutation.error.message : undefined}
        laeuft={mutation.isPending}
        onBestaetigen={() => mutation.mutateAsync()}
      >
        <p>
          Der Anlass bleibt vermerkt, eine Gebühr entsteht daraus nicht mehr. Der Verzicht steht im
          Protokoll und lässt sich nicht zurücknehmen.
        </p>
      </Rueckfrage>
    </div>
  );
}

/**
 * Was aus dem Termin geworden ist, als Zeilen der Zeilenliste (Design-Handoff
 * 2026-10-01, Abschnitt 6, Zyklus 3) - dieselben Angaben wie bisher die
 * Karte: Absagegrund, Eingang, Vermerk, Protokoll, Ausfallhonorar.
 */
function ZustandZeilen({ appointment }: { appointment: Appointment }) {
  const zone = appointment.organization_time_zone;
  const zeitpunkt = (iso: string) =>
    `${formatLocalDate(iso, zone)}, ${formatLocalTime(iso, zone)} Uhr`;
  const honorar = appointment.fee_basis ? (
    <Zeile label={honorarBeschriftung(appointment)}>{honorarText(appointment)}</Zeile>
  ) : null;

  if (appointment.status === 'cancelled') {
    return (
      <>
        <Zeile label="Absagegrund">
          {appointment.cancellation_reason
            ? cancellationReasonLabels[appointment.cancellation_reason]
            : 'Nicht erfasst'}
        </Zeile>
        {appointment.cancellation_received_at ? (
          <Zeile label="Eingegangen">{zeitpunkt(appointment.cancellation_received_at)}</Zeile>
        ) : null}
        {honorar}
      </>
    );
  }
  if (appointment.status === 'no_show') {
    return (
      <>
        {appointment.no_show_recorded_at ? (
          <Zeile label="Vermerkt am">{zeitpunkt(appointment.no_show_recorded_at)}</Zeile>
        ) : null}
        {/* Das bestätigte Protokoll ist die Grundlage der Forderung (CAL-018). */}
        {appointment.no_show_protocol_confirmed ? (
          <Zeile label="Protokoll">
            Bestätigt: 15 Minuten vor Ort gewartet, an der Tür geklingelt, telefonisch angerufen.
          </Zeile>
        ) : null}
        {honorar}
      </>
    );
  }
  // Ein Kennzeichen aus der Zeit vor ADR-018 Fassung 2 bleibt sichtbar.
  return honorar;
}

/** „Termin wieder öffnen" unter den Zeilen - nur an abgeschlossenen und nicht angetroffenen. */
function WiederOeffnen({
  appointment,
  darfWiederOeffnen,
  melden,
}: {
  appointment: Appointment;
  darfWiederOeffnen: boolean;
  melden: Melden;
}) {
  if (!darfWiederOeffnen) return null;
  return (
    <div className="mt-3 flex">
      <StatusAktion
        appointment={appointment}
        aktion={reopenAppointment}
        beschriftung="Termin wieder öffnen"
        laufend="Wird geöffnet …"
        erfolg="Termin wieder geöffnet."
        variant="secondary"
        melden={melden}
      />
    </div>
  );
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
function AbsageAktion({ appointment, melden }: { appointment: Appointment; melden: Melden }) {
  const queryClient = useQueryClient();
  // Ein Ereignis sagt keine Patient:in ab: Es gibt keine, es gibt keinen
  // Behandlungsbeginn, auf den sich eine Frist bezöge, und der Server setzt
  // dort keinen Honoraranlass (CAL-016). Also weder der Grund
  // „Patient:in hat abgesagt" noch die Frage nach dem Eingang noch der
  // Hinweis auf das Honorar - alles drei wäre hier eine Behauptung.
  const istEreignis = appointment.kind === 'internal';
  const [grund, setGrund] = useState('');
  const [grundFehler, setGrundFehler] = useState<string | undefined>(undefined);
  // Der Eingang: „jetzt" ist der Regelfall am Telefon, „früher" die
  // nachträgliche Erfassung. Vorbelegt ist „jetzt" - das ist keine stille
  // Annahme, sondern der Augenblick, in dem gerade jemand absagt (ANN-048).
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
      // Der Termin selbst, der Kalender und die Tagesliste zeigen sonst
      // weiter einen bestätigten Termin.
      // UBK-011: mit Tagesroute und Fahrpuffer - der Fahrweg zum abgesagten
      // Termin fällt sonst erst nach dem Neuladen weg.
      nachladen(queryClient, ['appointment', appointment.id], ...TAGESLAGE);
      if (istEreignis) {
        melden('Teilnahme abgesagt.');
        return;
      }
      // BEF-079: Ob ein Ausfallhonorar entsteht, rechnet nur der Server. Die
      // Meldung liest den neuen Stand und sagt die Folge gleich mit - sie
      // stand bisher nur als Zeile weiter unten, und niemand sah sie.
      const danach = await fetchAppointment(appointment.id).catch(() => null);
      melden(
        danach?.fee_basis
          ? `Termin abgesagt · Ausfallhonorar vorgemerkt: ${feeBasisLabels[danach.fee_basis]}.`
          : 'Termin abgesagt.',
      );
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

    const nachtraeglich = !istEreignis && eingang === 'frueher';
    if (nachtraeglich && (!datum || !uhrzeit)) {
      setEingangFehler('Bitte Datum und Uhrzeit des Eingangs angeben.');
      throw new Error('Eingang unvollständig');
    }
    setEingangFehler(undefined);

    await mutation.mutateAsync({
      grund: gewaehlt.data,
      datum: nachtraeglich ? datum : null,
      uhrzeit: nachtraeglich ? uhrzeit : null,
    });
  }

  return (
    <Rueckfrage
      ausloeser={istEreignis ? 'Nur diese Teilnahme absagen' : 'Termin absagen'}
      // Leise am Seitenende (Design-Handoff 2026-10-01, Abschnitt 6): Die
      // Absage ist selten, und die Rückfrage danach bleibt.
      ausloeserVariante="quiet"
      bezeichnung={istEreignis ? 'Teilnahme absagen' : 'Termin absagen'}
      bestaetigen={istEreignis ? 'Ja, Teilnahme absagen' : 'Ja, Termin absagen'}
      bestaetigenLaeuft="Wird abgesagt …"
      fehler={mutation.isError ? mutation.error.message : undefined}
      laeuft={mutation.isPending}
      onAbbrechen={() => setGrundFehler(undefined)}
      onBestaetigen={absagen}
    >
      <p>
        {istEreignis
          ? `Die Teilnahme von ${staffName(appointment)} an der Fehlzeit „${appointment.title ?? ''}“ `
          : 'Der Termin '}
        am {formatLocalDate(appointment.starts_at, appointment.organization_time_zone)} um{' '}
        {formatLocalTime(appointment.starts_at, appointment.organization_time_zone)} Uhr
        {istEreignis ? ' ' : ` für ${patientName(appointment)} `}
        wird als abgesagt geführt.{' '}
        {istEreignis ? 'Die Fehlzeit selbst bleibt für die übrigen Beteiligten bestehen. ' : ''}
        Der Eintrag bleibt vollständig erhalten und gibt seinen Zeitraum wieder frei. Eine Absage
        lässt sich nicht zurücknehmen – für einen neuen Eintrag bitte neu anlegen.
      </p>
      {/* Grund und Eingang nebeneinander, sobald zwei Spalten von je 220 px
          passen (Design-Handoff 2026-10-01, Abschnitt 6). */}
      <div className="mt-3 grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] items-start gap-3">
        <Select
          label="Absagegrund"
          value={grund}
          error={grundFehler}
          onChange={(e) => {
            setGrund(e.target.value);
            setGrundFehler(undefined);
          }}
        >
          <option value="">Bitte wählen …</option>
          {waehlbareAbsagegruende(istEreignis).map(([wert, beschriftung]) => (
            <option key={wert} value={wert}>
              {beschriftung}
            </option>
          ))}
        </Select>

        {/* Der Eingang, getrennt vom Zeitpunkt der Eingabe (§8, ADR-018
            Fassung 2 Punkt 8). Der Anruf kommt abends aufs Band, eingetragen
            wird am nächsten Morgen - ohne diese Angabe entschiede die
            Schreibgeschwindigkeit des Büros über eine Forderung.

            Am Ereignis entfällt die Frage: Es gibt keine Frist, die vom Eingang
            abhinge (CAL-016). */}
        {istEreignis ? null : (
          <Select
            label="Wann ist die Absage eingegangen?"
            value={eingang}
            hint="Maßgeblich für das Ausfallhonorar ist der Eingang, nicht die Eingabe."
            onChange={(e) => {
              setEingang(e.target.value === 'frueher' ? 'frueher' : 'jetzt');
              setEingangFehler(undefined);
            }}
          >
            <option value="jetzt">Gerade eben</option>
            <option value="frueher">Früher – jetzt erst eingetragen</option>
          </Select>
        )}
      </div>

      {!istEreignis && eingang === 'frueher' ? (
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

      {istEreignis ? (
        <p className="text-ink-muted mt-3 text-sm">
          Eine Fehlzeit des Praxisbetriebs löst kein Ausfallhonorar aus – es gibt keine Patient:in,
          die absagen könnte.
        </p>
      ) : (
        <p className="text-ink-muted mt-3 text-sm">
          Liegt der Eingang weniger als 24 Stunden vor dem Beginn und hat die Patient:in abgesagt
          oder verlegt, merkt die Anwendung ein Ausfallhonorar vor. Die Frist wird automatisch
          berechnet; genau 24 Stunden vorher gilt noch als rechtzeitig.
        </p>
      )}
    </Rueckfrage>
  );
}

/**
 * Die ganze Fehlzeit absagen (CAL-017).
 *
 * Neben der Absage der einzelnen Teilnahme, und ausdrücklich davon getrennt:
 * Eine Besprechung, die für die einen abgesagt ist und für die anderen noch
 * steht, ist der Zustand, den diese Klammer beseitigt. Der Server sagt alle
 * noch bestätigten Zeilen in **einer** Transaktion ab.
 *
 * Der Grund ist Pflicht wie bei jeder Absage (ANN-034), aber ohne
 * „Patient:in hat abgesagt" und ohne die Frage nach dem Eingang: Ein Ereignis
 * hat keine Patient:in und löst kein Ausfallhonorar aus (CAL-016).
 */
function EreignisAbsageAktion({
  appointment,
  beteiligte,
  melden,
}: {
  appointment: Appointment;
  beteiligte: EventParticipant[];
  melden: Melden;
}) {
  const queryClient = useQueryClient();
  const [grund, setGrund] = useState('');
  const [grundFehler, setGrundFehler] = useState<string | undefined>(undefined);

  const offen = beteiligte.filter((b) => b.status === 'confirmed');
  const stand = beteiligte[0]?.group_updated_at ?? '';

  const mutation = useMutation({
    mutationFn: (gewaehlt: CancellationReason) =>
      cancelAppointmentEvent(appointment.event_group_id!, stand, gewaehlt),
    onSuccess: () => {
      nachladen(
        queryClient,
        ['appointment'],
        ['event-participants'],
        ['appointments'],
        ['day-plan'],
      );
      melden('Fehlzeit für alle Beteiligten abgesagt.');
    },
  });

  async function absagen() {
    const gewaehlt = cancellationReasonSchema.safeParse(grund);
    if (!gewaehlt.success) {
      setGrundFehler('Bitte einen Absagegrund auswählen.');
      throw new Error('Absagegrund fehlt');
    }
    setGrundFehler(undefined);
    await mutation.mutateAsync(gewaehlt.data);
  }

  return (
    <Rueckfrage
      ausloeser="Fehlzeit absagen"
      bezeichnung="Fehlzeit absagen"
      bestaetigen="Ja, für alle absagen"
      bestaetigenLaeuft="Wird abgesagt …"
      fehler={mutation.isError ? mutation.error.message : undefined}
      laeuft={mutation.isPending}
      onAbbrechen={() => setGrundFehler(undefined)}
      onBestaetigen={absagen}
    >
      <p>
        {`Die Fehlzeit „${appointment.title ?? ''}“ `}
        am {formatLocalDate(appointment.starts_at, appointment.organization_time_zone)} um{' '}
        {formatLocalTime(appointment.starts_at, appointment.organization_time_zone)} Uhr wird für{' '}
        {offen.length === 1 ? 'die eine noch offene Teilnahme' : `alle ${offen.length} Beteiligten`}{' '}
        als abgesagt geführt. Die Einträge bleiben erhalten und geben ihre Zeiträume wieder frei.
        Eine Absage lässt sich nicht zurücknehmen.
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
          <option value="">Bitte wählen …</option>
          {waehlbareAbsagegruende(true).map(([wert, beschriftung]) => (
            <option key={wert} value={wert}>
              {beschriftung}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-ink-muted mt-3 text-sm">
        Eine Fehlzeit des Praxisbetriebs löst kein Ausfallhonorar aus – es gibt keine Patient:in,
        die absagen könnte.
      </p>
    </Rueckfrage>
  );
}

/**
 * Die ganze Dauerfehlzeit absagen (CAL-021).
 *
 * Die dritte Absage neben „Nur diese Teilnahme" und „Fehlzeit absagen", und
 * wieder ausdrücklich davon getrennt: Diese hier trifft **alle noch kommenden
 * Vorkommen** der Serie. Was schon stattgefunden hat, bleibt stehen — ein
 * Teammeeting von letzter Woche wird nicht nachträglich zu einem abgesagten
 * (ANN-059).
 */
function SerieAbsageAktion({ appointment, melden }: { appointment: Appointment; melden: Melden }) {
  const queryClient = useQueryClient();
  const [grund, setGrund] = useState('');
  const [grundFehler, setGrundFehler] = useState<string | undefined>(undefined);

  const serie = useQuery({
    queryKey: ['event-series', appointment.event_series_id],
    queryFn: () => fetchEventSeries(appointment.event_series_id!),
    enabled: Boolean(appointment.event_series_id),
    retry: false,
  });

  const vorkommen = serie.data ?? [];
  const stand = vorkommen[0]?.series_updated_at ?? '';
  // Dieselbe Grenze wie serverseitig: noch nicht begonnen und noch nicht
  // abgesagt. Verbindlich entscheidet sie der Server (ADR-004).
  const kommende = vorkommen.filter(
    (v) => v.open_count > 0 && new Date(v.starts_at).getTime() > Date.now(),
  );

  const mutation = useMutation({
    mutationFn: (gewaehlt: CancellationReason) =>
      cancelEventSeries(appointment.event_series_id!, stand, gewaehlt),
    onSuccess: () => {
      nachladen(
        queryClient,
        ['appointment'],
        ['event-participants'],
        ['event-series'],
        ['appointments'],
        ['day-plan'],
      );
      melden('Alle kommenden Vorkommen der Dauerfehlzeit sind abgesagt.');
    },
  });

  async function absagen() {
    const gewaehlt = cancellationReasonSchema.safeParse(grund);
    if (!gewaehlt.success) {
      setGrundFehler('Bitte einen Absagegrund auswählen.');
      throw new Error('Absagegrund fehlt');
    }
    setGrundFehler(undefined);
    await mutation.mutateAsync(gewaehlt.data);
  }

  // Ohne kommendes Vorkommen gibt es nichts abzusagen - dann steht der Weg
  // auch nicht da.
  if (kommende.length === 0) return null;

  return (
    <Rueckfrage
      ausloeser="Ganze Serie absagen"
      bezeichnung="Dauerfehlzeit absagen"
      bestaetigen="Ja, ganze Serie absagen"
      bestaetigenLaeuft="Wird abgesagt …"
      fehler={mutation.isError ? mutation.error.message : undefined}
      laeuft={mutation.isPending}
      onAbbrechen={() => setGrundFehler(undefined)}
      onBestaetigen={absagen}
    >
      <p>
        {`Die Dauerfehlzeit „${appointment.title ?? ''}“ `}
        wird mit {kommende.length === 1 ? 'ihrem einen noch' : `allen ${kommende.length}`} kommenden
        Vorkommen als abgesagt geführt – {kommende.length === 1 ? 'es' : 'das erste'} am{' '}
        {formatLocalDate(kommende[0]!.starts_at, appointment.organization_time_zone)}. Bereits
        stattgefundene Vorkommen bleiben unverändert stehen. Eine Absage lässt sich nicht
        zurücknehmen.
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
          <option value="">Bitte wählen …</option>
          {waehlbareAbsagegruende(true).map(([wert, beschriftung]) => (
            <option key={wert} value={wert}>
              {beschriftung}
            </option>
          ))}
        </Select>
      </div>
      <p className="text-ink-muted mt-3 text-sm">
        Eine Fehlzeit des Praxisbetriebs löst kein Ausfallhonorar aus – es gibt keine Patient:in,
        die absagen könnte.
      </p>
    </Rueckfrage>
  );
}

/**
 * „Nicht angetroffen" am Praxis- und am Videotermin — ein Schritt ohne
 * Honorar (CAL-014c, ANN-055).
 *
 * Das Protokoll ist ein Hausbesuchsprotokoll; an der Praxistür gibt es nichts
 * zu klingeln, und für das Nichtantreffen in der Praxis gibt es keine
 * Festlegung. Der Hausbesuch führt seit UX-005b seinen eigenen Ablauf
 * („Niemand öffnet?", `HomeVisitFlow`). Verbindlich prüft beides der Server.
 *
 * Die Rückfrage bleibt: Der Vermerk sperrt die Dokumentation und ist damit
 * mehr als ein Haken. Zurückgenommen wird er über „Termin wieder öffnen".
 */
function NichtAngetroffenAktion({
  appointment,
  melden,
}: {
  appointment: Appointment;
  melden: Melden;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => recordNoShow(appointment.id, appointment.updated_at, false),
    onSuccess: () => {
      nachladen(queryClient, ['appointment', appointment.id], ['appointments'], ['day-plan']);
      melden('Als „nicht angetroffen“ vermerkt.');
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
        {patientName(appointment)} wird als „nicht angetroffen“ geführt. Der Zeitraum bleibt belegt.
        Ein Irrtum lässt sich über „Termin wieder öffnen“ zurücknehmen.
      </p>
      {/* „Das ist ein organisatorischer Vermerk …" ist gestrichen
          (Design-Handoff 2026-10-01, Abschnitt 1). */}
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
  erfolg,
  variant,
  melden,
}: {
  appointment: Appointment;
  aktion: (id: string, expectedUpdatedAt: string) => Promise<void>;
  beschriftung: string;
  laufend: string;
  /** Die Bestätigung nach dem Vorgang - der Knopf ist danach fort (ZST-16). */
  erfolg: string;
  variant: 'primary' | 'secondary';
  melden: Melden;
}) {
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () => aktion(appointment.id, appointment.updated_at),
    onSuccess: () => {
      // Der Kalender führt den Termin sonst weiter im alten Status.
      nachladen(queryClient, ['appointment', appointment.id], ['appointments']);
      melden(erfolg);
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

/**
 * Die Aktionen an einem Termin, als Fenster über dem Kalender (Akte
 * entschlacken, 2026-10-03).
 *
 * Bis dahin hatte jeder Termin eine eigene Seite (`/termine/:id`). Jannes:
 * „Ein Termin soll keine eigene Unterseite bekommen" - was an ihr zu tun war,
 * steht jetzt hier, geöffnet aus dem Terminpanel des Kalenders („Aktionen").
 * Das Fenster trägt alles, was dort stand: Haken und „Doku" (im Panel stehen
 * sie nur am eigenen Termin, das Büro braucht sie auch an fremden), ändern,
 * nicht angetroffen, wieder öffnen, auf die Gebühr verzichten,
 * Folgetermin, Mitteilung, Heilmittel, Verordnungsfoto, Nachrücken und die
 * Absagen. Jede Aktion ist dieselbe wie vorher, mit derselben Rückfrage;
 * verbindlich prüfen die Serverfunktionen (ADR-018, ADR-004).
 */
function TerminAktionen({
  appointment,
  user,
  eingehend,
  zumTermin,
}: {
  appointment: Appointment;
  user: CurrentUser;
  /** Der Kalenderstand - Rückweg für die Formulare dieses Termins. */
  eingehend: string;
  /** Der Kalenderstand mit diesem Termin - Rückweg für andere Gegenstände. */
  zumTermin: string;
}) {
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
  // ABN-006: Verzichten dürfen, wer ein Ausfallhonorar erfasst (owner, office).
  const darfVerzichten =
    canRecordBillableServices(user.roles) &&
    appointment.fee_basis !== null &&
    appointment.fee_waived_at === null &&
    (appointment.status === 'cancelled' || appointment.status === 'no_show');
  /**
   * Eine Fehlzeit des Praxisbetriebs (CAL-015b): keine Patient:in, keine
   * Dokumentation, kein Abschluss - und damit kein Weg in die Abrechnung
   * (§19). Was bleibt: verschieben und absagen.
   */
  const istEreignis = appointment.kind === 'internal';
  /** Der Hausbesuch führt seinen eigenen Ablauf (CAL-018, ANN-055). */
  const istHausbesuch = !istEreignis && appointment.appointment_type === 'home_visit';

  /**
   * Die Bestätigung des letzten Vorgangs (ZST-16). Mit laufender Nummer: Eine
   * zweite, gleichlautende Bestätigung ist eine neue Zeile und nimmt den
   * Fokus erneut.
   */
  const [bestaetigung, setBestaetigung] = useState<{ nummer: number; text: string } | null>(null);
  const [abschlussFehler, setAbschlussFehler] = useState<string | null>(null);
  const melden: Melden = (text) => {
    setAbschlussFehler(null);
    setBestaetigung((bisher) => ({ nummer: (bisher?.nummer ?? 0) + 1, text }));
  };

  /** Die Beteiligten des Ereignisses (CAL-017) - nur an einer Fehlzeit. */
  const beteiligte = useQuery({
    queryKey: ['event-participants', appointment.event_group_id],
    queryFn: () => fetchEventParticipants(appointment.event_group_id!),
    enabled: istEreignis && Boolean(appointment.event_group_id),
    retry: false,
  });

  /** Die Serie, zu der dieses Ereignis gehört - eine Dauerfehlzeit (CAL-021). */
  const serie = useQuery({
    queryKey: ['event-series', appointment.event_series_id],
    queryFn: () => fetchEventSeries(appointment.event_series_id!),
    enabled: istEreignis && Boolean(appointment.event_series_id),
    retry: false,
  });

  const beteiligteListe = beteiligte.data ?? [];
  const offeneTeilnahmen = beteiligteListe.filter((b) => b.status === 'confirmed');
  const serienVorkommen = serie.data ?? [];

  // Die Abrechnung nur, wenn der Server sie zeigt (owner und office, ANN-139).
  const lage = useAbrechnungslage(appointment.id);
  const mitAbrechnung = appointment.kind === 'therapy' && lage.data?.billing_visible === true;

  return (
    <div className="flex flex-col">
      {istEreignis ? (
        <div className="text-ink-muted text-sm">
          <AppointmentHeadline appointment={appointment} user={user} />
          {zustandsHinweis(appointment) ? (
            <p className="mt-1">{zustandsHinweis(appointment)}</p>
          ) : null}
        </div>
      ) : (
        <TerminMetazeile
          appointment={appointment}
          user={user}
          darfVerwalten={darfVerwalten}
          zumTermin={zumTermin}
          hinweis={zustandsHinweis(appointment)}
        />
      )}

      {bestaetigung ? (
        <Rueckmeldung key={bestaetigung.nummer} className="mt-4">
          {bestaetigung.text}
        </Rueckmeldung>
      ) : null}

      {/* Der Abschluss am offenen Termin steht vor Dokumentation und
          Detailzeilen (BEF-055, Entscheidung Jannes 2026-10-09): ein
          Hauptknopf je Ansicht. Wer dokumentiert, schließt über „Doku“ ab -
          dort wird festgeschrieben, und der Termin gilt damit als
          durchgeführt. Am Hausbesuch stehen „Niemand öffnet?“ und „Ohne
          Behandlung“ daneben; der Abschluss ohne Dokumentation (ANN-005)
          heißt „Nur Termin abschließen“ und liegt eingeklappt darunter.
          Rollen ohne Doku-Recht haben „Termin abschließen“ als Hauptknopf,
          mit seiner Folge. */}
      {darfAendern && !istEreignis ? (
        <div role="group" aria-label="Abschluss" className="mt-4 flex flex-col items-start gap-3">
          {darfDokumentieren ? (
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink
                to={mitRueckweg(`/termine/${appointment.id}/abschluss`, eingehend)}
                groesse="kompakt"
              >
                Doku <span className="sr-only">schreiben</span>
              </ButtonLink>
              {istHausbesuch ? (
                <>
                  <HomeVisitFlow appointment={appointment} melden={melden} />
                  <ButtonLink
                    to={mitRueckweg(
                      `/termine/${appointment.id}/abschluss?ohne-behandlung=1`,
                      eingehend,
                    )}
                    variant="quiet"
                    groesse="kompakt"
                  >
                    Ohne Behandlung
                  </ButtonLink>
                </>
              ) : null}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <TerminAbschliessenKnopf
                appointmentId={appointment.id}
                stand={appointment.updated_at}
                variant="primary"
                text="Termin abschließen"
                onAbgeschlossen={() => melden('Termin abgeschlossen.')}
                onFehler={setAbschlussFehler}
              />
              {istHausbesuch ? <HomeVisitFlow appointment={appointment} melden={melden} /> : null}
              <p className="text-ink-muted basis-full text-sm">
                Der Termin gilt damit als durchgeführt.
              </p>
            </div>
          )}

          {istHausbesuch ? null : (
            <NichtAngetroffenAktion appointment={appointment} melden={melden} />
          )}

          {darfDokumentieren ? (
            <details className="group">
              <summary className={`${aufklappKopfKlassen} text-ink text-sm`}>
                <Aufklappzeichen />
                Nur Termin abschließen
              </summary>
              <div className="flex flex-col items-start gap-2 pb-1 pl-6">
                <p className="text-ink-muted max-w-prose text-sm">
                  Schließt den Termin ab, ohne zu dokumentieren. Die Doku bleibt offen.
                </p>
                <TerminAbschliessenKnopf
                  appointmentId={appointment.id}
                  stand={appointment.updated_at}
                  variant="secondary"
                  text="Nur Termin abschließen"
                  onAbgeschlossen={() => melden('Termin abgeschlossen. Doku offen.')}
                  onFehler={setAbschlussFehler}
                />
              </div>
            </details>
          ) : null}

          {abschlussFehler ? <Statusmeldung ton="fehler">{abschlussFehler}</Statusmeldung> : null}
        </div>
      ) : null}

      {/* Die Dokumentation dieses Termins, wie bisher auf der Terminseite:
          lesen, finalisieren, Nachtrag und Korrektur (DOK-001, ADR-016).
          Klinische Inhalte kommen über einen eigenen, protokollierten
          Lesepfad; an einer Fehlzeit gibt es sie nicht. */}
      {istEreignis ? null : (
        <TreatmentNoteSection appointment={appointment} user={user} eingehend={eingehend} />
      )}

      {istEreignis ? null : (
        <TerminZeilen
          appointment={appointment}
          darfKurzblick={canReadTreatmentNote(user.roles)}
          darfVerlauf={canReadTreatmentNote(user.roles)}
          zumTermin={zumTermin}
        >
          <ZustandZeilen appointment={appointment} />
        </TerminZeilen>
      )}

      {istEreignis ? (
        <DetailList>
          <DetailRow label="Fehlzeit">{appointment.title ?? '—'}</DetailRow>
          <DetailRow label="Diese Teilnahme">{staffName(appointment)}</DetailRow>
          {/* Wer hier steht, hat denselben Zeitraum belegt, und „Fehlzeit
              bearbeiten" trifft alle zugleich (CAL-017). */}
          {beteiligteListe.length > 1 ? (
            <DetailRow label="Beteiligte">
              {beteiligteListe
                .map((b) =>
                  b.status === 'confirmed'
                    ? b.display_name
                    : `${b.display_name} (${appointmentStatusLabels[b.status]})`,
                )
                .join(', ')}
              <span className="text-ink-muted mt-1 block text-sm">
                Bezeichnung, Zeit und Ort gelten für alle Beteiligten.
              </span>
            </DetailRow>
          ) : null}
          {/* Dieses Vorkommen ist eines von mehreren (CAL-021). */}
          {appointment.event_series_id && serienVorkommen.length > 0 ? (
            <DetailRow label="Dauerfehlzeit">
              <span>
                Vorkommen{' '}
                {serienVorkommen.findIndex((v) => v.event_group_id === appointment.event_group_id) +
                  1}{' '}
                von {serienVorkommen.length}
              </span>
              <span className="text-ink-muted mt-1 block text-sm">
                Ändern und Absagen gelten wahlweise für dieses Vorkommen oder für die ganze Serie.
              </span>
            </DetailRow>
          ) : null}
          <DetailRow label={ortsBeschriftung(appointment.appointment_type)}>
            {locationSummary(appointment)}
          </DetailRow>
          {appointment.status === 'cancelled' ? (
            <DetailRow label="Absagegrund">
              {appointment.cancellation_reason
                ? cancellationReasonLabels[appointment.cancellation_reason]
                : 'Nicht erfasst'}
            </DetailRow>
          ) : null}
        </DetailList>
      ) : null}

      {/* Die Aktionen als Auswahl untereinander: Jede ist ein Knopf, der ihre
          Rückfrage oder ihr Formular öffnet. */}
      <div role="group" aria-label="Aktionen" className="mt-4 flex flex-col items-start gap-3">
        {darfAendern ? (
          <div className="flex flex-wrap gap-3">
            {/* Zwei Wege an der Fehlzeit, und der Unterschied steht in der
                Beschriftung (CAL-017): „Fehlzeit bearbeiten" trifft alle
                Beteiligten zugleich, „Teilnahme ändern" nur diese eine Zeile. */}
            {istEreignis ? (
              <ButtonLink
                to={mitRueckweg(`/termine/${appointment.id}/ereignis-bearbeiten`, eingehend)}
                variant="secondary"
                groesse="kompakt"
              >
                Fehlzeit bearbeiten
              </ButtonLink>
            ) : null}
            <ButtonLink
              to={mitRueckweg(`/termine/${appointment.id}/bearbeiten`, eingehend)}
              variant="secondary"
              groesse="kompakt"
            >
              {istEreignis ? 'Teilnahme ändern' : 'Bearbeiten'}
            </ButtonLink>
          </div>
        ) : null}

        {istEreignis ? null : (
          <WiederOeffnen
            appointment={appointment}
            darfWiederOeffnen={darfWiederOeffnen}
            melden={melden}
          />
        )}
        {darfVerzichten ? <GebuehrVerzicht appointment={appointment} melden={melden} /> : null}

        {/* Am Ereignis bleibt die Karte des Zustands (Absage, Wiederöffnen). */}
        {istEreignis ? (
          <ZustandKarte
            appointment={appointment}
            darfWiederOeffnen={darfWiederOeffnen}
            melden={melden}
          />
        ) : null}

        {/* Der Folgetermin ist der häufigste Einzelvorgang am Ende eines
            Besuchs - auch am abgeschlossenen Termin (UX-003, IDEA-PRX-007). */}
        {darfVerwalten && !istEreignis && appointment.status !== 'cancelled' ? (
          <ButtonLink
            to={mitRueckweg(
              `/patienten/${appointment.patient_id}/termine/neu${schreibeTerminVorbelegung(
                folgeterminVorbelegung(appointment),
              )}`,
              zumTermin,
            )}
            variant="secondary"
            groesse="kompakt"
          >
            Folgetermin anlegen
          </ButtonLink>
        ) : null}
      </div>

      {/* Nachrücken (PRX-004): Ein abgesagter Behandlungstermin in der Zukunft
          ist ein freier Platz - ohne die Person, die gerade abgesagt hat. */}
      {darfVerwalten &&
      appointment.kind === 'therapy' &&
      appointment.status === 'cancelled' &&
      new Date(appointment.starts_at).getTime() > Date.now() ? (
        <div className="mt-6">
          <WaitlistMatches
            slot={(() => {
              const platz = appointmentToFormValues(appointment);
              return {
                staffMemberId: appointment.staff_member_id,
                date: platz.date,
                start: platz.start_time,
                end: platz.end_time,
                excludePatientId: appointment.patient_id,
              };
            })()}
            back={zumTermin}
          />
        </div>
      ) : null}

      {/* Verordnung ohne Papier (PRX-011): ein Foto am Termin, das Büro
          erfasst daraus die Grundlage (ANN-011); verbindlich prüft der Server. */}
      {!istEreignis &&
      appointment.patient_id &&
      appointment.status !== 'cancelled' &&
      canWriteTreatmentBases(user.roles) ? (
        <Section titel="Verordnung" ebene={3}>
          <PrescriptionPhoto patientId={appointment.patient_id} />
        </Section>
      ) : null}

      {/* „Ist der Termin schon mitgeteilt?" - nur am bevorstehenden
          Behandlungstermin (CAL-012). */}
      {darfVerwalten && !istEreignis && appointment.status === 'confirmed' ? (
        <div className="mt-6">
          <MitteilungVermerken appointment={appointment} />
        </div>
      ) : null}

      {/* Termin abhaken (PRX-009): die geleisteten Heilmittel bestätigen - die
          behandelnde Person an ihrem Termin, das Büro an jedem (ANN-140). */}
      {appointment.kind === 'therapy' &&
      canRecordAtAppointment(user.roles, appointment.staff_member_id, user.staffMemberId) ? (
        <HeilmittelBestaetigen appointment={appointment} user={user} />
      ) : null}

      {/* BEF-081: Empfänger und offene Rechnungen - nur für owner und office. */}
      {mitAbrechnung ? (
        <div className="mt-6">
          <AbrechnungAbschnitt appointmentId={appointment.id} />
        </div>
      ) : null}

      {/* Die Absagen am Ende: selten, ohne Rückweg und deshalb nicht neben den
          Handlungen des Besuchs (Design-Handoff 2026-10-01, Abschnitt 6). */}
      {darfAendern ? (
        <div className="border-line mt-6 flex flex-wrap items-start gap-3 border-t pt-4">
          {/* „Fehlzeit absagen" trifft alle noch offenen Teilnahmen, „Nur diese
              Teilnahme absagen" diese eine (CAL-017). */}
          {istEreignis && offeneTeilnahmen.length > 1 ? (
            <EreignisAbsageAktion
              appointment={appointment}
              beteiligte={beteiligteListe}
              melden={melden}
            />
          ) : null}
          {/* Die Absage der ganzen Dauerfehlzeit (CAL-021). */}
          {istEreignis && appointment.event_series_id ? (
            <SerieAbsageAktion appointment={appointment} melden={melden} />
          ) : null}
          <AbsageAktion appointment={appointment} melden={melden} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * Das Fenster „Aktionen" eines Termins (Akte entschlacken, 2026-10-03). Lädt
 * den Termin über denselben Lesepfad wie vorher die Terminseite
 * (`appointment_directory`) und hält ihn nach jeder Aktion frisch - die
 * Aktionen laden `['appointment', id]` selbst nach.
 */
export function TerminAktionenDialog({
  appointmentId,
  user,
  eingehend,
  zumTermin,
  onSchliessen,
}: {
  appointmentId: string;
  user: CurrentUser;
  eingehend: string;
  zumTermin: string;
  onSchliessen: () => void;
}) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => fetchAppointment(appointmentId),
    retry: false,
  });

  const titel = !data
    ? 'Termin'
    : data.kind === 'internal'
      ? (data.title ?? 'Fehlzeit')
      : patientName(data);

  return (
    <Dialogfenster titel={titel} onSchliessen={onSchliessen}>
      {isPending ? <LoadingState label="Termin wird geladen …" /> : null}
      {isError && !data ? (
        <ErrorState
          title="Der Termin konnte nicht geladen werden."
          description="Bitte die Verbindung prüfen und erneut versuchen."
          onErneut={() => void refetch()}
        />
      ) : null}
      {data === null ? (
        <ErrorState
          title="Nicht gefunden"
          description="Dieser Termin existiert nicht oder ist für Ihren Zugang nicht freigegeben."
        />
      ) : null}
      {data ? (
        <TerminAktionen
          appointment={data}
          user={user}
          eingehend={eingehend}
          zumTermin={zumTermin}
        />
      ) : null}
      <div className="border-line mt-6 flex justify-end border-t pt-4">
        <Button type="button" variant="secondary" onClick={onSchliessen}>
          Schließen
        </Button>
      </div>
    </Dialogfenster>
  );
}
