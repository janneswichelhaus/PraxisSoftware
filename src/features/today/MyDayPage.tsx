import { Fragment } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { BEGRIFFE } from '@/lib/begriffe';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { ButtonLink } from '@/components/ui/ButtonLink';
import { Aufklappzeichen, Card, CardGrid } from '@/components/ui/Card';
import { Section } from '@/components/ui/Section';
import { Textlink } from '@/components/ui/Textlink';
import { aufklappKopfKlassen } from '@/components/ui/aufklappStile';
import { kartenAktionKlassen } from '@/components/ui/buttonStile';
import { mitRueckweg } from '@/lib/rueckweg';
import { Statusmeldung } from '@/components/ui/Statusmeldung';
import { EmptyState, ErrorState, LoadingState } from '@/components/ui/Feedback';
import {
  appointmentStatusLabels,
  appointmentStatusTon,
  appointmentTypeLabels,
  fetchAppointments,
  formatLocalTime,
  formatLocalTimeRange,
  terminBezeichnung,
  staffName,
  todayInTimeZone,
  type CalendarEntry,
} from '@/features/appointments/api';
import {
  canManageAppointments,
  canReadPatientDirectory,
  canReadTrainingClients,
  canReadTreatmentNote,
  canWriteTreatmentNote,
  isStaff,
  type CurrentUser,
} from '@/features/session/types';
import { useVorschau } from '@/features/preview/vorschauContext';
import { vorschauidentitaet, darfEntscheiden } from '@/features/preview/identitaet';
import { formatDatum } from '@/features/preview/format';
import {
  NavigationFuerDenTag,
  NavigationZumTermin,
} from '@/features/appointments/NavigationStarten';
import { tagePlus } from '@/features/appointments/calendar';
import {
  adressZeilen,
  fetchDayPlan,
  istOffen,
  nachUhrzeit,
  TAGESPLAN_VORHALTEDAUER_MS,
  type DayPlanEntry,
} from './api';
import { Tageskarte } from './Tagesliste';
import { navigationsZiel } from '@/lib/location/navigation';
import {
  anstehendeFehlzeiten,
  liegeHeute,
  liegeText,
  mitnehmenHeute,
  mitnehmenText,
  wegeDesTages,
} from './tagesstart';
import { Laengenzeichen } from '@/features/appointments/Laengenzeichen';
import { TagesrouteAufklapper } from '@/features/tours/TagesrouteAufklapper';
import { OpenPointsSummary } from '@/features/open-points/OpenPointsSummary';
import {
  OPEN_INTAKES_KEY,
  fetchOpenIntakes,
  openItemsText,
} from '@/features/open-points/intake-api';

/**
 * Übersicht - der persönliche Einstieg.
 *
 * Die Seite beantwortet eine Frage: was ist als Nächstes zu tun. Sie ist
 * deshalb kein Begrüßungsbildschirm mit Kennzahl, sondern eine Aufgabenliste
 * aus echten Terminen und - klar getrennt - den Hinweisen aus den noch nicht
 * angebundenen Bereichen.
 *
 * Seit UX-001 stehen die eigenen Besuche oben als Tagesliste mit Adresse,
 * Rufnummer und Zugangshinweis; sie kommen aus einem eigenen, engeren
 * Lesepfad (`list_day_plan`), nicht aus dem Kalender. Der Tagesplan des Teams
 * darunter bleibt die Kalenderabfrage - er braucht keine Adressen.
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
 * der Name. Die Terminart steht einmal; bei Praxisterminen folgt ihr der
 * Standort.
 *
 * Die Kalenderabfrage liefert bewusst keine Besuchsadresse - für die Übersicht
 * über den Tag des Teams ist sie nicht erforderlich (ADR-004,
 * Datenminimierung). Die eigene Tagesliste oben hat sie.
 */
