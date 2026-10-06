import { useEffect, useId, useMemo, useState, type ReactNode } from 'react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { BEGRIFFE } from '@/lib/begriffe';
import { PageHeader } from '@/components/ui/PageHeader';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Aufklappzeichen, Card, CardGrid, Disclosure } from '@/components/ui/Card';
import { ListRow, ListRows } from '@/components/ui/ListRow';
import { ProgressDots } from '@/components/ui/ProgressDots';
import { Section } from '@/components/ui/Section';
import { StatusMark } from '@/components/ui/StatusMark';
import { Textlink } from '@/components/ui/Textlink';
import { TravelBar } from '@/components/ui/TravelBar';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import { mitRueckweg } from '@/lib/rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { Rueckmeldung } from '@/features/appointments/Rueckmeldungen';
import { TerminAbschliessenKnopf } from '@/features/appointments/TerminAbschliessen';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  appointmentStatusLabels,
  appointmentStatusTon,
  appointmentTypeHint,
  fetchAppointments,
  formatLocalDate,
  formatLocalTime,
  terminBezeichnung,
  staffName,
  todayInTimeZone,
  type CalendarEntry,
  terminPfad,
} from '@/features/appointments/api';
import {
  canManageAppointments,
  canReadPatientDirectory,
  canReadTrainingClients,
  canWriteTrainingClients,
  isTherapyStaff,
  canReadTreatmentNote,
  canWriteTreatmentNote,
  isStaff,
  type CurrentUser,
} from '@/features/session/types';
import { useVorschau } from '@/features/preview/vorschauContext';
import { vorschauidentitaet, darfEntscheiden } from '@/features/preview/identitaet';
import { NavigationZumTermin } from '@/features/appointments/NavigationStarten';
import { fetchAbrechnungslage, positionText } from '@/features/appointments/abrechnungslage-api';
import { tagePlus } from '@/features/appointments/calendar';
import { fetchDayPlan, nachUhrzeit, TAGESPLAN_VORHALTEDAUER_MS, type DayPlanEntry } from './api';
import { Tageskarte } from './Tagesliste';
import { Zeitstrahl } from './Zeitstrahl';
import { useTagesfahrzeiten } from './fahrzeiten';
import { TagesWort, bezugszeitpunkt, gewaehlterTag, tagesPfad, tagesWort } from './tageswahl';
import { navigationsZiel } from '@/lib/location/navigation';
import {
  besuchsphase,
  besucheDesTages,
  hausbesucheDesTages,
  bisBeginn,
  dokuText,
  fokusDesTages,
  fortschrittText,
  liegeHeute,
  liegeText,
  naechsterWeg,
  tagesfortschritt,
  terminName,
  VERALTET_TEXT,
  wegeDesTages,
  type Fokus,
  type LiegeHeute,
  type Tagesfortschritt,
} from './tagesstart';
import { Laengenzeichen } from '@/features/appointments/Laengenzeichen';
import { TagesrouteAufklapper } from '@/features/tours/TagesrouteAufklapper';
import { OpenPointsSummary } from '@/features/open-points/OpenPointsSummary';
import { OPEN_INTAKES_KEY, fetchOpenIntakes } from '@/features/open-points/intake-api';

/**
 * Übersicht - der persönliche Einstieg.
 *
 * Die Seite beantwortet eine Frage: was ist als Nächstes zu tun. Sie ist
 * deshalb kein Begrüßungsbildschirm mit Kennzahl, sondern der eigene Tag als
 * Zeitstrahl aus echten Terminen und - klar getrennt - den Hinweisen aus den
 * noch nicht angebundenen Bereichen.
 *
 * Seit UX-001 kommen die eigenen Besuche aus einem eigenen, engeren Lesepfad
 * (`list_day_plan`) mit Adresse, Rufnummer und Zugangshinweis, nicht aus dem
 * Kalender. Der Tagesplan des Teams bleibt die Kalenderabfrage - er braucht
 * keine Adressen.
 *
 * Seit dem Design-Handoff vom 2026-10-01 steht der Tag als **Zeitstrahl** da:
 * oben die Liege und der nächste Weg mit seinem Puffer, darunter alle Termine
 * an einer Schiene, der nächste ausgeklappt. Ab 900 px Inhaltsbreite steht
 * der Tagesplan des Teams als Karte rechts daneben, darunter ist er ein
 * Aufklapper unter dem eigenen Tag.
 *
 * Ein Ladefehler bietet hier immer „Erneut versuchen" an, nie ein Neuladen
 * der Seite: Das verwürfe im Funkloch genau die vorgehaltene Tagesliste
 * (ANN-021, ZST-04).
 */

/** Der nächste Schritt nach einem Ladefehler (WRT-01) - ohne Ratefrage. */
const NACH_LADEFEHLER = 'Bitte die Verbindung prüfen und erneut versuchen.';

/**
 * Zweite Zeile im Tagesplan des Teams: wer, dann wo (UEB-06).
 *
 * Die Person steht vorn, weil der Plan zeigen soll, wer wann wo ist - am
 * Telefon kürzt `truncate` das Ende der Zeile, und das war bis UXR-003 genau
 * der Name. Die Terminart steht einmal und nur, wenn sie vom Hausbesuch
 * abweicht (ANN-192); bei Praxisterminen folgt ihr der Standort.
 *
 * Die Kalenderabfrage liefert bewusst keine Besuchsadresse - für die Übersicht
 * über den Tag des Teams ist sie nicht erforderlich (ADR-004,
 * Datenminimierung). Die eigene Tagesliste hat sie.
 */
function personUndOrt(termin: CalendarEntry): string {
  const art = appointmentTypeHint(termin.appointment_type);
  const ort =
    termin.appointment_type === 'practice' && termin.location_name
      ? `${art} ${termin.location_name}`
      : art;
  return ort ? `${staffName(termin)} · ${ort}` : staffName(termin);
}

function greeting(now = new Date()): string {
  const hour = now.getHours();
  if (hour < 11) return 'Guten Morgen';
  if (hour < 18) return 'Guten Tag';
  return 'Guten Abend';
}

