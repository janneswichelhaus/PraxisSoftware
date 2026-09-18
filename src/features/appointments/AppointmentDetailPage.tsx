import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { MitteilungVermerken } from './MitteilungVermerken';
import { Deckungszeichen } from './Deckungszeichen';
import { Laengenzeichen } from './Laengenzeichen';
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
  cancelAppointmentEvent,
  cancelEventSeries,
  fetchEventSeries,
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
  fetchEventParticipants,
  type Appointment,
  type EventParticipant,
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
  // Ein Ereignis sagt keine Patient:in ab: Es gibt keine, es gibt keinen
  // Behandlungsbeginn, auf den sich eine Frist bezöge, und der Server setzt
  // dort keinen Gebührenanlass (CAL-016). Also weder der Grund
  // „Patient:in hat abgesagt" noch die Frage nach dem Eingang noch der
  // Hinweis auf die Gebühr - alles drei wäre hier eine Behauptung.
  const istEreignis = appointment.kind === 'event';
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
          ? `Die Teilnahme von ${staffName(appointment)} am Ereignis „${appointment.title ?? ''}" `
          : 'Der Termin '}
        am {formatLocalDate(appointment.starts_at, appointment.organization_time_zone)} um{' '}
        {formatLocalTime(appointment.starts_at, appointment.organization_time_zone)} Uhr
        {istEreignis ? ' ' : ` für ${patientName(appointment)} `}
        wird als abgesagt geführt.{' '}
        {istEreignis ? 'Das Ereignis selbst bleibt für die übrigen Beteiligten bestehen. ' : ''}
        Der Eintrag bleibt vollständig erhalten und gibt seinen Zeitraum wieder frei. Eine Absage
        lässt sich nicht zurücknehmen – für einen neuen Eintrag bitte neu anlegen.
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
          {Object.entries(cancellationReasonLabels)
            .filter(([wert]) => !istEreignis || wert !== 'patient_request')
            .map(([wert, beschriftung]) => (
              <option key={wert} value={wert}>
                {beschriftung}
              </option>
            ))}
        </Select>
      </div>

      {/* Der Eingang, getrennt vom Zeitpunkt der Eingabe (§8, ADR-018
          Fassung 2 Punkt 8). Der Anruf kommt abends aufs Band, eingetragen
          wird am nächsten Morgen - ohne diese Angabe entschiede die
          Schreibgeschwindigkeit des Büros über eine Forderung.

          Am Ereignis entfällt die Frage: Es gibt keine Frist, die vom Eingang
          abhinge (CAL-016). */}
      {istEreignis ? null : (
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
      )}

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
        <p className="text-ink-muted mt-3 text-sm leading-relaxed">
          Ein Ereignis des Praxisbetriebs löst keine Ausfallgebühr aus – es gibt keine Patient:in,
          die absagen könnte.
        </p>
      ) : (
        <p className="text-ink-muted mt-3 text-sm leading-relaxed">
          Liegt der Eingang weniger als 24 Stunden vor dem Beginn und hat die Patient:in abgesagt,
          merkt die Anwendung eine Ausfallgebühr vor. Die Frist rechnet der Server; genau 24 Stunden
          liegen außerhalb der Regel.
        </p>
      )}
    </Rueckfrage>
  );
}

/**
 * Das ganze Ereignis absagen (CAL-017).
 *
 * Neben der Absage der einzelnen Teilnahme, und ausdrücklich davon getrennt:
 * Eine Besprechung, die für die einen abgesagt ist und für die anderen noch
 * steht, ist der Zustand, den diese Klammer beseitigt. Der Server sagt alle
 * noch bestätigten Zeilen in **einer** Transaktion ab.
 *
 * Der Grund ist Pflicht wie bei jeder Absage (ANN-034), aber ohne
 * „Patient:in hat abgesagt" und ohne die Frage nach dem Eingang: Ein Ereignis
 * hat keine Patient:in und löst keine Ausfallgebühr aus (CAL-016).
 */
