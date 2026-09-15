import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { Badge } from '@/components/ui/Badge';
import { Card } from '@/components/ui/Card';
import { Section } from '@/components/ui/Section';
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
import { fetchDayPlan, istOffen, nachUhrzeit, TAGESPLAN_VORHALTEDAUER_MS } from './api';
import { Tageskarte } from './Tagesliste';

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
 */

/**
 * Kurze Ortsangabe eines Termins im Tagesplan des Teams.
 *
 * Die Kalenderabfrage liefert bewusst keine Besuchsadresse - für die Übersicht
 * über den Tag des Teams ist sie nicht erforderlich (ADR-004,
 * Datenminimierung). Die eigene Tagesliste oben hat sie.
 */
function ortKurz(termin: CalendarEntry): string {
  if (termin.appointment_type === 'video') return 'Videotermin';
  if (termin.appointment_type === 'practice') return termin.location_name ?? '';
  return 'Hausbesuch';
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
        <span className="min-w-0 flex-1">
          {/* Der Tagesplan des Teams liest den Kalender - dort stehen seit
              CAL-015b auch Ereignisse ohne Patient:in. */}
          <span className="text-ink block truncate text-[0.9375rem] font-medium">
            {terminBezeichnung(termin)}
          </span>
          <span className="text-ink-muted mt-0.5 block truncate text-sm">
            {appointmentTypeLabels[termin.appointment_type]}
            {ortKurz(termin) ? ` · ${ortKurz(termin)}` : ''}
            {` · ${staffName(termin)}`}
          </span>
        </span>
        {termin.status !== 'confirmed' ? (
          <Badge ton={appointmentStatusTon[termin.status]}>
            {appointmentStatusLabels[termin.status]}
          </Badge>
        ) : null}
      </Link>
    </li>
  );
}

/**
 * Die eigene Tagesliste: offene Besuche oben, erledigte zusammengefaltet.
 *
 * „Offen" heißt: der Besuch steht noch aus, oder er ist abgeschlossen und die
 * Dokumentation ist noch nicht finalisiert (siehe `istOffen`). Erledigtes
 * verschwindet nicht - es liegt hinter einem Aufklapper, damit die Liste am
 * Nachmittag nicht doppelt so lang ist wie am Morgen.
 */