function personUndOrt(termin: CalendarEntry): string {
  const art = appointmentTypeLabels[termin.appointment_type];
  const ort =
    termin.appointment_type === 'practice' && termin.location_name
      ? `${art} ${termin.location_name}`
      : art;
  return `${staffName(termin)} · ${ort}`;
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

/** Richtungszeichen hinter einem Link, nicht Teil seines Namens (WRT-08). */
function Pfeil() {
  return <span aria-hidden="true">→</span>;
}

function Terminzeile({ termin, zeitzone }: { termin: CalendarEntry; zeitzone: string }) {
  return (
    <li>
      <Link
        to={mitRueckweg(`/termine/${termin.id}`, '/')}
        className="hover:bg-surface-sunken flex min-h-16 items-center gap-4 py-3 transition-colors"
      >
        <span className="text-ink w-28 shrink-0 text-sm font-medium tabular-nums">
          {formatLocalTimeRange(termin.starts_at, termin.ends_at, zeitzone)}
        </span>
        {/* Unter 640 px brechen Längenzeichen und Abzeichen unter den Text
            um (UEB-06): In derselben Zeile kürzten sie den Namen. */}
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-0 basis-full sm:flex-1">
            {/* Der Tagesplan des Teams liest den Kalender - dort stehen seit
                CAL-015b auch Fehlzeiten ohne Patient:in. */}
            <span className="text-ink text-liste block truncate font-medium">
              {terminBezeichnung(termin)}
            </span>
            <span className="text-ink-muted mt-0.5 block truncate text-sm">
              {personUndOrt(termin)}
            </span>
          </span>
          {/* §8.1: weder 45 noch 60 Minuten - gekennzeichnet, nicht verboten (CAL-020). */}
          <Laengenzeichen termin={termin} />
          {termin.status !== 'confirmed' ? (
            <Badge ton={appointmentStatusTon[termin.status]}>
              {appointmentStatusLabels[termin.status]}
            </Badge>
          ) : null}
        </span>
      </Link>
    </li>
  );
}

/**
 * Vorschau auf den Besuch nach dem ersten Weg (UX-EPIC-003).
 *
 * Bewusst knapp und ohne Handlungen: Sie beantwortet „wohin danach, und muss
 * dafür etwas mit?" - die volle Karte mit Anschrift und Rufnummern liegt
 * unter „Weitere offene heute". Der Name führt wie auf der Tageskarte in die
 * Akte (UEB-13): ein Name, ein Ziel.
 */
function Vorschau({ termin }: { termin: DayPlanEntry }) {
  const zone = termin.organization_time_zone;
  const ort = adressZeilen(termin).join(', ') || ortDesTermins(termin);
  const person = termin.kind !== 'internal' && termin.patient_id ? termin.patient_id : null;
  return (
    <div className="border-line mt-4 border-t pt-3">
      {/* Überschrift wie „Erster Weg" darüber (UEB-17). */}
      <h3 className="text-ink-muted text-sm font-medium">Danach</h3>
      <p className="text-ink text-liste mt-1 min-w-0 wrap-anywhere">
        <span className="font-semibold tabular-nums">
          {formatLocalTimeRange(termin.starts_at, termin.ends_at, zone)}
        </span>{' '}
        {person ? (
          <Textlink
            alleinstehend
            to={mitRueckweg(`/patienten/${person}`, '/')}
            className="font-medium"
          >
            {`${termin.patient_given_name ?? ''} ${termin.patient_family_name ?? ''}`.trim()}
          </Textlink>
        ) : (
          <Textlink
            alleinstehend
            to={mitRueckweg(`/termine/${termin.id}`, '/')}
            className="font-medium"
          >
            {termin.title ?? 'Termin'}
          </Textlink>
        )}
      </p>
      {ort ? <p className="text-ink-muted mt-0.5 min-w-0 text-sm wrap-anywhere">{ort}</p> : null}
      {termin.treatment_table_required ? (
        <p className="text-ink mt-0.5 text-sm">
          <span className="text-ink-muted font-medium">Behandlungsliege: </span>mitnehmen
        </p>
      ) : null}
    </div>
  );
}

function ortDesTermins(termin: DayPlanEntry): string {
  if (termin.appointment_type === 'video') return 'Videotermin';
  if (termin.appointment_type === 'practice') return termin.location_name ?? 'Praxis';
  return 'Hausbesuch';
}

/**
 * „Heute außerdem: 13:00–14:00 Uhr Teambesprechung" (UEB-02).
 *
 * Fehlzeiten, die noch anstehen, sind keine Besuche und zählen nicht zu
 * „Offen heute" (ANN-117) - erledigt sind sie aber auch nicht. Sie stehen
 * deshalb als eigene Zeile unter der Liege bzw. im Leerzustand, bis ihr Ende
 * erreicht ist. Der Titel führt in den Termin, wie „Fehlzeit öffnen" auf
 * der Karte.
 */
function HeuteAusserdem({
  fehlzeiten,
  className = 'mb-3',
}: {
  fehlzeiten: readonly DayPlanEntry[];
  className?: string;
}) {
  if (fehlzeiten.length === 0) return null;
  return (
    <p className={`text-ink text-liste min-w-0 wrap-anywhere ${className}`}>
      <span className="font-semibold">Heute außerdem: </span>
      {fehlzeiten.map((termin, index) => (
        <Fragment key={termin.id}>
          {index > 0 ? ' · ' : null}
          <span className="tabular-nums">
            {formatLocalTimeRange(termin.starts_at, termin.ends_at, termin.organization_time_zone)}
          </span>{' '}
          <Textlink to={mitRueckweg(`/termine/${termin.id}`, '/')}>
            {termin.title ?? 'Fehlzeit'}
          </Textlink>
        </Fragment>
      ))}
    </p>
  );
}

/**
 * Die eigene Tagesliste: offene Besuche oben, erledigte zusammengefaltet.
 *
 * „Offen" heißt: der Besuch steht noch aus, oder er ist abgeschlossen und die
 * Dokumentation ist noch nicht finalisiert (siehe `istOffen`). Erledigtes
 * verschwindet nicht - es liegt hinter einem Aufklapper, damit die Liste am
 * Nachmittag nicht doppelt so lang ist wie am Morgen. Eine Fehlzeit, die noch
 * ansteht, ist weder das eine noch das andere (UEB-02, `HeuteAusserdem`).
 *
 * Ab 1024 px bleibt die Spalte bei einer Lesebreite (UEB-16): Eine Karte über
 * 1 128 px stellte das Abzeichen rund 1 000 px neben die Uhrzeit.
 */
function MeineTagesliste({
  datum,
  staffMemberId,
  darfDokumentieren,
  darfDokuLesen,
  zeitzone,
}: {
  datum: string;
  staffMemberId: string;
  darfDokumentieren: boolean;
  darfDokuLesen: boolean;
  zeitzone: string;
}) {
  const {
    data: termine,
    isPending,
    isError,
    isFetching,
    dataUpdatedAt,
    refetch,
  } = useQuery({
    queryKey: ['day-plan', datum, staffMemberId],
    queryFn: () => fetchDayPlan(datum, staffMemberId),
    retry: false,
    // Die zuletzt geladene Liste bleibt im Arbeitsspeicher der Seite lesbar,
    // auch wenn eine spätere Abfrage scheitert (UX-011, ADR-001, ANN-021).
    gcTime: TAGESPLAN_VORHALTEDAUER_MS,
  });

  // PRX-013: Was zur Erstaufnahme noch fehlt, steht an der Karte - vor der
  // Tür, wo man es noch mitnehmen oder erledigen kann. Dieselbe Abfrage wie
  // unter „Offene Punkte".
  const { data: erstaufnahmen } = useQuery({
    queryKey: OPEN_INTAKES_KEY,
    queryFn: fetchOpenIntakes,
    retry: false,
  });

  function erstaufnahme(termin: DayPlanEntry) {
    if (termin.kind !== 'therapy' || !termin.patient_id) return undefined;
    const offen = erstaufnahmen?.find((eintrag) => eintrag.patient_id === termin.patient_id);
    if (!offen) return undefined;
    return (
      <p className="text-ink mt-1 text-sm leading-relaxed wrap-anywhere">
        <span className="text-ink-muted font-medium">Erstaufnahme offen: </span>
        {openItemsText(offen.open_items)}
      </p>
    );
  }

  if (isPending) return <LoadingState label="Tagesliste wird geladen …" />;

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

  const sortiert = [...termine].sort(nachUhrzeit);
  const offen = sortiert.filter((termin) => istOffen(termin, darfDokumentieren));
  const ausserdem = anstehendeFehlzeiten(sortiert, Date.now());
  const erledigt = sortiert.filter(
    (termin) => !istOffen(termin, darfDokumentieren) && !ausserdem.includes(termin),
  );
  const wege = wegeDesTages(sortiert);
  const liege = liegeHeute(sortiert);
  const mitnehmen = mitnehmenHeute(sortiert);
  const weitere = offen.filter((termin) => termin.id !== wege.erster?.id);
  // Navigiert wird nur zu Besuchen, die noch ausstehen (UEB-04): Nach dem
  // Besuch mit offener Doku führte „Ganzer Tag" sonst zurück zur Adresse vom
  // Vormittag.
  const nochAnzufahren = offen.filter((termin) => termin.status === 'confirmed');
  const gabBesuche = sortiert.some((termin) => termin.kind === 'therapy');

  /**
   * Die Handlungen einer Karte, ohne die Navigation.
   *
   * Schreiben, ohne abzuschliessen (IDEA-PRX-040): Der Abschluss schreibt die
   * Dokumentation als Version 1 fest; wer waehrend des Besuchs mitschreibt
   * oder den Entwurf spaeter weiterfuehrt, braucht den Weg ohne diese Folge.
   * Kurz beschriftet, weil die Karte mehrere Ziele nebeneinander traegt; der
   * zugaengliche Name beginnt mit dem sichtbaren Wort, damit auch die
   * Sprachsteuerung „Doku" trifft (UEB-10, WCAG 2.5.3). Auf der Karte des
   * ersten Wegs ist die Navigation der Hauptknopf; dort bleibt der Abschluss
   * sekundaer (ein Hauptknopf je Ansicht, UX-EPIC-002).
   */
  function kartenAktionen(termin: DayPlanEntry, abschlussAlsHauptknopf: boolean) {
    const behandlung = termin.kind === 'therapy' && termin.patient_id !== null;
    return (
      <>
        {/* UX-EPIC-003: Vor der Tuer die bisherige Doku mit einem Tipp. Der
            Verlauf der Akte protokolliert jeden Lesezugriff (ADR-010); die
            Anzeige hier ist Darstellung, verbindlich prueft der Lesepfad. */}
        {darfDokuLesen && behandlung ? (
          <Link
            to={mitRueckweg(`/patienten/${termin.patient_id}/verlauf`, '/')}
            className={kartenAktionKlassen()}
          >
            Bisherige Doku
          </Link>
        ) : null}
        {darfDokumentieren && behandlung ? (
          <Link
            to={mitRueckweg(`/termine/${termin.id}/dokumentation`, '/')}
            className={kartenAktionKlassen()}
          >
            Doku <span className="sr-only">schreiben</span>
          </Link>
        ) : null}
        {/* Die eine Handlung, um die es am Ende jedes Besuchs geht - von der
            Tagesliste aus ein Tap (UX-007). */}
        {darfDokumentieren && behandlung ? (
          <Link
            to={mitRueckweg(`/termine/${termin.id}/abschluss`, '/')}
            className={kartenAktionKlassen(abschlussAlsHauptknopf ? 'primary' : 'secondary')}
          >
            Behandlung abschließen
          </Link>
        ) : null}
      </>
    );
  }

  return (
    <div className="mt-8 lg:max-w-3xl">
      {/* „Stand von …" erscheint nur, wenn die Liste tatsächlich nicht mehr
          frisch ist (UX-011). Dauerhaft angezeigt wäre es Rauschen - wie ein
          dauerhaftes „verbunden" (ANN-015). Aktualisiert wird über die
          Abfrage, nicht über ein Neuladen der Seite, das den Stand verwürfe
          (ANN-021, UEB-05). */}
      {isError ? (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
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

      <Section
        titel={offen.length > 0 ? `Offen heute (${offen.length})` : 'Offen heute'}
        hinweis="Ihre Besuche mit Anschrift, Rufnummer und Zugangshinweis."
        aktion={<NavigationFuerDenTag termine={nochAnzufahren} />}
      >
        {offen.length === 0 ? (
          // Der Titel sagt, was der Fall ist (UEB-11): „nichts mehr offen"
          // nur, wenn es heute Besuche gab.
          <EmptyState
            title={
              gabBesuche
                ? 'Heute ist nichts mehr offen'
                : 'Heute sind Ihnen keine Besuche zugeordnet'
            }
            description={gabBesuche ? 'Alle Besuche des Tages sind erledigt.' : undefined}
            aktion={
              ausserdem.length > 0 ? (
                <HeuteAusserdem fehlzeiten={ausserdem} className="" />
              ) : undefined
            }
          />
        ) : wege.erster ? (
          <>
            {/* UX-EPIC-003: Der Tag beginnt am Rad mit dem, was zählt - die
                Liege, der erste Weg, ein Blick auf den nächsten. Alles
                Weitere liegt zugeklappt darunter. */}
            <p className="text-ink mb-3 text-[1.0625rem]">
              <span className="font-semibold">Liege heute: </span>
              {liegeText(liege)}
            </p>
            {/* PRX-007: zusammengezählt und ohne Person (ANN-138) - wer wofür,
                steht im Kurzblick am Termin. Ohne Einträge keine Zeile. */}
            {mitnehmen.length > 0 ? (
              <p className="text-ink -mt-2 mb-3 text-[1.0625rem] wrap-anywhere">
                <span className="font-semibold">Heute mitnehmen: </span>
                {mitnehmenText(mitnehmen)}
              </p>
            ) : null}
            <HeuteAusserdem fehlzeiten={ausserdem} />

            <h3 className="text-ink-muted mb-2 text-sm font-medium">
              {wege.istErsterDesTages ? 'Erster Weg' : 'Nächster Weg'}
            </h3>
            <Tageskarte
              termin={wege.erster}
              hinweis={erstaufnahme(wege.erster)}
              aktionen={
                <>
                  <NavigationZumTermin termin={wege.erster} hauptknopf />
                  {/* Ohne Ziel für die Navigation (Praxis, Video) ist der
                      Abschluss der Hauptknopf - einer muss es sein. */}
                  {kartenAktionen(wege.erster, navigationsZiel(wege.erster) === null)}
                </>
              }
            />

            {/* ADR-019 Punkt 23: Die Übergabe ist nicht automatisch
                risikofrei. Wer sie auslöst, soll wissen, was dabei das Gerät
                verlässt - deshalb direkt unter dem Knopf, der sie auslöst,
                und in Lesegröße (UEB-11, UEB-17). */}
            {nochAnzufahren.some((termin) => termin.appointment_type === 'home_visit') ? (
              <p className="text-ink-muted mt-3 max-w-prose text-sm">
                „Navigation starten“ öffnet Google Maps im Fahrradmodus. Übergeben wird nur das Ziel
                – die Kartenposition oder, wo keine vorliegt, die Anschrift ohne Namen –, erst beim
                Tippen.
              </p>
            ) : null}

            {wege.danach ? <Vorschau termin={wege.danach} /> : null}

            {weitere.length > 0 ? (
              <details className="group mt-4">
                <summary className={`${aufklappKopfKlassen} text-ink-muted hover:text-ink text-sm`}>
                  <Aufklappzeichen />
                  Weitere offene heute ({weitere.length})
                </summary>
                <ul className="mt-3 flex flex-col gap-3">
                  {weitere.map((termin) => (
                    <li key={termin.id}>
                      <Tageskarte
                        termin={termin}
                        hinweis={erstaufnahme(termin)}
                        aktionen={
                          <>
                            {/* Ein Hauptknopf je Ansicht: den trägt der erste Weg. */}
                            {kartenAktionen(termin, false)}
                            {termin.status === 'confirmed' ? (
                              <NavigationZumTermin termin={termin} />
                            ) : null}
                          </>
                        }
                      />
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </>
        ) : (
          <>
            <HeuteAusserdem fehlzeiten={ausserdem} />
            {/* Kein Besuch steht mehr aus, offen ist nur noch Dokumentation.
                Den Hauptknopf trägt dann die erste Karte allein (UEB-04);
                eine Navigation gibt es an keiner mehr. */}
            <ul className="flex flex-col gap-3">
              {offen.map((termin, index) => (
                <li key={termin.id}>
                  <Tageskarte
                    termin={termin}
                    hinweis={erstaufnahme(termin)}
                    aktionen={kartenAktionen(termin, index === 0)}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </Section>

      {/* MAP-006b: die Tagesroute, erst beim Aufklappen geladen. */}
      <TagesrouteAufklapper datum={datum} staffMemberId={staffMemberId} plan={sortiert} />

      {erledigt.length > 0 ? (
        <details className="group border-line mt-6 border-t pt-3">
          <summary className={`${aufklappKopfKlassen} text-ink-muted hover:text-ink text-sm`}>
            <Aufklappzeichen />
            Erledigt heute ({erledigt.length})
          </summary>
          <ul className="mt-3 flex flex-col gap-3">
            {erledigt.map((termin) => (
              <li key={termin.id}>
                <Tageskarte termin={termin} />
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

export function MyDayPage({ user }: { user: CurrentUser }) {
  const zeitzone = user.organizationTimeZone ?? 'Europe/Berlin';
  const heute = todayInTimeZone(zeitzone);
  const darfTermine = canManageAppointments(user.roles);
  const praxisrolle = isStaff(user.roles);

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

  const {
    data: termine,
    isPending,
    isError,
    refetch,
  } = useQuery({
    queryKey: ['appointments', heute, morgen, null, null, 'active'],
    queryFn: () =>
      fetchAppointments({
        von: heute,
        bis: morgen,
        person: null,
        standort: null,
        status: 'active',
      }),
    enabled: darfTermine,
    retry: false,
  });

  const alleHeute = [...(termine ?? [])].sort(nachUhrzeit);
  const eigeneTagesliste = darfTermine && Boolean(user.staffMemberId);
  // ANN-117: Zugeklappt nur für die, die selbst unterwegs sind: Das Büro hat meist
  // keine eigenen Besuche, für es ist der Plan des Teams die Hauptsache.
  const teamplanZugeklappt = eigeneTagesliste && canWriteTreatmentNote(user.roles);

  if (!praxisrolle) {
    // UEB-08: Der Satz sagt, wozu der Zugang heute dient, und nennt den Weg
    // für alles andere - ohne ein Portal zu versprechen, das erst mit DSN-001
    // entworfen wird. Der Gruß bleibt beim „Sie", ohne Vornamen.
    return (
      <>
        <PageHeader title={greeting()} description={formatDatum(heute)} />
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

  return (
    <>
      <PageHeader
        title={`${greeting()}, ${firstName(user.profile.display_name)}`}
        description={formatDatum(heute)}
      />

      {/* PRX-EPIC-003: was liegen geblieben ist, als eine Zeile - nur wenn
          etwas fällig ist. Wer selbst unterwegs ist, sieht sie unter den
          eigenen Besuchen: Liege und erster Weg bleiben auf dem ersten
          Bildschirm (UX-EPIC-003). */}
      {eigeneTagesliste ? null : <OpenPointsSummary user={user} today={heute} />}

      {eigeneTagesliste && user.staffMemberId ? (
        <MeineTagesliste
          datum={heute}
          staffMemberId={user.staffMemberId}
          darfDokumentieren={canWriteTreatmentNote(user.roles)}
          darfDokuLesen={canReadTreatmentNote(user.roles)}
          zeitzone={zeitzone}
        />
      ) : null}

      {eigeneTagesliste ? <OpenPointsSummary user={user} today={heute} /> : null}

      {darfTermine ? (
        // UX-EPIC-003: Wer eine eigene Tagesliste hat, braucht den Plan des
        // Teams selten - er liegt dann zugeklappt unter dem eigenen Tag.
        // Laden und Fehler stehen im Aufklapper, an der Stelle der Liste
        // (UEB-05, ZST-18): Davor gelesen, hielt man den Fehler für einen der
        // eigenen Termine. Ab 1024 px dieselbe Lesebreite wie der eigene Tag
        // darüber (UEB-16) - die Übersicht ist eine Spalte.
        <section className="border-line mt-8 border-t pt-3 lg:max-w-3xl">
          <details open={!teamplanZugeklappt} className="group">
            {/* Die Überschrift bleibt eine Überschrift - im Label-Stil wie
                jede Abschnittsüberschrift (UEB-17); dass sich darunter etwas
                aufklappen lässt, sagt das Zeichen davor (UIK-07). */}
            <summary className={`${aufklappKopfKlassen} text-ink-muted hover:text-ink`}>
              <Aufklappzeichen />
              <h2 className="tracking-label text-xs font-semibold uppercase">
                Tagesplan des Teams
              </h2>
            </summary>
            <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
              <p className="text-ink-muted max-w-prose text-sm">
                Alle Termine und Fehlzeiten des Teams heute.
              </p>
              <Textlink
                alleinstehend
                to={`/kalender?ansicht=tag&datum=${heute}`}
                className="text-liste gap-1 font-medium"
              >
                Zum Kalender
                <Pfeil />
              </Textlink>
            </div>
            <div className="mt-3">
              {isPending ? (
                <LoadingState label="Tagesplan des Teams wird geladen …" />
              ) : isError ? (
                <ErrorState
                  title="Der Tagesplan des Teams konnte nicht geladen werden."
                  description={NACH_LADEFEHLER}
                  onErneut={() => refetch()}
                />
              ) : alleHeute.length === 0 ? (
                <EmptyState title="Heute sind keine Termine geplant" />
              ) : (
                <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
                  {alleHeute.map((termin) => (
                    <Terminzeile key={termin.id} termin={termin} zeitzone={zeitzone} />
                  ))}
                </ul>
              )}
            </div>
          </details>
        </section>
      ) : null}

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

      <UebersichtVorschau user={user} />
    </>
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
        <p className="text-ink-muted mt-4 mb-4 max-w-prose text-sm">
          Diese Karten gehören zu <strong className="text-ink">{ich.name}</strong>
          {identitaet.ueberNamen ? '' : ' (zur Rolle passend gewählt)'}.
        </p>

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
            <p className="text-ink-muted mt-1 text-sm">Urlaub, Zeitkonto und Erstattungen.</p>
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
              <p className="text-ink-muted mt-1 text-sm">Urlaubsanträge und Erstattungen.</p>
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
            <p className="text-ink-muted mt-1 text-sm">Kanäle und Direktnachrichten.</p>
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