function EreignisAbsageAktion({
  appointment,
  beteiligte,
}: {
  appointment: Appointment;
  beteiligte: EventParticipant[];
}) {
  const queryClient = useQueryClient();
  const [grund, setGrund] = useState('');
  const [grundFehler, setGrundFehler] = useState<string | undefined>(undefined);

  const offen = beteiligte.filter((b) => b.status === 'confirmed');
  const stand = beteiligte[0]?.group_updated_at ?? '';

  const mutation = useMutation({
    mutationFn: (gewaehlt: CancellationReason) =>
      cancelAppointmentEvent(appointment.event_group_id!, stand, gewaehlt),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['appointment'] });
      await queryClient.invalidateQueries({ queryKey: ['event-participants'] });
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
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
      ausloeser="Ereignis absagen"
      bezeichnung="Ereignis absagen"
      bestaetigen="Ja, für alle absagen"
      bestaetigenLaeuft="Wird abgesagt …"
      fehler={mutation.isError ? mutation.error.message : undefined}
      laeuft={mutation.isPending}
      onAbbrechen={() => setGrundFehler(undefined)}
      onBestaetigen={absagen}
    >
      <p>
        {`Das Ereignis „${appointment.title ?? ''}" `}
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
          <option value="">Bitte wählen</option>
          {Object.entries(cancellationReasonLabels)
            .filter(([wert]) => wert !== 'patient_request')
            .map(([wert, beschriftung]) => (
              <option key={wert} value={wert}>
                {beschriftung}
              </option>
            ))}
        </Select>
      </div>
      <p className="text-ink-muted mt-3 text-sm leading-relaxed">
        Ein Ereignis des Praxisbetriebs löst keine Ausfallgebühr aus – es gibt keine Patient:in, die
        absagen könnte.
      </p>
    </Rueckfrage>
  );
}

/**
 * Die ganze Dauerfehlzeit absagen (CAL-021).
 *
 * Die dritte Absage neben „Nur diese Teilnahme" und „Ereignis absagen", und
 * wieder ausdrücklich davon getrennt: Diese hier trifft **alle noch kommenden
 * Vorkommen** der Serie. Was schon stattgefunden hat, bleibt stehen — ein
 * Teammeeting von letzter Woche wird nicht nachträglich zu einem abgesagten
 * (ANN-059).
 */
function SerieAbsageAktion({ appointment }: { appointment: Appointment }) {
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
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['appointment'] });
      await queryClient.invalidateQueries({ queryKey: ['event-participants'] });
      await queryClient.invalidateQueries({ queryKey: ['event-series'] });
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
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
        {`Die Dauerfehlzeit „${appointment.title ?? ''}" `}
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
          <option value="">Bitte wählen</option>
          {Object.entries(cancellationReasonLabels)
            .filter(([wert]) => wert !== 'patient_request')
            .map(([wert, beschriftung]) => (
              <option key={wert} value={wert}>
                {beschriftung}
              </option>
            ))}
        </Select>
      </div>
      <p className="text-ink-muted mt-3 text-sm leading-relaxed">
        Eine Fehlzeit des Praxisbetriebs löst keine Ausfallgebühr aus – es gibt keine Patient:in,
        die absagen könnte.
      </p>
    </Rueckfrage>
  );
}

/**
 * Das Protokoll aus Hausbesuch-Szenario 2 (CAL-018, ADR-018 Fassung 3
 * Punkt 9).
 *
 * Drei Schritte, die nur gemeinsam gelten. Sie stehen hier als Liste und nicht
 * als ein Satz mit einem Haken: Wer sie einzeln abhakt, liest sie einzeln —
 * und das ist der Punkt, denn aus ihnen entsteht eine Forderung gegen eine
 * Patientin.
 */
const PROTOKOLLSCHRITTE = [
  { id: 'gewartet', label: '15 Minuten vor Ort gewartet' },
  { id: 'geklingelt', label: 'An der Tür geklingelt' },
  { id: 'angerufen', label: 'Telefonisch angerufen' },
] as const;