function MeineTagesliste({
  datum,
  staffMemberId,
  darfDokumentieren,
  zeitzone,
}: {
  datum: string;
  staffMemberId: string;
  darfDokumentieren: boolean;
  zeitzone: string;
}) {
  const {
    data: termine,
    isPending,
    isError,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ['day-plan', datum, staffMemberId],
    queryFn: () => fetchDayPlan(datum, staffMemberId),
    retry: false,
    // Die zuletzt geladene Liste bleibt im Arbeitsspeicher der Seite lesbar,
    // auch wenn eine spätere Abfrage scheitert (UX-011, ADR-001, ANN-021).
    gcTime: TAGESPLAN_VORHALTEDAUER_MS,
  });

  if (isPending) return <LoadingState label="Tagesliste wird geladen …" />;

  // Nur wenn es NICHTS zu zeigen gibt, tritt der Fehler an die Stelle der
  // Liste. Gibt es einen älteren Stand, ist er im Hausflur mehr wert als eine
  // Fehlermeldung - er wird dann als älterer Stand gekennzeichnet.
  if (isError && !termine) {
    return (
      <ErrorState
        title="Die Tagesliste konnte nicht geladen werden."
        description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
      />
    );
  }
  if (!termine) return null;

  const sortiert = [...termine].sort(nachUhrzeit);
  const offen = sortiert.filter((termin) => istOffen(termin, darfDokumentieren));
  const erledigt = sortiert.filter((termin) => !istOffen(termin, darfDokumentieren));

  return (
    <>
      {/* „Stand von …" erscheint nur, wenn die Liste tatsächlich nicht mehr
          frisch ist (UX-011). Dauerhaft angezeigt wäre es Rauschen - wie ein
          dauerhaftes „verbunden" (ANN-015). */}
      {isError ? (
        <Statusmeldung ton="warnung" className="mt-4">
          Die Tagesliste ließ sich gerade nicht aktualisieren. Angezeigt wird der Stand von{' '}
          {formatLocalTime(new Date(dataUpdatedAt).toISOString(), zeitzone)} Uhr – er kann veraltet
          sein. Geschrieben wird davon nichts.
        </Statusmeldung>
      ) : null}

      <Section
        titel={offen.length > 0 ? `Offen heute (${offen.length})` : 'Offen heute'}
        hinweis="Ihre Besuche mit Anschrift, Rufnummer und Zugangshinweis."
        aktion={<NavigationFuerDenTag termine={offen} />}
      >
        {offen.length === 0 ? (
          <EmptyState
            title="Heute ist nichts mehr offen"
            description={
              erledigt.length > 0
                ? 'Alle Besuche des Tages sind erledigt.'
                : 'Für heute sind Ihnen keine Termine zugeordnet.'
            }
          />
        ) : (
          <ul className="flex flex-col gap-3">
            {offen.map((termin) => (
              <li key={termin.id}>
                <Tageskarte
                  termin={termin}
                  aktionen={
                    <>
                      {/* Schreiben, ohne abzuschliessen (IDEA-PRX-040). Der
                          Abschluss schreibt die Dokumentation als Version 1
                          fest; wer waehrend des Besuchs mitschreibt oder den
                          Entwurf spaeter weiterfuehrt, braucht den Weg ohne
                          diese Folge. Kurz beschriftet, weil die Karte fuenf
                          Ziele nebeneinander traegt - der zugaengliche Name
                          sagt, was gemeint ist. */}
                      {darfDokumentieren ? (
                        <Link
                          to={mitRueckweg(`/termine/${termin.id}/dokumentation`, '/')}
                          aria-label="Dokumentation schreiben"
                          className={kartenAktionKlassen()}
                        >
                          Doku
                        </Link>
                      ) : null}
                      {/* Die eine Handlung, um die es am Ende jedes Besuchs
                          geht - von der Tagesliste aus ein Tap (UX-007). */}
                      {darfDokumentieren ? (
                        <Link
                          to={mitRueckweg(`/termine/${termin.id}/abschluss`, '/')}
                          className={kartenAktionKlassen('primary')}
                        >
                          Behandlung abschließen
                        </Link>
                      ) : null}
                      <NavigationZumTermin termin={termin} />
                    </>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* ADR-019 Punkt 23: Die Übergabe ist nicht automatisch risikofrei. Wer
          sie auslöst, soll wissen, was dabei das Gerät verlässt. */}
      {offen.some((termin) => termin.appointment_type === 'home_visit') ? (
        <p className="text-ink-subtle mt-3 max-w-prose text-xs leading-relaxed">
          „Navigation starten" öffnet Google Maps im Fahrradmodus und übergibt dabei nur die
          Anschrift ohne Namen – keine Uhrzeit, keinen Zugangshinweis, keine Kennung. Die Übergabe
          passiert erst beim Tippen.
        </p>
      ) : null}

      {erledigt.length > 0 ? (
        <details className="border-line mt-6 border-t pt-3">
          <summary className="text-ink-muted hover:text-ink flex min-h-11 cursor-pointer items-center text-sm">
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
    </>
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

  if (!praxisrolle) {
    return (
      <>
        <PageHeader
          title={`${greeting()}, ${firstName(user.profile.display_name)}`}
          description={formatDatum(heute)}
        />
        <Section titel="Ihr Zugang">
          <p className="text-ink-muted max-w-prose text-[0.9375rem]">
            Sie sehen ausschließlich Ihre eigenen Daten. Weitere Bereiche des Patientenportals
            werden schrittweise ergänzt.
          </p>
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

      {darfTermine && user.staffMemberId ? (
        <MeineTagesliste
          datum={heute}
          staffMemberId={user.staffMemberId}
          darfDokumentieren={canWriteTreatmentNote(user.roles)}
          zeitzone={zeitzone}
        />
      ) : null}

      {darfTermine ? (
        <>
          {isPending ? <LoadingState label="Termine werden geladen …" /> : null}
          {isError ? (
            <ErrorState
              title="Die Termine konnten nicht geladen werden."
              description="Bitte später erneut versuchen. Sind Sie noch angemeldet?"
            />
          ) : null}

          <Section
            titel="Tagesplan des Teams"
            hinweis="Alle Besuche des heutigen Tages."
            aktion={
              <Link
                to={`/kalender?ansicht=tag&datum=${heute}`}
                className="text-accent hover:text-accent-hover inline-flex min-h-11 items-center text-[0.9375rem] font-medium"
              >
                Zum Kalender →
              </Link>
            }
          >
            {termine && alleHeute.length === 0 ? (
              <EmptyState title="Heute sind keine Termine geplant" />
            ) : (
              <ul className="divide-line border-line bg-surface rounded-card divide-y border px-4 sm:px-5">
                {alleHeute.map((termin) => (
                  <Terminzeile key={termin.id} termin={termin} zeitzone={zeitzone} />
                ))}
              </ul>
            )}
          </Section>
        </>
      ) : null}

      <UebersichtVorschau user={user} />

      {canReadPatientDirectory(user.roles) ? (
        <p className="text-ink-subtle mt-10 max-w-prose text-sm">
          Früher Entwicklungsstand mit ausschließlich synthetischen Testdaten.
        </p>
      ) : null}
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
 * auf. Der Aufklapper trägt die Kennzeichnung „Vorschau" auch im
 * zugeklappten Zustand.
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
  const meineTour = zustand.touren.find((tour) => tour.mitarbeiterId === ich.id);

  return (
    <section className="border-line mt-10 border-t pt-6">
      <details>
        {/* Die Überschrift bleibt eine Überschrift: `summary` darf nach dem
            HTML-Inhaltsmodell ein Überschriftenelement enthalten, und nur so
            steht der Block weiter in der Gliederung, die Vorlesesoftware
            ansteuert. */}
        <summary className="flex min-h-11 cursor-pointer flex-wrap items-center gap-2">
          <Badge ton="warnung">Vorschau</Badge>
          <h2 className="text-ink text-[1.0625rem] font-semibold tracking-[-0.01em]">
            Organisatorisches, Wege und Kommunikation
          </h2>
          <span className="text-ink-muted text-sm">– noch nicht angebunden</span>
        </summary>

        <p className="text-ink-muted mt-4 mb-4 max-w-prose text-sm">
          Diese Bereiche sind noch nicht angebunden. Angezeigt werden synthetische Daten der
          Demoperson <strong className="text-ink">{ich.name}</strong>
          {identitaet.ueberNamen ? '' : ' (zur Rolle passend gewählt)'}. Es entstehen keine echten
          Vorgänge.
        </p>

        <div className="grid [grid-template-columns:repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-3">
          <Card>
            <p className="text-ink-muted text-sm">Mein Rad heute</p>
            <p className="text-ink mt-1 text-[0.9375rem] font-medium">
              {meinRad ? meinRad.name : 'Kein Rad zugeordnet'}
            </p>
            {meinRad ? (
              <p className="text-ink-muted mt-1 text-sm">
                {meinRad.schluesselInhaber
                  ? `Schlüssel bei ${meinRad.schluesselInhaber}`
                  : 'Schlüssel im Tresor'}
              </p>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-3">
              <Link
                to="/betrieb/flotte"
                className="text-accent hover:text-accent-hover text-sm font-medium"
              >
                Zur Radflotte →
              </Link>
              <Link
                to="/betrieb/flotte/panne"
                className="text-danger text-sm font-medium hover:underline"
              >
                Panne melden
              </Link>
            </div>
          </Card>

          <Card>
            <p className="text-ink-muted text-sm">Meine Wege heute</p>
            <p className="text-ink mt-1 text-[0.9375rem] font-medium">
              {meineTour ? `${meineTour.stopps.length} Stopps` : 'Keine Tour hinterlegt'}
            </p>
            <p className="text-ink-muted mt-1 text-sm">
              Wegzeiten sind geschätzt, nicht berechnet.
            </p>
            <Link
              to="/touren"
              className="text-accent hover:text-accent-hover mt-3 inline-block text-sm font-medium"
            >
              Zur Besuchsfolge →
            </Link>
          </Card>

          <Card>
            <p className="text-ink-muted text-sm">Meine Anträge</p>
            <p className="text-ink mt-1 text-[0.9375rem] font-medium">
              {meineOffenen === 0
                ? 'Nichts offen'
                : `${meineOffenen} offen${meineOffenen === 1 ? '' : 'e'}`}
            </p>
            <p className="text-ink-muted mt-1 text-sm">Urlaub, Zeitkonto und Erstattungen.</p>
            <Link
              to="/betrieb/urlaub"
              className="text-accent hover:text-accent-hover mt-3 inline-block text-sm font-medium"
            >
              Zu meinen Anträgen →
            </Link>
          </Card>

          {zuEntscheiden > 0 ? (
            <Card>
              <p className="text-ink-muted text-sm">Zu entscheiden</p>
              <p className="text-ink mt-1 text-[0.9375rem] font-medium">
                {zuEntscheiden} Vorgang{zuEntscheiden === 1 ? '' : 'e'}
              </p>
              <p className="text-ink-muted mt-1 text-sm">Urlaubsanträge und Erstattungen.</p>
              <Link
                to="/betrieb/urlaub"
                className="text-accent hover:text-accent-hover mt-3 inline-block text-sm font-medium"
              >
                Freigaben öffnen →
              </Link>
            </Card>
          ) : null}

          <Card>
            <p className="text-ink-muted text-sm">Kommunikation</p>
            <p className="text-ink mt-1 text-[0.9375rem] font-medium">
              {ungelesen === 0 ? 'Nichts Ungelesenes' : `${ungelesen} ungelesen`}
            </p>
            <p className="text-ink-muted mt-1 text-sm">Kanäle und Direktnachrichten.</p>
            <Link
              to="/team"
              className="text-accent hover:text-accent-hover mt-3 inline-block text-sm font-medium"
            >
              Zur Kommunikation →
            </Link>
          </Card>
        </div>
      </details>
    </section>
  );
}