function firstName(displayName: string): string {
  return displayName.split(' ')[0] ?? displayName;
}

/** „Donnerstag, 1. Oktober 2026" aus dem Kalendertag der Praxis. */
function langesDatum(tag: string): string {
  return formatLocalDate(`${tag}T12:00:00Z`, 'UTC');
}

/** Richtungszeichen hinter einem Link, nicht Teil seines Namens (WRT-08). */
function Pfeil() {
  return <span aria-hidden="true">→</span>;
}

/**
 * Die laufende Zeit für Jetzt-Marke, Arbeitskarte und den ersten Weg.
 *
 * Ein Zeitpunkt, keine Uhrzeit: Angezeigt wird er immer in der Zeitzone der
 * Praxis (`formatLocalTime`), nie in der des Geräts. Er rückt alle 30
 * Sekunden nach - der Zeitstrahl rechnet in Minuten, und mit dem halben Takt
 * hängt die Marke nie mehr als eine halbe Minute nach.
 */
function useJetzt(): number {
  const [jetzt, setJetzt] = useState(() => Date.now());
  useEffect(() => {
    const takt = window.setInterval(() => setJetzt(Date.now()), 30_000);
    return () => window.clearInterval(takt);
  }, []);
  return jetzt;
}

/**
 * Der Tagesplan des Teams: als Karte in der Kontextspalte, darunter als
 * Aufklapper (Design-Handoff 2026-10-01, Abschnitt 5).
 *
 * Dichte Zeilen mit Statuszeichen statt Abzeichen - in 300 px Breite sprengte
 * ein Abzeichen die Zeile. Laden und Fehler stehen im Aufklapper, an der
 * Stelle der Liste (UEB-05, ZST-18): Davor gelesen, hielt man den Fehler für
 * einen der eigenen Termine.
 */
function Teamplan({
  abfrage,
  heute,
  tagWort,
  zeitzone,
  offen,
  offenAbLg,
}: {
  abfrage: UseQueryResult<CalendarEntry[]>;
  /** Der gezeigte Tag (ANN-234) - meist heute. */
  heute: string;
  /** „Heute", „Morgen", „Am Mi., 7.10." für den Leerzustand. */
  tagWort: string;
  zeitzone: string;
  offen: boolean;
  /** In der Kontextspalte: am Rechner von Anfang an offen. */
  offenAbLg: boolean;
}) {
  const { data, isPending, isError, refetch } = abfrage;
  const alleHeute = [...(data ?? [])].sort(nachUhrzeit);

  return (
    <section>
      <Disclosure
        inKarte
        kopf="label"
        offen={offen}
        {...(offenAbLg ? { offenAb: 'lg' as const } : {})}
        {...(data ? { anzahl: alleHeute.length } : {})}
        // Die Überschrift bleibt eine Überschrift: `summary` darf ein
        // Überschriftenelement enthalten, und nur so steht der Block in der
        // Gliederung, die Vorlesesoftware ansteuert (UEB-17).
        summary={<h2>Tagesplan des Teams</h2>}
      >
        {isPending ? (
          <LoadingState label="Tagesplan des Teams wird geladen …" />
        ) : isError ? (
          <ErrorState
            title="Der Tagesplan des Teams konnte nicht geladen werden."
            description={NACH_LADEFEHLER}
            onErneut={() => refetch()}
          />
        ) : alleHeute.length === 0 ? (
          <EmptyState title={`${tagWort} sind keine Termine geplant`} />
        ) : (
          <ListRows rahmen={false}>
            {alleHeute.map((termin) => (
              <ListRow
                key={termin.id}
                dicht
                to={mitRueckweg(terminPfad(termin), '/')}
                zeit={formatLocalTime(termin.starts_at, zeitzone)}
                // Der Tagesplan des Teams liest den Kalender - dort stehen
                // seit CAL-015b auch Fehlzeiten ohne Patient:in.
                titel={terminBezeichnung(termin)}
                meta={personUndOrt(termin)}
                gedaempft={termin.status !== 'confirmed'}
                status={
                  <span className="flex items-center gap-2">
                    {/* §8.1: weder 45 noch 60 Minuten - gekennzeichnet, nicht
                        verboten (CAL-020). */}
                    <Laengenzeichen termin={termin} knapp />
                    {termin.status !== 'confirmed' ? (
                      <StatusMark ton={appointmentStatusTon[termin.status]}>
                        {appointmentStatusLabels[termin.status]}
                      </StatusMark>
                    ) : null}
                  </span>
                }
              />
            ))}
          </ListRows>
        )}
        <Textlink
          alleinstehend
          to={`/kalender?ansicht=tag&datum=${heute}`}
          className="gap-1 text-sm font-semibold"
        >
          Zum Kalender
          <Pfeil />
        </Textlink>
      </Disclosure>
    </section>
  );
}

/**
 * Die eine Tagesfrage: Muss die Liege mit (Design-Handoff 2026-10-01)?
 *
 * Eine Zeile auf der Akzentfläche, Beschriftung links, Antwort rechts. Die
 * Antwort steht als Wort da - „Ja · ab 2. Besuch 10:00" oder „Nein" -, das
 * Häkchen davor ist Schmuck.
 */
function LiegeZeile({ liege, tagWort }: { liege: LiegeHeute; tagWort: string }) {
  return (
    <dl className="bg-accent-soft rounded-card flex min-h-13 flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-2">
      <dt className="text-accent tracking-label text-xs font-semibold uppercase">
        Liege {tagWort}
      </dt>
      <dd className="text-accent text-base font-semibold tabular-nums">
        {liege.noetig ? <span aria-hidden="true">✓ </span> : null}
        {liegeText(liege)}
      </dd>
    </dl>
  );
}

/**
 * Der Tagesabschluss in Tiefgrün (Design-Handoff 2026-10-01, Abschnitt 5a
 * Punkt 8): Steht kein Besuch mehr aus, tritt diese Karte an die Stelle von
 * Liege-Zeile und Wegbalken - einmal, über dem Zeitstrahl.
 *
 * Sie sagt, was der Fall ist, und behauptet nicht mehr: „Alle Besuche
 * erledigt" heißt, dass jeder Besuch abgehakt ist; „Kein Weg mehr offen",
 * dass nach der Uhr niemand mehr anzufahren ist, aber noch ein Haken fehlt
 * (ANN-117 Fassung 2). Was noch offen ist, steht darunter im Zeitstrahl als
 * ausgeklappte Karte.
 */