/**
 * „Nicht angetroffen" — am Hausbesuch mit Protokoll, sonst ein Schritt.
 *
 * Die behandelnde Person steht vor der Tür, niemand öffnet. **Am Hausbesuch**
 * löst das seit E14 eine Ausfallgebühr aus, aber erst nach bestätigtem
 * Protokoll: 15 Minuten gewartet, geklingelt, angerufen. Ohne die Bestätigung
 * gibt es kein Nichtantreffen — der Termin bleibt bestätigt, bis die Person
 * entscheidet (ADR-018 Fassung 3 Punkt 9).
 *
 * **Sonst** bleibt es der Schritt aus CAL-014c: ein Vermerk ohne Gebühr. Das
 * Protokoll ist ein Hausbesuchsprotokoll; an der Praxistür gibt es nichts zu
 * klingeln, und für das Nichtantreffen in der Praxis gibt es keine Festlegung
 * (ANN-055). Verbindlich prüft beides der Server.
 *
 * Die Rückfrage bleibt in beiden Fällen: Der Vermerk sperrt die Dokumentation
 * und ist damit mehr als ein Haken. Zurückgenommen wird er über „Termin wieder
 * öffnen"; der Gebührenanlass fällt dabei mit weg.
 */
function NichtAngetroffenAktion({
  appointment,
  mitProtokoll = false,
}: {
  appointment: Appointment;
  /** Am Hausbesuch: das Protokoll ist Pflicht und die Gebühr die Folge. */
  mitProtokoll?: boolean;
}) {
  const queryClient = useQueryClient();
  const [schritte, setSchritte] = useState<Record<string, boolean>>({});
  const [protokollFehler, setProtokollFehler] = useState<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: () => recordNoShow(appointment.id, appointment.updated_at, mitProtokoll),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['appointment', appointment.id] });
      await queryClient.invalidateQueries({ queryKey: ['appointments'] });
      await queryClient.invalidateQueries({ queryKey: ['day-plan'] });
    },
  });

  async function vermerken() {
    if (mitProtokoll && !PROTOKOLLSCHRITTE.every((schritt) => schritte[schritt.id])) {
      setProtokollFehler('Bitte alle drei Schritte des Protokolls bestätigen.');
      // Ohne den Wurf schlösse die Rückfrage sich trotz fehlender Angabe.
      throw new Error('Protokoll unvollständig');
    }
    setProtokollFehler(undefined);
    await mutation.mutateAsync();
  }

  return (
    <Rueckfrage
      ausloeser={mitProtokoll ? 'Niemand angetroffen' : 'Nicht angetroffen'}
      bezeichnung="Nicht angetroffen"
      bestaetigen="Ja, niemand angetroffen"
      bestaetigenLaeuft="Wird vermerkt …"
      fehler={mutation.isError ? mutation.error.message : undefined}
      laeuft={mutation.isPending}
      onAbbrechen={() => setProtokollFehler(undefined)}
      onBestaetigen={vermerken}
    >
      <p>
        Der Termin am {formatLocalDate(appointment.starts_at, appointment.organization_time_zone)}{' '}
        um {formatLocalTime(appointment.starts_at, appointment.organization_time_zone)} Uhr für{' '}
        {patientName(appointment)} wird als „nicht angetroffen" geführt
        {mitProtokoll ? ' und merkt eine Ausfallgebühr vor' : ''}. Der Zeitraum bleibt belegt. Ein
        Irrtum lässt sich über „Termin wieder öffnen" zurücknehmen.
      </p>

      {/* Die drei Schritte als Pflichtangabe vor der Gebühr (ADR-018
          Fassung 3 Punkt 9). Ohne Vorbelegung: Bestätigt wird, was tatsächlich
          getan wurde. */}
      {mitProtokoll ? (
        <fieldset className="mt-3">
          <legend className="text-ink text-sm font-medium">Protokoll vor Ort</legend>
          <div className="mt-1">
            {PROTOKOLLSCHRITTE.map((schritt) => (
              <Checkbox
                key={schritt.id}
                label={schritt.label}
                checked={schritte[schritt.id] ?? false}
                onChange={(e) => {
                  setSchritte((bisher) => ({ ...bisher, [schritt.id]: e.target.checked }));
                  setProtokollFehler(undefined);
                }}
              />
            ))}
          </div>
          {protokollFehler ? (
            <p role="alert" className="text-danger mt-1 text-sm">
              {protokollFehler}
            </p>
          ) : null}
        </fieldset>
      ) : null}

      <p className="text-ink-muted mt-3 text-sm leading-relaxed">
        Das ist ein organisatorischer Vermerk: keine durchgeführte Behandlung, keine Dokumentation,
        keine verbrauchte Verordnungsleistung.{' '}
        {mitProtokoll
          ? 'Die Gebühr entsteht erst mit dem bestätigten Protokoll; Höhe und Abrechnung stehen noch aus.'
          : 'Eine Gebühr entsteht daraus nicht.'}
      </p>
    </Rueckfrage>
  );
}

