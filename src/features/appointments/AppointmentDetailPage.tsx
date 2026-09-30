import { Fragment, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Navigate, useLocation, useParams, useSearchParams } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Rueckweg } from '@/components/ui/Rueckweg';
import { Select } from '@/components/ui/Select';
import { Checkbox } from '@/components/ui/Checkbox';
import { Field } from '@/components/ui/Field';
import { DetailList, DetailRow } from '@/components/ui/DetailList';
import { Section } from '@/components/ui/Section';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Rueckfrage } from '@/components/ui/Rueckfrage';
import { Textlink } from '@/components/ui/Textlink';
import { Badge } from '@/components/ui/Badge';
import { Tile, TileGrid, TileRow, TileRows } from '@/components/ui/Tile';
import { MitteilungVermerken } from './MitteilungVermerken';
import { Kurzblick } from './Kurzblick';
import { AbrechnungAbschnitt, TreatmentBasisTile } from './Abrechnungslage';
import { AppointmentHeadline } from './AppointmentHeadline';
import { HeilmittelBestaetigen } from './HeilmittelBestaetigen';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  canManageAppointments,
  canReadTreatmentNote,
  canRecordAtAppointment,
  canWriteTreatmentBases,
  canWriteTreatmentNote,
  type CurrentUser,
} from '@/features/session/types';
import { PrescriptionPhoto } from '@/features/files/PrescriptionPhoto';
import { TreatmentNoteSection } from '@/features/documentation/TreatmentNoteSection';
import { WaitlistMatches } from '@/features/waitlist/WaitlistMatches';
import { BEREICHE } from '@/lib/begriffe';
import { leseRueckweg, mitRueckweg } from '@/lib/rueckweg';
import { NavigationZumTermin } from './NavigationStarten';
import { NachladeHinweis, Rueckmeldung } from './Rueckmeldungen';
import { leseAngelegtenTermin, leseMeldung } from './terminformular';
import {
  appointmentStatusLabels,
  appointmentToFormValues,
  appointmentTypeHint,
  cancelAppointment,
  cancelAppointmentEvent,
  cancelEventSeries,
  fetchEventSeries,
  cancellationReasonLabels,
  cancellationReasonSchema,
  completeAppointment,
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
  schreibeTerminVorbelegung,
  staffName,
  todayInTimeZone,
  fetchEventParticipants,
  type Appointment,
  type EventParticipant,
} from './api';

/**
 * Wo das Ausfallhonorar erfasst wird (TER-10).
 *
 * Bis UXR-005 stand hier, Höhe und Abrechnung stünden noch aus, weil der
 * Leistungskatalog noch nicht eingerichtet sei. Katalog und Rechnung gibt es
 * inzwischen; das Honorar erscheint dort unter den Leistungen.
 */
const HONORAR_ERFASSUNG = `Wird unter ${BEREICHE.abrechnung.label} → Leistungen erfasst.`;

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
 * Die Kachel des Ortes (UX-005a): Anschrift mit Navigation am Hausbesuch,
 * Standort am Praxistermin, der Hinweis am Videotermin.
 *
 * Der Hausbesuch ist der Regelfall dieser Praxis und trägt deshalb kein Wort
 * dafür (ANN-187). Ein Praxis- oder Videotermin ist die Ausnahme — Jannes:
 * „Sollte hier irgendwann eine Räumlichkeit hinzukommen, sollte ein Kästchen
 * aufploppen, das darauf hinweist." Die Kachel wird dann zur Akzentkarte und
 * nennt die Art als Zeichen.
 *
 * Der Navigations-Handoff steht bei der Anschrift, nicht bei den
 * Statusaktionen: Er gehört zur Anfahrt, nicht zum Vorgang (ADR-019 Punkt 20).
 * Was dabei das Gerät verlässt, steht direkt darunter (ADR-019 Punkt 23) —
 * bis UX-005a stand es als Fußnote am Ende der Seite.
 */