function Tagesabschluss({
  fortschritt,
  morgen,
  tagWort,
  istHeute,
  datum,
}: {
  fortschritt: Tagesfortschritt;
  morgen: string;
  /** „Heute", „Gestern" … über dem Titel (ANN-234). */
  tagWort: string;
  istHeute: boolean;
  datum: string;
}) {
  const titelId = useId();
  const doku = dokuText(fortschritt);
  // ANN-117 Fassung 2: Nach der Uhr ist kein Weg mehr offen; „erledigt" sagt
  // die Karte erst, wenn auch jeder Besuch abgehakt ist.
  const alleAbgehakt = fortschritt.erledigt === fortschritt.gesamt;
  return (
    <section aria-labelledby={titelId} className="bg-surface-inverse rounded-card px-4 py-4">
      {/* Salbei ist nur auf Tiefgrün Textfarbe, und nur in 12 px und 600. */}
      <p className="text-salbei tracking-label text-xs font-semibold uppercase">{tagWort}</p>
      <h2 id={titelId} className="text-surface text-h3 tracking-display mt-1 font-extrabold">
        {alleAbgehakt ? <span aria-hidden="true">✓ </span> : null}
        {alleAbgehakt ? 'Alle Besuche erledigt' : 'Kein Weg mehr offen'}
      </h2>
      <p className="text-accent-soft mt-1 text-sm tabular-nums">
        {doku ? `${fortschrittText(fortschritt)} · ${doku}` : fortschrittText(fortschritt)}
      </p>
      {/* Auf Tiefgrün ist der Fokusrahmen Papier, nicht Hauptfarbe. */}
      <Link
        to={`/kalender?ansicht=tag&datum=${istHeute ? morgen : datum}`}
        className="text-surface focus-visible:outline-surface mt-1 inline-flex min-h-11 items-center gap-1 text-sm font-semibold underline underline-offset-3"
      >
        {istHeute ? 'Morgen im Kalender' : 'Diesen Tag im Kalender'}
        <Pfeil />
      </Link>
    </section>
  );
}

/**
 * Vortag, heute, Folgetag (UBK-003, ANN-234): eine Zeile unter dem Kopf.
 *
 * Links statt Knöpfe - der Tag steht in der Adresse, und „zurück" im Browser
 * führt wieder auf den Tag davor. „Heute" erscheint nur, wenn ein anderer Tag
 * gezeigt wird; dann sagt die Zeile auch, welcher.
 */
function TagWechsel({ tag, heute, istHeute }: { tag: string; heute: string; istHeute: boolean }) {
  return (
    <nav aria-label="Tag wechseln" className="mb-4 flex flex-wrap items-center gap-2">
      <ButtonLink to={tagesPfad(tagePlus(tag, -1), heute)} variant="secondary" groesse="kompakt">
        <span aria-hidden="true">‹</span> Vortag
      </ButtonLink>
      {istHeute ? null : (
        <ButtonLink to="/" variant="secondary" groesse="kompakt">
          Heute
        </ButtonLink>
      )}
      <ButtonLink to={tagesPfad(tagePlus(tag, 1), heute)} variant="secondary" groesse="kompakt">
        Folgetag <span aria-hidden="true">›</span>
      </ButtonLink>
      {istHeute ? null : (
        <p className="text-accent text-sm font-semibold">{TagesWort(tag, heute)}</p>
      )}
    </nav>
  );
}

/** Leere Flächen in Zielgröße, solange die Tagesliste lädt: Liege-Zeile und Wegbalken. */
function Ladegeruest() {
  return (
    <>
      <div aria-hidden="true" className="flex flex-col gap-2">
        <div className="border-line bg-surface rounded-card h-13 border" />
        <div className="border-line bg-surface rounded-card h-30 border" />
      </div>
      <div className="mt-4">
        <LoadingState label="Tagesliste wird geladen …" />
      </div>
    </>
  );
}

/**
 * Der eigene Tag: Liege, nächster Weg, Zeitstrahl.
 *
 * „Offen" heißt: der Besuch steht noch aus, oder er ist abgeschlossen und die
 * Dokumentation ist noch nicht finalisiert (siehe `istOffen`). Erledigtes
 * verschwindet nicht - es bleibt an seiner Stelle im Strahl und trägt ein
 * Abzeichen.
 */