/**
 * Der geführte Ablauf am Hausbesuch: „Was ist passiert?" (CAL-018).
 *
 * ADR-018 Fassung 3 Punkt 9 verlangt, dass die Oberfläche **erklärend** durch
 * die drei Szenarien führt: welcher Fall vorliegt, was daraus folgt, welche
 * Angabe fehlt. Vorher standen an derselben Stelle vier Schaltflächen
 * nebeneinander, deren Folgen man kennen musste — und die teuerste
 * Verwechslung („nicht angetroffen" statt „Tür geöffnet") kostete eine
 * Patientin Geld.
 *
 * Deshalb steht hier der Regelfall zuerst und jede Wahl mit ihrer Folge
 * daneben. Die Erklärung ist Bedienhilfe, keine Auswertung: Sie zählt nichts
 * und wertet niemanden aus (§20).
 *
 * Verbindlich ist auch hier nichts davon — Protokoll, Gebührenanlass und
 * Pflichtvermerk prüft der Server (ADR-004).
 */
function HausbesuchSzenarien({
  appointment,
  eingehend,
  darfDokumentieren,
}: {
  appointment: Appointment;
  eingehend: string;
  darfDokumentieren: boolean;
}) {
  return (
    <Section
      titel="Was ist passiert?"
      hinweis="Am Hausbesuch entscheidet dieser Schritt über die Abrechnung. Gerechnet wird serverseitig."
      rahmen
    >
      <ol className="divide-line divide-y">
        <li className="py-4 first:pt-0 last:pb-0">
          <p className="text-ink font-medium">Die Behandlung hat stattgefunden</p>
          <p className="text-ink-muted mt-1 max-w-prose text-sm leading-relaxed">
            Der Regelfall: Der Termin gilt als durchgeführt, die Dokumentation wird festgeschrieben,
            abgerechnet wird normal.
          </p>
          {darfDokumentieren ? (
            <div className="mt-3">
              <ButtonLink to={mitRueckweg(`/termine/${appointment.id}/abschluss`, eingehend)}>
                Dokumentieren und abschließen
              </ButtonLink>
            </div>
          ) : null}
        </li>

        <li className="py-4 first:pt-0 last:pb-0">
          <p className="text-ink font-medium">Tür geöffnet, Behandlung nicht durchgeführt</p>
          <p className="text-ink-muted mt-1 max-w-prose text-sm leading-relaxed">
            Die Patient:in öffnet und sagt ab. Der Termin gilt trotzdem als durchgeführt und wird
            normal abgerechnet; eine Ausfallgebühr entsteht nicht. Die Dokumentation trägt dazu
            einen Pflichtvermerk.
          </p>
          {darfDokumentieren ? (
            <div className="mt-3">
              <ButtonLink
                to={mitRueckweg(
                  `/termine/${appointment.id}/abschluss?ohne-behandlung=1`,
                  eingehend,
                )}
                variant="secondary"
              >
                Ohne Behandlung abschließen
              </ButtonLink>
            </div>
          ) : null}
        </li>

        <li className="py-4 first:pt-0 last:pb-0">
          {/* Die Überschrift beschreibt die Lage, die Schaltfläche darunter
              den Schritt — beide gleich zu benennen hieße, zweimal dasselbe
              zu sagen und doch Verschiedenes zu meinen. */}
          <p className="text-ink font-medium">Niemand hat geöffnet</p>
          <p className="text-ink-muted mt-1 max-w-prose text-sm leading-relaxed">
            Nach 15 Minuten Wartezeit, Klingeln und Anruf gilt der Termin als nicht wahrgenommen und
            löst eine Ausfallgebühr aus. Die drei Schritte werden vorher bestätigt.
          </p>
          <div className="mt-3">
            <NichtAngetroffenAktion appointment={appointment} mitProtokoll />
          </div>
        </li>

        <li className="py-4 first:pt-0 last:pb-0">
          <p className="text-ink font-medium">Die Patient:in hat vorher abgesagt</p>
          <p className="text-ink-muted mt-1 max-w-prose text-sm leading-relaxed">
            Dann gehört das zur Absage, nicht hierher: „Termin absagen" steht unten. Liegt der
            Eingang der Absage weniger als 24 Stunden vor dem Beginn, merkt die Anwendung eine
            Ausfallgebühr vor.
          </p>
        </li>
      </ol>
    </Section>
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
  /**
   * Ein Ereignis des Praxisbetriebs (CAL-015b).
   *
   * Es hat keine Patient:in, keine Dokumentation und keinen Abschluss - und
   * damit auch keinen Weg in die Abrechnung (§19). Was bleibt: verschieben und
   * absagen.
   */
  const istEreignis = appointment.kind === 'event';

  /**
   * Der Hausbesuch führt seinen eigenen Ablauf (CAL-018).
   *
   * Die drei Szenarien aus E14 gelten dort — und nur dort (ANN-055). Was in
   * der Praxis passiert, bleibt bei den Schaltflächen von vorher.
   */
  const istHausbesuch = !istEreignis && appointment.appointment_type === 'home_visit';

  /**
   * Die Beteiligten des Ereignisses (CAL-017).
   *
   * Sie machen aus n Zeilen einen sichtbaren Vorgang: Wer hier steht, hat
   * denselben Zeitraum belegt, und eine Änderung trifft alle zugleich. Für
   * einen Behandlungstermin wird gar nicht erst gefragt.
   */
  const beteiligte = useQuery({
    queryKey: ['event-participants', appointment.event_group_id],
    queryFn: () => fetchEventParticipants(appointment.event_group_id!),
    enabled: istEreignis && Boolean(appointment.event_group_id),
    retry: false,
  });

  /**
   * Die Serie, zu der dieses Ereignis gehört - eine Dauerfehlzeit (CAL-021).
   *
   * Sie steht hier, damit der Termin sagen kann, dass er einer von mehreren
   * ist. Ohne das stünde weiter unten ein „Ganze Serie absagen" ohne
   * erkennbaren Anlass.
   */
  const serie = useQuery({
    queryKey: ['event-series', appointment.event_series_id],
    queryFn: () => fetchEventSeries(appointment.event_series_id!),
    enabled: istEreignis && Boolean(appointment.event_series_id),
    retry: false,
  });

  const beteiligteListe = beteiligte.data ?? [];
  const offeneTeilnahmen = beteiligteListe.filter((b) => b.status === 'confirmed');
  const serienVorkommen = serie.data ?? [];

  return (
    <>
      <PageHeader
        /* Der Name führt von hier direkt in die Akte (UX-012). Er ist die
           häufigste Anschlussfrage am Termin — „wer ist das noch mal, was
           steht sonst noch an?" — und stand vorher nur als Text da; der Weg
           ging über die Zeile darunter oder über die Suche. Der Rückweg reist
           mit, damit der Weg zurück am Termin endet und nicht in der Liste. */
        title={
          istEreignis ? (
            `Ereignis – ${appointment.title ?? ''}`
          ) : (
            <>
              Termin –{' '}
              <Link
                to={mitRueckweg(`/patienten/${appointment.patient_id}`, zumTermin)}
                className="underline decoration-2 underline-offset-4 hover:no-underline"
              >
                {patientName(appointment)}
              </Link>
            </>
          )
        }
        description={zustandsHinweis(appointment)}
        actions={
          darfAendern ? (
            <div className="flex flex-wrap gap-3">
              {/* Zwei Wege, und der Unterschied steht in der Beschriftung
                  (CAL-017): „Ereignis bearbeiten" trifft alle Beteiligten
                  zugleich, „Teilnahme ändern" nur diese eine Zeile. Ohne die
                  Trennung wäre jede Verschiebung eine Wette darauf, was
                  gemeint war. */}
              {istEreignis ? (
                <Link
                  to={mitRueckweg(`/termine/${appointment.id}/ereignis-bearbeiten`, eingehend)}
                  className="border-line-strong bg-surface text-ink hover:bg-surface-sunken rounded-button inline-flex min-h-11 items-center justify-center border px-4 text-[0.9375rem] font-medium transition-colors"
                >
                  Ereignis bearbeiten
                </Link>
              ) : null}
              <Link
                to={mitRueckweg(`/termine/${appointment.id}/bearbeiten`, eingehend)}
                className="border-line-strong bg-surface text-ink hover:bg-surface-sunken rounded-button inline-flex min-h-11 items-center justify-center border px-4 text-[0.9375rem] font-medium transition-colors"
              >
                {istEreignis ? 'Teilnahme ändern' : 'Bearbeiten'}
              </Link>
            </div>
          ) : null
        }
      />

      <Section titel="Termin" rahmen>
        <DetailList>
          {/* Bewusst Text und kein zweiter Link: Der Name im Kopf führt in die
              Akte (UX-012). Zwei gleichnamige Links auf dieselbe Seite wären
              für Vorlesesoftware zwei Angebote mit einer Wirkung. */}
          {istEreignis ? (
            <DetailRow label="Ereignis">{appointment.title ?? '—'}</DetailRow>
          ) : (
            <DetailRow label="Patient:in">{patientName(appointment)}</DetailRow>
          )}
          <DetailRow label={istEreignis ? 'Diese Teilnahme' : 'Behandelnde Person'}>
            {staffName(appointment)}
          </DetailRow>
          {/* Aus n Zeilen wird hier ein sichtbarer Vorgang: Wer hier steht,
              hat denselben Zeitraum belegt, und „Ereignis bearbeiten" trifft
              alle zugleich (CAL-017). */}
          {istEreignis && beteiligteListe.length > 1 ? (
            <DetailRow label="Beteiligte">
              <span>
                {beteiligteListe
                  .map((b) =>
                    b.status === 'confirmed'
                      ? b.display_name
                      : `${b.display_name} (${appointmentStatusLabels[b.status]})`,
                  )
                  .join(', ')}
              </span>
              <span className="text-ink-muted mt-1 block text-sm">
                Bezeichnung, Zeit und Ort gelten für alle Beteiligten.
              </span>
            </DetailRow>
          ) : null}
          {/* Dieses Vorkommen ist eines von mehreren (CAL-021). Die Zeile
              sagt es, bevor weiter unten „Ganze Serie absagen" steht. */}
          {istEreignis && appointment.event_series_id && serienVorkommen.length > 0 ? (
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
          <DetailRow label="Art">{appointmentTypeLabels[appointment.appointment_type]}</DetailRow>
          <DetailRow label="Status">{appointmentStatusLabels[appointment.status]}</DetailRow>
          {/* CAL-022: Dieser Termin geht über das Kontingent seiner
              Behandlungsgrundlage hinaus. Er ist geplant und gilt — aber er
              erzeugt keine Leistung gegen diese Grundlage (§19, ADR-009), und
              das gehört an den Termin selbst, nicht nur in die Akte. */}
          {appointment.treatment_basis_covered === false ? (
            <DetailRow label="Deckung">
              <span className="flex flex-wrap items-center gap-2">
                <Deckungszeichen gedeckt={appointment.treatment_basis_covered} />
                <span className="text-ink-muted text-sm">
                  Die Behandlungsgrundlage deckt diesen Termin nicht. In der Akte lässt er sich auf
                  eine andere übertragen.
                </span>
              </span>
            </DetailRow>
          ) : null}
          <DetailRow label="Datum">{formatLocalDate(appointment.starts_at, zone)}</DetailRow>
          <DetailRow label="Zeit">
            {formatLocalTimeRange(appointment.starts_at, appointment.ends_at, zone)}{' '}
            <Laengenzeichen termin={appointment} />
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
          {/* Das bestätigte Protokoll steht neben dem Vermerk, denn es ist
              die Grundlage der Forderung (CAL-018). An einem Vermerk ohne
              Gebühr steht es nicht: Dort gibt es nichts zu belegen. */}
          {appointment.no_show_protocol_confirmed ? (
            <DetailRow label="Protokoll">
              Bestätigt: 15 Minuten vor Ort gewartet, an der Tür geklingelt, telefonisch angerufen.
            </DetailRow>
          ) : null}
          {/* Der Gebührenanlass steht nur da, wenn es einen gibt. Ein
              „Keine Gebühr" an jedem abgesagten Termin wäre eine Zeile, die
              nichts sagt. */}
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

      {/* Am Hausbesuch steht vor den Schaltflächen die Frage, die über die
          Abrechnung entscheidet (CAL-018). */}
      {darfAendern && istHausbesuch ? (
        <div className="mt-8">
          <HausbesuchSzenarien
            appointment={appointment}
            eingehend={eingehend}
            darfDokumentieren={darfDokumentieren}
          />
        </div>
      ) : null}

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
          {/* Ein Ereignis wird weder abgeschlossen noch dokumentiert noch als
              „nicht angetroffen" vermerkt - der Server weist alle drei ab
              (CAL-015b). Bleiben Verschieben und Absagen. */}
          {/* Am Hausbesuch stehen die beiden Wege zum Abschluss und das
              Nichtantreffen oben im geführten Ablauf (CAL-018); hier bliebe
              nur eine zweite Tür zu denselben Räumen. „Ohne Dokumentation
              abschließen" bleibt daneben — ANN-005 gilt unverändert, und der
              Weg hat dort keine eigene Frage zu beantworten. */}
          {istEreignis ? null : (
            <>
              {darfDokumentieren && !istHausbesuch ? (
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
              {istHausbesuch ? null : <NichtAngetroffenAktion appointment={appointment} />}
            </>
          )}
          {/* Zwei Absagen, und der Unterschied steht in der Beschriftung
              (CAL-017): „Ereignis absagen" trifft alle noch offenen
              Teilnahmen, „Nur diese Teilnahme absagen" diese eine. Die
              zweite steht daneben, weil sie der seltenere Fall ist. */}
          {istEreignis && offeneTeilnahmen.length > 1 ? (
            <EreignisAbsageAktion appointment={appointment} beteiligte={beteiligteListe} />
          ) : null}
          {/* Und die dritte Absage, wenn dieses Ereignis zu einer
              Dauerfehlzeit gehoert (CAL-021): Sie trifft alle noch kommenden
              Vorkommen der Serie. */}
          {istEreignis && appointment.event_series_id ? (
            <SerieAbsageAktion appointment={appointment} />
          ) : null}
          <AbsageAktion appointment={appointment} />
        </div>
      ) : null}

      {/* Der Folgetermin ist der häufigste Einzelvorgang am Ende eines
          Besuchs. Er steht auch am abgeschlossenen Termin: dort wird er
          tatsächlich gebraucht (UX-003, IDEA-PRX-007). */}
      {darfVerwalten && !istEreignis && appointment.status !== 'cancelled' ? (
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
      {/* Ein Ereignis teilt niemand einer Patient:in mit. */}
      {darfVerwalten && !istEreignis && appointment.status === 'confirmed' ? (
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
          über einen eigenen, protokollierten Lesepfad geholt (DOK-001). An
          einem Ereignis gibt es sie nicht - und der Abschnitt fragt auch nicht
          danach (CAL-015b). */}
      {istEreignis ? null : <TreatmentNoteSection appointment={appointment} user={user} />}

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