function OrtKachel({ appointment }: { appointment: Appointment }) {
  const art = appointment.appointment_type;
  const kennzeichen = appointmentTypeHint(art);
  const strasse = [appointment.visit_street, appointment.visit_house_number]
    .filter(Boolean)
    .join(' ');
  const ort = [appointment.visit_postal_code, appointment.visit_city].filter(Boolean).join(' ');

  return (
    <Tile label={ortsBeschriftung(art)} ton={kennzeichen ? 'akzent' : 'neutral'}>
      {kennzeichen ? (
        <span className="mb-1 block">
          <Badge ton="akzent">{kennzeichen}termin</Badge>
        </span>
      ) : null}
      {art === 'home_visit' ? (
        strasse || ort ? (
          <address className="not-italic">
            {strasse ? <span className="block font-medium">{strasse}</span> : null}
            {ort ? <span className="block">{ort}</span> : null}
          </address>
        ) : (
          '—'
        )
      ) : art === 'practice' ? (
        <span className="block font-medium">{locationSummary(appointment)}</span>
      ) : null}
      {art === 'home_visit' ? (
        <span className="mt-3 block">
          <NavigationZumTermin termin={appointment} />
          <span className="text-ink-muted mt-2 block text-xs leading-relaxed">
            Öffnet Google Maps im Fahrradmodus und übergibt nur die Anschrift ohne Namen – erst beim
            Tippen.
          </span>
        </span>
      ) : null}
      {art === 'video' ? (
        <span className="text-ink-muted mt-1 block text-sm">
          Für Videotermine wird noch kein Videolink erzeugt.
        </span>
      ) : null}
    </Tile>
  );
}

/**
 * Die Kachel eines Zustands mit Einzelheiten (UX-005a): die Absage mit Grund,
 * Eingang und Gebührenanlass; das Nichtantreffen mit Zeitpunkt, Protokoll und
 * Gebührenanlass. Am bestätigten, abgeschlossenen oder dokumentierten Termin
 * gibt es sie nicht — dort steht nichts, was über die Kopfzeile hinausginge.
 *
 * Der Honoraranlass steht nur da, wenn es einen gibt. Ein „Kein
 * Ausfallhonorar" an jedem abgesagten Termin wäre eine Zeile, die nichts
 * sagt. Dasselbe Wort wie auf Rechnung, Katalog und dem Blatt für
 * Patient:innen (TER-10). Kein Betrag: Die Höhe steht im Katalog, abgerechnet
 * wird über die Leistungen — eine Zahl hier wäre eine zweite Quelle.
 */