function MeinTag({
  abfrage,
  sortiert,
  fokus,
  fortschritt,
  datum,
  morgen,
  staffMemberId,
  darfDokumentieren,
  darfDokuLesen,
  darfTermine,
  mitBehandlung,
  zeitzone,
  jetzt,
  heute,
}: {
  abfrage: UseQueryResult<DayPlanEntry[]>;
  /** Die Tagesliste nach Uhrzeit; leer, solange nichts geladen ist. */
  sortiert: readonly DayPlanEntry[];
  fokus: Fokus | null;
  fortschritt: Tagesfortschritt;
  datum: string;
  morgen: string;
  staffMemberId: string;
  darfDokumentieren: boolean;
  darfDokuLesen: boolean;
  darfTermine: boolean;
  /** Sieht die Rolle Akten? Sonst fragt die Liste nicht nach Erstaufnahmen (TRN-006). */
  mitBehandlung: boolean;
  zeitzone: string;
  /** Der Bezugszeitpunkt des gezeigten Tags (`bezugszeitpunkt`, ANN-234). */
  jetzt: number;
  /** Der heutige Tag der Praxis - `datum` kann davon abweichen (ANN-234). */
  heute: string;
}) {
  const { data: termine, isPending, isError, isFetching, dataUpdatedAt, refetch } = abfrage;
  const istHeute = datum === heute;
  const tagWort = tagesWort(datum, heute);

  // Was der Haken bewirkt hat - oder warum nicht (Design-Handoff 2026-10-01,
  // Abschnitt 5a Punkt 4). Steht oben, nimmt den Fokus.
  const [meldung, setMeldung] = useState<{ ton: 'ok' | 'fehler'; text: string } | null>(null);

  /**
   * Der Haken an einem bestätigten Behandlungstermin (Abschnitt 6a): schließt
   * ab, ohne zu dokumentieren. Die Doku bleibt danach als „Doku offen" stehen.
   */
  function haken(
    termin: DayPlanEntry,
    groesse: 'normal' | 'gross' = 'normal',
    beschriftung?: string,
  ): ReactNode {
    if (!darfTermine || termin.kind !== 'therapy' || termin.status !== 'confirmed') return null;
    // Ein künftiger Tag wird nicht abgehakt (ANN-234): Der Besuch war noch nicht.
    if (datum > heute) return null;
    const name = terminName(termin);
    return (
      <TerminAbschliessenKnopf
        appointmentId={termin.id}
        name={name}
        {...(beschriftung ? { beschriftung } : {})}
        variant={groesse === 'gross' ? 'primary' : 'secondary'}
        groesse={groesse}
        onAbgeschlossen={() =>
          setMeldung({
            ton: 'ok',
            text: darfDokumentieren
              ? `${name} abgeschlossen. Doku offen.`
              : `${name} abgeschlossen.`,
          })
        }
        onFehler={(text) => setMeldung({ ton: 'fehler', text })}
      />
    );
  }

  /**
   * „Doku" an jeder Zeile des Zeitstrahls (Leitfaden schlank und klar, L3;
   * Jannes 2026-10-06): an jedem Behandlungstermin des Tages, auch nach dem
   * Abschließen und nach dem Festschreiben - erledigt heißt nicht
   * unerreichbar. Das Ziel ist dasselbe wie an der Karte, der Reiter „Doku"
   * der Akte mit diesem Termin oben (AKTE-008, ANN-225); er zeigt je nach
   * Stand Schreibseite, Entwurf oder den festgeschriebenen Eintrag mit dem Weg
   * zum Nachtrag (ADR-016). Abgesagt und nicht angetroffen bekommen keinen
   * Knopf: Zu ihnen entsteht keine Dokumentation (ADR-018).
   */
  function zeilenAktionen(termin: DayPlanEntry): ReactNode {
    const mitDoku =
      termin.kind === 'therapy' &&
      termin.patient_id !== null &&
      (darfDokuLesen || darfDokumentieren) &&
      termin.status !== 'cancelled' &&
      termin.status !== 'no_show';
    const knopf = haken(termin);
    if (!mitDoku && !knopf) return null;
    return (
      <>
        {mitDoku ? (
          <ButtonLink
            to={mitRueckweg(`/patienten/${termin.patient_id}/doku?termin=${termin.id}`, '/')}
            variant="secondary"
            groesse="kompakt"
            className="shrink-0"
          >
            Doku{' '}
            <span className="sr-only">
              zum Termin um {formatLocalTime(termin.starts_at, zeitzone)} Uhr
            </span>
          </ButtonLink>
        ) : null}
        {knopf}
      </>
    );
  }

  // PRX-013: Was zur Erstaufnahme noch fehlt, steht an der Karte - vor der
  // Tür, wo man es noch mitnehmen oder erledigen kann. Dieselbe Abfrage wie
  // unter „Offene Punkte".
  const { data: erstaufnahmen } = useQuery({
    queryKey: OPEN_INTAKES_KEY,
    queryFn: fetchOpenIntakes,
    enabled: mitBehandlung,
    retry: false,
  });

  // Fahrzeiten für Wegbalken und Übergänge (ANN-194). Nur für die
  // Praxisrollen - der Server gibt die Tagesroute der Trainingsbetreuung nicht.
  const fahrzeiten = useTagesfahrzeiten({
    datum,
    staffMemberId,
    plan: termine,
    aktiv: mitBehandlung,
    jetzt,
  });

  // PRX-008: „Termin n von m" an der ausgeklappten Karte - derselbe Lesepfad
  // und derselbe Schlüssel wie die Kachel „Grundlage" am Termin.
  const fokusBehandlung = fokus?.termin.kind === 'therapy' ? fokus.termin.id : null;
  const { data: lage } = useQuery({
    queryKey: ['appointment', fokusBehandlung, 'abrechnungslage'],
    queryFn: () => fetchAbrechnungslage(fokusBehandlung!),
    enabled: darfTermine && fokusBehandlung !== null,
    retry: false,
  });

  if (isPending) return <Ladegeruest />;

  // Nur wenn es NICHTS zu zeigen gibt, tritt der Fehler an die Stelle der
  // Liste. Gibt es einen älteren Stand, ist er im Hausflur mehr wert als eine
  // Fehlermeldung - er wird dann als älterer Stand gekennzeichnet.
  if (isError && !termine) {
    return (
      <ErrorState
        title="Die Tagesliste konnte nicht geladen werden."
        description={NACH_LADEFEHLER}
        onErneut={() => refetch()}
      />
    );
  }
  if (!termine) return null;

  const wege = wegeDesTages(sortiert, jetzt);
  const besuche = besucheDesTages(sortiert);
  const hausbesuche = hausbesucheDesTages(sortiert);
  const stehtBesuchAus = fokus?.art === 'besuch';
  // Der Wegbalken rechnet von jetzt (ANN-196) - an einem anderen Tag gibt es
  // kein Jetzt, nur die Anfahrten am Zeitstrahl (ANN-234).
  const weg = istHeute ? naechsterWeg(sortiert, fokus, fahrzeiten.anfahrten, jetzt) : null;

  function karte(): ReactNode {
    if (!fokus) return null;
    const termin = fokus.termin;
    const zone = termin.organization_time_zone;
    const behandlung = termin.kind === 'therapy' && termin.patient_id !== null;
    const phase = besuchsphase(termin, jetzt);
    // Ab dem Beginn - und wenn nur noch die Dokumentation offen ist - wird
    // die Karte zur Arbeitskarte: Abschluss statt Navigation (UEB-04).
    const arbeitet = fokus.art === 'dokumentation' || phase !== 'wartet';
    const hatNavigation = navigationsZiel(termin) !== null;
    const anfahrt = fahrzeiten.anfahrten.get(termin.id);
    const ende = formatLocalTime(termin.ends_at, zone);

    // ANN-117 Fassung 2: Ein vorbeigegangener, nicht abgehakter Besuch hält
    // die Karte nur, wenn kein Weg mehr aussteht - dann zum Abschließen.
    const kicker =
      fokus.art === 'dokumentation'
        ? termin.status === 'confirmed'
          ? `Seit ${ende} offen`
          : 'Doku offen'
        : phase === 'laeuft'
          ? `Jetzt · bis ${ende}`
          : phase === 'ueberfaellig'
            ? `Seit ${ende} offen`
            : `${wege.erster?.id === termin.id && wege.istErsterDesTages ? 'Erster Weg' : 'Nächster Weg'}${
                anfahrt ? ` · ≈ ${anfahrt.minuten} min` : ''
              }`;

    // Ein Ziel für die Doku (Jannes 2026-10-03): der Reiter „Doku" der Akte
    // mit diesem Termin oben (AKTE-008, ANN-225). Er ersetzt „Bisherige Doku" und den
    // direkten Weg auf die Schreibseite - geschrieben wird von dort aus.
    const doku = termin.patient_id
      ? mitRueckweg(`/patienten/${termin.patient_id}/doku?termin=${termin.id}`, '/')
      : null;
    const zeigtDoku = behandlung && doku !== null && (darfDokuLesen || darfDokumentieren);
    // Der zugängliche Name beginnt mit dem sichtbaren Wort, damit auch die
    // Sprachsteuerung „Doku" trifft (UEB-10, WCAG 2.5.3).
    const dokuKnopf = (variante: 'primary' | 'secondary', klassen: string) =>
      zeigtDoku && doku ? (
        <ButtonLink
          to={doku}
          variant={variante}
          groesse={variante === 'secondary' ? 'kompakt' : 'normal'}
          className={klassen}
        >
          Doku <span className="sr-only">zu diesem Termin</span>
        </ButtonLink>
      ) : null;

    // Ein Hauptknopf je Ansicht (UX-EPIC-002): die Navigation, solange der
    // Besuch wartet; darunter „Doku" und der Haken in einer Reihe. Ab dem
    // Beginn - und davor, wenn es kein Ziel für die Navigation gibt (Praxis,
    // Video) - ist der Haken der Hauptknopf (Design-Handoff 2026-10-01,
    // Abschnitt 6a): Der Haken schließt ab, „Doku" führt zur Doku.
    let hauptaktion: ReactNode = null;
    if (!arbeitet && hatNavigation) {
      const kleinerHaken = haken(termin, 'normal', 'Behandlung abschließen');
      const reihe =
        zeigtDoku && kleinerHaken ? (
          <div className="grid grid-cols-[minmax(0,1fr)_44px] gap-2">
            {dokuKnopf('secondary', '')}
            {kleinerHaken}
          </div>
        ) : (
          (dokuKnopf('secondary', 'w-full') ?? kleinerHaken)
        );
      hauptaktion = (
        <>
          <NavigationZumTermin termin={termin} hauptknopf breit />
          {reihe}
        </>
      );
    } else {
      const grosserHaken = haken(termin, 'gross');
      hauptaktion =
        grosserHaken || zeigtDoku ? (
          <div className="flex w-full items-center gap-2">
            {grosserHaken}
            {dokuKnopf('primary', 'flex-1')}
          </div>
        ) : null;
    }

    return (
      <Tageskarte
        termin={termin}
        kicker={kicker}
        relativ={fokus.art === 'besuch' ? bisBeginn(termin, jetzt) : null}
        position={lage && lage.appointment_id === termin.id ? positionText(lage) : null}
        erstaufnahme={
          erstaufnahmen?.find((eintrag) => eintrag.patient_id === termin.patient_id)?.open_items
        }
        hauptaktion={hauptaktion}
        hinweis={
          fokus.art === 'besuch' && fahrzeiten.veraltet.has(termin.id) ? VERALTET_TEXT : null
        }
      />
    );
  }

  return (
    <>
      {meldung?.ton === 'ok' ? (
        <Rueckmeldung key={meldung.text} className="mb-4">
          {meldung.text}
        </Rueckmeldung>
      ) : meldung ? (
        <Statusmeldung ton="fehler" className="mb-4">
          {meldung.text}
        </Statusmeldung>
      ) : null}
      {/* „Stand von …" erscheint nur, wenn die Liste tatsächlich nicht mehr
          frisch ist (UX-011). Dauerhaft angezeigt wäre es Rauschen - wie ein
          dauerhaftes „verbunden" (ANN-015). Aktualisiert wird über die
          Abfrage, nicht über ein Neuladen der Seite, das den Stand verwürfe
          (ANN-021, UEB-05). */}
      {isError ? (
        <div className="bg-warnung-soft rounded-card mb-4 flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Statusmeldung ton="warnung" className="max-w-prose">
            Die Tagesliste ließ sich gerade nicht aktualisieren. Angezeigt wird der Stand von{' '}
            {formatLocalTime(new Date(dataUpdatedAt).toISOString(), zeitzone)} Uhr – er kann
            veraltet sein.
          </Statusmeldung>
          <Button
            type="button"
            variant="secondary"
            groesse="kompakt"
            disabled={isFetching}
            onClick={() => {
              void refetch();
            }}
          >
            {isFetching ? 'Wird aktualisiert …' : 'Jetzt aktualisieren'}
          </Button>
        </div>
      ) : null}

      {besuche.length === 0 && !stehtBesuchAus ? (
        // Der Titel sagt, was der Fall ist (UEB-11): An einem Tag ohne Besuch
        // ist nichts „erledigt". Eine Fehlzeit steht darunter im Zeitstrahl.
        // Ohne Karte drumherum: ein Satz ist kein Kasten (Leitfaden L2).
        <EmptyState title={`${TagesWort(datum, heute)} sind Ihnen keine Besuche zugeordnet`} />
      ) : stehtBesuchAus ? (
        <div className="flex flex-col gap-2">
          {/* Die Liege gehört an den Hausbesuch (BEF-051): An einem Tag nur
              mit Praxisterminen gibt es die Frage nicht. */}
          {hausbesuche.length > 0 ? (
            <LiegeZeile liege={liegeHeute(sortiert, jetzt)} tagWort={tagWort} />
          ) : null}
          {weg ? (
            <TravelBar titel={weg.titel} von={weg.von} bis={weg.bis} fahrtMin={weg.fahrtMin} />
          ) : null}
          {/* Eine Nachbildung ohne Kartendienst sieht aus wie eine Fahrzeit;
              die Seite sagt es dazu, wie die Tour (MAP-006c). */}
          {fahrzeiten.quelle === 'nachbildung' && fahrzeiten.anfahrten.size > 0 ? (
            <Statusmeldung ton="warnung">
              Nachbildung ohne Kartendienst: Die Fahrzeiten sind über die Luftlinie mit 15 km/h
              gerechnet.
            </Statusmeldung>
          ) : null}
        </div>
      ) : (
        <Tagesabschluss
          fortschritt={fortschritt}
          morgen={morgen}
          tagWort={TagesWort(datum, heute)}
          istHeute={istHeute}
          datum={datum}
        />
      )}

      {sortiert.length > 0 ? (
        <Zeitstrahl
          plan={sortiert}
          fokusId={fokus?.termin.id ?? null}
          jetzt={jetzt}
          jetztMarke={istHeute}
          zeitzone={zeitzone}
          anfahrten={fahrzeiten.anfahrten}
          veraltet={fahrzeiten.veraltet}
          karte={karte()}
          aktionen={zeilenAktionen}
        />
      ) : null}
    </>
  );
}