function ZustandKachel({ appointment }: { appointment: Appointment }) {
  const zone = appointment.organization_time_zone;
  const zeitpunkt = (iso: string) =>
    `${formatLocalDate(iso, zone)}, ${formatLocalTime(iso, zone)} Uhr`;
  const honorar = appointment.fee_basis ? (
    <TileRow label="Ausfallhonorar vorgemerkt">
      <span>{feeBasisLabels[appointment.fee_basis]}</span>
      <span className="text-ink-muted mt-1 block text-sm">{HONORAR_ERFASSUNG}</span>
    </TileRow>
  ) : null;

  if (appointment.status === 'cancelled') {
    return (
      <Tile label="Absage" ton="kritisch">
        <TileRows>
          <TileRow label="Absagegrund">
            {appointment.cancellation_reason
              ? cancellationReasonLabels[appointment.cancellation_reason]
              : 'Nicht erfasst'}
          </TileRow>
          {appointment.cancellation_received_at ? (
            <TileRow label="Absage eingegangen">
              {zeitpunkt(appointment.cancellation_received_at)}
            </TileRow>
          ) : null}
          {honorar}
        </TileRows>
      </Tile>
    );
  }

  if (appointment.status === 'no_show') {
    return (
      <Tile label="Vermerk" ton="warnung">
        <TileRows>
          {appointment.no_show_recorded_at ? (
            <TileRow label="Vermerkt am">{zeitpunkt(appointment.no_show_recorded_at)}</TileRow>
          ) : null}
          {/* Das bestätigte Protokoll steht neben dem Vermerk, denn es ist
              die Grundlage der Forderung (CAL-018). An einem Vermerk ohne
              Honorar steht es nicht: Dort gibt es nichts zu belegen. */}
          {appointment.no_show_protocol_confirmed ? (
            <TileRow label="Protokoll">
              Bestätigt: 15 Minuten vor Ort gewartet, an der Tür geklingelt, telefonisch angerufen.
            </TileRow>
          ) : null}
          {honorar}
        </TileRows>
      </Tile>
    );
  }

  // Ein Kennzeichen aus der Zeit vor ADR-018 Fassung 2 an einem anderen
  // Zustand bleibt sichtbar - historische Vorgänge werden nicht umgedeutet,
  // aber auch nicht versteckt.
  if (appointment.fee_basis) {
    return (
      <Tile label="Vermerk" ton="warnung">
        <TileRows>{honorar}</TileRows>
      </Tile>
    );
  }

  return null;
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
      nachladen(queryClient, ['appointment', appointment.id], ['appointments'], ['day-plan']);
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
            hint="Maßgeblich für das Ausfallhonorar ist der Eingang, nicht die Eingabe."
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
        <p className="text-ink-muted mt-3 text-sm">
          Eine Fehlzeit des Praxisbetriebs löst kein Ausfallhonorar aus – es gibt keine Patient:in,
          die absagen könnte.
        </p>
      ) : (
        <p className="text-ink-muted mt-3 text-sm">
          Liegt der Eingang weniger als 24 Stunden vor dem Beginn und hat die Patient:in abgesagt,
          merkt die Anwendung ein Ausfallhonorar vor. Die Frist wird automatisch berechnet; genau 24
          Stunden vorher gilt noch als rechtzeitig.
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
          {Object.entries(cancellationReasonLabels)
            .filter(([wert]) => wert !== 'patient_request')
            .map(([wert, beschriftung]) => (
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
          {Object.entries(cancellationReasonLabels)
            .filter(([wert]) => wert !== 'patient_request')
            .map(([wert, beschriftung]) => (
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
 * löst das seit E14 ein Ausfallhonorar aus, aber erst nach bestätigtem
 * Protokoll: 15 Minuten gewartet, geklingelt, angerufen. Ohne die Bestätigung
 * gibt es kein Nichtantreffen — der Termin bleibt bestätigt, bis die Person
 * entscheidet (ADR-018 Fassung 3 Punkt 9).
 *
 * **Sonst** bleibt es der Schritt aus CAL-014c: ein Vermerk ohne Honorar. Das
 * Protokoll ist ein Hausbesuchsprotokoll; an der Praxistür gibt es nichts zu
 * klingeln, und für das Nichtantreffen in der Praxis gibt es keine Festlegung
 * (ANN-055). Verbindlich prüft beides der Server.
 *
 * Die Rückfrage bleibt in beiden Fällen: Der Vermerk sperrt die Dokumentation
 * und ist damit mehr als ein Haken. Zurückgenommen wird er über „Termin wieder
 * öffnen"; der Honoraranlass fällt dabei mit weg.
 */
function NichtAngetroffenAktion({
  appointment,
  mitProtokoll = false,
  melden,
}: {
  appointment: Appointment;
  /** Am Hausbesuch: das Protokoll ist Pflicht und das Honorar die Folge. */
  mitProtokoll?: boolean;
  melden: Melden;
}) {
  const queryClient = useQueryClient();
  const [schritte, setSchritte] = useState<Record<string, boolean>>({});
  const [protokollFehler, setProtokollFehler] = useState<string | undefined>(undefined);

  const mutation = useMutation({
    mutationFn: () => recordNoShow(appointment.id, appointment.updated_at, mitProtokoll),
    onSuccess: () => {
      nachladen(queryClient, ['appointment', appointment.id], ['appointments'], ['day-plan']);
      melden(
        mitProtokoll
          ? 'Als „nicht angetroffen“ vermerkt – das Ausfallhonorar ist vorgemerkt.'
          : 'Als „nicht angetroffen“ vermerkt.',
      );
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
        {patientName(appointment)} wird als „nicht angetroffen“ geführt
        {mitProtokoll ? ' und merkt ein Ausfallhonorar vor' : ''}. Der Zeitraum bleibt belegt. Ein
        Irrtum lässt sich über „Termin wieder öffnen“ zurücknehmen.
      </p>

      {/* Die drei Schritte als Pflichtangabe vor dem Honorar (ADR-018
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

      <p className="text-ink-muted mt-3 text-sm">
        Das ist ein organisatorischer Vermerk: keine durchgeführte Behandlung, keine Dokumentation,
        keine verbrauchte Verordnungsleistung.{' '}
        {mitProtokoll
          ? `Das Ausfallhonorar entsteht erst mit dem bestätigten Protokoll. ${HONORAR_ERFASSUNG}`
          : 'Ein Ausfallhonorar entsteht daraus nicht.'}
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
 * Verbindlich ist auch hier nichts davon — Protokoll, Honoraranlass und
 * Pflichtvermerk prüft der Server (ADR-004).
 */
function HausbesuchSzenarien({
  appointment,
  eingehend,
  darfDokumentieren,
  melden,
}: {
  appointment: Appointment;
  eingehend: string;
  darfDokumentieren: boolean;
  melden: Melden;
}) {
  return (
    <Section
      titel="Was ist passiert?"
      hinweis="Am Hausbesuch entscheidet dieser Schritt über die Abrechnung."
      rahmen
    >
      <ol className="divide-line divide-y">
        <li className="py-4 first:pt-0 last:pb-0">
          <p className="text-ink font-medium">Die Behandlung hat stattgefunden</p>
          <p className="text-ink-muted mt-1 max-w-prose text-sm">
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
          <p className="text-ink-muted mt-1 max-w-prose text-sm">
            Die Patient:in öffnet und sagt ab. Der Termin gilt trotzdem als durchgeführt und wird
            normal abgerechnet; ein Ausfallhonorar entsteht nicht. Die Dokumentation trägt dazu
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
              zu sagen und doch Verschiedenes zu meinen. Der Zustand selbst
              heißt überall „nicht angetroffen" (WRT-B01). */}
          <p className="text-ink font-medium">Niemand hat geöffnet</p>
          <p className="text-ink-muted mt-1 max-w-prose text-sm">
            Nach 15 Minuten Wartezeit, Klingeln und Anruf wird der Termin als „nicht angetroffen“
            geführt und löst ein Ausfallhonorar aus. Die drei Schritte werden vorher bestätigt.
          </p>
          <div className="mt-3">
            <NichtAngetroffenAktion appointment={appointment} mitProtokoll melden={melden} />
          </div>
        </li>

        <li className="py-4 first:pt-0 last:pb-0">
          <p className="text-ink font-medium">Die Patient:in hat vorher abgesagt</p>
          <p className="text-ink-muted mt-1 max-w-prose text-sm">
            Dann gehört das zur Absage, nicht hierher: „Termin absagen“ steht unten. Liegt der
            Eingang der Absage weniger als 24 Stunden vor dem Beginn, merkt die Anwendung ein
            Ausfallhonorar vor.
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
 * Die Bestätigung eines gerade angelegten Folgetermins (TER-04).
 *
 * Das Formular kehrt auf diesen Termin zurück und hängt die Kennung des neuen
 * an (`?neu=`). Vorher stand man danach wortlos wieder auf dem alten Termin -
 * „Folgetermin anlegen" unverändert daneben, und ein zweiter Versuch ergab
 * eine Dublette. Tag und Zeit kommen aus dem neuen Termin selbst.
 */
function FolgeterminMeldung({ neuId, zumTermin }: { neuId: string; zumTermin: string }) {
  const neu = useQuery({
    queryKey: ['appointment', neuId],
    queryFn: () => fetchAppointment(neuId),
    retry: false,
  });

  // Erst, wenn feststeht, was dasteht: Die Zeile nimmt beim Erscheinen den
  // Fokus, und ein Satz, der sich danach ändert, würde zweimal vorgelesen.
  if (neu.isPending) return null;

  const termin = neu.data;
  const zone = termin?.organization_time_zone;
  return (
    <Rueckmeldung className="mb-6">
      {termin && zone
        ? `Folgetermin am ${formatLocalDate(termin.starts_at, zone)} um ${formatLocalTime(termin.starts_at, zone)} Uhr angelegt.`
        : 'Folgetermin angelegt.'}{' '}
      <Textlink to={mitRueckweg(`/termine/${neuId}`, zumTermin)}>Folgetermin öffnen</Textlink>
    </Rueckmeldung>
  );
}

function AppointmentDetail({
  appointment,
  user,
  eingehend,
  zumTermin,
  eingangsmeldung,
  neuerTermin,
  nachladeFehler,
}: {
  appointment: Appointment;
  user: CurrentUser;
  /** Der Rückweg dieser Seite - für die Unterseiten desselben Termins. */
  eingehend: string;
  /** Der Weg zurück zu diesem Termin - für die Wege zu anderen Gegenständen. */
  zumTermin: string;
  /** Was ein anderer Vorgang beim Hierherkommen bestätigt (DOK-15, ZST-17). */
  eingangsmeldung: string | null;
  /** Der gerade angelegte Folgetermin (TER-04). */
  neuerTermin: string | null;
  /** Das Nachladen ist gescheitert; der Stand kann veraltet sein (ZST-03). */
  nachladeFehler: { laeuft: boolean; erneut: () => void } | null;
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
  /**
   * Eine Fehlzeit des Praxisbetriebs (CAL-015b).
   *
   * Es hat keine Patient:in, keine Dokumentation und keinen Abschluss - und
   * damit auch keinen Weg in die Abrechnung (§19). Was bleibt: verschieben und
   * absagen.
   */
  const istEreignis = appointment.kind === 'internal';

  /**
   * Der Hausbesuch führt seinen eigenen Ablauf (CAL-018).
   *
   * Die drei Szenarien aus E14 gelten dort — und nur dort (ANN-055). Was in
   * der Praxis passiert, bleibt bei den Schaltflächen von vorher.
   */
  const istHausbesuch = !istEreignis && appointment.appointment_type === 'home_visit';

  /**
   * Die Bestätigung des letzten Vorgangs auf dieser Seite (ZST-16).
   *
   * Mit laufender Nummer: Eine zweite, gleichlautende Bestätigung ist eine
   * neue Zeile und nimmt den Fokus erneut.
   */
  const [bestaetigung, setBestaetigung] = useState<{ nummer: number; text: string } | null>(null);
  const melden: Melden = (text) =>
    setBestaetigung((bisher) => ({ nummer: (bisher?.nummer ?? 0) + 1, text }));

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
            `Fehlzeit – ${appointment.title ?? ''}`
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
        /* Datum, Zeit, Zustand und Mitteilungszeichen direkt unter dem
           Namen (UX-005a) - was einen Termin ausmacht, ohne Tabelle. Der
           Satz darunter sagt nur noch, was aus einem Zustand ohne Rückweg
           folgt. */
        description={
          <>
            <AppointmentHeadline appointment={appointment} user={user} />
            {zustandsHinweis(appointment) ? (
              <p className="mt-1">{zustandsHinweis(appointment)}</p>
            ) : null}
          </>
        }
        actions={
          darfAendern ? (
            <div className="flex flex-wrap gap-3">
              {/* Zwei Wege, und der Unterschied steht in der Beschriftung
                  (CAL-017): „Fehlzeit bearbeiten" trifft alle Beteiligten
                  zugleich, „Teilnahme ändern" nur diese eine Zeile. Ohne die
                  Trennung wäre jede Verschiebung eine Wette darauf, was
                  gemeint war.

                  Kompakte Sekundärknöpfe aus dem Baustein (TER-16, UIK-14):
                  vorher eine eigene Klassenkette in Tinte, 15 px und 500. */}
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
          ) : null
        }
      />

      {nachladeFehler ? (
        <NachladeHinweis
          className="mb-6"
          laeuft={nachladeFehler.laeuft}
          onErneut={nachladeFehler.erneut}
        />
      ) : null}

      {/* Die Bestätigung steht oben, wo man nach dem Vorgang hinsieht - auch
          wenn der Knopf dazu weit unten saß (ZST-16, TER-17). Ein Vorgang auf
          dieser Seite geht der Meldung vor, mit der man hergekommen ist. */}
      {bestaetigung ? (
        <Rueckmeldung key={bestaetigung.nummer} className="mb-6">
          {bestaetigung.text}
        </Rueckmeldung>
      ) : neuerTermin && neuerTermin !== appointment.id ? (
        <FolgeterminMeldung neuId={neuerTermin} zumTermin={zumTermin} />
      ) : eingangsmeldung ? (
        <Rueckmeldung className="mb-6">{eingangsmeldung}</Rueckmeldung>
      ) : null}

      {/* Die Angaben des Behandlungstermins als Kacheln (UX-005a): der Ort
          mit der Anfahrt, die Grundlage mit dem Zähler, ein Zustand mit seinen
          Einzelheiten. Was schon im Kopf steht - Name, Tag, Zeit, Zustand -,
          steht hier nicht noch einmal. Ein Ereignis behält seine Zeilen: Es
          hat Beteiligte und Vorkommen, die eine Kachel nicht besser trüge. */}
      {istEreignis ? null : (
        <TileGrid>
          <ZustandKachel appointment={appointment} />
          <OrtKachel appointment={appointment} />
          {/* PRX-008: „Termin n von m" an der Grundlage, seit CAL-022 mit
              der Deckung; Empfänger und offene Rechnungen stehen darunter
              im Abschnitt „Abrechnung". */}
          {appointment.kind === 'therapy' ? (
            <TreatmentBasisTile
              appointment={appointment}
              darfVerwalten={darfVerwalten}
              zumTermin={zumTermin}
            />
          ) : null}
        </TileGrid>
      )}

      {istEreignis ? (
        <Section titel="Fehlzeit" rahmen>
          <DetailList>
            <DetailRow label="Fehlzeit">{appointment.title ?? '—'}</DetailRow>
            <DetailRow label="Diese Teilnahme">{staffName(appointment)}</DetailRow>
            {/* Aus n Zeilen wird hier ein sichtbarer Vorgang: Wer hier steht,
                hat denselben Zeitraum belegt, und „Fehlzeit bearbeiten" trifft
                alle zugleich (CAL-017). Jede andere Teilnahme führt zu ihrem
                Termin - dort wird sie getauscht oder abgesagt (TER-15). */}
            {beteiligteListe.length > 1 ? (
              <DetailRow label="Beteiligte">
                {/* Die Links stehen je für sich und sind 44 px hoch - am
                    Telefon ein Ziel für den Daumen, nicht für die Fingerspitze. */}
                <span className="inline-flex flex-wrap items-center">
                  {beteiligteListe.map((b, index) => {
                    const name =
                      b.status === 'confirmed'
                        ? b.display_name
                        : `${b.display_name} (${appointmentStatusLabels[b.status]})`;
                    return (
                      <Fragment key={b.appointment_id}>
                        {index > 0 ? <span className="mr-1">, </span> : null}
                        {b.appointment_id === appointment.id ? (
                          <span>{name}</span>
                        ) : (
                          <Textlink
                            alleinstehend
                            to={mitRueckweg(`/termine/${b.appointment_id}`, zumTermin)}
                          >
                            {name}
                          </Textlink>
                        )}
                      </Fragment>
                    );
                  })}
                </span>
                <span className="text-ink-muted mt-1 block text-sm">
                  Bezeichnung, Zeit und Ort gelten für alle Beteiligten.
                </span>
              </DetailRow>
            ) : null}
            {/* Dieses Vorkommen ist eines von mehreren (CAL-021). Die Zeile
                sagt es, bevor weiter unten „Ganze Serie absagen" steht. */}
            {appointment.event_series_id && serienVorkommen.length > 0 ? (
              <DetailRow label="Dauerfehlzeit">
                <span>
                  Vorkommen{' '}
                  {serienVorkommen.findIndex(
                    (v) => v.event_group_id === appointment.event_group_id,
                  ) + 1}{' '}
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
        </Section>
      ) : null}

      {/* BEF-081: Empfänger und offene Rechnungen als eigener Abschnitt statt
          zweier Zeilen zwischen den Termindaten - nur für owner und office. */}
      {appointment.kind === 'therapy' ? (
        <AbrechnungAbschnitt appointmentId={appointment.id} />
      ) : null}

      {/* Was man vor der Tür wissen muss (PRX-006): zugeklappt, erst auf
          Anforderung gelesen und protokolliert (ANN-137). Nur am
          Behandlungstermin; die Rollenprüfung trägt der Server. */}
      {appointment.kind === 'therapy' && canReadTreatmentNote(user.roles) ? (
        <div className="mt-6">
          <Kurzblick appointmentId={appointment.id} />
        </div>
      ) : null}

      {/* Am Hausbesuch steht vor den Schaltflächen die Frage, die über die
          Abrechnung entscheidet (CAL-018). */}
      {darfAendern && istHausbesuch ? (
        <div className="mt-8">
          <HausbesuchSzenarien
            appointment={appointment}
            eingehend={eingehend}
            darfDokumentieren={darfDokumentieren}
            melden={melden}
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
                erfolg="Termin abgeschlossen."
                variant={darfDokumentieren ? 'secondary' : 'primary'}
                melden={melden}
              />
              {istHausbesuch ? null : (
                <NichtAngetroffenAktion appointment={appointment} melden={melden} />
              )}
            </>
          )}
          {/* Zwei Absagen, und der Unterschied steht in der Beschriftung
              (CAL-017): „Fehlzeit absagen" trifft alle noch offenen
              Teilnahmen, „Nur diese Teilnahme absagen" diese eine. Die
              zweite steht daneben, weil sie der seltenere Fall ist. */}
          {istEreignis && offeneTeilnahmen.length > 1 ? (
            <EreignisAbsageAktion
              appointment={appointment}
              beteiligte={beteiligteListe}
              melden={melden}
            />
          ) : null}
          {/* Und die dritte Absage, wenn dieses Ereignis zu einer
              Dauerfehlzeit gehoert (CAL-021): Sie trifft alle noch kommenden
              Vorkommen der Serie. */}
          {istEreignis && appointment.event_series_id ? (
            <SerieAbsageAktion appointment={appointment} melden={melden} />
          ) : null}
          <AbsageAktion appointment={appointment} melden={melden} />
        </div>
      ) : null}

      {/* Nachrücken (PRX-004): Ein abgesagter Behandlungstermin in der
          Zukunft ist ein freier Platz. Die Liste zeigt, wer darauf passt -
          ohne die Person, die gerade abgesagt hat. */}
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

      {/* Verordnung ohne Papier (PRX-011): ein Foto am Termin, das Büro
          erfasst daraus die Grundlage. Wer Grundlagen schreibt, darf auch
          ihren Scan ablegen (ANN-011); verbindlich prüft der Server. */}
      {!istEreignis &&
      appointment.patient_id &&
      appointment.status !== 'cancelled' &&
      canWriteTreatmentBases(user.roles) ? (
        <Section titel="Verordnung" ebene={3}>
          <PrescriptionPhoto patientId={appointment.patient_id} />
        </Section>
      ) : null}

      {darfWiederOeffnen ? (
        <div className="mt-5 flex">
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

      {/* Am Termin steht der Hinweis in der Kachel des Ortes (UX-005a). */}
      {istEreignis && appointment.appointment_type === 'video' ? (
        <p className="text-ink-muted mt-6 max-w-prose text-sm">
          Für Videotermine wird noch kein Videolink erzeugt.
        </p>
      ) : null}

      {/* Klinische Inhalte stehen bewusst in einem eigenen Datensatz und werden
          über einen eigenen, protokollierten Lesepfad geholt (DOK-001). An
          einem Ereignis gibt es sie nicht - und der Abschnitt fragt auch nicht
          danach (CAL-015b). Der Rückweg des Termins reist in die Doku-Seiten
          mit, damit er über sie nicht verloren geht (DOK-01). */}
      {istEreignis ? null : (
        <TreatmentNoteSection appointment={appointment} user={user} eingehend={eingehend} />
      )}

      {/* Termin abhaken (PRX-009): nach der Dokumentation die geleisteten
          Heilmittel bestätigen - die behandelnde Person an ihrem Termin,
          das Büro an jedem (ANN-140). Verbindlich prüft der Server. */}
      {appointment.kind === 'therapy' &&
      canRecordAtAppointment(user.roles, appointment.staff_member_id, user.staffMemberId) ? (
        <HeilmittelBestaetigen appointment={appointment} user={user} />
      ) : null}

      {/* Bis UX-005a stand hier eine Fußnote: Zeiten in der Zeitzone der
          Praxis, nur organisatorische Angaben, was die Navigation übergibt.
          Die ersten beiden Sätze sagten, was jeder hier weiß (Kennzeichnung,
          ARBEITSBEREICHE.md §2); der dritte steht jetzt an der Schaltfläche,
          die ihn braucht (ADR-019 Punkt 23). */}
    </>
  );
}

export function AppointmentDetailPage({ user }: { user: CurrentUser }) {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const [suche] = useSearchParams();
  // Was ein anderer Vorgang beim Seitenwechsel mitgibt - ungeprüft, bis
  // `leseMeldung` es liest.
  const zustand: unknown = useLocation().state;

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

  const { data, isPending, isError, isFetching, refetch } = useQuery({
    queryKey: ['appointment', appointmentId],
    queryFn: () => fetchAppointment(appointmentId!),
    enabled: Boolean(appointmentId),
    retry: false,
  });

  /**
   * Wohin „zurück" ohne mitgereisten Weg führt (TER-03).
   *
   * Aus dem Termin selbst abgeleitet: ein Behandlungstermin in die Terminliste
   * seiner Akte, eine Fehlzeit in den Kalender. Bis UXR-005 führte er immer
   * in die Patientenliste - auch von einer Fehlzeit, die keine Patient:in hat.
   * Solange der Termin nicht geladen ist, ist der Kalender das Ziel: Dort
   * stehen alle Termine.
   */
  const standard =
    data && data.kind !== 'internal' && data.patient_id
      ? `/patienten/${data.patient_id}/termine`
      : '/kalender';

  // Ein Trainingstermin hat seine Seite im Trainingsbereich (TRN-004) - hier
  // stünden Abschließen, Dokumentation und Akte, die es an ihm nicht gibt.
  if (data?.kind === 'training') {
    return <Navigate to={mitRueckweg(`/training/termine/${data.id}`, eingehend)} replace />;
  }

  return (
    <>
      <Rueckweg standard={standard} />

      {/* Auch ohne Termin trägt die Seite einen Titel - Vorlesesoftware findet
          sonst keine Überschrift (UIK-16). */}
      {!data ? <PageHeader title="Termin" /> : null}

      {isPending ? <LoadingState label="Termin wird geladen …" /> : null}
      {/* Ersetzt wird der Termin nur, solange es keinen gibt; ein
          gescheitertes Nachladen meldet sich über dem Stand (ZST-03). */}
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
        <AppointmentDetail
          appointment={data}
          user={user}
          eingehend={eingehend}
          zumTermin={zumTermin}
          eingangsmeldung={leseMeldung(zustand)}
          neuerTermin={leseAngelegtenTermin(suche)}
          nachladeFehler={isError ? { laeuft: isFetching, erneut: () => void refetch() } : null}
        />
      ) : null}
    </>
  );
}