export function MyDayPage({ user }: { user: CurrentUser }) {
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const heute = todayInTimeZone(zeitzone);
  const darfTermine = canManageAppointments(user.roles);
  const praxisrolle = isStaff(user.roles);
  const darfDokumentieren = canWriteTreatmentNote(user.roles);
  const uhr = useJetzt();
  // ANN-234: der gezeigte Tag, aus der Adresse; ohne Angabe heute. An einem
  // anderen Tag misst die Seite nicht an der Uhr, sondern liegt ganz vor oder
  // ganz hinter ihm.
  const [suche] = useSearchParams();
  const tag = gewaehlterTag(suche.get('tag'), heute);
  const istHeute = tag === heute;
  const jetzt = bezugszeitpunkt(tag, heute, uhr);

  /**
   * Der Tagesplan des Teams fragt genau einen Kalendertag ab.
   *
   * Der Bereich ist halboffen - `bis` ist der erste Tag NACH dem Bereich,
   * dieselbe Auslegung wie in `bereichFuer` und wie in `list_appointments`
   * selbst. Bis hierher stand hier zweimal derselbe Tag; die Funktion weist
   * das mit `to must be after from` zurueck, und die Seite zeigte dauerhaft
   * "Die Termine konnten nicht geladen werden". Der Abschnitt hat damit nie
   * funktioniert - es war kein abgelaufener Anmeldezustand.
   */
  const morgen = tagePlus(heute, 1);
  const folgetag = tagePlus(tag, 1);

  const team = useQuery({
    queryKey: ['appointments', tag, folgetag, null, null, 'active'],
    queryFn: () =>
      fetchAppointments({
        von: tag,
        bis: folgetag,
        person: null,
        standort: null,
        status: 'active',
      }),
    enabled: darfTermine,
    retry: false,
  });

  // Seit TRN-006 auch die Trainingsbetreuung: Ihre Liste zeigt nur
  // Trainingstermine, der Server filtert je Termin (ADR-022 Punkt 11).
  const eigeneTagesliste =
    (darfTermine || canWriteTrainingClients(user.roles)) && Boolean(user.staffMemberId);
  const staffMemberId = user.staffMemberId ?? '';

  const tagesliste = useQuery({
    queryKey: ['day-plan', tag, staffMemberId],
    queryFn: () => fetchDayPlan(tag, staffMemberId),
    enabled: praxisrolle && eigeneTagesliste,
    retry: false,
    // Die zuletzt geladene Liste bleibt im Arbeitsspeicher der Seite lesbar,
    // auch wenn eine spätere Abfrage scheitert (UX-011, ADR-001, ANN-021).
    gcTime: TAGESPLAN_VORHALTEDAUER_MS,
  });

  const sortiert = useMemo(() => [...(tagesliste.data ?? [])].sort(nachUhrzeit), [tagesliste.data]);
  const fokus = useMemo(
    () => fokusDesTages(sortiert, darfDokumentieren, jetzt),
    [sortiert, darfDokumentieren, jetzt],
  );
  const fortschritt = useMemo(
    () => tagesfortschritt(sortiert, fokus?.art === 'besuch' ? fokus.termin.id : null),
    [sortiert, fokus],
  );

  // ANN-117: Zugeklappt nur für die, die selbst unterwegs sind: Das Büro hat meist
  // keine eigenen Besuche, für es ist der Plan des Teams die Hauptsache.
  const teamplanZugeklappt = eigeneTagesliste && darfDokumentieren;
  // BEF-051: Wer nicht dokumentiert (das Büro), plant zuerst - der Plan des
  // Teams steht dann vor der eigenen Liste, und die Seite bleibt einspaltig.
  const teamplanZuerst = eigeneTagesliste && !darfDokumentieren;
  const zweispaltig = eigeneTagesliste && !teamplanZuerst;

  if (!praxisrolle) {
    // UEB-08: Der Satz sagt, wozu der Zugang heute dient, und nennt den Weg
    // für alles andere - ohne ein Portal zu versprechen, das erst mit DSN-001
    // entworfen wird. Der Gruß bleibt beim „Sie", ohne Vornamen.
    return (
      <>
        <PageHeader title={greeting()} description={langesDatum(heute)} />
        <Section titel="Ihr Zugang">
          <p className="text-ink-muted text-liste max-w-prose">
            Über diesen Zugang verwalten Sie derzeit Ihr Konto. Termine vereinbaren oder absagen Sie
            bitte direkt bei der Praxis.
          </p>
          <ButtonLink to="/mein-konto" variant="secondary" className="mt-4">
            Mein Konto
          </ButtonLink>
        </Section>
      </>
    );
  }

  // MAP-006b: die Tagesroute auf der Karte, erst beim Aufklappen geladen. Nur
  // für die Praxisrollen - der Server gibt sie der Trainingsbetreuung nicht -
  // und nur mit einem Hausbesuch: Ohne ihn lüde sie nur „Heute gibt es keinen
  // Besuch mit Ort" (BEF-051).
  const tagesroute =
    isTherapyStaff(user.roles) &&
    tagesliste.data &&
    user.staffMemberId &&
    hausbesucheDesTages(sortiert).length > 0 ? (
      <TagesrouteAufklapper datum={tag} staffMemberId={user.staffMemberId} plan={sortiert} />
    ) : null;

  const teamplan = darfTermine ? (
    <Teamplan
      abfrage={team}
      heute={tag}
      tagWort={TagesWort(tag, heute)}
      zeitzone={zeitzone}
      offen={!teamplanZugeklappt}
      offenAbLg={eigeneTagesliste}
    />
  ) : null;

  return (
    // Zwei Spalten ab 900 px **Inhaltsbreite** (`--container-zweispaltig`):
    // Gemessen wird der Inhalt, nicht das Fenster - die Seitenleiste ist je
    // nach Breite 72 oder 248 px. Darunter rückt die Kontextspalte unter den
    // eigenen Tag. Wer keinen eigenen Tag hat (das Büro), bleibt einspaltig:
    // Für ihn ist der Plan des Teams die Hauptsache, keine Randspalte.
    <div className="@container">
      <div
        className={
          zweispaltig
            ? '@zweispaltig:grid-cols-[minmax(0,1fr)_minmax(300px,380px)] @zweispaltig:gap-x-8 grid items-start gap-6'
            : 'lg:max-w-3xl'
        }
      >
        <div className="min-w-0">
          <PageHeader
            title={`${greeting()}, ${firstName(user.profile.display_name)}`}
            description={langesDatum(tag)}
            actions={
              // Tagesfortschritt im Kopf: ein Punkt je Behandlungsbesuch.
              // Fehlzeiten und Training zählen nicht (ANN-117).
              fortschritt.gesamt > 0 ? (
                <ProgressDots punkte={fortschritt.punkte}>
                  {fortschrittText(fortschritt)}
                </ProgressDots>
              ) : undefined
            }
          />

          {eigeneTagesliste || darfTermine ? (
            <TagWechsel tag={tag} heute={heute} istHeute={istHeute} />
          ) : null}

          {teamplanZuerst ? <div className="mb-6">{teamplan}</div> : null}

          {eigeneTagesliste && user.staffMemberId ? (
            <MeinTag
              abfrage={tagesliste}
              sortiert={sortiert}
              fokus={fokus}
              fortschritt={fortschritt}
              datum={tag}
              morgen={morgen}
              staffMemberId={user.staffMemberId}
              darfDokumentieren={darfDokumentieren}
              darfDokuLesen={canReadTreatmentNote(user.roles)}
              darfTermine={darfTermine}
              mitBehandlung={isTherapyStaff(user.roles)}
              zeitzone={zeitzone}
              jetzt={jetzt}
              heute={heute}
            />
          ) : null}

          {/* PRX-EPIC-003: was liegen geblieben ist, als eine Zeile - nur wenn
              etwas fällig ist. Wer selbst unterwegs ist, sieht sie unter dem
              eigenen Tag: Liege und nächster Weg bleiben auf dem ersten
              Bildschirm (UX-EPIC-003). */}
          <OpenPointsSummary user={user} today={heute} />

          {teamplanZuerst && tagesroute ? <div className="mt-6">{tagesroute}</div> : null}

          {eigeneTagesliste ? null : <div className="mt-6">{teamplan}</div>}
        </div>

        {zweispaltig ? (
          <aside className="flex min-w-0 flex-col gap-4">
            {teamplan}
            {tagesroute}
          </aside>
        ) : null}
      </div>

      {/* PRX-EPIC-003: der ruhige Weg zur Büroliste, auch wenn nichts fällig
          ist - die Zeile oben erscheint nur mit Fälligem. */}
      {canReadPatientDirectory(user.roles) ? (
        <p className="border-line mt-8 border-t pt-3 lg:max-w-3xl">
          <Textlink alleinstehend to="/offen" className="text-liste gap-1 font-medium">
            Offene Punkte: Aufgaben, Anrufliste, Erstaufnahmen
            <Pfeil />
          </Textlink>
        </p>
      ) : null}

      {/* TRN-EPIC-001: der Weg in den Bereich Training für die Rollen, die ihn
          sehen - für die Trainingsbetreuung der einzige Arbeitsbereich neben
          dieser Übersicht. */}
      {canReadTrainingClients(user.roles) ? (
        <p className="border-line mt-8 border-t pt-3 lg:max-w-3xl">
          <Textlink alleinstehend to="/training" className="text-liste gap-1 font-medium">
            {BEGRIFFE.trainingskundInnen}
            <Pfeil />
          </Textlink>
        </p>
      ) : null}

      {/* Die Vorschau führt nach Organisatorisches und Kommunikation - Bereiche,
          die ein reines Trainingskonto nicht hat (TRN-003). */}
      {isTherapyStaff(user.roles) ? <UebersichtVorschau user={user} /> : null}
    </div>
  );
}

// -----------------------------------------------------------------------------
// Vorschauteil
// -----------------------------------------------------------------------------

/**
 * Der Teil der Übersicht, dessen Hintergrundfunktionen noch fehlen.
 *
 * Seit UX-001 zusammengefaltet: Der Tag beginnt mit dem, was echt ist. Die
 * fünf Vorschaukarten standen bisher als erstes im Blickfeld, sobald man die
 * eigene Tagesliste durchgescrollt hatte - auf dem Telefon war die Hälfte der
 * Seite Attrappe. Sie bleiben erreichbar, aber sie drängen sich nicht mehr
 * auf. Die Kennzeichnung „Vorschau" am Aufklapper ist am 2026-09-22 gefallen:
 * Der zugeklappte Block sagt schon durch seine Überschrift, was drin ist.
 *
 * Die Links der Karten sind Textlinks mit 44 px Tippziel (UEB-18, RSP-14,
 * UIK-15). Wo eine Karte Urlaub und Erstattungen zusammen zählt, führt je ein
 * Link zu beiden - vorher landete eine offene Erstattung beim Urlaub.
 */
function UebersichtVorschau({ user }: { user: CurrentUser }) {
  const { zustand } = useVorschau();
  const identitaet = vorschauidentitaet(zustand, user);
  if (!identitaet) return null;

  const ich = identitaet.person;
  const meinRad = zustand.raeder.find(
    (rad) => rad.stammnutzerId === ich.id || rad.aktuellerNutzerId === ich.id,
  );
  const meineOffenen =
    zustand.urlaub.filter(
      (antrag) => antrag.mitarbeiterId === ich.id && antrag.status === 'beantragt',
    ).length +
    zustand.erstattungen.filter(
      (antrag) =>
        antrag.mitarbeiterId === ich.id &&
        (antrag.stand === 'eingereicht' || antrag.stand === 'genehmigt'),
    ).length;
  const zuEntscheiden = darfEntscheiden(user)
    ? zustand.urlaub.filter((antrag) => antrag.status === 'beantragt').length +
      zustand.erstattungen.filter((antrag) => antrag.stand === 'eingereicht').length
    : 0;
  const ungelesen = zustand.nachrichten.filter((nachricht) => !nachricht.gelesen).length;
  const kartenlink = 'gap-1 text-sm font-medium';

  return (
    <section className="border-line mt-8 border-t pt-3 lg:max-w-3xl">
      <details className="group">
        {/* Die Überschrift bleibt eine Überschrift: `summary` darf nach dem
            HTML-Inhaltsmodell ein Überschriftenelement enthalten, und nur so
            steht der Block weiter in der Gliederung, die Vorlesesoftware
            ansteuert. Gestaltet wie der Tagesplan des Teams (UEB-17). */}
        <summary className={`${aufklappKopfKlassen} text-ink-muted hover:text-ink`}>
          <Aufklappzeichen />
          <h2 className="tracking-label text-xs font-semibold uppercase">
            Organisatorisches und Kommunikation
          </h2>
        </summary>

        {/* „Angezeigt wird der Stand von …" darf hier nicht stehen: Denselben
            Satzanfang trägt die Altersmeldung der Tagesliste aus UX-011, und
            zwei gleich beginnende Sätze auf einer Seite lassen sich weder
            vorlesen noch testen auseinanderhalten. */}
        {/* Wer über den Namen erkannt ist, braucht den Satz nicht - er steht
            nur, wenn die Zuordnung über die Rolle geraten ist (UX-005h). */}
        {identitaet.ueberNamen ? null : (
          <p className="text-ink-muted mt-4 mb-4 max-w-prose text-sm">
            Diese Karten gehören zu <strong className="text-ink">{ich.name}</strong> (zur Rolle
            passend gewählt).
          </p>
        )}

        <CardGrid>
          <Card>
            <p className="text-ink-muted text-sm">Mein Rad heute</p>
            <p className="text-ink text-liste mt-1 font-medium">
              {meinRad ? meinRad.name : 'Kein Rad zugeordnet'}
            </p>
            {meinRad ? (
              <p className="text-ink-muted mt-1 text-sm">
                {meinRad.schluesselInhaber
                  ? `Schlüssel bei ${meinRad.schluesselInhaber}`
                  : 'Schlüssel im Tresor'}
              </p>
            ) : null}
            <div className="mt-2 flex flex-wrap gap-x-4">
              <Textlink alleinstehend to="/betrieb/flotte" className={kartenlink}>
                Zur Radflotte
                <Pfeil />
              </Textlink>
              {/* Eine Aktion, keine Störung: Hauptfarbe statt Fehlerfarbe. */}
              <Textlink alleinstehend to="/betrieb/flotte/panne" className={kartenlink}>
                Panne melden
              </Textlink>
            </div>
          </Card>

          <Card>
            <p className="text-ink-muted text-sm">Meine Anträge</p>
            <p className="text-ink text-liste mt-1 font-medium">
              {meineOffenen === 0
                ? 'Nichts offen'
                : `${meineOffenen} ${meineOffenen === 1 ? 'Antrag' : 'Anträge'} offen`}
            </p>
            <div className="mt-2 flex flex-wrap gap-x-4">
              <Textlink alleinstehend to="/betrieb/urlaub" className={kartenlink}>
                Zum Urlaub
                <Pfeil />
              </Textlink>
              <Textlink alleinstehend to="/betrieb/erstattungen" className={kartenlink}>
                Zu den Erstattungen
                <Pfeil />
              </Textlink>
            </div>
          </Card>

          {zuEntscheiden > 0 ? (
            <Card>
              <p className="text-ink-muted text-sm">Zu entscheiden</p>
              <p className="text-ink text-liste mt-1 font-medium">
                {zuEntscheiden} {zuEntscheiden === 1 ? 'Vorgang' : 'Vorgänge'}
              </p>
              <div className="mt-2 flex flex-wrap gap-x-4">
                <Textlink alleinstehend to="/betrieb/urlaub" className={kartenlink}>
                  Urlaubsanträge
                  <Pfeil />
                </Textlink>
                <Textlink alleinstehend to="/betrieb/erstattungen" className={kartenlink}>
                  Erstattungen
                  <Pfeil />
                </Textlink>
              </div>
            </Card>
          ) : null}

          <Card>
            <p className="text-ink-muted text-sm">Kommunikation</p>
            <p className="text-ink text-liste mt-1 font-medium">
              {ungelesen === 0 ? 'Nichts Ungelesenes' : `${ungelesen} ungelesen`}
            </p>
            <Textlink alleinstehend to="/team" className={`mt-2 ${kartenlink}`}>
              Zur Kommunikation
              <Pfeil />
            </Textlink>
          </Card>
        </CardGrid>
      </details>
    </section>
  );
}
